"""
字典校验器
提供字典项的校验功能
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.cases.services.dict_service import DictService


class DictValidator:
    """字典校验器"""

    @staticmethod
    async def validate_dict_code(
        session: AsyncSession,
        dict_type: str,
        dict_code: str
    ) -> bool:
        """
        校验字典编码是否存在且启用

        Args:
            session: 数据库会话
            dict_type: 字典类型
            dict_code: 字典编码

        Returns:
            True 如果字典项存在且启用，否则 False
        """
        # 获取字典项列表（只返回启用的）
        items = await DictService.get_dict_by_type(session, dict_type, is_active=True)

        # 检查字典编码是否存在
        return any(item.dict_code == dict_code for item in items)

    @staticmethod
    async def validate_dict_path(
        session: AsyncSession,
        dict_type: str,
        dict_code: str,
        parent_code: Optional[str] = None
    ) -> bool:
        """
        校验多级字典路径是否有效

        Args:
            session: 数据库会话
            dict_type: 字典类型
            dict_code: 字典编码
            parent_code: 父节点编码（可选）

        Returns:
            True 如果路径有效，否则 False
        """
        # 获取所有字典项
        items = await DictService.get_dict_by_type(session, dict_type, is_active=False)

        # 构建字典映射
        item_map = {item.dict_code: item for item in items}

        # 检查目标字典项是否存在
        if dict_code not in item_map:
            return False

        target_item = item_map[dict_code]

        # 如果指定了父节点编码，验证父子关系
        if parent_code:
            # 检查父节点是否存在
            if parent_code not in item_map:
                return False

            parent_item = item_map[parent_code]

            # 检查目标项的 parent_id 是否指向父节点
            return target_item.parent_id == parent_item.id

        # 如果没有指定父节点，检查目标项是否为顶级节点
        return target_item.parent_id is None