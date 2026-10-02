"""
自定义业务异常模块
所有业务逻辑异常必须继承 BusinessException
"""
from typing import Any, Dict, Optional


class BusinessException(Exception):
    """
    业务异常基类

    所有业务逻辑异常必须继承此类，不允许直接抛出内置异常

    使用示例:
        if budget < amount:
            raise BusinessException(
                code=4002,
                message="业务线预算不足",
                details={"budget": budget, "required": amount}
            )
    """

    def __init__(
        self,
        code: int,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        初始化业务异常

        Args:
            code: 业务错误码（4位数字）
                - 4000-4099: 参数校验错误
                - 4100-4199: 业务规则错误
                - 4200-4299: 权限错误
                - 4300-4399: 数据不存在错误
                - 5000-5099: 系统内部错误
            message: 错误消息（用户友好）
            details: 错误详情（调试用）
        """
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        result = {
            "code": self.code,
            "message": self.message,
        }
        if self.details:
            result["details"] = self.details
        return result


# ==================== 常用业务异常 ====================

class NotFoundException(BusinessException):
    """数据不存在异常"""

    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            code=4300,
            message=f"{resource}不存在",
            details={"resource": resource, "id": resource_id},
        )


class PermissionDeniedException(BusinessException):
    """权限不足异常"""

    def __init__(self, action: str, resource: str):
        super().__init__(
            code=4200,
            message=f"无权限执行此操作: {action}",
            details={"action": action, "resource": resource},
        )


class ValidationException(BusinessException):
    """参数校验异常"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(code=4000, message=message, details=details)


class BudgetInsufficientException(BusinessException):
    """预算不足异常"""

    def __init__(self, budget: float, required: float, business_line: str):
        super().__init__(
            code=4002,
            message="业务线预算不足",
            details={
                "budget": budget,
                "required": required,
                "business_line": business_line,
            },
        )


class CaseStageTransitionException(BusinessException):
    """案件阶段流转异常"""

    def __init__(self, current_stage: str, target_stage: str, reason: str):
        super().__init__(
            code=4100,
            message=f"无法从 {current_stage} 转换到 {target_stage}",
            details={"current_stage": current_stage, "target_stage": target_stage, "reason": reason},
        )


class DuplicateException(BusinessException):
    """重复数据异常"""

    def __init__(self, field: str, value: str):
        super().__init__(
            code=4001,
            message=f"{field}已存在",
            details={"field": field, "value": value},
        )