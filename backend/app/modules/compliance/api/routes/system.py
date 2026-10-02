from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import (
    AuthStoreDep,
    CurrentUserDep,
    HqInspectionOrAdminDep,
    SystemAdminDep,
    SystemAdminOrWorkflowTemplateReadDep,
)
from app.modules.compliance.domain.dictionaries import dictionary_contract_payload
from app.modules.compliance.domain.system_dictionary_service import (
    parse_requested_dict_types,
    system_dictionary_service,
)
from app.modules.compliance.schemas.auth import RoleAssignmentCreateRequest
from app.modules.compliance.schemas.system_dictionary import (
    DictionaryAdminItemCreateRequest,
    DictionaryAdminItemUpdateRequest,
    DictionaryAdminSortRequest,
)

router = APIRouter(prefix="/system", tags=["system"])
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/org-tree", name="org-tree")
async def org_tree(
    request: Request,
    _: HqInspectionOrAdminDep,
    store: AuthStoreDep,
) -> dict:
    return success_response(store.org_tree(), request)


@router.get("/dictionaries", name="system-dictionary-contract")
async def system_dictionaries(
    request: Request,
    _: CurrentUserDep,
) -> dict:
    return success_response(dictionary_contract_payload(), request)


@router.get("/config-dictionaries", name="system-config-dictionaries")
async def system_config_dictionaries(
    request: Request,
    _: CurrentUserDep,
    session: DbSessionDep,
    types: Annotated[str | None, Query()] = None,
) -> dict:
    dict_types = parse_requested_dict_types(types)
    payload = await system_dictionary_service.config_dictionaries(session, dict_types=dict_types)
    return success_response(payload, request)


@router.get("/dictionary-admin/types", name="system-dictionary-admin-type-list")
async def dictionary_admin_type_list(
    request: Request,
    _: SystemAdminDep,
    session: DbSessionDep,
) -> dict:
    payload = await system_dictionary_service.admin_type_list(session)
    return success_response(payload, request)


@router.get("/dictionary-admin/items", name="system-dictionary-admin-item-list")
async def dictionary_admin_item_list(
    request: Request,
    _: SystemAdminDep,
    session: DbSessionDep,
    dict_type: Annotated[str | None, Query(alias="dictType")] = None,
    keyword: Annotated[str | None, Query()] = None,
    active: Annotated[bool | None, Query()] = None,
    include_deleted: Annotated[bool, Query(alias="includeDeleted")] = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    payload = await system_dictionary_service.admin_item_page(
        session,
        dict_type=dict_type,
        keyword=keyword,
        active=active,
        include_deleted=include_deleted,
        page=page,
        page_size=page_size,
    )
    return success_response(payload, request)


@router.post("/dictionary-admin/items", name="system-dictionary-admin-item-create")
async def dictionary_admin_item_create(
    payload: DictionaryAdminItemCreateRequest,
    request: Request,
    user: SystemAdminDep,
    session: DbSessionDep,
) -> dict:
    result = await system_dictionary_service.create_admin_item(session, payload=payload, user=user)
    return success_response(result, request)


@router.patch("/dictionary-admin/items/{dictId}", name="system-dictionary-admin-item-update")
async def dictionary_admin_item_update(
    dict_id: Annotated[str, Path(alias="dictId")],
    payload: DictionaryAdminItemUpdateRequest,
    request: Request,
    user: SystemAdminDep,
    session: DbSessionDep,
) -> dict:
    result = await system_dictionary_service.update_admin_item(
        session,
        dict_id=dict_id,
        payload=payload,
        user=user,
    )
    return success_response(result, request)


@router.delete("/dictionary-admin/items/{dictId}", name="system-dictionary-admin-item-delete")
async def dictionary_admin_item_delete(
    dict_id: Annotated[str, Path(alias="dictId")],
    request: Request,
    user: SystemAdminDep,
    session: DbSessionDep,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> dict:
    result = await system_dictionary_service.delete_admin_item(
        session,
        dict_id=dict_id,
        version=version,
        user=user,
    )
    return success_response(result, request)


@router.post("/dictionary-admin/items:sort", name="system-dictionary-admin-item-sort")
async def dictionary_admin_item_sort(
    payload: DictionaryAdminSortRequest,
    request: Request,
    user: SystemAdminDep,
    session: DbSessionDep,
) -> dict:
    result = await system_dictionary_service.sort_admin_items(session, payload=payload, user=user)
    return success_response(result, request)


@router.get("/personnel", name="personnel-list")
async def personnel_list(
    request: Request,
    _: SystemAdminOrWorkflowTemplateReadDep,
    store: AuthStoreDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    sort: Annotated[str, Query()] = "displayName",
) -> dict:
    page_data = store.personnel_page(page=page, page_size=page_size, sort=sort)
    return success_response(page_data, request)


@router.get("/roles", name="role-list")
async def role_list(
    request: Request,
    _: SystemAdminOrWorkflowTemplateReadDep,
    store: AuthStoreDep,
) -> dict:
    return success_response(store.role_list(), request)


@router.get("/role-assignments", name="role-assignment-list")
async def role_assignment_list(
    request: Request,
    _: SystemAdminDep,
    store: AuthStoreDep,
) -> dict:
    return success_response(store.role_assignment_list(), request)


@router.post("/role-assignments", name="role-assignment-create")
async def role_assignment_create(
    payload: RoleAssignmentCreateRequest,
    request: Request,
    user: SystemAdminDep,
    store: AuthStoreDep,
) -> dict:
    from app.adapters.roles import create_assignment
    assignment = await create_assignment(payload,user)
    return success_response(assignment, request)


@router.delete("/role-assignments/{assignmentId}", name="role-assignment-delete")
async def role_assignment_delete(
    assignment_id: Annotated[str, Path(alias="assignmentId")],
    request: Request,
    _: SystemAdminDep,
    store: AuthStoreDep,
) -> dict:
    from app.adapters.roles import delete_assignment
    return success_response(await delete_assignment(assignment_id), request)
