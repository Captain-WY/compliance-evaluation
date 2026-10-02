"""案件卷宗/文档 Service (切片 2.S5).

实现 14 个 BFF 端点的业务逻辑 + D4 权限继承算法 + 审计日志联动.

设计约束 (6 铁律 + 2.S5 决策):
  1. 写操作使用显式事务 `async with session.begin()`, 审计日志同事务
  2. 权限门槛: canUploadDocument (10 键之一, 决策 D2)
  3. D3/D4 继承: _can_access_document 算法 4 层 (doc → folder → parent_chain)
  4. D5 object_key 格式: `{tenant_id}/{case_id}/{doc_id}/v{version}/{filename}`
  5. D7 file_hash 秒传: 查 idx_case_docs_hash 命中即复用 object_key
  6. D8 审批流轻实现: auth-request/review 手动 PENDING → APPROVED/REJECTED
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.exceptions import BusinessException, NotFoundException, ValidationException
from ..enums import (
    AuthRequestStatus,
    CaseMemberRole,
    GranteeType,
    PermissionTargetType,
    PermissionType,
    label_of,
)
from ..models.case_documents import CaseDocument
from ..models.case_document_folders import CaseDocumentFolder
from ..models.case_members import CaseMember
from ..models.cases import Case
from ..models.document_auth_requests import DocumentAuthRequest
from ..models.document_permissions import DocumentPermission
from ..models.sys_departments import SysDepartment
from ..models.sys_dicts import SysDict
from ..models.sys_users import SysUser
from ..providers.minio_storage import MinIOStorageProvider
from ..providers.storage import FileNotFoundException, IStorageProvider, StorageException
from ..schemas.dossier import (
    AuthRequestCreateRequest,
    AuthRequestReviewRequest,
    AuthRequestsListRequest,
    AuthRequestsListResponse,
    AuthRequestVO,
    DocumentDeleteRequest,
    DocumentDetailRequest,
    DocumentDetailResponse,
    DocumentMoveRequest,
    DocumentRenameRequest,
    DocumentVO,
    DocumentsListRequest,
    DocumentsListResponse,
    DossierPagination,
    DossierTreeRequest,
    DossierTreeResponse,
    DownloadUrlRequest,
    DownloadUrlResponse,
    EvidenceCatalogItem,
    EvidenceCatalogRequest,
    EvidenceCatalogResponse,
    FolderCreateRequest,
    FolderDeleteRequest,
    FolderRenameRequest,
    FolderVO,
    PermissionGrantRequest,
    PermissionRevokeRequest,
    PermissionVO,
    PermissionsListRequest,
    PermissionsListResponse,
    UploadAbortRequest,
    UploadCompleteRequest,
    UploadInitRequest,
    UploadInitResponse,
)
from .audit_log_service import compute_field_diff, write_audit_log
from .case_detail_ext_service import _compute_permissions


# =============================================================================
# 配置与 Provider 工厂
# =============================================================================

_PERM_RANK = {
    PermissionType.VIEW.value: 1,
    PermissionType.DOWNLOAD.value: 2,
    PermissionType.EDIT.value: 3,
}

_UPLOAD_SESSION_TTL_SECONDS = 900  # 15 分钟
_PRESIGNED_URL_EXPIRES = 900


def _get_storage_provider() -> IStorageProvider:
    """获取 MinIO Provider 实例 (每次新建, 无状态单例开销极小)."""
    settings = get_settings()
    return MinIOStorageProvider(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
        public_endpoint=settings.MINIO_PUBLIC_ENDPOINT or None,
    )


def _get_bucket() -> str:
    return get_settings().MINIO_BUCKET or "sld-documents"


def _object_key(tenant_id: str, case_id: str, doc_id: str, version: int, filename: str) -> str:
    """D5: `{tenant_id}/{case_id}/{doc_id}/v{version}/{filename}`"""
    return f"{tenant_id}/{case_id}/{doc_id}/v{version}/{filename}"


# =============================================================================
# VO 构造 / 辅助
# =============================================================================


def _folder_to_vo(folder: CaseDocumentFolder, *, document_count: int = 0, children_count: int = 0) -> FolderVO:
    return FolderVO(
        id=folder.id,
        parent_id=folder.parent_id,
        folder_name=folder.folder_name,
        sort_order=int(folder.sort_order or 0),
        is_system=bool(folder.is_system),
        document_count=document_count,
        children_count=children_count,
        children=[],
    )


def _document_to_vo(
    doc: CaseDocument,
    *,
    doc_category_name: str | None = None,
    uploader_name: str | None = None,
    version_count: int = 1,
) -> DocumentVO:
    return DocumentVO(
        id=doc.id,
        case_id=doc.case_id,
        folder_id=doc.folder_id,
        process_node_id=doc.process_node_id,
        doc_category=doc.doc_category,
        doc_category_name=doc_category_name,
        doc_name=doc.doc_name,
        doc_type=doc.doc_type,
        doc_size=int(doc.doc_size or 0),
        file_hash=doc.file_hash,
        file_url=doc.file_url,
        version=int(doc.version or 1),
        parent_doc_id=doc.parent_doc_id,
        is_latest=bool(doc.is_latest),
        evidence_no=doc.evidence_no,
        proof_purpose=doc.proof_purpose,
        is_confidential=bool(doc.is_confidential),
        uploader_id=doc.uploader_id,
        uploader_name=uploader_name,
        upload_time=doc.upload_time,
        created_at=doc.created_at,
        version_count=version_count,
    )


def _doc_snapshot(doc: CaseDocument) -> dict[str, Any]:
    return {
        "doc_name": doc.doc_name,
        "folder_id": doc.folder_id,
        "doc_category": doc.doc_category,
        "doc_type": doc.doc_type,
        "doc_size": int(doc.doc_size or 0),
        "file_hash": doc.file_hash,
        "file_url": doc.file_url,
        "version": int(doc.version or 1),
        "is_latest": bool(doc.is_latest),
        "is_confidential": bool(doc.is_confidential),
        "evidence_no": doc.evidence_no,
        "proof_purpose": doc.proof_purpose,
    }


def _folder_snapshot(f: CaseDocumentFolder) -> dict[str, Any]:
    return {
        "folder_name": f.folder_name,
        "parent_id": f.parent_id,
        "sort_order": int(f.sort_order or 0),
        "is_system": bool(f.is_system),
    }


async def _load_case_or_404(session: AsyncSession, tenant_id: str, case_id: str) -> Case:
    case = (
        await session.execute(
            select(Case).where(
                and_(Case.id == case_id, Case.tenant_id == tenant_id, Case.is_deleted.is_(False))
            )
        )
    ).scalar_one_or_none()
    if case is None:
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _load_folder_or_404(
    session: AsyncSession, tenant_id: str, folder_id: str, *, for_update: bool = False
) -> CaseDocumentFolder:
    stmt = select(CaseDocumentFolder).where(
        and_(
            CaseDocumentFolder.id == folder_id,
            CaseDocumentFolder.tenant_id == tenant_id,
            CaseDocumentFolder.is_deleted.is_(False),
        )
    )
    if for_update:
        stmt = stmt.with_for_update()
    folder = (await session.execute(stmt)).scalar_one_or_none()
    if folder is None:
        raise NotFoundException(resource="文件夹", resource_id=folder_id)
    return folder


async def _load_document_or_404(
    session: AsyncSession, tenant_id: str, doc_id: str, *, for_update: bool = False
) -> CaseDocument:
    stmt = select(CaseDocument).where(
        and_(
            CaseDocument.id == doc_id,
            CaseDocument.tenant_id == tenant_id,
            CaseDocument.is_deleted.is_(False),
        )
    )
    if for_update:
        stmt = stmt.with_for_update()
    doc = (await session.execute(stmt)).scalar_one_or_none()
    if doc is None:
        raise NotFoundException(resource="文档", resource_id=doc_id)
    return doc


async def _load_doc_category_map(session: AsyncSession, tenant_id: str) -> dict[str, str]:
    """DOCUMENT_CATEGORY 字典 code → name."""
    rows = (
        await session.execute(
            select(SysDict.dict_code, SysDict.dict_name).where(
                SysDict.dict_type == "DOCUMENT_CATEGORY",
                SysDict.is_deleted.is_(False),
                SysDict.is_active.is_(True),
            )
        )
    ).all()
    return {code: name for code, name in rows}


async def _load_user_names(session: AsyncSession, tenant_id: str, user_ids: list[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    rows = (
        await session.execute(
            select(SysUser.id, SysUser.real_name, SysUser.username).where(
                SysUser.id.in_(user_ids),
                SysUser.tenant_id == tenant_id,
                SysUser.is_deleted.is_(False),
            )
        )
    ).all()
    return {uid: (real or username or uid) for uid, real, username in rows}


# =============================================================================
# 权限检查: canUploadDocument (10 键) + D4 继承
# =============================================================================


async def _require_case_readable(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """案件读权限: 任一成员 / LEGAL_ADMIN / SYS_ADMIN. 否则视为不存在."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not any(perms.model_dump().values()):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_can_upload_document(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_upload_document:
        raise BusinessException(code=4013, message="无上传/管理文档权限")
    return case


