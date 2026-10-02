from typing import Any

from fastapi import Request

from app.modules.compliance.core.errors import get_request_id


def success_response(data: Any, request: Request) -> dict[str, Any]:
    return {
        "data": data,
        "requestId": get_request_id(request),
    }
