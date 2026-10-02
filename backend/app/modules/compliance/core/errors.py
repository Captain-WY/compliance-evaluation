from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorCode(StrEnum):
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    CONFLICT = "CONFLICT"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class AppError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        details: Any | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Authentication is required") -> None:
        super().__init__(code=ErrorCode.UNAUTHORIZED, message=message, status_code=401)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Permission denied") -> None:
        super().__init__(code=ErrorCode.FORBIDDEN, message=message, status_code=403)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(code=ErrorCode.NOT_FOUND, message=message, status_code=404)


def get_request_id(request: Request) -> str:
    request_id = getattr(request.state, "request_id", None)
    return str(request_id) if request_id else ""


def error_payload(
    *,
    request: Request,
    code: str,
    message: str,
    details: Any | None = None,
) -> dict[str, Any]:
    return {
        "code": str(code),
        "message": message,
        "details": details,
        "requestId": get_request_id(request),
    }


def validation_details(exc: RequestValidationError) -> list[dict[str, str]]:
    details: list[dict[str, str]] = []
    for error in exc.errors():
        loc = error.get("loc", [])
        field = ".".join(str(item) for item in loc if item != "body")
        details.append(
            {
                "field": field or "body",
                "reason": str(error.get("msg", "Invalid value")),
            }
        )
    return details


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(
                request=request,
                code=exc.code,
                message=exc.message,
                details=exc.details,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_payload(
                request=request,
                code=ErrorCode.VALIDATION_ERROR,
                message="Validation failed",
                details=validation_details(exc),
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = ErrorCode.NOT_FOUND if exc.status_code == 404 else ErrorCode.INTERNAL_ERROR
        message = "Resource not found" if exc.status_code == 404 else str(exc.detail)
        if exc.status_code == 401:
            code = ErrorCode.UNAUTHORIZED
        elif exc.status_code == 403:
            code = ErrorCode.FORBIDDEN
        elif exc.status_code == 409:
            code = ErrorCode.CONFLICT
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(request=request, code=code, message=message),
        )
