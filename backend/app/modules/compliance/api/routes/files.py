from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.errors import AppError
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.providers.storage import StorageConfigurationError, build_object_storage_provider
from app.modules.compliance.repositories.file_asset_runtime import file_asset_runtime_repository

router = APIRouter(prefix="/files", tags=["files"])
UPLOAD_FILE = File(...)
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]


def _file_asset_runtime_enabled() -> bool:
    settings = get_settings()
    return (
        settings.assessment_runtime_persistence == "database"
        or settings.inspection_report_runtime_persistence == "database"
    )


def _storage_provider():
    try:
        return build_object_storage_provider(get_settings())
    except StorageConfigurationError as exc:
        raise AppError(
            code="STORAGE_CONFIGURATION_INVALID",
            message="File storage is not configured for the selected mode",
            status_code=503,
        ) from exc


@router.post("", name="file-upload")
async def file_upload(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    file: Annotated[UploadFile, UPLOAD_FILE],
) -> dict:
    content = await file.read()
    asset = await evidence_store.upload_file(
        user=user,
        auth_store=auth_store,
        storage=_storage_provider(),
        file_name=file.filename or "uploaded-file",
        content_type=file.content_type or "application/octet-stream",
        content=content,
    )
    if _file_asset_runtime_enabled():
        await file_asset_runtime_repository.save_file_asset(
            session,
            evidence_store.file_assets[asset["fileId"]],
        )
        await session.commit()
    return success_response(asset, request)


@router.get("/{file_id}/download", name="file-download")
async def file_download(
    file_id: str,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    settings = get_settings()
    # Generic file asset scope first
    try:
        asset = evidence_store.require_file_assets_for_user(
            file_ids=[file_id],
            user=user,
            auth_store=auth_store,
        )[0]
    except AppError:
        # Plan-scoped exception: target branch may download HQ-uploaded
        # preparation attachments bound to their inspection plan.
        if not evidence_store.can_download_via_plan_scope(
            file_id=file_id,
            user=user,
            auth_store=auth_store,
        ):
            raise
        asset = evidence_store.file_assets[file_id]
    try:
        download = _storage_provider().presign_get_object(
            key=asset.storage_key,
            expires_in_seconds=settings.s3_presigned_get_expires_seconds,
        )
    except StorageConfigurationError as exc:
        raise AppError(
            code="STORAGE_CONFIGURATION_INVALID",
            message="File storage is not configured for the selected mode",
            status_code=503,
        ) from exc
    except Exception as exc:
        raise AppError(
            code="FILE_DOWNLOAD_URL_FAILED",
            message="File download URL could not be issued",
            status_code=502,
        ) from exc
    return success_response(
        {
            "fileId": asset.file_id,
            "fileName": asset.file_name,
            "contentType": asset.content_type,
            "fileSize": asset.file_size,
            "checksum": asset.checksum,
            "downloadUrl": download.url,
            "expiresInSeconds": download.expires_in_seconds,
        },
        request,
    )
