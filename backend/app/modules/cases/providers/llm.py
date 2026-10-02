"""LLM 服务防腐层 (Legal Brain AI Provider).

抽象大语言模型调用，隔离底层实现差异。
兼容所有 OpenAI API 格式的端点：OpenAI、Qwen(通义千问)、DeepSeek、ChatGLM 等。

使用 httpx（项目已有依赖）做原生 HTTP 调用，避免引入 openai SDK。

参考:
  - docs/plan/2026Q2_AI_CASE_ASSISTANT_WP_AI_04_STRATEGY_RECOMMEND_SERVICE_DESIGN.md
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

import httpx


# ---------------------------------------------------------------------------
# 异常体系
# ---------------------------------------------------------------------------


class LLMException(Exception):
    """LLM 服务异常基类."""
    pass


class LLMRateLimitException(LLMException):
    """速率限制异常 (HTTP 429)."""
    pass


class LLMContextLengthException(LLMException):
    """上下文长度超限 (HTTP 400/413)."""
    pass


class LLMAuthException(LLMException):
    """认证失败 (HTTP 401)."""
    pass


# ---------------------------------------------------------------------------
# 抽象接口
# ---------------------------------------------------------------------------


class ILLMProvider(ABC):
    """LLM 服务接口.

    防腐层设计原则：
    - 抽象 LLM 调用，隔离底层实现差异
    - 业务层通过接口调用，不直接依赖第三方 SDK
    - 便于切换模型提供商或私有化部署
    """

    @abstractmethod
    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int | None = None,
        json_mode: bool = False,
    ) -> str:
        """单轮对话，返回完整文本.

        Args:
            messages: OpenAI 格式消息列表，如 [{"role": "system", "content": "..."}, ...]
            model: 模型名称，None 时使用默认模型
            temperature: 温度 (0-2)
            max_tokens: 最大输出 token 数
            json_mode: 是否启用 JSON mode (response_format={"type": "json_object"})

        Returns:
            LLM 生成的文本内容

        Raises:
            LLMException: 调用失败
            LLMRateLimitException: 速率限制
            LLMContextLengthException: 上下文长度超限
        """
        pass

    @abstractmethod
    async def stream_chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """流式对话，逐 token 返回.

        当前 stub 实现，完整流式支持可在后续 Legal Brain 切片中补齐。
        """
        pass

    @abstractmethod
    async def close(self) -> None:
        """关闭 HTTP 客户端连接."""
        pass


# ---------------------------------------------------------------------------
# 具体实现：OpenAI API 兼容层 (httpx)
# ---------------------------------------------------------------------------


class OpenAICompatibleProvider(ILLMProvider):
    """OpenAI API 兼容 Provider.

    使用 httpx 做原生 HTTP 调用，兼容：
    - OpenAI (api.openai.com)
    - 阿里云百炼 / 通义千问 (dashscope.aliyuncs.com/compatible-mode/v1)
    - DeepSeek (api.deepseek.com)
    - 私有化部署的 vLLM / TGI 等

    认证方式：Bearer Token (api_key)
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        default_model: str = "gpt-4o",
        timeout: float = 60.0,
    ):
        """初始化 Provider.

        Args:
            api_key: API Key (Bearer Token)
            base_url: API Base URL，末尾不含 /
            default_model: 默认模型名称
            timeout: HTTP 请求超时（秒）
        """
        if not api_key:
            raise LLMException("LLM API Key 不能为空，请在 .env 中配置 LLM_API_KEY")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.timeout = timeout

        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10.0),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    # -- 辅助方法 --

    def _raise_for_status(self, response: httpx.Response) -> None:
        """根据 HTTP 状态码抛出对应的 LLMException."""
        if response.status_code == 200:
            return

        if response.status_code == 429:
            raise LLMRateLimitException(f"LLM 速率限制: {response.status_code} {response.text[:200]}")
        if response.status_code in (400, 413):
            # 400 可能是上下文超限 (context_length_exceeded)
            body = response.text.lower()
            if "context" in body or "length" in body or "token" in body:
                raise LLMContextLengthException(f"LLM 上下文长度超限: {response.status_code} {response.text[:200]}")
            raise LLMException(f"LLM 请求错误: {response.status_code} {response.text[:200]}")
        if response.status_code == 401:
            raise LLMAuthException(f"LLM 认证失败，请检查 API Key: {response.status_code}")
        if response.status_code >= 500:
            raise LLMException(f"LLM 服务端错误: {response.status_code} {response.text[:200]}")

        raise LLMException(f"LLM 调用失败: {response.status_code} {response.text[:200]}")

    def _extract_content(self, data: dict[str, Any]) -> str:
        """从 OpenAI 格式响应中提取 content."""
        choices = data.get("choices", [])
        if not choices:
            raise LLMException("LLM 响应中无 choices 字段")

        message = choices[0].get("message", {})
        content = message.get("content", "")
        if content is None:
            content = ""
        return str(content).strip()

    # -- 接口实现 --

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int | None = None,
        json_mode: bool = False,
    ) -> str:
        """调用 LLM 获取完整回复."""
        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
            "temperature": temperature,
        }

        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            response = await self._client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
            )
            self._raise_for_status(response)
            data = response.json()
            return self._extract_content(data)
        except (LLMException, LLMRateLimitException, LLMContextLengthException, LLMAuthException):
            raise
        except httpx.TimeoutException as e:
            raise LLMException(f"LLM 调用超时 ({self.timeout}s): {str(e)}")
        except httpx.NetworkError as e:
            raise LLMException(f"LLM 网络错误: {str(e)}")
        except Exception as e:
            raise LLMException(f"LLM 调用未知错误: {str(e)}")

    async def stream_chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """流式对话 Stub.

        当前退化为非流式：一次性返回全部内容。
        完整 SSE 流式解析可在 Legal Brain 切片中补齐。
        """
        content = await self.chat_completion(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        # 模拟流式：逐字 yield（实际生产可改为逐 token yield）
        for char in content:
            yield char

    async def close(self) -> None:
        """关闭 HTTP 客户端."""
        try:
            await self._client.aclose()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 工厂函数
# ---------------------------------------------------------------------------


def get_llm_provider(settings: Any) -> ILLMProvider | None:
    """根据配置创建 LLM Provider.

    配置缺失或 LLM_ENABLED=false 时返回 None，由 Service 层生成降级响应。

    Args:
        settings: 应用配置 (Settings 实例)

    Returns:
        ILLMProvider 实例，或 None（未启用/配置缺失）

    Raises:
        LLMException: api_key 为空时抛出（仅在 enabled=true 时）
    """
    if not getattr(settings, "LLM_ENABLED", False):
        return None

    provider_type = getattr(settings, "LLM_PROVIDER_TYPE", "openai_compatible")
    api_key = getattr(settings, "LLM_API_KEY", "")

    if not api_key:
        # 不抛异常，返回 None，由 Service 层降级处理
        return None

    if provider_type in ("openai_compatible", "openai", "qwen", "deepseek"):
        base_url = getattr(settings, "LLM_BASE_URL", "")
        if not base_url:
            # 根据 provider_type 推断默认 base_url
            if provider_type == "qwen":
                base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
            elif provider_type == "deepseek":
                base_url = "https://api.deepseek.com/v1"
            else:
                base_url = "https://api.openai.com/v1"

        default_model = getattr(settings, "LLM_DEFAULT_MODEL", "gpt-4o")
        timeout = getattr(settings, "LLM_REQUEST_TIMEOUT", 60.0)

        return OpenAICompatibleProvider(
            api_key=api_key,
            base_url=base_url,
            default_model=default_model,
            timeout=timeout,
        )

    # 未知 provider_type，返回 None 降级
    return None
