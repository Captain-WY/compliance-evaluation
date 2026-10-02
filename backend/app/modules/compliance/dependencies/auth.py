from typing import Annotated

from fastapi import Depends, Header

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.domain.auth_service import AuthLoginService, build_auth_service
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore, auth_store


def get_auth_store() -> SeedAuthStore:
    return auth_store


def get_auth_service(store: Annotated[SeedAuthStore, Depends(get_auth_store)]) -> AuthLoginService:
    return build_auth_service(get_settings(), store)


from app.platform.auth import ce_current_user as get_current_user


async def require_system_admin(
    current_user: Annotated[AuthUserRecord, Depends(get_current_user)],
    store: Annotated[SeedAuthStore, Depends(get_auth_store)],
) -> AuthUserRecord:
    store.require_permission(current_user, "PERM-SYSTEM-ADMIN")
    return current_user


async def require_system_admin_or_workflow_template_read(
    current_user: Annotated[AuthUserRecord, Depends(get_current_user)],
    store: Annotated[SeedAuthStore, Depends(get_auth_store)],
) -> AuthUserRecord:
    if store.has_permission(current_user, "PERM-SYSTEM-ADMIN") or store.has_permission(
        current_user,
        "PERM-P2-WORKFLOW-TEMPLATE-READ",
    ):
        return current_user
    from app.modules.compliance.core.errors import ForbiddenError

    raise ForbiddenError()


async def require_hq_inspection_or_admin(
    current_user: Annotated[AuthUserRecord, Depends(get_current_user)],
    store: Annotated[SeedAuthStore, Depends(get_auth_store)],
) -> AuthUserRecord:
    if store.has_permission(current_user, "PERM-SYSTEM-ADMIN") or store.has_permission(
        current_user,
        "PERM-HQ-INSPECTION-MANAGE",
    ):
        return current_user
    from app.modules.compliance.core.errors import ForbiddenError

    raise ForbiddenError()


async def require_hq_inspection_manage(
    current_user: Annotated[AuthUserRecord, Depends(get_current_user)],
    store: Annotated[SeedAuthStore, Depends(get_auth_store)],
) -> AuthUserRecord:
    store.require_permission(current_user, "PERM-HQ-INSPECTION-MANAGE")
    return current_user


AuthStoreDep = Annotated[SeedAuthStore, Depends(get_auth_store)]
AuthServiceDep = Annotated[AuthLoginService, Depends(get_auth_service)]
CurrentUserDep = Annotated[AuthUserRecord, Depends(get_current_user)]
SystemAdminDep = Annotated[AuthUserRecord, Depends(require_system_admin)]
SystemAdminOrWorkflowTemplateReadDep = Annotated[
    AuthUserRecord,
    Depends(require_system_admin_or_workflow_template_read),
]
HqInspectionOrAdminDep = Annotated[AuthUserRecord, Depends(require_hq_inspection_or_admin)]
HqInspectionManageDep = Annotated[AuthUserRecord, Depends(require_hq_inspection_manage)]
