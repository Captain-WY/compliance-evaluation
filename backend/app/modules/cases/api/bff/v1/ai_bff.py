"""法律大脑 AI BFF 路由 (2.S17 + WP-AI-03).

挂载路径: POST /api/bff/v1/ai/*

端点分配:
  - ai/sessions/*       -> ai_stub_service (Stub)
  - ai/chat/stream      -> ai_stub_service (Stub)
  - ai/similar-cases/search -> external_case_search_service (WP-AI-03)
"""
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.ai_chat import (
    AiSessionListRequest, AiSessionListResponse,
    AiSessionDetailRequest, AiSessionDetailResponse,
    AiSessionCreateRequest, AiSessionCreateResponse,
    AiSessionDeleteRequest, AiSessionDeleteResponse,
    AiChatStreamRequest, AiChatStreamResponse,
    SimilarCaseSearchRequest, SimilarCaseSearchResponse,
    SimilarCaseItem,
)
from ....schemas.case_ai import SimilarCaseItemVO
from ....services import ai_stub_service
from ....services import external_case_search_service

router = APIRouter(tags=["BFF - 法律大脑 (AI)"])

_STUB_HEADER = {"X-AI-Stub": "true"}


def _map_vo_to_item(vo: SimilarCaseItemVO) -> SimilarCaseItem:
    """将主契约 VO 映射为 ai_chat 兼容层 Item."""
    return SimilarCaseItem(
        case_id=vo.external_doc_id or vo.display_id,
        case_name=vo.title,
        similarity=vo.similarity or 0.0,
        outcome=vo.referee_result,
        outcome_name=vo.referee_result,
        amount=None,
        display_id=vo.display_id,
        source_scope=vo.source_scope,
        source_index=vo.source_index,
        external_doc_id=vo.external_doc_id,
        internal_case_id=vo.internal_case_id,
        title=vo.title,
        case_no=vo.case_no,
        court_name=vo.court_name,
        cause_of_action=vo.cause_of_action,
        trial_procedure=vo.trial_procedure,
        referee_date=vo.referee_date.isoformat() if vo.referee_date else None,
        referee_result=vo.referee_result,
        score=vo.score,
        matched_fields=vo.matched_fields,
        match_reason=vo.match_reason,
        snippets=vo.snippets,
    )


def _map_case_ai_to_ai_chat(raw: external_case_search_service.CaseAiSimilarCaseSearchResponse) -> SimilarCaseSearchResponse:
    """将 case_ai 主契约响应映射为 ai_chat 兼容层响应."""
    return SimilarCaseSearchResponse(
        is_stub=raw.is_stub,
        run_mode=raw.run_mode,
        generated_at=raw.generated_at,
        confidence=raw.confidence,
        source_refs=raw.source_refs,
        material_completeness=raw.material_completeness,
        pending_material_tasks=raw.pending_material_tasks,
        items=[_map_vo_to_item(i) for i in raw.items],
        query_text=raw.query_text,
        source_scope=raw.source_scope,
        total=raw.total,
        warnings=raw.warnings,
    )


# ===========================================================================
# AI 会话管理 (Stub)
# ===========================================================================

@router.post("/sessions/list", response_model=StandardResponse[AiSessionListResponse])
async def list_ai_sessions(
    req: AiSessionListRequest,
    response: Response,
    current_user: SysUser = Depends(get_current_user),
):
    response.headers.update(_STUB_HEADER)
    data = await ai_stub_service.list_sessions(req)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/sessions/detail", response_model=StandardResponse[AiSessionDetailResponse])
async def get_ai_session_detail(
    req: AiSessionDetailRequest,
    response: Response,
    current_user: SysUser = Depends(get_current_user),
):
    response.headers.update(_STUB_HEADER)
    data = await ai_stub_service.get_session_detail(req)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/sessions/create", response_model=StandardResponse[AiSessionCreateResponse])
async def create_ai_session(
    req: AiSessionCreateRequest,
    response: Response,
    current_user: SysUser = Depends(get_current_user),
):
    response.headers.update(_STUB_HEADER)
    data = await ai_stub_service.create_session(req)
    return StandardResponse(code=200, message="创建成功", data=data)


@router.post("/sessions/delete", response_model=StandardResponse[AiSessionDeleteResponse])
async def delete_ai_session(
    req: AiSessionDeleteRequest,
    response: Response,
    current_user: SysUser = Depends(get_current_user),
):
    response.headers.update(_STUB_HEADER)
    data = await ai_stub_service.delete_session(req)
    return StandardResponse(code=200, message="删除成功", data=data)


# ===========================================================================
# AI 对话 (Stub)
# ===========================================================================

@router.post("/chat/stream", response_model=StandardResponse[AiChatStreamResponse])
async def chat_stream(
    req: AiChatStreamRequest,
    response: Response,
    current_user: SysUser = Depends(get_current_user),
):
    response.headers.update(_STUB_HEADER)
    data = await ai_stub_service.chat_stream(req)
    return StandardResponse(code=200, message="成功", data=data)


# ===========================================================================
# 相似案例检索 (WP-AI-03)
# ===========================================================================

@router.post("/similar-cases/search", response_model=StandardResponse[SimilarCaseSearchResponse])
async def search_similar_cases(
    req: SimilarCaseSearchRequest,
    response: Response,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SimilarCaseSearchResponse]:
    """外部类案检索 (WP-AI-03).

    支持两种调用模式:
      - case_id 模式: 优先，自动构建最小化查询文本。
      - query 模式: 独立检索，同样执行脱敏和长度限制。

    未配置外部 ES、ES 超时、无结果时均返回稳定降级响应，不抛 500。
    """
    raw = await external_case_search_service.search_similar_cases(
        db, current_user.tenant_id, req, current_user
    )

    if raw.is_stub:
        response.headers.update(_STUB_HEADER)

    data = _map_case_ai_to_ai_chat(raw)
    return StandardResponse(code=200, message="获取成功", data=data)
