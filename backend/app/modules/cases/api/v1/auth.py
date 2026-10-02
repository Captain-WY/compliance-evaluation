"""
认证 API 路由

提供登录、登出、令牌刷新等认证相关端点
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...core.deps import get_current_user
from ...models.sys_users import SysUser
from ...schemas.common import StandardResponse
from ...schemas.auth import (
    LoginRequest,
    LoginResponse,
    UserInfoResponse,
    UserContext,
    RefreshTokenRequest
)
from ...services.auth_service import AuthService
from ...services.auth_me_service import build_user_info_response
from ...providers.casdoor_provider import CasdoorProvider
from ...core.casdoor_config import CasdoorConfig

router = APIRouter(tags=["认证"])
security = HTTPBearer()


@router.post("/login", response_model=StandardResponse[LoginResponse])
async def login(
    credentials: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    用户登录

    使用 Casdoor 进行身份认证,返回 JWT Token 和用户信息

    Args:
        credentials: 登录凭据 (username, password, organization)

    Returns:
        StandardResponse[LoginResponse]: 包含 token 和用户信息
    """
    casdoor_provider = CasdoorProvider(CasdoorConfig.from_env())
    auth_service = AuthService(db, casdoor_provider)
    result = await auth_service.login(credentials)

    return StandardResponse(
        code=200,
        message="登录成功",
        data=result
    )


@router.post("/logout", response_model=StandardResponse[None])
async def logout(
    current_user: UserContext = Depends(get_current_user)
):
    """
    用户登出

    清除用户会话 (当前实现为无状态,仅客户端清除 token)

    Args:
        current_user: 当前登录用户

    Returns:
        StandardResponse[None]: 成功响应
    """
    # 无状态 JWT,登出只需客户端清除 token
    # TODO: 如需服务端 token 黑名单,在此实现

    return StandardResponse(
        code=200,
        message="登出成功",
        data=None
    )


@router.post("/refresh", response_model=StandardResponse[LoginResponse])
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    刷新访问令牌

    使用 refresh_token 获取新的 access_token

    Args:
        request: 刷新令牌请求

    Returns:
        StandardResponse[LoginResponse]: 新的 token 和用户信息
    """
    try:
        casdoor_provider = CasdoorProvider(CasdoorConfig.from_env())

        # 使用 refresh_token 获取新的 access_token
        token_response = await casdoor_provider.get_oauth_token(request.refresh_token)

        # TODO: 构造完整的 LoginResponse
        return StandardResponse(
            code=200,
            message="令牌刷新成功",
            data=LoginResponse(
                access_token=token_response.access_token,
                refresh_token=token_response.refresh_token,
                token_type=token_response.token_type,
                expires_in=token_response.expires_in,
                user=UserInfoResponse(
                    id="",
                    username="",
                    real_name="",
                    roles=[],
                    permissions=[]
                )
            )
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"令牌刷新失败: {str(e)}"
        )


@router.get("/me", response_model=StandardResponse[UserInfoResponse])
async def get_current_user_info(
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户信息 (D9: 补全 roles / permissions / menus, 2.S16-PRE2)."""
    data = await build_user_info_response(db, user=current_user)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.get("/permissions", response_model=StandardResponse[list[str]])
async def get_user_permissions(
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户权限标识列表."""
    from ...services.auth_me_service import get_user_permissions as _get_perms
    perms = await _get_perms(db, user=current_user)
    return StandardResponse(code=200, message="获取成功", data=perms)