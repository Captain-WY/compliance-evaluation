"""
搜索服务防腐层
抽象 Elasticsearch 搜索服务
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional


class ISearchProvider(ABC):
    """
    搜索服务接口

    支持：
    - 全文搜索
    - 向量搜索（KNN）
    - 文档索引
    """

    @abstractmethod
    async def index_document(
        self,
        index: str,
        doc_id: str,
        document: Dict[str, Any]
    ) -> bool:
        """
        索引文档

        Args:
            index: 索引名称
            doc_id: 文档 ID
            document: 文档内容

        Returns:
            bool: 是否索引成功
        """
        pass

    @abstractmethod
    async def search(
        self,
        index: str,
        query: Dict[str, Any],
        size: int = 10,
        from_: int = 0
    ) -> List[Dict[str, Any]]:
        """
        搜索文档

        Args:
            index: 索引名称
            query: 查询条件
            size: 返回数量
            from_: 偏移量

        Returns:
            List[Dict]: 搜索结果列表
        """
        pass

    @abstractmethod
    async def vector_search(
        self,
        index: str,
        vector: List[float],
        k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        向量搜索（KNN）

        Args:
            index: 索引名称
            vector: 查询向量
            k: 返回数量

        Returns:
            List[Dict]: 搜索结果列表
        """
        pass

    @abstractmethod
    async def delete_document(self, index: str, doc_id: str) -> bool:
        """删除文档"""
        pass

    @abstractmethod
    async def create_index(self, index: str, mappings: Dict[str, Any]) -> bool:
        """创建索引"""
        pass


class SearchException(Exception):
    """搜索服务异常"""
    pass


