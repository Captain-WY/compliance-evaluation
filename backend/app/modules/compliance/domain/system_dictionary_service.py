from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.errors import AppError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord
from app.modules.compliance.domain.dictionaries import reference_codes_for_inspection_plan_dictionary
from app.modules.compliance.models import SysDictModel
from app.modules.compliance.repositories.system_dictionary_repository import (
    SystemDictionaryRepository,
    system_dictionary_repository,
)
from app.modules.compliance.schemas.system_dictionary import (
    ConfigDictionariesResponse,
    ConfigDictionaryItem,
    DictionaryAdminDeleteResponse,
    DictionaryAdminItem,
    DictionaryAdminItemCreateRequest,
    DictionaryAdminItemListResponse,
    DictionaryAdminItemUpdateRequest,
    DictionaryAdminSortRequest,
    DictionaryAdminTypeListResponse,
    DictionaryAdminTypeSummary,
)

MAX_DICT_DEPTH = 3
LOCKED_DELETE_POLICIES = {"SYSTEM_LOCKED", "SEEDED_LOCKED"}


def parse_requested_dict_types(raw_types: str | None) -> list[str] | None:
    if raw_types is None:
        return None
    parsed = [item.strip() for item in raw_types.split(",") if item.strip()]
    if not parsed:
        return None
    return list(dict.fromkeys(parsed))


