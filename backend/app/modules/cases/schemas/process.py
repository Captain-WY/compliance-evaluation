"""案件流程与任务 (process_instances / process_nodes / case_action_items) Pydantic Schema.

字段严格对齐:
  - docs/design/v1/db/05_process_execution.md (process_instances / process_nodes)
  - docs/design/v1/db/18_collaboration_and_execution.md (case_action_items)
  - docs/design/v1/api/02_case_center/04_case_detail_process_api_plan.md (v2.0)
  - docs/design/v1/09_business_logic_and_state_machines.md §6 (状态机)

覆盖场景 (切片 2.S4):
- 流程时间轴 (ProcessTimelineResponse / ProcessInstanceVO / ProcessNodeVO)
- 阶段推进 (StageAdvanceRequest / StageAdvanceResponse, 决策 D2 force 模式)
- 节点操作 (NodeComplete / NodeSkip / NodeCreate / NodeUpdate / NodeRemove)
- 协作任务 (TasksListRequest / CaseActionItemVO / TaskCreate / TaskStatusUpdate / TaskRemove)
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.cases.enums.case_enums import (
    ActionType,
    CaseActionItemStatus,
    NodeType,
    Priority,
    ProcessInstanceStatus,
    ProcessNodeStatus,
)


# =============================================================================
# 1. ProcessNode VO
# =============================================================================


class ProcessNodeBase(BaseModel):
    """流程节点公共字段."""

    task_code: str | None = Field(None, description="任务编码 (对齐 task_templates.task_code)", max_length=64)
    task_name: str = Field(description="任务名称", min_length=1, max_length=128)
    node_type: NodeType = Field(NodeType.TASK, description="节点类型")
    status: ProcessNodeStatus = Field(ProcessNodeStatus.PENDING, description="节点生命周期状态")
    assignee_id: str | None = Field(None, description="指派人 ID (sys_users.id)", max_length=36)
    priority: Priority = Field(Priority.MEDIUM, description="优先级")
    deadline: date | None = Field(None, description="截止日期")
    completed_date: date | None = Field(None, description="实际完成日期")
    action_type: ActionType = Field(ActionType.NONE, description="动作类型")
    action_config: dict | None = Field(None, description="动作参数 (JSONB)")
    required_doc_types: list[str] | None = Field(None, description="要求的文档类型 (字典 DOCUMENT_CATEGORY)")
    description: str | None = Field(None, description="节点说明")


class ProcessNodeVO(ProcessNodeBase):
    """流程节点视图. 返回给前端, 含中文标签和关联信息."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    instance_id: str
    case_id: str
    task_template_id: str | None = Field(
        None,
        description="模板节点 ID; 为 null 表示自定义节点 (2.S4 决策: 自定义节点才可删除)",
    )
    node_type_name: str | None = Field(None, description="node_type 中文标签")
    status_name: str | None = Field(None, description="status 中文标签")
    priority_name: str | None = Field(None, description="priority 中文标签")
    assignee_name: str | None = Field(None, description="指派人姓名 (JOIN sys_users)")
    result_data: dict | None = Field(None, description="完成结果数据")
    is_overdue: bool = Field(False, description="是否已逾期 (status != COMPLETED/SKIPPED 且 deadline < today)")
    created_at: datetime | None = None
    updated_at: datetime | None = None


# =============================================================================
# 2. ProcessInstance VO + Timeline
# =============================================================================


