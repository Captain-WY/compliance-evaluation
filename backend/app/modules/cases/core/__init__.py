"""
核心模块
包含配置、数据库连接、异常处理、安全工具等基础设施
"""
from .config import Settings, get_settings, settings
from .database import Base, AsyncSessionLocal, get_db, init_db, close_db
from .exceptions import (
    BusinessException,
    NotFoundException,
    PermissionDeniedException,
    ValidationException,
    BudgetInsufficientException,
    CaseStageTransitionException,
    DuplicateException,
)
from .security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token,
    generate_password_reset_token,
    verify_password_reset_token,
)

__all__ = [
    # 配置
    "Settings",
    "get_settings",
    "settings",
    # 数据库
    "Base",
    "AsyncSessionLocal",
    "get_db",
    "init_db",
    "close_db",
    # 异常
    "BusinessException",
    "NotFoundException",
    "PermissionDeniedException",
    "ValidationException",
    "BudgetInsufficientException",
    "CaseStageTransitionException",
    "DuplicateException",
    # 安全
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "decode_access_token",
    "generate_password_reset_token",
    "verify_password_reset_token",
]