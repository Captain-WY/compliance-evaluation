"""
结构化日志配置模块

使用 structlog + asgi-correlation-id 实现：
- 开发环境：彩色控制台输出
- 生产环境：单行 JSON 输出（可直接接入 ELK/Loki/Grafana）
- 全链路 trace_id/correlation_id 传播
- 请求/响应日志统一格式

设计要点：
1. structlog 使用 PrintLoggerFactory 直接输出到 stdout，避免 stdlib 双重格式化
2. 标准库 logging（uvicorn/sqlalchemy/httpx）通过 wrap 处理器统一格式
3. uvicorn 启动时必须传入 log_config=None，防止覆盖本配置
"""
import sys
import logging
from logging.handlers import RotatingFileHandler
from typing import Any

import structlog
from asgi_correlation_id import correlation_id

from .config import settings


# ───────────────────────────────────────────────
# 常量
# ───────────────────────────────────────────────
_LOG_FILE = "logs/app.jsonl"
_LOG_LEVEL = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
_IS_PROD = settings.ENVIRONMENT == "production"


# ───────────────────────────────────────────────
# 基础处理器（兼容 PrintLogger，不依赖 stdlib logger 属性）
# ───────────────────────────────────────────────
def _add_log_level(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """注入日志级别字符串."""
    event_dict["level"] = method_name
    return event_dict


def _add_logger_name(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """注入 logger 名称；PrintLogger 无 name 属性，使用 'app' 兜底."""
    event_dict["logger"] = getattr(logger, "name", "app")
    return event_dict


# ───────────────────────────────────────────────
# 处理器：注入 correlation_id / trace_id
# ───────────────────────────────────────────────
def _add_correlation_id(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """将 ASGI correlation_id 注入 structlog 事件字典."""
    cid = correlation_id.get()
    if cid:
        event_dict["trace_id"] = cid
        event_dict["correlation_id"] = cid
    return event_dict


def _add_environment(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """注入环境标识，便于多环境日志区分."""
    event_dict["environment"] = settings.ENVIRONMENT
    event_dict["service"] = settings.APP_NAME.lower().replace("-", "_")
    return event_dict


# ───────────────────────────────────────────────
# 最终渲染器（开发彩色 / 生产 JSON）
# ───────────────────────────────────────────────
def _get_renderer() -> structlog.types.Processor:
    if _IS_PROD:
        return structlog.processors.JSONRenderer()
    return structlog.dev.ConsoleRenderer(
        colors=True,
        pad_level=False,
        pad_event=25,
    )


# ───────────────────────────────────────────────
# 共享处理器链（structlog 与 stdlib 共用）
# ───────────────────────────────────────────────
SHARED_PROCESSORS: list[structlog.types.Processor] = [
    # 合并通过 bind_contextvars() 注入的上下文变量
    structlog.contextvars.merge_contextvars,
    # 注入 correlation_id / trace_id
    _add_correlation_id,
    # 注入环境信息
    _add_environment,
    # 添加 logger 名称（兼容 PrintLogger）
    _add_logger_name,
    # 添加日志级别（兼容 PrintLogger）
    _add_log_level,
    # 添加 ISO8601 时间戳（UTC）
    structlog.processors.TimeStamper(fmt="iso", utc=True),
    # 添加调用点信息（文件名/行号/函数名）
    structlog.processors.CallsiteParameterAdder(
        [
            structlog.processors.CallsiteParameter.FILENAME,
            structlog.processors.CallsiteParameter.LINENO,
            structlog.processors.CallsiteParameter.FUNC_NAME,
        ]
    ),
    # 异常信息格式化
    structlog.processors.StackInfoRenderer(),
    structlog.processors.format_exc_info,
    # 统一 event 字段名
    structlog.processors.UnicodeDecoder(),
]


# ───────────────────────────────────────────────
# 全局初始化
# ───────────────────────────────────────────────
def setup_logging() -> None:
    """
    初始化全局日志系统。

    必须在 uvicorn 启动前调用，且 uvicorn.run() 需传入 log_config=None
    以防止 uvicorn 覆盖本配置。
    """
    renderer = _get_renderer()

    # ── 1. structlog 配置：直接输出到 stdout ──
    # 使用 PrintLoggerFactory 绕过 stdlib logging，避免双重格式化。
    # 使用 make_filtering_bound_logger 在 BoundLogger 层面做级别过滤，兼容 PrintLogger。
    structlog.configure(
        processors=SHARED_PROCESSORS + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(_LOG_LEVEL),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # ── 2. 标准库 logging 桥接 ──
    # 第三方库（uvicorn, sqlalchemy, httpx）使用 stdlib logging。
    # 通过 ProcessorFormatter 让它们也输出同样的结构化格式。
    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=SHARED_PROCESSORS,
    )

    # stdout handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(_LOG_LEVEL)

    handlers: list[logging.Handler] = [console_handler]

    # 生产环境追加文件 handler
    if _IS_PROD:
        file_handler = RotatingFileHandler(
            _LOG_FILE,
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(_LOG_LEVEL)
        handlers.append(file_handler)

    # ── 根 logger ──
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    for h in handlers:
        root_logger.addHandler(h)
    root_logger.setLevel(_LOG_LEVEL)

    # ── 第三方库日志级别调优 ──
    # uvicorn access：由自定义 ASGI middleware 接管，降级避免重复
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    # uvicorn error：保留，走 structlog 统一格式
    logging.getLogger("uvicorn.error").setLevel(_LOG_LEVEL)
    # sqlalchemy engine：生产降级，避免查询日志淹没业务日志
    sa_level = logging.WARNING if _IS_PROD else logging.INFO
    logging.getLogger("sqlalchemy.engine").setLevel(sa_level)
    # 其他 noisy 库
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """获取结构化日志记录器。"""
    return structlog.get_logger(name)