class SystemDictionaryService:
    def __init__(self, repository: SystemDictionaryRepository) -> None:
        self._repository = repository

    async def config_dictionaries(
        self,
        session: AsyncSession,
        *,
        dict_types: list[str] | None,
    ) -> dict:
        rows = await self._repository.list_business_items(session, dict_types=dict_types)
        dictionaries = self._group_active_rows(rows, dict_types=dict_types)
        response = ConfigDictionariesResponse(dictionaries=dictionaries)
        return response.model_dump(by_alias=True)

    def _group_active_rows(
        self,
        rows: list[SysDictModel],
        *,
        dict_types: list[str] | None,
    ) -> dict[str, list[ConfigDictionaryItem]]:
        requested = set(dict_types or [])
        grouped: dict[str, list[SysDictModel]] = {}
        for row in rows:
            if row.is_deleted or not row.is_active:
                continue
            if requested and row.dict_type not in requested:
                continue
            grouped.setdefault(row.dict_type, []).append(row)

        if dict_types:
            ordered_types = dict_types
        else:
            ordered_types = sorted(grouped)

        return {
            dict_type: [
                ConfigDictionaryItem(
                    dict_id=row.dict_id,
                    dict_type=row.dict_type,
                    dict_code=row.dict_code,
                    dict_label=row.dict_label,
                    dict_label_en=row.dict_label_en,
                    parent_id=row.parent_id,
                    sort_order=row.sort_order,
                    is_active=row.is_active,
                    is_system=row.is_system,
                    edit_policy=row.edit_policy,
                    description=row.description,
                    ui_meta=row.ui_meta or {},
                    source=row.source,
                    version=row.version,
                )
                for row in sorted(
                    grouped.get(dict_type, []),
                    key=lambda item: (item.sort_order, item.dict_code),
                )
            ]
            for dict_type in ordered_types
        }

    async def admin_type_list(self, session: AsyncSession) -> dict:
        rows = await self._repository.list_all_items(session)
        active_rows = [row for row in rows if not row.is_deleted]
        dict_types = sorted({row.dict_type for row in active_rows})

        items: list[DictionaryAdminTypeSummary] = []
        for dict_type in dict_types:
            typed = [row for row in active_rows if row.dict_type == dict_type]
            active_count = sum(1 for row in typed if row.is_active)
            items.append(
                DictionaryAdminTypeSummary(
                    dict_type=dict_type,
                    type_label=self._type_label(dict_type, active_rows),
                    item_count=len(typed),
                    active_count=active_count,
                    inactive_count=len(typed) - active_count,
                )
            )
        return DictionaryAdminTypeListResponse(items=items).model_dump(by_alias=True)

    async def admin_item_page(
        self,
        session: AsyncSession,
        *,
        dict_type: str | None,
        keyword: str | None,
        active: bool | None,
        include_deleted: bool,
        page: int,
        page_size: int,
    ) -> dict:
        rows = await self._repository.list_all_items(session)
        filtered = self._filter_admin_items(
            rows,
            dict_type=dict_type,
            keyword=keyword,
            active=active,
            include_deleted=include_deleted,
        )
        total = len(filtered)
        start = (page - 1) * page_size
        end = start + page_size
        response = DictionaryAdminItemListResponse(
            items=[self._admin_item(row) for row in filtered[start:end]],
            page=page,
            page_size=page_size,
            total=total,
        )
        return response.model_dump(by_alias=True)

    async def create_admin_item(
        self,
        session: AsyncSession,
        *,
        payload: DictionaryAdminItemCreateRequest,
        user: AuthUserRecord,
    ) -> dict:
        rows = await self._repository.list_all_items(session)
        dict_type = payload.dict_type.strip()
        dict_code = payload.dict_code.strip()
        label = payload.label.strip()
        if not dict_type or not dict_code or not label:
            raise AppError(
                code="DICT_VALIDATION_ERROR",
                message="Dictionary type, code, and label are required",
                status_code=422,
            )
        self._ensure_unique_code(rows, dict_type=dict_type, dict_code=dict_code)
        self._validate_parent(rows, dict_type=dict_type, parent_id=payload.parent_id)
        now = datetime.now(UTC)
        row = SysDictModel(
            dict_id=self._new_dict_id(),
            parent_id=payload.parent_id,
            dict_type=dict_type,
            dict_code=dict_code,
            dict_label=label,
            dict_label_en=payload.label_en,
            sort_order=payload.sort_order,
            is_active=payload.active,
            is_system=False,
            edit_policy="ADMIN_EDITABLE",
            description=payload.description,
            ui_meta=payload.ui_meta,
            source="admin",
            version=1,
            created_by=user.user_id,
            updated_by=user.user_id,
            created_at=now,
            updated_at=now,
            is_deleted=False,
            deleted_at=None,
            deleted_by=None,
        )
        self._repository.add_item(session, row)
        await self._repository.commit(session)
        return self._admin_item(row).model_dump(by_alias=True)

    async def update_admin_item(
        self,
        session: AsyncSession,
        *,
        dict_id: str,
        payload: DictionaryAdminItemUpdateRequest,
        user: AuthUserRecord,
    ) -> dict:
        rows = await self._repository.list_all_items(session)
        row = self._require_item(rows, dict_id)
        self._ensure_version(row, received_version=payload.version)
        if row.edit_policy == "SYSTEM_LOCKED":
            raise AppError(
                code="DICT_LOCKED",
                message="System locked dictionary item cannot be updated",
                status_code=409,
                details={"dictId": row.dict_id, "editPolicy": row.edit_policy},
            )
        now = datetime.now(UTC)
        if payload.label is not None:
            row.dict_label = payload.label.strip()
        if "label_en" in payload.model_fields_set:
            row.dict_label_en = payload.label_en
        if payload.sort_order is not None:
            row.sort_order = payload.sort_order
        if payload.active is False and row.is_active:
            await self._ensure_not_in_use(session, [row])
        if payload.active is not None:
            row.is_active = payload.active
        if "description" in payload.model_fields_set:
            row.description = payload.description
        if payload.ui_meta is not None:
            row.ui_meta = payload.ui_meta
        row.updated_by = user.user_id
        row.updated_at = now
        row.version += 1
        await self._repository.commit(session)
        return self._admin_item(row).model_dump(by_alias=True)

    async def delete_admin_item(
        self,
        session: AsyncSession,
        *,
        dict_id: str,
        version: int | None,
        user: AuthUserRecord,
    ) -> dict:
        rows = await self._repository.list_all_items(session)
        row = self._require_item(rows, dict_id)
        if version is not None:
            self._ensure_version(row, received_version=version)
        affected = self._recursive_descendants(rows, row)
        await self._ensure_not_in_use(session, affected)
        locked = [
            item
            for item in affected
            if item.is_system or item.edit_policy in LOCKED_DELETE_POLICIES
        ]
        if locked:
            raise AppError(
                code="DICT_LOCKED",
                message="Locked dictionary item cannot be deleted",
                status_code=409,
                details={"dictIds": [item.dict_id for item in locked]},
            )
        now = datetime.now(UTC)
        deleted_ids: list[str] = []
        for item in affected:
            item.is_deleted = True
            item.is_active = False
            item.deleted_at = now
            item.deleted_by = user.user_id
            item.updated_at = now
            item.updated_by = user.user_id
            item.version += 1
            deleted_ids.append(item.dict_id)
        await self._repository.commit(session)
        response = DictionaryAdminDeleteResponse(
            deleted_count=len(deleted_ids),
            dict_ids=deleted_ids,
        )
        return response.model_dump(by_alias=True)

    async def sort_admin_items(
        self,
        session: AsyncSession,
        *,
        payload: DictionaryAdminSortRequest,
        user: AuthUserRecord,
    ) -> dict:
        rows = await self._repository.list_all_items(session)
        row_by_id = {row.dict_id: row for row in rows if not row.is_deleted}
        seen: set[str] = set()
        updates: list[SysDictModel] = []
        for item in payload.items:
            if item.dict_id in seen:
                raise AppError(
                    code="DICT_SORT_DUPLICATE_ITEM",
                    message="Dictionary sort payload contains duplicate item ids",
                    status_code=422,
                    details={"dictId": item.dict_id},
                )
            seen.add(item.dict_id)
            row = row_by_id.get(item.dict_id)
            if row is None:
                raise NotFoundError("Dictionary item not found")
            if row.edit_policy in {"READ_ONLY", "SYSTEM_LOCKED"}:
                raise AppError(code="DICT_LOCKED",message="受保护字典项不可排序",status_code=403)
            self._ensure_version(row, received_version=item.version)
            updates.append(row)

        now = datetime.now(UTC)
        sort_order_by_id = {item.dict_id: item.sort_order for item in payload.items}
        for row in updates:
            row.sort_order = sort_order_by_id[row.dict_id]
            row.updated_at = now
            row.updated_by = user.user_id
            row.version += 1
        await self._repository.commit(session)
        response = DictionaryAdminItemListResponse(
            items=[
                self._admin_item(row)
                for row in sorted(updates, key=lambda item: item.sort_order)
            ],
            page=1,
            page_size=len(updates),
            total=len(updates),
        )
        return response.model_dump(by_alias=True)

    def _filter_admin_items(
        self,
        rows: list[SysDictModel],
        *,
        dict_type: str | None,
        keyword: str | None,
        active: bool | None,
        include_deleted: bool,
    ) -> list[SysDictModel]:
        normalized_keyword = keyword.strip().lower() if keyword else None
        filtered = list(rows) if include_deleted else [row for row in rows if not row.is_deleted]
        if dict_type:
            filtered = [row for row in filtered if row.dict_type == dict_type]
        if active is not None:
            filtered = [row for row in filtered if row.is_active is active]
        if normalized_keyword:
            filtered = [
                row
                for row in filtered
                if normalized_keyword in row.dict_code.lower()
                or normalized_keyword in row.dict_label.lower()
                or (
                    row.dict_label_en is not None
                    and normalized_keyword in row.dict_label_en.lower()
                )
                or (
                    row.description is not None
                    and normalized_keyword in row.description.lower()
                )
            ]
        return sorted(filtered, key=lambda item: (item.dict_type, item.sort_order, item.dict_code))

    def _type_label(self, dict_type: str, rows: list[SysDictModel]) -> str:
        metadata = next(
            (
                row
                for row in rows
                if row.dict_type == "dict_type"
                and row.dict_code == dict_type
                and not row.is_deleted
            ),
            None,
        )
        return metadata.dict_label if metadata else dict_type

    def _admin_item(self, row: SysDictModel) -> DictionaryAdminItem:
        return DictionaryAdminItem(
            dict_id=row.dict_id,
            parent_id=row.parent_id,
            dict_type=row.dict_type,
            dict_code=row.dict_code,
            label=row.dict_label,
            label_en=row.dict_label_en,
            sort_order=row.sort_order,
            active=row.is_active,
            is_system=row.is_system,
            edit_policy=row.edit_policy,
            description=row.description,
            ui_meta=row.ui_meta or {},
            source=row.source,
            version=row.version,
            is_deleted=row.is_deleted,
        )

    def _require_item(self, rows: list[SysDictModel], dict_id: str) -> SysDictModel:
        row = next((item for item in rows if item.dict_id == dict_id and not item.is_deleted), None)
        if row is None:
            raise NotFoundError("Dictionary item not found")
        return row

    def _ensure_unique_code(
        self,
        rows: list[SysDictModel],
        *,
        dict_type: str,
        dict_code: str,
    ) -> None:
        duplicate = next(
            (
                row
                for row in rows
                if not row.is_deleted
                and row.dict_type == dict_type
                and row.dict_code == dict_code
            ),
            None,
        )
        if duplicate is not None:
            raise AppError(
                code="DICT_CODE_DUPLICATE",
                message="Dictionary code already exists in this type",
                status_code=409,
                details={"dictType": dict_type, "dictCode": dict_code},
            )

    def _validate_parent(
        self,
        rows: list[SysDictModel],
        *,
        dict_type: str,
        parent_id: str | None,
    ) -> None:
        if parent_id is None:
            return
        row_by_id = {row.dict_id: row for row in rows if not row.is_deleted}
        parent = row_by_id.get(parent_id)
        if parent is None or parent.dict_type != dict_type:
            raise AppError(
                code="DICT_PARENT_INVALID",
                message="Dictionary parent must exist in the same type",
                status_code=422,
                details={"parentId": parent_id, "dictType": dict_type},
            )
        if self._depth(parent, row_by_id) + 1 > MAX_DICT_DEPTH:
            raise AppError(
                code="DICT_DEPTH_EXCEEDED",
                message="Dictionary item depth cannot exceed three levels",
                status_code=422,
                details={"parentId": parent_id, "maxDepth": MAX_DICT_DEPTH},
            )

    def _depth(self, row: SysDictModel, row_by_id: dict[str, SysDictModel]) -> int:
        depth = 1
        seen = {row.dict_id}
        parent_id = row.parent_id
        while parent_id is not None:
            if parent_id in seen:
                return MAX_DICT_DEPTH + 1
            seen.add(parent_id)
            parent = row_by_id.get(parent_id)
            if parent is None:
                return depth
            depth += 1
            parent_id = parent.parent_id
        return depth

    def _ensure_version(self, row: SysDictModel, *, received_version: int) -> None:
        if row.version != received_version:
            raise AppError(
                code="DICT_VERSION_CONFLICT",
                message="Dictionary item version has changed",
                status_code=409,
                details={
                    "dictId": row.dict_id,
                    "expectedVersion": row.version,
                    "receivedVersion": received_version,
                },
            )

    def _recursive_descendants(
        self,
        rows: list[SysDictModel],
        root: SysDictModel,
    ) -> list[SysDictModel]:
        active_rows = [row for row in rows if not row.is_deleted]
        by_parent: dict[str | None, list[SysDictModel]] = {}
        for row in active_rows:
            by_parent.setdefault(row.parent_id, []).append(row)
        result: list[SysDictModel] = []
        stack = [root]
        seen: set[str] = set()
        while stack:
            current = stack.pop(0)
            if current.dict_id in seen:
                continue
            seen.add(current.dict_id)
            result.append(current)
            stack.extend(by_parent.get(current.dict_id, []))
        return result

    async def _ensure_not_in_use(
        self,
        session: AsyncSession,
        rows: list[SysDictModel],
    ) -> None:
        guarded = [
            row
            for row in rows
            if row.dict_type
            in {
                "inspection_plan_type",
                "inspection_plan_frequency",
                "inspection_confidentiality_level",
                "inspection_plan_attachment_type",
            }
        ]
        if not guarded:
            return
        plans = await self._repository.list_inspection_plans(session)
        references: list[dict[str, str]] = []
        for row in guarded:
            reference_codes = reference_codes_for_inspection_plan_dictionary(
                category=row.dict_type,
                dict_code=row.dict_code,
                ui_meta=row.ui_meta,
            )
            for plan in plans:
                if row.dict_type == "inspection_plan_type" and plan.type in reference_codes:
                    references.append(
                        {
                            "dictId": row.dict_id,
                            "dictType": row.dict_type,
                            "dictCode": row.dict_code,
                            "matchedCode": plan.type,
                            "inspectionPlanId": plan.inspection_plan_id,
                            "field": "type",
                        }
                    )
                if (
                    row.dict_type == "inspection_plan_frequency"
                    and plan.frequency in reference_codes
                ):
                    references.append(
                        {
                            "dictId": row.dict_id,
                            "dictType": row.dict_type,
                            "dictCode": row.dict_code,
                            "matchedCode": plan.frequency,
                            "inspectionPlanId": plan.inspection_plan_id,
                            "field": "frequency",
                        }
                    )
                if (
                    row.dict_type == "inspection_confidentiality_level"
                    and plan.confidentiality_level in reference_codes
                ):
                    references.append(
                        {
                            "dictId": row.dict_id,
                            "dictType": row.dict_type,
                            "dictCode": row.dict_code,
                            "matchedCode": str(plan.confidentiality_level),
                            "inspectionPlanId": plan.inspection_plan_id,
                            "field": "confidentialityLevel",
                        }
                    )
                if row.dict_type == "inspection_plan_attachment_type":
                    for attachment in plan.files or []:
                        if not isinstance(attachment, dict):
                            continue
                        attachment_type = str(
                            attachment.get("attachmentType", "")
                        ).strip()
                        if attachment_type not in reference_codes:
                            continue
                        references.append(
                            {
                                "dictId": row.dict_id,
                                "dictType": row.dict_type,
                                "dictCode": row.dict_code,
                                "matchedCode": attachment_type,
                                "inspectionPlanId": plan.inspection_plan_id,
                                "field": "files.attachmentType",
                            }
                        )
        if references:
            raise AppError(
                code="DICT_IN_USE",
                message="Dictionary item is referenced by inspection plans",
                status_code=409,
                details={"references": references[:20]},
            )

    def _new_dict_id(self) -> str:
        return f"DICT-{uuid4().hex[:16].upper()}"


system_dictionary_service = SystemDictionaryService(system_dictionary_repository)
