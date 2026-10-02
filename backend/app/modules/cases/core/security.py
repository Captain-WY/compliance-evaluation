"""
安全工具模块
包含 JWT 令牌生成、密码哈希等功能
"""
from datetime import datetime, timedelta
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings
from .exceptions import ValidationException

# 密码哈希上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码

    Args:
        plain_password: 明文密码
        hashed_password: 哈希后的密码

    Returns:
        bool: 密码是否匹配
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    生成密码哈希

    Args:
        password: 明文密码

    Returns:
        str: 哈希后的密码
    """
    return pwd_context.hash(password)


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    创建 JWT 访问令牌

    Args:
        data: 要编码的数据（通常是用户信息）
        expires_delta: 过期时间增量

    Returns:
        str: JWT 令牌

    Example:
        token = create_access_token(
            data={"sub": "user_id", "role": "admin"},
            expires_delta=timedelta(hours=24)
        )
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    return encoded_jwt


def decode_access_token(token: str) -> dict[str, Any]:
    """
    解码 JWT 访问令牌

    Args:
        token: JWT 令牌

    Returns:
        dict: 解码后的数据

    Raises:
        ValidationException: 令牌无效或已过期
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError as e:
        raise ValidationException(
            message="无效的访问令牌",
            details={"error": str(e)},
        )


def generate_password_reset_token(email: str) -> str:
    """
    生成密码重置令牌

    Args:
        email: 用户邮箱

    Returns:
        str: 密码重置令牌
    """
    delta = timedelta(hours=24)  # 密码重置链接 24 小时有效
    now = datetime.utcnow()
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now.timestamp(), "sub": email, "type": "reset"},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> Optional[str]:
    """
    验证密码重置令牌

    Args:
        token: 密码重置令牌

    Returns:
        Optional[str]: 用户邮箱，如果令牌无效则返回 None
    """
    try:
        decoded_token = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if decoded_token.get("type") != "reset":
            return None
        return decoded_token.get("sub")
    except JWTError:
        return None