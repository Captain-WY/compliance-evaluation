from fastapi import APIRouter

from app.modules.compliance.core.errors import (
    AppError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)

router = APIRouter(prefix="/_foundation", tags=["foundation"])


@router.get("/error-samples/{kind}", include_in_schema=False)
async def error_sample(kind: str) -> dict[str, str]:
    if kind == "unauthorized":
        raise UnauthorizedError()
    if kind == "forbidden":
        raise ForbiddenError()
    if kind == "not-found":
        raise NotFoundError("Foundation sample not found")
    if kind == "conflict":
        raise AppError(
            code=ErrorCode.CONFLICT,
            message="Foundation conflict sample",
            status_code=409,
        )
    if kind == "domain":
        raise AppError(
            code="SAMPLE_DOMAIN_ERROR",
            message="Foundation domain error sample",
            status_code=409,
        )
    return {"kind": kind}