class ProcessInstanceVO(BaseModel):
    """流程实例视图 (阶段级)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    stage_code: str
    stage_name: str
    status: ProcessInstanceStatus
    status_name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    node_count: int = Field(0, description="该实例下节点总数")
    completed_count: int = Field(0, description="该实例下 COMPLETED 节点数")
    nodes: list[ProcessNodeVO] = Field(default_factory=list)


class ProcessTimelineRequest(BaseModel):
    """`POST /cases/process/timeline` 请求."""

    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(description="案件 ID", max_length=36)


class ProcessTimelineResponse(BaseModel):
    """流程时间轴响应."""

    case_id: str
    current_stage_code: str | None = Field(None, description="来自 cases.current_stage_code, 权威源")
    current_stage_name: str | None = None
    instances: list[ProcessInstanceVO] = Field(default_factory=list)


# =============================================================================
# 3. StageAdvance (D2)
# =============================================================================


class StageAdvanceRequest(BaseModel):
    """`POST /cases/process/stage/advance` 请求."""

    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(description="案件 ID", max_length=36)
    next_stage_code: str = Field(description="目标阶段 (字典 CASE_STAGE)", max_length=64)
    force: bool = Field(
        False,
        description="强制推进: True 时未完成的 PENDING/ACTIVE 节点自动标 SKIPPED; "
                    "False 时若当前阶段有未完成节点则返回 BusinessException(4201)",
    )
    remark: str | None = Field(None, description="变更说明 (入 latest_progress)", max_length=200)


class StageAdvanceResponse(BaseModel):
    """阶段推进响应."""

    case_id: str
    previous_stage_code: str | None = None
    current_stage_code: str
    skipped_node_ids: list[str] = Field(
        default_factory=list,
        description="force=True 时自动 SKIPPED 的节点 ID",
    )
    new_instance_id: str | None = Field(
        None,
        description="新阶段的 process_instance ID (若已存在则复用)",
    )
    new_node_ids: list[str] = Field(
        default_factory=list,
        description="新阶段从模板展开的 process_nodes ID 列表",
    )


# =============================================================================
# 4. Node 操作请求
# =============================================================================


class NodeCompleteRequest(BaseModel):
    """`POST /cases/process/nodes/complete` 请求."""

    model_config = ConfigDict(extra="forbid")
    node_id: str = Field(description="节点 ID", max_length=36)
    completed_date: date | None = Field(None, description="实际完成日期 (默认今天)")
    result_data: dict | None = Field(None, description="完成结果 (JSONB)")
    remark: str | None = Field(None, description="完成备注 (入审计)", max_length=500)


class NodeSkipRequest(BaseModel):
    """`POST /cases/process/nodes/skip` 请求."""

    model_config = ConfigDict(extra="forbid")
    node_id: str = Field(description="节点 ID", max_length=36)
    reason: str = Field(description="跳过原因 (必填, 入审计)", min_length=1, max_length=500)


class NodeCreateRequest(BaseModel):
    """`POST /cases/process/nodes/create` 请求 — 创建自定义节点."""

    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(description="案件 ID", max_length=36)
    instance_id: str = Field(description="归属 process_instance ID", max_length=36)
    task_name: str = Field(description="任务名称", min_length=1, max_length=128)
    node_type: NodeType = Field(NodeType.TASK, description="节点类型")
    priority: Priority = Field(Priority.MEDIUM, description="优先级")
    assignee_id: str | None = Field(None, description="指派人 ID", max_length=36)
    deadline: date | None = Field(None, description="截止日期")
    action_type: ActionType = Field(ActionType.NONE, description="动作类型")
    action_config: dict | None = Field(None, description="动作参数")
    required_doc_types: list[str] | None = Field(None, description="文档要求")
    description: str | None = Field(None, description="节点说明", max_length=2000)


class NodeUpdateRequest(BaseModel):
    """`POST /cases/process/nodes/update` 请求 (PATCH)."""

    model_config = ConfigDict(extra="forbid")
    node_id: str = Field(description="节点 ID", max_length=36)
    patch: "NodePatchPayload" = Field(description="变更字段白名单")


class NodePatchPayload(BaseModel):
    """节点更新白名单 (PATCH). 全部字段可选.

    明确禁止更新的字段: status (走 complete/skip), task_template_id, instance_id, case_id.
    """

    model_config = ConfigDict(extra="forbid")
    priority: Priority | None = None
    assignee_id: str | None = Field(None, max_length=36)
    deadline: date | None = None
    task_name: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = Field(None, max_length=2000)
    action_config: dict | None = None
    required_doc_types: list[str] | None = None


NodeUpdateRequest.model_rebuild()


class NodeRemoveRequest(BaseModel):
    """`POST /cases/process/nodes/delete` 请求."""

    model_config = ConfigDict(extra="forbid")
    node_id: str = Field(description="节点 ID", max_length=36)
    reason: str | None = Field(None, description="删除原因 (入审计)", max_length=200)


# =============================================================================
# 5. 协作任务 (case_action_items)
# =============================================================================


class CaseActionItemBase(BaseModel):
    """协作任务公共字段."""

    title: str = Field(description="任务标题", min_length=1, max_length=255)
    description: str | None = Field(None, description="任务详情")
    resp_dept_id: str | None = Field(None, description="负责部门 ID", max_length=36)
    assignee_id: str = Field(description="指派人 ID (必填)", max_length=36)
    due_date: datetime | None = Field(None, description="截止时间 (含时分)")
    priority: Priority = Field(Priority.MEDIUM, description="优先级")


class CaseActionItemVO(CaseActionItemBase):
    """协作任务视图."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    process_node_id: str | None = Field(
        None,
        description="弱关联 process_nodes.id (决策 D1 解耦: 仅供 UI 展示, 不做级联)",
    )
    status: CaseActionItemStatus
    status_name: str | None = None
    priority_name: str | None = None
    assignee_name: str | None = Field(None, description="指派人姓名")
    resp_dept_name: str | None = Field(None, description="部门名称")
    notification_status: str | None = Field(None, description="通知状态 (预留, UNNOTIFIED/NOTIFIED/FAILED)")
    completed_at: datetime | None = None
    is_overdue: bool = Field(False, description="是否逾期")
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TasksListRequest(BaseModel):
    """`POST /cases/tasks/list` 请求."""

    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(description="案件 ID", max_length=36)
    status_filter: list[CaseActionItemStatus] | None = Field(
        None,
        description="状态过滤 (未传则返回全部)",
    )
    assignee_id: str | None = Field(None, description="按指派人过滤", max_length=36)
    pagination: "TasksPagination | None" = None


class TasksPagination(BaseModel):
    page: int = Field(1, ge=1)
    size: int = Field(50, ge=1, le=200)


class TasksListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[CaseActionItemVO] = Field(default_factory=list)


TasksListRequest.model_rebuild()


class TaskCreateRequest(CaseActionItemBase):
    """`POST /cases/tasks/create` 请求."""

    case_id: str = Field(description="案件 ID", max_length=36)
    process_node_id: str | None = Field(
        None,
        description="(可选) 弱关联到某个 process_node 用于 UI 展示",
        max_length=36,
    )


class TaskStatusUpdateRequest(BaseModel):
    """`POST /cases/tasks/update-status` 请求."""

    model_config = ConfigDict(extra="forbid")
    task_id: str = Field(description="任务 ID", max_length=36)
    new_status: CaseActionItemStatus = Field(description="目标状态")
    remark: str | None = Field(None, description="状态变更备注 (入审计)", max_length=500)


class TaskRemoveRequest(BaseModel):
    """`POST /cases/tasks/delete` 请求."""

    model_config = ConfigDict(extra="forbid")
    task_id: str = Field(description="任务 ID", max_length=36)
    reason: str | None = Field(None, description="删除原因", max_length=200)
