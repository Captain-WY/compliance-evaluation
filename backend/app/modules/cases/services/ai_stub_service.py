"""法律大脑 AI Stub Service (2.S17).

D-AI 决策: 全部 Stub 占位，真实 Qwen/BGE 接入留到项目最后阶段.
所有函数均为同步风格包装，无真实 AI 调用.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..schemas.ai_chat import (
    AiSessionListRequest, AiSessionListResponse,
    AiSessionDetailRequest, AiSessionDetailResponse,
    AiSessionCreateRequest, AiSessionCreateResponse,
    AiSessionDeleteRequest, AiSessionDeleteResponse,
    AiChatStreamRequest, AiChatStreamResponse,
    SimilarCaseSearchRequest, SimilarCaseSearchResponse,
)
from ..schemas.case_ai import MaterialCompletenessVO

_STUB_MSG = "【AI 功能即将上线】Legal Brain 正在训练中，预计下一版本提供完整 AI 解答能力。"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def list_sessions(req: AiSessionListRequest) -> AiSessionListResponse:
    return AiSessionListResponse(total=0, page=req.page, pageSize=req.pageSize, items=[])


async def get_session_detail(req: AiSessionDetailRequest) -> AiSessionDetailResponse:
    return AiSessionDetailResponse(
        sessionId=req.sessionId,
        title="Stub Session",
        messages=[],
        total=0,
        page=req.page,
        pageSize=req.pageSize,
    )


async def create_session(req: AiSessionCreateRequest) -> AiSessionCreateResponse:
    title = req.title or "新对话"
    return AiSessionCreateResponse(
        sessionId=f"stub_sess_{_now_iso().replace(':', '').replace('-', '')}",
        title=title,
        createdAt=_now_iso(),
        isStub=True,
    )


async def delete_session(req: AiSessionDeleteRequest) -> AiSessionDeleteResponse:
    return AiSessionDeleteResponse(sessionId=req.sessionId, deleted=True)


async def chat_stream(req: AiChatStreamRequest) -> AiChatStreamResponse:
    return AiChatStreamResponse(
        messageId=f"stub_msg_{_now_iso().replace(':', '').replace('-', '')}",
        sessionId=req.sessionId,
        content=_STUB_MSG,
        isStub=True,
        createdAt=_now_iso(),
    )


async def search_similar_cases(req: SimilarCaseSearchRequest) -> SimilarCaseSearchResponse:
    return SimilarCaseSearchResponse(
        items=[],
        confidence=0.0,
        material_completeness=MaterialCompletenessVO(score=0, level="LOW"),
    )