async def _require_can_manage_permissions(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """权限授予/审批: 需 canManageMembers + canUploadDocument 双权限."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not (perms.can_manage_members and perms.can_upload_document):
        raise BusinessException(code=4014, message="无权授予/审批文档权限")
    return case


async def _get_folder_ancestors(
    session: AsyncSession, tenant_id: str, folder_id: str
) -> list[str]:
    """返回从当前文件夹到根的 ID 列表 (含自身, 顺序 self → ... → root)."""
    ids: list[str] = []
    current_id: str | None = folder_id
    while current_id:
        ids.append(current_id)
        parent = (
            await session.execute(
                select(CaseDocumentFolder.parent_id).where(
                    CaseDocumentFolder.id == current_id,
                    CaseDocumentFolder.tenant_id == tenant_id,
                    CaseDocumentFolder.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if parent is None:
            break
        current_id = parent
        if len(ids) > 20:  # 防御循环引用
            break
    return ids


async def _can_access_document(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
    case: Case,
    doc: CaseDocument,
    required: PermissionType = PermissionType.VIEW,
) -> bool:
    """D4 权限继承算法.

    流程:
      1. 用户是 OWNER / CO_COUNSEL 或全局 SYS_ADMIN/LEGAL_ADMIN → 允许
      2. 查 target=DOCUMENT + target_id=doc.id 显式权限
      3. 未命中则查 target=FOLDER + target_id=doc.folder_id
      4. 递归向上查父文件夹 parent_chain
      5. 全未命中 → 拒
    """
    perms = await _compute_permissions(session, tenant_id, case.id, user.id, case=case)
    # 内置 OWNER/CO_COUNSEL/LEGAL_ADMIN/SYS_ADMIN 已经在 _compute_permissions 里体现
    if perms.can_upload_document and (perms.has_sys_admin or perms.has_legal_admin):
        return True
    # 在案件内角色 OWNER / CO_COUNSEL 拥有 can_upload_document
    if perms.can_upload_document and perms.user_role_in_case in (
        CaseMemberRole.OWNER.value,
        CaseMemberRole.CO_COUNSEL.value,
    ):
        return True

    required_rank = _PERM_RANK.get(required.value, 1)
    now = datetime.now(timezone.utc)

    async def _check_rows(target_type: str, target_id: str) -> bool:
        rows = (
            await session.execute(
                select(DocumentPermission).where(
                    and_(
                        DocumentPermission.case_id == case.id,
                        DocumentPermission.tenant_id == tenant_id,
                        DocumentPermission.is_deleted.is_(False),
                        DocumentPermission.target_type == target_type,
                        DocumentPermission.target_id == target_id,
                        DocumentPermission.grantee_type == GranteeType.USER.value,
                        DocumentPermission.grantee_id == user.id,
                    )
                )
            )
        ).scalars().all()
        for r in rows:
            if r.expire_at and r.expire_at < now:
                continue
            if _PERM_RANK.get(r.permission_type, 0) >= required_rank:
                return True
        return False

    # 2. 文档级显式权限
    if await _check_rows(PermissionTargetType.DOCUMENT.value, doc.id):
        return True

    # 3-4. 文件夹及父级链
    ancestor_ids = await _get_folder_ancestors(session, tenant_id, doc.folder_id)
    for folder_id in ancestor_ids:
        if await _check_rows(PermissionTargetType.FOLDER.value, folder_id):
            return True

    return False


# =============================================================================
# 2.1 目录树
# =============================================================================


async def get_tree(
    session: AsyncSession, tenant_id: str, payload: DossierTreeRequest, user: SysUser
) -> DossierTreeResponse:
    case = await _require_case_readable(session, tenant_id, payload.case_id, user)
    folders = (
        await session.execute(
            select(CaseDocumentFolder)
            .where(
                and_(
                    CaseDocumentFolder.case_id == case.id,
                    CaseDocumentFolder.tenant_id == tenant_id,
                    CaseDocumentFolder.is_deleted.is_(False),
                )
            )
            .order_by(CaseDocumentFolder.sort_order.asc(), CaseDocumentFolder.folder_name.asc())
        )
    ).scalars().all()

    # D3 (Batch A 2026-04-20): EXTERNAL_COUNSEL 仅返回已授权子树.
    # OWNER / CO_COUNSEL / VIEWER / BUSINESS_COLLABORATOR + LEGAL_ADMIN / SYS_ADMIN 返回完整树.
    perms = await _compute_permissions(session, tenant_id, case.id, user.id, case=case)
    is_external_only = (
        perms.user_role_in_case == CaseMemberRole.EXTERNAL_COUNSEL.value
        and not perms.has_legal_admin
        and not perms.has_sys_admin
    )
    visible_folder_ids: set[str] | None = None
    # Batch C (2026-04-20): 分离两个集合
    # - visible_folder_ids: 树显示用 (含路径祖先, 供前端渲染目录结构)
    # - doc_accessible_folder_ids: 文档统计用 (仅"真授权"的文件夹, 不含路径祖先)
    # 这样解决祖先节点 document_count 泄漏未授权文档的 bug
    doc_accessible_folder_ids: set[str] | None = None
    if is_external_only:
        # 查该用户在本案所有 document_permissions (target_type=FOLDER 或 DOCUMENT)
        now = datetime.now(timezone.utc)
        rows_perm = (
            await session.execute(
                select(DocumentPermission).where(
                    and_(
                        DocumentPermission.case_id == case.id,
                        DocumentPermission.tenant_id == tenant_id,
                        DocumentPermission.is_deleted.is_(False),
                        DocumentPermission.grantee_type == GranteeType.USER.value,
                        DocumentPermission.grantee_id == user.id,
                    )
                )
            )
        ).scalars().all()
        # 过滤未过期权限
        valid_perms = [p for p in rows_perm if (p.expire_at is None or p.expire_at >= now)]

        # 收集直接可见的文件夹 ID
        direct_visible: set[str] = set()
        # FOLDER 权限: 该文件夹 + 其所有子孙 (向下递归) 可见
        granted_folder_ids = {
            p.target_id for p in valid_perms if p.target_type == PermissionTargetType.FOLDER.value
        }
        # DOCUMENT 权限: 该文档所在的文件夹链 (该文件夹 + 所有祖先) 可见但子树不可见
        granted_doc_ids = [
            p.target_id for p in valid_perms if p.target_type == PermissionTargetType.DOCUMENT.value
        ]
        folder_of_doc: dict[str, str] = {}
        if granted_doc_ids:
            doc_rows = (
                await session.execute(
                    select(CaseDocument.id, CaseDocument.folder_id).where(
                        and_(
                            CaseDocument.id.in_(granted_doc_ids),
                            CaseDocument.tenant_id == tenant_id,
                            CaseDocument.is_deleted.is_(False),
                        )
                    )
                )
            ).all()
            folder_of_doc = {doc_id: folder_id for doc_id, folder_id in doc_rows}

        # 构建 parent 映射 (快速查祖先)
        parent_map: dict[str, str | None] = {f.id: f.parent_id for f in folders}

        def _walk_descendants(root_id: str) -> set[str]:
            """向下收集子孙 folder_id."""
            descendants: set[str] = set()
            stack = [root_id]
            while stack:
                cur = stack.pop()
                if cur in descendants:
                    continue
                descendants.add(cur)
                for fid, pid in parent_map.items():
                    if pid == cur and fid not in descendants:
                        stack.append(fid)
            return descendants

        def _walk_ancestors(leaf_id: str) -> set[str]:
            """向上收集祖先 folder_id (含自身), 用于让文档权限的文件夹路径可见."""
            ancestors: set[str] = set()
            cur: str | None = leaf_id
            hops = 0
            while cur and hops < 30:
                ancestors.add(cur)
                cur = parent_map.get(cur)
                hops += 1
            return ancestors

        # "真授权"集合: 用户实际有权访问文档的文件夹
        # - FOLDER 权限: 自身 + 所有子孙 (继承向下)
        # - DOCUMENT 权限: 仅该文档所在 folder (同级其他文档未授权, 不计入)
        doc_accessible: set[str] = set()
        for fid in granted_folder_ids:
            if fid in parent_map:
                doc_accessible |= _walk_descendants(fid)
        for _doc_id, fid in folder_of_doc.items():
            if fid in parent_map:
                doc_accessible.add(fid)

        # "可见"集合 = 真授权 + 路径祖先 (供前端渲染目录导航路径)
        direct_visible = set(doc_accessible)
        for fid in list(doc_accessible):
            direct_visible |= _walk_ancestors(fid)

        visible_folder_ids = direct_visible
        doc_accessible_folder_ids = doc_accessible
        folders = [f for f in folders if f.id in direct_visible]

    # 统计每个文件夹下最新版本文档数
    # EXTERNAL_COUNSEL 场景: 按"真授权"集合限定, 避免祖先路径节点统计未授权文档
    doc_count_filters = [
        CaseDocument.case_id == case.id,
        CaseDocument.tenant_id == tenant_id,
        CaseDocument.is_deleted.is_(False),
        CaseDocument.is_latest.is_(True),
    ]
    if doc_accessible_folder_ids is not None:
        if not doc_accessible_folder_ids:
            doc_count_filters.append(CaseDocument.folder_id.in_([]))
        else:
            doc_count_filters.append(CaseDocument.folder_id.in_(doc_accessible_folder_ids))
    doc_counts: dict[str, int] = {}
    rows = (
        await session.execute(
            select(CaseDocument.folder_id, func.count(CaseDocument.id))
            .where(and_(*doc_count_filters))
            .group_by(CaseDocument.folder_id)
        )
    ).all()
    for folder_id, cnt in rows:
        doc_counts[folder_id] = int(cnt or 0)

    # 构造 ID -> FolderVO map
    vo_map: dict[str, FolderVO] = {}
    children_cnt: dict[str, int] = {}
    for f in folders:
        if f.parent_id and (visible_folder_ids is None or f.parent_id in visible_folder_ids):
            children_cnt[f.parent_id] = children_cnt.get(f.parent_id, 0) + 1

    for f in folders:
        vo_map[f.id] = _folder_to_vo(
            f, document_count=doc_counts.get(f.id, 0), children_count=children_cnt.get(f.id, 0)
        )

    # 组装树: 根节点放入 top-level, 非根挂到 parent.children
    roots: list[FolderVO] = []
    for f in folders:
        vo = vo_map[f.id]
        if f.parent_id and f.parent_id in vo_map:
            vo_map[f.parent_id].children.append(vo)
        else:
            roots.append(vo)

    return DossierTreeResponse(case_id=case.id, folders=roots)


# =============================================================================
# 2.2 / 2.3 文档列表 + 详情
# =============================================================================


async def list_documents(
    session: AsyncSession, tenant_id: str, payload: DocumentsListRequest, user: SysUser
) -> DocumentsListResponse:
    case = await _require_case_readable(session, tenant_id, payload.case_id, user)
    folder = await _load_folder_or_404(session, tenant_id, payload.folder_id)
    if folder.case_id != case.id:
        raise NotFoundException(resource="文件夹", resource_id=payload.folder_id)

    pagination = payload.pagination or DossierPagination()
    filters = [
        CaseDocument.case_id == case.id,
        CaseDocument.tenant_id == tenant_id,
        CaseDocument.is_deleted.is_(False),
        CaseDocument.folder_id == folder.id,
        CaseDocument.is_latest.is_(True),
    ]
    if payload.doc_category:
        filters.append(CaseDocument.doc_category == payload.doc_category)

    # 先查全部再过滤权限, 避免分页后总数与可见条数不一致
    all_rows = (
        await session.execute(
            select(CaseDocument)
            .where(*filters)
            .order_by(CaseDocument.upload_time.desc(), CaseDocument.created_at.desc())
        )
    ).scalars().all()

    # D4 权限过滤: 非 OWNER/CO_COUNSEL/ADMIN 需逐条校验显式权限
    accessible_rows = []
    for doc in all_rows:
        if await _can_access_document(session, tenant_id, user, case, doc, PermissionType.VIEW):
            accessible_rows.append(doc)

    total = len(accessible_rows)
    offset = (pagination.page - 1) * pagination.size
    rows = accessible_rows[offset : offset + pagination.size]

    # 批量翻译
    cat_map = await _load_doc_category_map(session, tenant_id)
    user_map = await _load_user_names(
        session, tenant_id, list({d.uploader_id for d in rows if d.uploader_id})
    )

    # 版本链计数
    vchain_counts: dict[str, int] = {}
    if rows:
        # 找每条 is_latest 行的完整版本链
        chain_roots = [r.parent_doc_id or r.id for r in rows]
        if chain_roots:
            cnt_rows = (
                await session.execute(
                    select(
                        func.coalesce(CaseDocument.parent_doc_id, CaseDocument.id).label("root"),
                        func.count(CaseDocument.id),
                    )
                    .where(
                        CaseDocument.case_id == case.id,
                        CaseDocument.tenant_id == tenant_id,
                        CaseDocument.is_deleted.is_(False),
                        or_(
                            CaseDocument.id.in_(chain_roots),
                            CaseDocument.parent_doc_id.in_(chain_roots),
                        ),
                    )
                    .group_by("root")
                )
            ).all()
            for root, cnt in cnt_rows:
                vchain_counts[root] = int(cnt or 0)

    # 文件夹路径
    ancestors = await _get_folder_ancestors(session, tenant_id, folder.id)
    name_rows = (
        await session.execute(
            select(CaseDocumentFolder.id, CaseDocumentFolder.folder_name).where(
                CaseDocumentFolder.id.in_(ancestors)
            )
        )
    ).all()
    name_map = {i: n for i, n in name_rows}
    folder_path = [name_map[i] for i in reversed(ancestors) if i in name_map]

    items = [
        _document_to_vo(
            d,
            doc_category_name=cat_map.get(d.doc_category) if d.doc_category else None,
            uploader_name=user_map.get(d.uploader_id),
            version_count=vchain_counts.get(d.parent_doc_id or d.id, 1),
        )
        for d in rows
    ]

    return DocumentsListResponse(
        folder_id=folder.id,
        folder_path=folder_path,
        total=int(total),
        page=pagination.page,
        size=pagination.size,
        items=items,
    )


async def get_document_detail(
    session: AsyncSession, tenant_id: str, payload: DocumentDetailRequest, user: SysUser
) -> DocumentDetailResponse:
    doc = await _load_document_or_404(session, tenant_id, payload.doc_id)
    case = await _require_case_readable(session, tenant_id, doc.case_id, user)

    # D4 继承权限检查 (读 = VIEW)
    if not await _can_access_document(session, tenant_id, user, case, doc, PermissionType.VIEW):
        raise NotFoundException(resource="文档", resource_id=doc.id)

    cat_map = await _load_doc_category_map(session, tenant_id)
    user_map = await _load_user_names(session, tenant_id, [doc.uploader_id])

    # 版本链
    root_id = doc.parent_doc_id or doc.id
    version_rows = (
        await session.execute(
            select(CaseDocument)
            .where(
                and_(
                    CaseDocument.case_id == doc.case_id,
                    CaseDocument.tenant_id == tenant_id,
                    CaseDocument.is_deleted.is_(False),
                    or_(CaseDocument.id == root_id, CaseDocument.parent_doc_id == root_id),
                    CaseDocument.id != doc.id,
                )
            )
            .order_by(CaseDocument.version.desc())
        )
    ).scalars().all()

    user_map |= await _load_user_names(
        session, tenant_id, list({v.uploader_id for v in version_rows})
    )

    current_vo = _document_to_vo(
        doc,
        doc_category_name=cat_map.get(doc.doc_category) if doc.doc_category else None,
        uploader_name=user_map.get(doc.uploader_id),
        version_count=len(version_rows) + 1,
    )
    version_vos = [
        _document_to_vo(
            v,
            doc_category_name=cat_map.get(v.doc_category) if v.doc_category else None,
            uploader_name=user_map.get(v.uploader_id),
        )
        for v in version_rows
    ]

    return DocumentDetailResponse(document=current_vo, versions=version_vos)


# =============================================================================
# 2.4 上传三段式
# =============================================================================


async def init_upload(
    session: AsyncSession, tenant_id: str, payload: UploadInitRequest, user: SysUser
) -> UploadInitResponse:
    from sqlalchemy import text

    async with session.begin_nested():
        # 权限 + 归属检查 (放事务内避免 autobegin 冲突; 见 TROUBLESHOOTING §5.9)
        case = await _require_can_upload_document(session, tenant_id, payload.case_id, user)
        folder = await _load_folder_or_404(session, tenant_id, payload.folder_id)
        if folder.case_id != case.id:
            raise ValidationException(f"文件夹 {payload.folder_id} 不属于案件 {case.id}")

        # 计算版本号
        version = 1
        if payload.parent_doc_id:
            parent_doc = await _load_document_or_404(session, tenant_id, payload.parent_doc_id)
            if parent_doc.case_id != case.id:
                raise ValidationException("parent_doc_id 不属于该案件")
            max_version = (
                await session.execute(
                    select(func.max(CaseDocument.version)).where(
                        and_(
                            CaseDocument.case_id == case.id,
                            CaseDocument.tenant_id == tenant_id,
                            CaseDocument.is_deleted.is_(False),
                            or_(
                                CaseDocument.id == payload.parent_doc_id,
                                CaseDocument.parent_doc_id == payload.parent_doc_id,
                            ),
                        )
                    )
                )
            ).scalar() or 1
            version = int(max_version) + 1

        # D7 秒传: 查租户内 file_hash 命中
        skip_upload = False
        reused_object_key: str | None = None
        if payload.file_hash:
            hit = (
                await session.execute(
                    select(CaseDocument.file_url).where(
                        and_(
                            CaseDocument.tenant_id == tenant_id,
                            CaseDocument.file_hash == payload.file_hash,
                            CaseDocument.is_deleted.is_(False),
                        )
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if hit:
                skip_upload = True
                reused_object_key = hit

        doc_id = f"doc_{uuid.uuid4().hex[:12]}"
        bucket = _get_bucket()
        object_key = reused_object_key or _object_key(
            tenant_id, case.id, doc_id, version, payload.doc_name
        )

        presigned_url: str | None = None
        if not skip_upload:
            provider = _get_storage_provider()
            try:
                presigned_url = await provider.get_presigned_put_url(
                    bucket=bucket,
                    object_key=object_key,
                    expires_in=_PRESIGNED_URL_EXPIRES,
                    content_type=None,
                    content_length=payload.doc_size,
                )
            except StorageException as e:
                raise BusinessException(code=5003, message=f"存储服务签发上传 URL 失败: {e}")

        upload_id = f"upl_{uuid.uuid4().hex[:12]}"
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=_UPLOAD_SESSION_TTL_SECONDS)
        metadata_json = json.dumps({
            "doc_name": payload.doc_name,
            "doc_type": payload.doc_type,
            "doc_category": payload.doc_category,
            "doc_size": payload.doc_size,
            "file_hash": payload.file_hash,
            "parent_doc_id": payload.parent_doc_id,
            "evidence_no": payload.evidence_no,
            "proof_purpose": payload.proof_purpose,
            "is_confidential": payload.is_confidential,
            "process_node_id": payload.process_node_id,
            "version": version,
            "skip_upload": skip_upload,
        }, ensure_ascii=False)

        await session.execute(
            text(
                """
                INSERT INTO upload_sessions (
                    id, tenant_id, case_id, folder_id, doc_id,
                    bucket, object_key, upload_metadata, expires_at,
                    is_deleted, created_at, created_by, updated_at, updated_by
                ) VALUES (
                    :id, :tid, :cid, :fid, :did,
                    :bucket, :key, CAST(:meta AS JSONB), :exp,
                    FALSE, NOW(), :uid, NOW(), :uid
                )
                """
            ),
            {
                "id": upload_id,
                "tid": tenant_id,
                "cid": case.id,
                "fid": folder.id,
                "did": doc_id,
                "bucket": bucket,
                "key": object_key,
                "meta": metadata_json,
                "exp": expires_at,
                "uid": user.id,
            },
        )

    required_headers: dict[str, str] = {}
    return UploadInitResponse(
        upload_id=upload_id,
        doc_id=doc_id,
        bucket=bucket,
        object_key=object_key,
        presigned_url=presigned_url,
        expires_in=_PRESIGNED_URL_EXPIRES,
        required_headers=required_headers,
        skip_upload=skip_upload,
    )


async def complete_upload(
    session: AsyncSession, tenant_id: str, payload: UploadCompleteRequest, user: SysUser
) -> DocumentVO:
    from sqlalchemy import text

    async with session.begin_nested():
        sess_row = (
            await session.execute(
                text(
                    "SELECT id, case_id, folder_id, doc_id, bucket, object_key, "
                    "upload_metadata, expires_at, completed_at, aborted_at "
                    "FROM upload_sessions WHERE id=:id AND tenant_id=:tid AND is_deleted=FALSE"
                ),
                {"id": payload.upload_id, "tid": tenant_id},
            )
        ).fetchone()
        if sess_row is None:
            raise NotFoundException(resource="上传会话", resource_id=payload.upload_id)
        if sess_row.completed_at is not None:
            raise BusinessException(code=4301, message="上传会话已完成, 不可重复")
        if sess_row.aborted_at is not None:
            raise BusinessException(code=4302, message="上传会话已取消")
        now = datetime.now(timezone.utc)
        # SQL 返回可能是 naive datetime, 容忍处理
        expires_at = sess_row.expires_at
        if expires_at is not None and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at is not None and expires_at < now:
            raise BusinessException(code=4303, message="上传会话已过期, 请重新 init")

        meta = sess_row.upload_metadata or {}
        case = await _require_can_upload_document(session, tenant_id, sess_row.case_id, user)

        # 校验 MinIO 对象存在性 + 大小 (秒传跳过校验)
        bucket = sess_row.bucket
        object_key = sess_row.object_key
        if not meta.get("skip_upload"):
            provider = _get_storage_provider()
            try:
                stat = await provider.stat_object(bucket, object_key)
            except FileNotFoundException:
                raise BusinessException(code=4304, message="对象未上传, 请先 PUT 再 complete")
            expected_size = int(meta.get("doc_size") or 0)
            if expected_size and int(stat["size"]) != expected_size:
                raise BusinessException(
                    code=4305,
                    message=f"上传大小不匹配: 期望 {expected_size}, 实际 {stat['size']}",
                )

        # 版本链处理: parent_doc_id 存在时, 把老版本的 is_latest 设为 FALSE
        parent_doc_id = meta.get("parent_doc_id")
        if parent_doc_id:
            rows = (
                await session.execute(
                    select(CaseDocument)
                    .where(
                        and_(
                            CaseDocument.case_id == case.id,
                            CaseDocument.tenant_id == tenant_id,
                            CaseDocument.is_deleted.is_(False),
                            or_(
                                CaseDocument.id == parent_doc_id,
                                CaseDocument.parent_doc_id == parent_doc_id,
                            ),
                        )
                    )
                    .with_for_update()
                )
            ).scalars().all()
            for r in rows:
                if r.is_latest:
                    r.is_latest = False
                    r.updated_by = user.id

        # 插 case_documents
        doc = CaseDocument(
            id=sess_row.doc_id,
            tenant_id=tenant_id,
            case_id=case.id,
            folder_id=sess_row.folder_id,
            process_node_id=meta.get("process_node_id"),
            doc_category=meta.get("doc_category"),
            doc_name=meta["doc_name"],
            doc_type=meta["doc_type"],
            doc_size=int(meta["doc_size"]),
            file_hash=meta.get("file_hash"),
            file_url=object_key,
            version=int(meta.get("version") or 1),
            parent_doc_id=parent_doc_id,
            is_latest=True,
            evidence_no=meta.get("evidence_no"),
            proof_purpose=meta.get("proof_purpose"),
            is_confidential=bool(meta.get("is_confidential", False)),
            uploader_id=user.id,
            upload_time=now,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(doc)
        await session.flush()

        # 自动授予上传者 EDIT 权限 (BUG-DS-003)
        doc_perm = DocumentPermission(
            tenant_id=tenant_id,
            case_id=case.id,
            target_type=PermissionTargetType.DOCUMENT.value,
            target_id=doc.id,
            grantee_type=GranteeType.USER.value,
            grantee_id=user.id,
            permission_type=PermissionType.EDIT.value,
            granted_by=user.id,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(doc_perm)

        # 标记 upload_session 完成
        await session.execute(
            text(
                "UPDATE upload_sessions SET completed_at=NOW(), updated_by=:uid, updated_at=NOW() "
                "WHERE id=:id"
            ),
            {"id": payload.upload_id, "uid": user.id},
        )

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="UPLOAD",
            action_detail=f"上传文档【{doc.doc_name}】v{doc.version}",
            target_record_id=doc.id,
            before_data=None,
            after_data=_doc_snapshot(doc),
        )

        cat_map = await _load_doc_category_map(session, tenant_id)
        user_map = await _load_user_names(session, tenant_id, [user.id])

    return _document_to_vo(
        doc,
        doc_category_name=cat_map.get(doc.doc_category) if doc.doc_category else None,
        uploader_name=user_map.get(user.id),
    )


async def abort_upload(
    session: AsyncSession, tenant_id: str, payload: UploadAbortRequest, user: SysUser
) -> None:
    from sqlalchemy import text

    async with session.begin_nested():
        row = (
            await session.execute(
                text(
                    "SELECT id, completed_at, aborted_at FROM upload_sessions "
                    "WHERE id=:id AND tenant_id=:tid AND is_deleted=FALSE"
                ),
                {"id": payload.upload_id, "tid": tenant_id},
            )
        ).fetchone()
        if row is None:
            raise NotFoundException(resource="上传会话", resource_id=payload.upload_id)
        if row.completed_at or row.aborted_at:
            return  # 幂等: 已完成/已取消视为成功
        await session.execute(
            text(
                "UPDATE upload_sessions SET aborted_at=NOW(), updated_by=:uid, updated_at=NOW() "
                "WHERE id=:id"
            ),
            {"id": payload.upload_id, "uid": user.id},
        )


# =============================================================================
# 2.5 下载 URL
# =============================================================================


async def get_download_url(
    session: AsyncSession, tenant_id: str, payload: DownloadUrlRequest, user: SysUser
) -> DownloadUrlResponse:
    async with session.begin_nested():
        doc = await _load_document_or_404(session, tenant_id, payload.doc_id)
        case = await _require_case_readable(session, tenant_id, doc.case_id, user)

        if not await _can_access_document(
            session, tenant_id, user, case, doc, PermissionType.DOWNLOAD
        ):
            raise BusinessException(code=4015, message="无下载权限 (需 DOWNLOAD 级别)")

        provider = _get_storage_provider()
        response_headers = None
        if payload.disposition == "inline":
            response_headers = {
                "response-content-disposition": f'inline; filename="{doc.doc_name}"'
            }
        elif payload.disposition == "attachment":
            response_headers = {
                "response-content-disposition": f'attachment; filename="{doc.doc_name}"'
            }
        try:
            url = await provider.get_file_url(
                bucket=_get_bucket(),
                filename=doc.file_url,
                expires=_PRESIGNED_URL_EXPIRES,
                response_headers=response_headers,
            )
        except StorageException as e:
            raise BusinessException(code=5003, message=f"存储服务签发下载 URL 失败: {e}")

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="DOWNLOAD",
            action_detail=f"下载【{doc.doc_name}】v{doc.version}",
            target_record_id=doc.id,
        )

    return DownloadUrlResponse(doc_id=doc.id, presigned_url=url, expires_in=_PRESIGNED_URL_EXPIRES)


# =============================================================================
# 2.6 文档 CRUD (rename / move / delete)
# =============================================================================


async def rename_document(
    session: AsyncSession, tenant_id: str, payload: DocumentRenameRequest, user: SysUser
) -> DocumentVO:
    async with session.begin_nested():
        doc = await _load_document_or_404(session, tenant_id, payload.doc_id, for_update=True)
        case = await _require_can_upload_document(session, tenant_id, doc.case_id, user)
        if not await _can_access_document(session, tenant_id, user, case, doc, PermissionType.EDIT):
            raise BusinessException(code=4016, message="无文档编辑权限")

        before = _doc_snapshot(doc)
        doc.doc_name = payload.new_name
        doc.updated_by = user.id
        doc.updated_at = datetime.now(timezone.utc)
        await session.flush()
        after = _doc_snapshot(doc)
        bdiff, adiff = compute_field_diff(before, after)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="UPDATE",
            action_detail=f"重命名文档【{before['doc_name']}】→【{after['doc_name']}】",
            target_record_id=doc.id,
            before_data=bdiff,
            after_data=adiff,
        )

        cat_map = await _load_doc_category_map(session, tenant_id)
        user_map = await _load_user_names(session, tenant_id, [doc.uploader_id])

    return _document_to_vo(
        doc,
        doc_category_name=cat_map.get(doc.doc_category) if doc.doc_category else None,
        uploader_name=user_map.get(doc.uploader_id),
    )


async def move_document(
    session: AsyncSession, tenant_id: str, payload: DocumentMoveRequest, user: SysUser
) -> DocumentVO:
    async with session.begin_nested():
        doc = await _load_document_or_404(session, tenant_id, payload.doc_id, for_update=True)
        case = await _require_can_upload_document(session, tenant_id, doc.case_id, user)
        target_folder = await _load_folder_or_404(session, tenant_id, payload.target_folder_id)
        if target_folder.case_id != case.id:
            raise ValidationException("目标文件夹不属于该案件")

        before = _doc_snapshot(doc)
        doc.folder_id = target_folder.id
        doc.updated_by = user.id
        doc.updated_at = datetime.now(timezone.utc)
        await session.flush()
        after = _doc_snapshot(doc)
        bdiff, adiff = compute_field_diff(before, after)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="UPDATE",
            action_detail=f"移动文档【{doc.doc_name}】到文件夹【{target_folder.folder_name}】",
            target_record_id=doc.id,
            before_data=bdiff,
            after_data=adiff,
        )

        cat_map = await _load_doc_category_map(session, tenant_id)
        user_map = await _load_user_names(session, tenant_id, [doc.uploader_id])

    return _document_to_vo(
        doc,
        doc_category_name=cat_map.get(doc.doc_category) if doc.doc_category else None,
        uploader_name=user_map.get(doc.uploader_id),
    )


async def delete_document(
    session: AsyncSession, tenant_id: str, payload: DocumentDeleteRequest, user: SysUser
) -> None:
    async with session.begin_nested():
        doc = await _load_document_or_404(session, tenant_id, payload.doc_id, for_update=True)
        case = await _require_can_upload_document(session, tenant_id, doc.case_id, user)

        before = _doc_snapshot(doc)
        doc.is_deleted = True
        doc.updated_by = user.id
        doc.updated_at = datetime.now(timezone.utc)
        await session.flush()

        # 若删除的是 is_latest, 把同链下 version 最大的有效行设为 is_latest
        if before["is_latest"]:
            root_id = doc.parent_doc_id or doc.id
            latest = (
                await session.execute(
                    select(CaseDocument)
                    .where(
                        and_(
                            CaseDocument.case_id == case.id,
                            CaseDocument.tenant_id == tenant_id,
                            CaseDocument.is_deleted.is_(False),
                            or_(CaseDocument.id == root_id, CaseDocument.parent_doc_id == root_id),
                        )
                    )
                    .order_by(CaseDocument.version.desc())
                    .limit(1)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if latest is not None:
                latest.is_latest = True
                latest.updated_by = user.id

        reason_suffix = f" (原因: {payload.reason})" if payload.reason else ""
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="DELETE",
            action_detail=f"删除文档【{doc.doc_name}】v{before['version']}{reason_suffix}",
            target_record_id=doc.id,
            before_data=before,
            after_data=None,
        )


# =============================================================================
# 2.7 文件夹 CRUD
# =============================================================================


async def create_folder(
    session: AsyncSession, tenant_id: str, payload: FolderCreateRequest, user: SysUser
) -> FolderVO:
    # 使用 begin_nested() 兼容 FastAPI 依赖注入中 get_current_user 已触发 autobegin 的场景
    async with session.begin_nested():
        case = await _require_can_upload_document(session, tenant_id, payload.case_id, user)
        if payload.parent_id:
            parent = await _load_folder_or_404(session, tenant_id, payload.parent_id)
            if parent.case_id != case.id:
                raise ValidationException("父文件夹不属于该案件")

        # 同级唯一
        dup = (
            await session.execute(
                select(func.count(CaseDocumentFolder.id)).where(
                    and_(
                        CaseDocumentFolder.case_id == case.id,
                        CaseDocumentFolder.tenant_id == tenant_id,
                        CaseDocumentFolder.is_deleted.is_(False),
                        CaseDocumentFolder.parent_id == payload.parent_id,
                        CaseDocumentFolder.folder_name == payload.folder_name,
                    )
                )
            )
        ).scalar() or 0
        if dup > 0:
            raise BusinessException(code=4306, message="同级文件夹名已存在")

        folder_id = f"folder_{uuid.uuid4().hex[:12]}"
        folder = CaseDocumentFolder(
            id=folder_id,
            tenant_id=tenant_id,
            case_id=case.id,
            parent_id=payload.parent_id,
            folder_name=payload.folder_name,
            sort_order=payload.sort_order,
            is_system=False,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(folder)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="CREATE",
            action_detail=f"新建文件夹【{folder.folder_name}】",
            target_record_id=folder.id,
            before_data=None,
            after_data=_folder_snapshot(folder),
        )

    # 显式提交外层事务
    await session.commit()
    return _folder_to_vo(folder)


async def rename_folder(
    session: AsyncSession, tenant_id: str, payload: FolderRenameRequest, user: SysUser
) -> FolderVO:
    async with session.begin_nested():
        folder = await _load_folder_or_404(session, tenant_id, payload.folder_id, for_update=True)
        if folder.is_system:
            raise BusinessException(code=4307, message="系统文件夹不可重命名")
        case = await _require_can_upload_document(session, tenant_id, folder.case_id, user)

        before = _folder_snapshot(folder)
        folder.folder_name = payload.new_name
        folder.updated_by = user.id
        folder.updated_at = datetime.now(timezone.utc)
        await session.flush()
        after = _folder_snapshot(folder)
        bdiff, adiff = compute_field_diff(before, after)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="UPDATE",
            action_detail=f"重命名文件夹【{before['folder_name']}】→【{after['folder_name']}】",
            target_record_id=folder.id,
            before_data=bdiff,
            after_data=adiff,
        )

    return _folder_to_vo(folder)


async def delete_folder(
    session: AsyncSession, tenant_id: str, payload: FolderDeleteRequest, user: SysUser
) -> None:
    async with session.begin_nested():
        folder = await _load_folder_or_404(session, tenant_id, payload.folder_id, for_update=True)
        if folder.is_system:
            raise BusinessException(code=4307, message="系统文件夹不可删除")
        case = await _require_can_upload_document(session, tenant_id, folder.case_id, user)

        # 有效子文件夹数
        sub_count = (
            await session.execute(
                select(func.count(CaseDocumentFolder.id)).where(
                    and_(
                        CaseDocumentFolder.tenant_id == tenant_id,
                        CaseDocumentFolder.parent_id == folder.id,
                        CaseDocumentFolder.is_deleted.is_(False),
                    )
                )
            )
        ).scalar() or 0
        doc_count = (
            await session.execute(
                select(func.count(CaseDocument.id)).where(
                    and_(
                        CaseDocument.tenant_id == tenant_id,
                        CaseDocument.folder_id == folder.id,
                        CaseDocument.is_deleted.is_(False),
                    )
                )
            )
        ).scalar() or 0
        if int(sub_count) > 0 or int(doc_count) > 0:
            raise BusinessException(
                code=4310,
                message="文件夹非空, 请先清空子文件夹和文档",
                details={"document_count": int(doc_count), "folder_count": int(sub_count)},
            )

        before = _folder_snapshot(folder)
        folder.is_deleted = True
        folder.updated_by = user.id
        folder.updated_at = datetime.now(timezone.utc)
        await session.flush()

        reason_suffix = f" (原因: {payload.reason})" if payload.reason else ""
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="DELETE",
            action_detail=f"删除文件夹【{before['folder_name']}】{reason_suffix}",
            target_record_id=folder.id,
            before_data=before,
            after_data=None,
        )


# =============================================================================
# 2.8 权限授予 / 撤销 / 列表
# =============================================================================


def _permission_to_vo(p: DocumentPermission, *, grantee_name: str | None = None) -> PermissionVO:
    now = datetime.now(timezone.utc)
    expired = bool(p.expire_at and p.expire_at < now)
    return PermissionVO(
        id=p.id,
        case_id=p.case_id,
        target_type=PermissionTargetType(p.target_type),
        target_type_name=label_of(p.target_type, PermissionTargetType),
        target_id=p.target_id,
        grantee_type=GranteeType(p.grantee_type),
        grantee_type_name=label_of(p.grantee_type, GranteeType),
        grantee_id=p.grantee_id,
        grantee_name=grantee_name,
        permission_type=PermissionType(p.permission_type),
        permission_type_name=label_of(p.permission_type, PermissionType),
        expire_at=p.expire_at,
        granted_by=p.granted_by,
        source_request_id=p.source_request_id,
        created_at=p.created_at,
        is_expired=expired,
    )


async def grant_permission(
    session: AsyncSession, tenant_id: str, payload: PermissionGrantRequest, user: SysUser
) -> PermissionVO:
    async with session.begin_nested():
        case = await _require_can_manage_permissions(session, tenant_id, payload.case_id, user)
        # target 归属校验
        if payload.target_type == PermissionTargetType.FOLDER:
            folder = await _load_folder_or_404(session, tenant_id, payload.target_id)
            if folder.case_id != case.id:
                raise ValidationException("目标文件夹不属于该案件")
        elif payload.target_type == PermissionTargetType.DOCUMENT:
            doc = await _load_document_or_404(session, tenant_id, payload.target_id)
            if doc.case_id != case.id:
                raise ValidationException("目标文档不属于该案件")

        # upsert: 查同 (case, target, grantee, permission_type) 已有行
        existing = (
            await session.execute(
                select(DocumentPermission)
                .where(
                    and_(
                        DocumentPermission.case_id == case.id,
                        DocumentPermission.tenant_id == tenant_id,
                        DocumentPermission.target_type == payload.target_type.value,
                        DocumentPermission.target_id == payload.target_id,
                        DocumentPermission.grantee_type == payload.grantee_type.value,
                        DocumentPermission.grantee_id == payload.grantee_id,
                        DocumentPermission.permission_type == payload.permission_type.value,
                        DocumentPermission.is_deleted.is_(False),
                    )
                )
                .with_for_update()
            )
        ).scalar_one_or_none()

        if existing is not None:
            existing.expire_at = payload.expire_at
            existing.granted_by = user.id
            existing.updated_by = user.id
            existing.updated_at = datetime.now(timezone.utc)
            if payload.source_request_id:
                existing.source_request_id = payload.source_request_id
            perm = existing
        else:
            perm = DocumentPermission(
                id=f"perm_{uuid.uuid4().hex[:12]}",
                tenant_id=tenant_id,
                case_id=case.id,
                target_type=payload.target_type.value,
                target_id=payload.target_id,
                grantee_type=payload.grantee_type.value,
                grantee_id=payload.grantee_id,
                permission_type=payload.permission_type.value,
                expire_at=payload.expire_at,
                granted_by=user.id,
                source_request_id=payload.source_request_id,
                created_by=user.id,
                updated_by=user.id,
            )
            session.add(perm)
            await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="UPDATE",
            action_detail=(
                f"授权 {payload.grantee_type.value}:{payload.grantee_id} "
                f"对 {payload.target_type.value}:{payload.target_id} "
                f"的 {payload.permission_type.value} 权限"
            ),
            target_record_id=perm.id,
            before_data=None,
            after_data={
                "target_type": perm.target_type,
                "target_id": perm.target_id,
                "grantee_type": perm.grantee_type,
                "grantee_id": perm.grantee_id,
                "permission_type": perm.permission_type,
                "expire_at": perm.expire_at.isoformat() if perm.expire_at else None,
            },
        )

        grantee_name = None
        if perm.grantee_type == GranteeType.USER.value:
            name_map = await _load_user_names(session, tenant_id, [perm.grantee_id])
            grantee_name = name_map.get(perm.grantee_id)

    return _permission_to_vo(perm, grantee_name=grantee_name)


async def revoke_permission(
    session: AsyncSession, tenant_id: str, payload: PermissionRevokeRequest, user: SysUser
) -> None:
    async with session.begin_nested():
        perm = (
            await session.execute(
                select(DocumentPermission)
                .where(
                    and_(
                        DocumentPermission.id == payload.permission_id,
                        DocumentPermission.tenant_id == tenant_id,
                        DocumentPermission.is_deleted.is_(False),
                    )
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if perm is None:
            raise NotFoundException(resource="权限记录", resource_id=payload.permission_id)

        case = await _require_can_manage_permissions(session, tenant_id, perm.case_id, user)

        before = {
            "target_type": perm.target_type,
            "target_id": perm.target_id,
            "grantee_type": perm.grantee_type,
            "grantee_id": perm.grantee_id,
            "permission_type": perm.permission_type,
        }
        perm.is_deleted = True
        perm.updated_by = user.id
        perm.updated_at = datetime.now(timezone.utc)
        await session.flush()

        reason_suffix = f" (原因: {payload.reason})" if payload.reason else ""
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="UPDATE",
            action_detail=f"撤销权限 {perm.id}{reason_suffix}",
            target_record_id=perm.id,
            before_data=before,
            after_data=None,
        )


async def list_permissions(
    session: AsyncSession, tenant_id: str, payload: PermissionsListRequest, user: SysUser
) -> PermissionsListResponse:
    case = await _require_case_readable(session, tenant_id, payload.case_id, user)

    filters = [
        DocumentPermission.case_id == case.id,
        DocumentPermission.tenant_id == tenant_id,
        DocumentPermission.is_deleted.is_(False),
    ]
    if payload.target_type:
        filters.append(DocumentPermission.target_type == payload.target_type.value)
    if payload.target_id:
        filters.append(DocumentPermission.target_id == payload.target_id)

    rows = (
        await session.execute(
            select(DocumentPermission).where(*filters).order_by(DocumentPermission.created_at.desc())
        )
    ).scalars().all()

    grantee_user_ids = [r.grantee_id for r in rows if r.grantee_type == GranteeType.USER.value]
    name_map = await _load_user_names(session, tenant_id, grantee_user_ids)

    return PermissionsListResponse(
        total=len(rows),
        items=[
            _permission_to_vo(
                r,
                grantee_name=name_map.get(r.grantee_id) if r.grantee_type == GranteeType.USER.value else None,
            )
            for r in rows
        ],
    )


# =============================================================================
# 2.9 授权申请 (D8 轻实现)
# =============================================================================


def _auth_request_to_vo(
    req: DocumentAuthRequest,
    *,
    applicant_name: str | None = None,
    reviewer_name: str | None = None,
) -> AuthRequestVO:
    return AuthRequestVO(
        id=req.id,
        case_id=req.case_id,
        target_type=PermissionTargetType(req.target_type),
        target_type_name=label_of(req.target_type, PermissionTargetType),
        target_id=req.target_id,
        requested_permission=PermissionType(req.requested_permission),
        requested_permission_name=label_of(req.requested_permission, PermissionType),
        applicant_id=req.applicant_id,
        applicant_name=applicant_name,
        reason=req.reason,
        requested_duration_days=req.requested_duration_days,
        status=AuthRequestStatus(req.status or AuthRequestStatus.PENDING.value),
        status_name=label_of(req.status or AuthRequestStatus.PENDING.value, AuthRequestStatus),
        reviewer_id=req.reviewer_id,
        reviewer_name=reviewer_name,
        review_comment=req.review_comment,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


async def create_auth_request(
    session: AsyncSession, tenant_id: str, payload: AuthRequestCreateRequest, user: SysUser
) -> AuthRequestVO:
    async with session.begin_nested():
        case = await _load_case_or_404(session, tenant_id, payload.case_id)
        # 申请者需属于同租户; 无需案件成员 (EXTERNAL_COUNSEL 未加入也可申请)
        # target 归属校验
        if payload.target_type == PermissionTargetType.FOLDER:
            folder = await _load_folder_or_404(session, tenant_id, payload.target_id)
            if folder.case_id != case.id:
                raise ValidationException("目标文件夹不属于该案件")
        elif payload.target_type == PermissionTargetType.DOCUMENT:
            doc = await _load_document_or_404(session, tenant_id, payload.target_id)
            if doc.case_id != case.id:
                raise ValidationException("目标文档不属于该案件")

        req = DocumentAuthRequest(
            id=f"auth_req_{uuid.uuid4().hex[:10]}",
            tenant_id=tenant_id,
            case_id=case.id,
            target_type=payload.target_type.value,
            target_id=payload.target_id,
            requested_permission=payload.requested_permission.value,
            applicant_id=user.id,
            reason=payload.reason,
            requested_duration_days=payload.requested_duration_days,
            status=AuthRequestStatus.PENDING.value,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(req)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case.id,
            operator=user,
            action_module="DOCUMENTS",
            action_type="CREATE",
            action_detail=(
                f"申请权限 {payload.requested_permission.value} 针对 "
                f"{payload.target_type.value}:{payload.target_id}"
            ),
            target_record_id=req.id,
            before_data=None,
            after_data={
                "target_type": req.target_type,
                "target_id": req.target_id,
                "requested_permission": req.requested_permission,
                "reason": req.reason,
            },
        )

    return _auth_request_to_vo(req, applicant_name=getattr(user, "real_name", None))


async def review_auth_request(
    session: AsyncSession, tenant_id: str, payload: AuthRequestReviewRequest, user: SysUser
) -> AuthRequestVO:
    async with session.begin_nested():
        req = (
            await session.execute(
                select(DocumentAuthRequest)
                .where(
                    and_(
                        DocumentAuthRequest.id == payload.request_id,
                        DocumentAuthRequest.tenant_id == tenant_id,
                        DocumentAuthRequest.is_deleted.is_(False),
                    )
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if req is None:
            raise NotFoundException(resource="授权申请", resource_id=payload.request_id)
        if req.status != AuthRequestStatus.PENDING.value:
            raise BusinessException(code=4308, message=f"申请已被处理 (当前状态: {req.status})")

        case = await _require_can_manage_permissions(session, tenant_id, req.case_id, user)

        now = datetime.now(timezone.utc)
        if payload.action == "APPROVE":
            req.status = AuthRequestStatus.APPROVED.value
            req.reviewer_id = user.id
            req.review_comment = payload.comment
            req.updated_by = user.id
            req.updated_at = now
            await session.flush()

            # 自动创建 document_permissions 行
            expire_at = None
            if req.requested_duration_days:
                expire_at = now + timedelta(days=int(req.requested_duration_days))
            perm = DocumentPermission(
                id=f"perm_{uuid.uuid4().hex[:12]}",
                tenant_id=tenant_id,
                case_id=case.id,
                target_type=req.target_type,
                target_id=req.target_id,
                grantee_type=GranteeType.USER.value,
                grantee_id=req.applicant_id,
                permission_type=req.requested_permission,
                expire_at=expire_at,
                granted_by=user.id,
                source_request_id=req.id,
                created_by=user.id,
                updated_by=user.id,
            )
            session.add(perm)
            await session.flush()

            await write_audit_log(
                session,
                tenant_id=tenant_id,
                case_id=case.id,
                operator=user,
                action_module="DOCUMENTS",
                action_type="UPDATE",
                action_detail=f"批准授权申请 {req.id}, 生成权限 {perm.id}",
                target_record_id=req.id,
                before_data={"status": AuthRequestStatus.PENDING.value},
                after_data={"status": AuthRequestStatus.APPROVED.value, "permission_id": perm.id},
            )
        else:  # REJECT
            req.status = AuthRequestStatus.REJECTED.value
            req.reviewer_id = user.id
            req.review_comment = payload.comment
            req.updated_by = user.id
            req.updated_at = now
            await session.flush()

            await write_audit_log(
                session,
                tenant_id=tenant_id,
                case_id=case.id,
                operator=user,
                action_module="DOCUMENTS",
                action_type="UPDATE",
                action_detail=f"拒绝授权申请 {req.id}",
                target_record_id=req.id,
                before_data={"status": AuthRequestStatus.PENDING.value},
                after_data={"status": AuthRequestStatus.REJECTED.value},
            )

        user_map = await _load_user_names(session, tenant_id, [req.applicant_id, user.id])

    return _auth_request_to_vo(
        req,
        applicant_name=user_map.get(req.applicant_id),
        reviewer_name=user_map.get(user.id),
    )


async def list_auth_requests(
    session: AsyncSession, tenant_id: str, payload: AuthRequestsListRequest, user: SysUser
) -> AuthRequestsListResponse:
    case = await _require_case_readable(session, tenant_id, payload.case_id, user)
    pagination = payload.pagination or DossierPagination()

    filters = [
        DocumentAuthRequest.case_id == case.id,
        DocumentAuthRequest.tenant_id == tenant_id,
        DocumentAuthRequest.is_deleted.is_(False),
    ]
    if payload.status_filter:
        filters.append(DocumentAuthRequest.status.in_([s.value for s in payload.status_filter]))

    total = (
        await session.execute(select(func.count(DocumentAuthRequest.id)).where(*filters))
    ).scalar() or 0
    rows = (
        await session.execute(
            select(DocumentAuthRequest)
            .where(*filters)
            .order_by(DocumentAuthRequest.created_at.desc())
            .offset((pagination.page - 1) * pagination.size)
            .limit(pagination.size)
        )
    ).scalars().all()

    user_ids = list({r.applicant_id for r in rows} | {r.reviewer_id for r in rows if r.reviewer_id})
    user_map = await _load_user_names(session, tenant_id, user_ids)

    return AuthRequestsListResponse(
        total=int(total),
        page=pagination.page,
        size=pagination.size,
        items=[
            _auth_request_to_vo(
                r,
                applicant_name=user_map.get(r.applicant_id),
                reviewer_name=user_map.get(r.reviewer_id) if r.reviewer_id else None,
            )
            for r in rows
        ],
    )


# =============================================================================
# 2.10 证据目录自动生成
# =============================================================================


async def generate_evidence_catalog(
    session: AsyncSession, tenant_id: str, payload: EvidenceCatalogRequest, user: SysUser
) -> EvidenceCatalogResponse:
    """根据 case_id 汇总所有证据卷文档, 按 evidence_no 排序生成目录."""
    case = await _require_case_readable(session, tenant_id, payload.case_id, user)

    # 查询所有证据类文档 (最新版本, 不限文件夹)
    filters = [
        CaseDocument.case_id == case.id,
        CaseDocument.tenant_id == tenant_id,
        CaseDocument.is_deleted.is_(False),
        CaseDocument.is_latest.is_(True),
        CaseDocument.doc_category == "EVIDENCE",
    ]

    rows = (
        await session.execute(
            select(CaseDocument)
            .where(*filters)
            .order_by(
                func.nulls_last(CaseDocument.evidence_no.asc()),
                CaseDocument.created_at.asc(),
            )
        )
    ).scalars().all()

    # 批量获取上传人姓名
    user_map = await _load_user_names(
        session, tenant_id, list({d.uploader_id for d in rows if d.uploader_id})
    )

    # 批量获取文件夹路径
    folder_ids = list({d.folder_id for d in rows if d.folder_id})
    folder_name_map: dict[str, str] = {}
    if folder_ids:
        f_rows = (
            await session.execute(
                select(CaseDocumentFolder.id, CaseDocumentFolder.folder_name).where(
                    CaseDocumentFolder.id.in_(folder_ids),
                    CaseDocumentFolder.tenant_id == tenant_id,
                    CaseDocumentFolder.is_deleted.is_(False),
                )
            )
        ).all()
        folder_name_map = {i: n for i, n in f_rows}

    items: list[EvidenceCatalogItem] = []
    for d in rows:
        folder_path = folder_name_map.get(d.folder_id, "")
        items.append(
            EvidenceCatalogItem(
                evidence_no=d.evidence_no,
                doc_name=d.doc_name,
                proof_purpose=d.proof_purpose,
                doc_type=d.doc_type,
                doc_size=int(d.doc_size or 0),
                uploader_name=user_map.get(d.uploader_id),
                upload_time=d.upload_time,
                folder_path=folder_path,
            )
        )

    return EvidenceCatalogResponse(
        case_id=case.id,
        case_name=getattr(case, "case_name", None),
        total=len(items),
        items=items,
    )
