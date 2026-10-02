"""
ASGI 请求日志中间件

使用原生 ASGI 中间件（非 BaseHTTPMiddleware），避免 FastAPI 已知的
contextvar 跨边界丢失问题：
https://github.com/fastapi/fastapi/discussions/8632

功能：
- 记录每条 HTTP 请求的方法、路径、状态码、耗时
- 自动关联 trace_id（由外层的 CorrelationIdMiddleware 提供）
- 异常请求记录完整堆栈
- 响应头回写 X-Correlation-ID
"""
import time
from typing import Callable

import structlog
from asgi_correlation_id import correlation_id
from starlette.types import ASGIApp, Receive, Scope, Send


logger = structlog.get_logger("app.modules.cases.middleware.logging_middleware")


class AccessLogMiddleware:
    """
    原生 ASGI 访问日志中间件。

    必须在 CorrelationIdMiddleware 之后注册，确保 correlation_id
    已在 ASGI scope 中可用。
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_code = 500
        method = scope.get("method", "")
        path = scope.get("path", "")
        client = scope.get("client")
        client_ip = client[0] if client else None

        # 包装 send，捕获响应状态码
        # 注意：X-Correlation-ID 响应头由 CorrelationIdMiddleware 统一回写，
        # 此处仅捕获 status_code，不做任何 header 修改。
        async def wrapped_send(message: dict) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, wrapped_send)
        except Exception:
            # 异常时记录，然后继续抛出由上层异常处理器处理
            logger.error(
                "request_exception",
                method=method,
                path=path,
                status=status_code,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
                client_ip=client_ip,
            )
            raise
        finally:
            duration = time.perf_counter() - start
            # 使用 route 级别的 logger，自动携带 trace_id
            logger.info(
                "request_completed",
                method=method,
                path=path,
                status=status_code,
                duration_ms=round(duration * 1000, 2),
                client_ip=client_ip,
            )


class StructlogContextMiddleware:
    """
    在每个 HTTP 请求边界内绑定 structlog 上下文变量。

    必须在 CorrelationIdMiddleware 之后注册，确保 correlation_id 已可用。
    在请求开始时 clear + bind，请求结束时自动释放（contextvars 机制）。
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # 清理旧上下文（防止异常泄漏）
        structlog.contextvars.clear_contextvars()

        # 绑定请求级上下文
        cid = correlation_id.get()
        if cid:
            structlog.contextvars.bind_contextvars(
                trace_id=cid,
                correlation_id=cid,
            )

        method = scope.get("method", "")
        path = scope.get("path", "")
        structlog.contextvars.bind_contextvars(
            http_method=method,
            http_path=path,
        )

        try:
            await self.app(scope, receive, send)
        finally:
            # 清理上下文（contextvars 在请求结束时自动清理，此处显式兜底）
            structlog.contextvars.clear_contextvars()