class ElasticsearchProvider(ISearchProvider):
    """
    Elasticsearch 搜索服务实现

    使用 elasticsearch-py 异步客户端
    """

    def __init__(
        self,
        hosts: List[str],
        *,
        basic_auth: Optional[tuple[str, str]] = None,
        verify_certs: bool = True,
        request_timeout: Optional[float] = None,
    ):
        """
        初始化 Elasticsearch 客户端

        Args:
            hosts: Elasticsearch 主机列表
            basic_auth: HTTP Basic Auth (username, password)
            verify_certs: 是否验证 SSL 证书
            request_timeout: 请求超时（秒），用于 API 调用
        """
        try:
            from elasticsearch import AsyncElasticsearch
            kwargs: dict[str, Any] = {}
            if basic_auth:
                kwargs["basic_auth"] = basic_auth
            if not verify_certs:
                kwargs["verify_certs"] = False
            # 禁用节点嗅探，避免跨网络连接时因 sniff 超时导致请求失败
            kwargs["sniff_on_start"] = False
            kwargs["sniff_on_node_failure"] = False
            self.client = AsyncElasticsearch(hosts, **kwargs)
            self._request_timeout = request_timeout
        except ImportError:
            raise SearchException(
                "elasticsearch package not installed. Install with: pip install elasticsearch"
            )

    @classmethod
    def from_settings(cls, settings: Any) -> "ElasticsearchProvider":
        """从应用配置创建 Provider（内部 ES）."""
        hosts = settings.ELASTICSEARCH_URL.split(",")
        return cls(hosts=hosts)

    async def health_check(self) -> bool:
        """
        健康检查

        Returns:
            bool: Elasticsearch 是否健康
        """
        try:
            health = await self.client.cluster.health()
            return health["status"] in ["green", "yellow"]
        except Exception:
            return False

    async def index_document(
        self,
        index: str,
        doc_id: str,
        document: Dict[str, Any]
    ) -> bool:
        """
        索引文档

        Args:
            index: 索引名称
            doc_id: 文档 ID
            document: 文档内容

        Returns:
            bool: 是否索引成功
        """
        try:
            await self.client.index(index=index, id=doc_id, document=document)
            return True
        except Exception as e:
            raise SearchException(f"Failed to index document: {str(e)}")

    async def search(
        self,
        index: str,
        query: Dict[str, Any],
        size: int = 10,
        from_: int = 0
    ) -> List[Dict[str, Any]]:
        """
        搜索文档

        Args:
            index: 索引名称
            query: 查询条件
            size: 返回数量
            from_: 偏移量

        Returns:
            List[Dict]: 搜索结果列表
        """
        try:
            # elasticsearch-py 8.x: 不再支持 body 参数与 size/from_ 混用
            # 将 query dict 展平为独立参数
            kwargs: Dict[str, Any] = {"index": index}
            query_body = dict(query)

            # size: body 中的 size 优先于参数
            body_size = query_body.pop("size", None)
            kwargs["size"] = body_size if body_size is not None else size

            # from
            body_from = query_body.pop("from", None)
            kwargs["from_"] = body_from if body_from is not None else from_

            # 注意：query body 中的 timeout 是 ES 服务器端搜索超时，保留在 body 中
            # 不转换为 request_timeout，避免客户端 HTTP 超时与服务器端超时混淆

            # 应用实例级别的请求超时（给 HTTP 传输留足余地）
            if self._request_timeout is not None:
                kwargs["request_timeout"] = self._request_timeout

            # 剩余字段直接传入（query, _source, highlight, timeout 等）
            for key, value in query_body.items():
                kwargs[key] = value

            response = await self.client.search(**kwargs)
            return response.get("hits", {}).get("hits", [])
        except Exception as e:
            raise SearchException(f"Search failed: {str(e)}")

    async def vector_search(
        self,
        index: str,
        vector: List[float],
        k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        向量搜索（KNN）

        Args:
            index: 索引名称
            vector: 查询向量
            k: 返回数量

        Returns:
            List[Dict]: 搜索结果列表
        """
        try:
            # Elasticsearch KNN query
            query = {
                "knn": {
                    "field": "embedding",
                    "query_vector": vector,
                    "k": k,
                    "num_candidates": k * 10
                }
            }

            search_kwargs: Dict[str, Any] = {
                "index": index,
                "body": query,
                "size": k,
            }
            if self._request_timeout is not None:
                search_kwargs["request_timeout"] = self._request_timeout
            response = await self.client.search(**search_kwargs)
            return response.get("hits", {}).get("hits", [])
        except Exception as e:
            raise SearchException(f"Vector search failed: {str(e)}")

    async def delete_document(self, index: str, doc_id: str) -> bool:
        """
        删除文档

        Args:
            index: 索引名称
            doc_id: 文档 ID

        Returns:
            bool: 是否删除成功
        """
        try:
            await self.client.delete(index=index, id=doc_id)
            return True
        except Exception as e:
            raise SearchException(f"Failed to delete document: {str(e)}")

    async def create_index(self, index: str, mappings: Dict[str, Any]) -> bool:
        """
        创建索引

        Args:
            index: 索引名称
            mappings: 映射配置

        Returns:
            bool: 是否创建成功
        """
        try:
            await self.client.indices.create(index=index, body={"mappings": mappings})
            return True
        except Exception as e:
            raise SearchException(f"Failed to create index: {str(e)}")

    async def delete_index(self, index: str) -> bool:
        """
        删除索引

        Args:
            index: 索引名称

        Returns:
            bool: 是否删除成功
        """
        try:
            await self.client.indices.delete(index=index)
            return True
        except Exception:
            return False

    async def close(self) -> None:
        """关闭 ES 客户端连接."""
        try:
            await self.client.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 外部类案检索 ES Provider 工厂 (WP-AI-03)
# ---------------------------------------------------------------------------


def get_external_case_search_provider(settings: Any) -> Optional[ElasticsearchProvider]:
    """
    根据配置创建外部类案检索 ES Provider。

    配置缺失时返回 None，由 Service 层生成 is_stub=true 降级响应。
    """
    if not getattr(settings, "EXTERNAL_CASE_ES_ENABLED", False):
        return None

    url = getattr(settings, "EXTERNAL_CASE_ES_URL", "")
    if not url:
        return None

    hosts = [h.strip() for h in url.split(",") if h.strip()]
    if not hosts:
        return None

    username = getattr(settings, "EXTERNAL_CASE_ES_USERNAME", "")
    password = getattr(settings, "EXTERNAL_CASE_ES_PASSWORD", "")
    basic_auth = (username, password) if username and password else None

    verify_certs = getattr(settings, "EXTERNAL_CASE_ES_VERIFY_CERTS", False)
    request_timeout = getattr(settings, "EXTERNAL_CASE_ES_REQUEST_TIMEOUT", 5.0)

    return ElasticsearchProvider(
        hosts=hosts,
        basic_auth=basic_auth,
        verify_certs=verify_certs,
        request_timeout=request_timeout,
    )