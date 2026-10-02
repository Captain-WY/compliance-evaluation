"""案件流程与任务 Service (切片 2.S4).

实现:
  - 流程时间轴查询 (timeline)
  - 阶段推进 (advance_stage, 支持 force 强制 SKIPPED 决策 D2)
  - 节点操作 (complete / skip / create / update / delete)
  - 协作任务 CRUD (list / create / update_status / delete)
  - PROCESS + TASK 审计日志联动 (决策 D6)

设计约束:
  1. 所有写操作用 `async with session.begin_nested():`; 审计日志与业务变更同一事务
     (FastAPI 依赖 get_db 已触发 autobegin, 故用 begin_nested 避免冲突)
  2. 权限门槛:
     - canManageProcess: 节点 CUD + 任务 CUD
     - canChangeStage: 阶段推进 + 节点 SKIP (决策 D3 复用)
     - 任务 update-status: assignee 自己 OR canManageProcess
  3. 状态机 Guard (09_business_logic_and_state_machines.md §6):
     - complete / skip: status ∈ {PENDING, ACTIVE}
     - delete: task_template_id is None (模板节点不可删)
     - advance_stage force=False: 无 PENDING/ACTIVE 节点
  4. cases.current_stage_code 为权威源 (决策 D5), process_instances.stage_code 快照
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException, ValidationException
from ..enums import (
    ActionType,
    CaseActionItemStatus,
    NodeType,
    Priority,
    ProcessInstanceStatus,
    ProcessNodeStatus,
    label_of,
)
from ..models.case_action_items import CaseActionItem
from ..models.cases import Case
from ..models.process_instances import ProcessInstance
from ..models.process_nodes import ProcessNode
from ..models.process_templates import ProcessTemplate
from ..models.task_templates import TaskTemplate
from ..models.sys_departments import SysDepartment
from ..models.sys_dicts import SysDict
from ..models.sys_users import SysUser
from ..schemas.process import (
    CaseActionItemVO,
    NodeCompleteRequest,
    NodeCreateRequest,
    NodePatchPayload,
    NodeRemoveRequest,
    NodeSkipRequest,
    NodeUpdateRequest,
    ProcessInstanceVO,
    ProcessNodeVO,
    ProcessTimelineResponse,
    StageAdvanceRequest,
    StageAdvanceResponse,
    TaskCreateRequest,
    TaskRemoveRequest,
    TasksListRequest,
    TasksListResponse,
    TasksPagination,
    TaskStatusUpdateRequest,
)
from .audit_log_service import compute_field_diff, write_audit_log
from .case_detail_ext_service import _compute_permissions


# =============================================================================
# 共用工具
# =============================================================================


_TERMINAL_NODE_STATUSES: frozenset[str] = frozenset({
    ProcessNodeStatus.COMPLETED.value,
    ProcessNodeStatus.SKIPPED.value,
})
_OPEN_NODE_STATUSES: frozenset[str] = frozenset({
    ProcessNodeStatus.PENDING.value,
    ProcessNodeStatus.ACTIVE.value,
})


def _is_overdue_node(status: str, deadline: date | None) -> bool:
    if status in _TERMINAL_NODE_STATUSES:
        return False
    if deadline is None:
        return False
    return deadline < date.today()


def _is_overdue_task(status: str, due_date: datetime | None) -> bool:
    if status in (CaseActionItemStatus.DONE.value, CaseActionItemStatus.CANCELLED.value):
        return False
    if due_date is None:
        return False
    return due_date < datetime.now(timezone.utc)


def _node_to_vo(
    node: ProcessNode, *, assignee_name: str | None = None
) -> ProcessNodeVO:
    return ProcessNodeVO(
        id=node.id,
        instance_id=node.instance_id,
        case_id=node.case_id,
        task_template_id=node.task_template_id,
        task_code=node.task_code,
        task_name=node.task_name,
        node_type=NodeType(node.node_type or NodeType.TASK.value),
        node_type_name=label_of(node.node_type or NodeType.TASK.value, NodeType),
        status=ProcessNodeStatus(node.status or ProcessNodeStatus.PENDING.value),
        status_name=label_of(node.status or ProcessNodeStatus.PENDING.value, ProcessNodeStatus),
        assignee_id=node.assignee_id,
        assignee_name=assignee_name,
        priority=Priority(node.priority or Priority.MEDIUM.value),
        priority_name=label_of(node.priority or Priority.MEDIUM.value, Priority),
        deadline=node.deadline,
        completed_date=node.completed_date,
        action_type=ActionType(node.action_type or ActionType.NONE.value),
        action_config=node.action_config,
        required_doc_types=node.required_doc_types,
        result_data=node.result_data,
        description=node.description,
        is_overdue=_is_overdue_node(node.status or "", node.deadline),
        created_at=node.created_at,
        updated_at=node.updated_at,
    )


def _instance_to_vo(
    inst: ProcessInstance,
    *,
    node_vos: list[ProcessNodeVO] | None = None,
) -> ProcessInstanceVO:
    node_vos = node_vos or []
    completed = sum(
        1 for n in node_vos if n.status.value == ProcessNodeStatus.COMPLETED.value
    )
    return ProcessInstanceVO(
        id=inst.id,
        case_id=inst.case_id,
        stage_code=inst.stage_code,
        stage_name=inst.stage_name,
        status=ProcessInstanceStatus(inst.status or ProcessInstanceStatus.ACTIVE.value),
        status_name=label_of(
            inst.status or ProcessInstanceStatus.ACTIVE.value, ProcessInstanceStatus
        ),
        start_date=inst.start_date,
        end_date=inst.end_date,
        node_count=len(node_vos),
        completed_count=completed,
        nodes=node_vos,
    )


def _node_snapshot(node: ProcessNode) -> dict[str, Any]:
    """审计日志 JSONB 友好快照."""
    return {
        "task_name": node.task_name,
        "node_type": node.node_type,
        "status": node.status,
        "priority": node.priority,
        "assignee_id": node.assignee_id,
        "deadline": node.deadline.isoformat() if node.deadline else None,
        "completed_date": node.completed_date.isoformat() if node.completed_date else None,
        "action_type": node.action_type,
        "description": node.description,
    }


def _task_snapshot(task: CaseActionItem) -> dict[str, Any]:
    return {
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "assignee_id": task.assignee_id,
        "resp_dept_id": task.resp_dept_id,
        "due_date": task.due_date.isoformat() if task.due_date else None,
    }


# =============================================================================
# Loader 辅助
# =============================================================================


async def _load_case_or_404(
    session: AsyncSession, tenant_id: str, case_id: str
) -> Case:
    stmt = select(Case).where(
        and_(
            Case.id == case_id,
            Case.tenant_id == tenant_id,
            Case.is_deleted.is_(False),
        )
    )
    case = (await session.execute(stmt)).scalar_one_or_none()
    if case is None:
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _load_node_or_404(
    session: AsyncSession,
    tenant_id: str,
    node_id: str,
    *,
    for_update: bool = False,
) -> ProcessNode:
    """加载节点; for_update=True 时加 `with_for_update()` 悲观锁 (写操作使用)."""
    stmt = select(ProcessNode).where(
        and_(
            ProcessNode.id == node_id,
            ProcessNode.tenant_id == tenant_id,
            ProcessNode.is_deleted.is_(False),
        )
    )
    if for_update:
        stmt = stmt.with_for_update()
    node = (await session.execute(stmt)).scalar_one_or_none()
    if node is None:
        raise NotFoundException(resource="流程节点", resource_id=node_id)
    return node


async def _load_task_or_404(
    session: AsyncSession,
    tenant_id: str,
    task_id: str,
    *,
    for_update: bool = False,
) -> CaseActionItem:
    """加载任务; for_update=True 时加悲观锁."""
    stmt = select(CaseActionItem).where(
        and_(
            CaseActionItem.id == task_id,
            CaseActionItem.tenant_id == tenant_id,
            CaseActionItem.is_deleted.is_(False),
        )
    )
    if for_update:
        stmt = stmt.with_for_update()
    task = (await session.execute(stmt)).scalar_one_or_none()
    if task is None:
        raise NotFoundException(resource="协作任务", resource_id=task_id)
    return task


async def _require_case_member_or_admin(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """读权限 (案件成员 + LEGAL_ADMIN / SYS_ADMIN); 其他抛 NotFound."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not any(perms.model_dump(exclude={"case_id", "user_role_in_case",
                                         "has_legal_admin", "has_sys_admin",
                                         "case_closed"}).values()):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_can_manage_process(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_manage_process:
        raise BusinessException(code=4011, message="无权管理该案件流程/任务 (缺少 canManageProcess)")
    return case


async def _require_can_change_stage(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_change_stage:
        raise BusinessException(code=4012, message="无权变更案件阶段 (缺少 canChangeStage)")
    return case


async def _load_assignee_names(
    session: AsyncSession, user_ids: set[str]
) -> dict[str, str]:
    if not user_ids:
        return {}
    rows = (
        await session.execute(
            select(SysUser.id, SysUser.real_name, SysUser.username).where(
                SysUser.id.in_(user_ids)
            )
        )
    ).all()
    return {r[0]: (r[1] or r[2] or r[0]) for r in rows}


async def _load_dept_names(
    session: AsyncSession, dept_ids: set[str]
) -> dict[str, str]:
    if not dept_ids:
        return {}
    rows = (
        await session.execute(
            select(SysDepartment.id, SysDepartment.dept_name).where(
                SysDepartment.id.in_(dept_ids)
            )
        )
    ).all()
    return {r[0]: r[1] for r in rows}


async def _load_stage_code_to_name(session: AsyncSession) -> dict[str, str]:
    rows = (
        await session.execute(
            select(SysDict.dict_code, SysDict.dict_name).where(
                SysDict.dict_type == "CASE_STAGE",
                SysDict.is_deleted.is_(False),
                SysDict.is_active.is_(True),
            )
        )
    ).all()
    return {r[0]: r[1] for r in rows}


# =============================================================================
# Template Expansion (模板展开: process_template + task_templates → process_instance + process_nodes)
# =============================================================================


async def expand_process_template(
    session: AsyncSession,
    tenant_id: str,
    case_id: str,
    case_type_code: str,
    stage_code: str,
    user_id: str,
) -> tuple[str | None, list[str]]:
    """根据案件类型和阶段编码，展开流程模板生成运行实例和任务节点。

    Returns:
        (instance_id, node_ids) — 若未找到匹配的 process_template 则返回 (None, [])
    """
    # 1. 查找匹配的 process_template
    pt = (
        await session.execute(
            select(ProcessTemplate).where(
                and_(
                    ProcessTemplate.tenant_id == tenant_id,
                    ProcessTemplate.case_type_code == case_type_code,
                    ProcessTemplate.stage_code == stage_code,
                    ProcessTemplate.is_deleted.is_(False),
                    ProcessTemplate.is_active.is_(True),
                )
            )
        )
    ).scalar_one_or_none()

    if pt is None:
        return None, []

    # 2. 查找该模板下的所有 task_templates
    task_rows = (
        await session.execute(
            select(TaskTemplate).where(
                and_(
                    TaskTemplate.process_template_id == pt.id,
                    TaskTemplate.is_deleted.is_(False),
                    TaskTemplate.is_active.is_(True),
                )
            ).order_by(TaskTemplate.sort_order.asc())
        )
    ).scalars().all()

    if not task_rows:
        return None, []

    # 3. 创建 process_instance
    instance_id = f"pi_{uuid.uuid4().hex[:12]}"
    today = date.today()
    session.add(
        ProcessInstance(
            id=instance_id,
            tenant_id=tenant_id,
            case_id=case_id,
            process_template_id=pt.id,
            stage_code=stage_code,
            stage_name=pt.stage_name,
            status=ProcessInstanceStatus.ACTIVE.value,
            start_date=today,
            created_by=user_id,
            updated_by=user_id,
        )
    )

    # 4. 按顺序创建 process_nodes (第一个 ACTIVE，其余 PENDING)
    node_ids: list[str] = []
    for idx, tt in enumerate(task_rows):
        node_id = f"pn_{uuid.uuid4().hex[:12]}"
        node_status = (
            ProcessNodeStatus.ACTIVE.value
            if idx == 0
            else ProcessNodeStatus.PENDING.value
        )
        deadline = None
        if tt.default_days_due is not None:
            deadline = date.fromordinal(today.toordinal() + tt.default_days_due)

        session.add(
            ProcessNode(
                id=node_id,
                tenant_id=tenant_id,
                instance_id=instance_id,
                case_id=case_id,
                task_template_id=tt.id,
                task_code=tt.task_code,
                task_name=tt.task_name,
                node_type=NodeType.TASK.value,
                status=node_status,
                priority=tt.extended_config.get("priority", Priority.MEDIUM.value)
                if tt.extended_config and isinstance(tt.extended_config, dict)
                else Priority.MEDIUM.value,
                deadline=deadline,
                action_type=tt.action_type or ActionType.NONE.value,
                action_config=tt.action_config,
                required_doc_types=tt.required_doc_types,
                description=tt.description,
                created_by=user_id,
                updated_by=user_id,
            )
        )
        node_ids.append(node_id)

    return instance_id, node_ids


# =============================================================================
# Timeline
# =============================================================================


async def get_timeline(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> ProcessTimelineResponse:
    case = await _require_case_member_or_admin(session, tenant_id, case_id, user)

    # 实例
    instances = (
        await session.execute(
            select(ProcessInstance)
            .where(
                and_(
                    ProcessInstance.case_id == case_id,
                    ProcessInstance.tenant_id == tenant_id,
                    ProcessInstance.is_deleted.is_(False),
                )
            )
            .order_by(ProcessInstance.start_date.asc().nulls_last(), ProcessInstance.id.asc())
        )
    ).scalars().all()

    instance_ids = [i.id for i in instances]
    nodes: list[ProcessNode] = []
    if instance_ids:
        nodes = (
            await session.execute(
                select(ProcessNode)
                .where(
                    and_(
                        ProcessNode.instance_id.in_(instance_ids),
                        ProcessNode.tenant_id == tenant_id,
                        ProcessNode.is_deleted.is_(False),
                    )
                )
                .order_by(ProcessNode.deadline.asc().nulls_last(), ProcessNode.id.asc())
            )
        ).scalars().all()

    # 批量翻译
    assignee_ids = {n.assignee_id for n in nodes if n.assignee_id}
    assignee_map = await _load_assignee_names(session, assignee_ids)

    # 按 instance 分组
    nodes_by_instance: dict[str, list[ProcessNodeVO]] = {}
    for n in nodes:
        vo = _node_to_vo(n, assignee_name=assignee_map.get(n.assignee_id or ""))
        nodes_by_instance.setdefault(n.instance_id, []).append(vo)

    stage_name_map = await _load_stage_code_to_name(session)

    return ProcessTimelineResponse(
        case_id=case_id,
        current_stage_code=case.current_stage_code,
        current_stage_name=stage_name_map.get(case.current_stage_code or ""),
        instances=[
            _instance_to_vo(i, node_vos=nodes_by_instance.get(i.id, []))
            for i in instances
        ],
    )


# =============================================================================
# Stage advance (D2)
# =============================================================================


async def advance_stage(
    session: AsyncSession,
    tenant_id: str,
    payload: StageAdvanceRequest,
    user: SysUser,
) -> StageAdvanceResponse:
    """推进案件阶段 (重 D2).

    - force=False: 若当前阶段仍有 PENDING/ACTIVE 节点, 抛 4201
    - force=True: 未完成节点自动标 SKIPPED (每条写 PROCESS/UPDATE 审计)
    - 更新 cases.current_stage_code (权威源, D5)
    - 若新阶段无 ACTIVE 实例, 创建一个空实例 (节点从模板展开留给后续切片)
    """
    async with session.begin_nested():
        case = await _require_can_change_stage(session, tenant_id, payload.case_id, user)

        # 校验 next_stage_code 字典合法
        valid = (
            await session.execute(
                select(SysDict.dict_code).where(
                    SysDict.dict_type == "CASE_STAGE",
                    SysDict.dict_code == payload.next_stage_code,
                    SysDict.is_deleted.is_(False),
                    SysDict.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if not valid:
            raise BusinessException(
                code=4001, message=f"无效的 next_stage_code: {payload.next_stage_code!r}"
            )

        if case.case_status == "CLOSED":
            raise BusinessException(code=4103, message="案件已结案, 不可推进阶段")

        previous_stage = case.current_stage_code

        # 查当前阶段的未完成节点 (当前阶段 = cases.current_stage_code)
        # Batch B (2026-04-19): 加 with_for_update() 避免并发 advance 导致双写冲突
        open_nodes: list[ProcessNode] = []
        if previous_stage:
            open_nodes = (
                await session.execute(
                    select(ProcessNode)
                    .join(
                        ProcessInstance,
                        and_(
                            ProcessInstance.id == ProcessNode.instance_id,
                            ProcessInstance.is_deleted.is_(False),
                        ),
                    )
                    .where(
                        and_(
                            ProcessNode.case_id == payload.case_id,
                            ProcessNode.tenant_id == tenant_id,
                            ProcessNode.is_deleted.is_(False),
                            ProcessInstance.stage_code == previous_stage,
                            ProcessNode.status.in_(_OPEN_NODE_STATUSES),
                        )
                    )
                    .with_for_update(of=ProcessNode)
                )
            ).scalars().all()

        if open_nodes and not payload.force:
            raise BusinessException(
                code=4201,
                message="当前阶段仍有未完成节点, 请先完成或使用 force=True 强制推进",
                details={"open_node_ids": [n.id for n in open_nodes]},
            )

        skipped_ids: list[str] = []
        if open_nodes and payload.force:
            for node in open_nodes:
                old_status = node.status
                node.status = ProcessNodeStatus.SKIPPED.value
                node.updated_by = user.id
                node.updated_at = datetime.now(timezone.utc)
                skipped_ids.append(node.id)
                await write_audit_log(
                    session,
                    tenant_id=tenant_id,
                    case_id=payload.case_id,
                    operator=user,
                    action_module="PROCESS",
                    action_type="UPDATE",
                    action_detail=f"强制推进阶段, 节点【{node.task_name}】自动 SKIPPED",
                    target_record_id=node.id,
                    before_data={"status": old_status},
                    after_data={"status": ProcessNodeStatus.SKIPPED.value},
                )

        # 更新主表 (权威源)
        case.current_stage_code = payload.next_stage_code
        if payload.remark:
            prefix = (
                f"[{datetime.now(timezone.utc).date()} 阶段推进 "
                f"{previous_stage or '—'} → {payload.next_stage_code}] "
            )
            case.latest_progress = prefix + payload.remark
        case.updated_by = user.id
        case.updated_at = datetime.now(timezone.utc)

        # 历史实例 (previous_stage) 的 status 改为 COMPLETED
        if previous_stage:
            await session.execute(
                ProcessInstance.__table__.update()
                .where(
                    ProcessInstance.case_id == payload.case_id,
                    ProcessInstance.tenant_id == tenant_id,
                    ProcessInstance.stage_code == previous_stage,
                    ProcessInstance.status == ProcessInstanceStatus.ACTIVE.value,
                    ProcessInstance.is_deleted.is_(False),
                )
                .values(
                    status=ProcessInstanceStatus.COMPLETED.value,
                    end_date=date.today(),
                    updated_by=user.id,
                    updated_at=datetime.now(timezone.utc),
                )
            )

        # 新阶段实例: 若存在则激活, 否则创建空实例
        existing_new = (
            await session.execute(
                select(ProcessInstance).where(
                    and_(
                        ProcessInstance.case_id == payload.case_id,
                        ProcessInstance.tenant_id == tenant_id,
                        ProcessInstance.stage_code == payload.next_stage_code,
                        ProcessInstance.is_deleted.is_(False),
                    )
                )
            )
        ).scalar_one_or_none()

        if existing_new:
            if existing_new.status != ProcessInstanceStatus.ACTIVE.value:
                existing_new.status = ProcessInstanceStatus.ACTIVE.value
                existing_new.end_date = None
                existing_new.updated_by = user.id
                existing_new.updated_at = datetime.now(timezone.utc)
            new_instance_id = existing_new.id
            new_node_ids: list[str] = []
        else:
            # 尝试模板展开 (process_template → instance + nodes)
            expanded_instance_id, expanded_node_ids = await expand_process_template(
                session,
                tenant_id=tenant_id,
                case_id=payload.case_id,
                case_type_code=case.case_type_code or "CIVIL_LITIGATION",
                stage_code=payload.next_stage_code,
                user_id=user.id,
            )
            if expanded_instance_id:
                new_instance_id = expanded_instance_id
                new_node_ids = expanded_node_ids
            else:
                # 无匹配模板时创建空实例
                new_instance_id = f"pi_{uuid.uuid4().hex[:12]}"
                stage_name_map = await _load_stage_code_to_name(session)
                session.add(
                    ProcessInstance(
                        id=new_instance_id,
                        tenant_id=tenant_id,
                        case_id=payload.case_id,
                        stage_code=payload.next_stage_code,
                        stage_name=stage_name_map.get(payload.next_stage_code, payload.next_stage_code),
                        status=ProcessInstanceStatus.ACTIVE.value,
                        start_date=date.today(),
                        created_by=user.id,
                        updated_by=user.id,
                    )
                )
                new_node_ids = []

        # 审计 STAGE/UPDATE
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="STAGE",
            action_type="UPDATE",
            action_detail=(
                f"阶段推进 {previous_stage or '(无)'} → {payload.next_stage_code}"
                + (f" (force, 跳过 {len(skipped_ids)} 节点)" if skipped_ids else "")
            ),
            target_record_id=payload.case_id,
            before_data={"current_stage_code": previous_stage},
            after_data={"current_stage_code": payload.next_stage_code},
        )
        await session.commit()

        return StageAdvanceResponse(
            case_id=payload.case_id,
            previous_stage_code=previous_stage,
            current_stage_code=payload.next_stage_code,
            skipped_node_ids=skipped_ids,
            new_instance_id=new_instance_id,
            new_node_ids=new_node_ids,
        )


# =============================================================================
# Node 操作
# =============================================================================


async def complete_node(
    session: AsyncSession, tenant_id: str, payload: NodeCompleteRequest, user: SysUser
) -> ProcessNodeVO:
    async with session.begin_nested():
        node = await _load_node_or_404(session, tenant_id, payload.node_id, for_update=True)
        await _require_can_manage_process(session, tenant_id, node.case_id, user)

        # Guard: 只有 PENDING / ACTIVE 可完成 (§6.1)
        if node.status not in _OPEN_NODE_STATUSES:
            raise BusinessException(
                code=4202,
                message=f"节点已为终态 {node.status}, 不可再完成",
            )

        before = _node_snapshot(node)
        node.status = ProcessNodeStatus.COMPLETED.value
        node.completed_date = payload.completed_date or date.today()
        if payload.result_data is not None:
            node.result_data = payload.result_data
        node.updated_by = user.id
        node.updated_at = datetime.now(timezone.utc)
        await session.flush()

        after = _node_snapshot(node)
        before_diff, after_diff = compute_field_diff(before, after)

        detail = f"完成节点【{node.task_name}】"
        if payload.remark:
            detail += f" (备注: {payload.remark})"

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=node.case_id,
            operator=user,
            action_module="PROCESS",
            action_type="UPDATE",
            action_detail=detail,
            target_record_id=node.id,
            before_data=before_diff,
            after_data=after_diff,
        )
        await session.refresh(node)
        await session.commit()

    assignee_map = await _load_assignee_names(session, {node.assignee_id} if node.assignee_id else set())
    return _node_to_vo(node, assignee_name=assignee_map.get(node.assignee_id or ""))


async def skip_node(
    session: AsyncSession, tenant_id: str, payload: NodeSkipRequest, user: SysUser
) -> ProcessNodeVO:
    async with session.begin_nested():
        node = await _load_node_or_404(session, tenant_id, payload.node_id, for_update=True)
        # D3: SKIP 复用 canChangeStage
        await _require_can_change_stage(session, tenant_id, node.case_id, user)

        if node.status not in _OPEN_NODE_STATUSES:
            raise BusinessException(
                code=4202,
                message=f"节点已为终态 {node.status}, 不可再跳过",
            )

        old_status = node.status
        node.status = ProcessNodeStatus.SKIPPED.value
        node.updated_by = user.id
        node.updated_at = datetime.now(timezone.utc)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=node.case_id,
            operator=user,
            action_module="PROCESS",
            action_type="UPDATE",
            action_detail=f"跳过节点【{node.task_name}】(原因: {payload.reason})",
            target_record_id=node.id,
            before_data={"status": old_status},
            after_data={"status": ProcessNodeStatus.SKIPPED.value},
        )
        await session.refresh(node)
        await session.commit()

    assignee_map = await _load_assignee_names(session, {node.assignee_id} if node.assignee_id else set())
    return _node_to_vo(node, assignee_name=assignee_map.get(node.assignee_id or ""))


async def create_node(
    session: AsyncSession, tenant_id: str, payload: NodeCreateRequest, user: SysUser
) -> ProcessNodeVO:
    async with session.begin_nested():
        await _require_can_manage_process(session, tenant_id, payload.case_id, user)

        # 验证 instance_id 属于该案件
        inst = (
            await session.execute(
                select(ProcessInstance).where(
                    and_(
                        ProcessInstance.id == payload.instance_id,
                        ProcessInstance.case_id == payload.case_id,
                        ProcessInstance.tenant_id == tenant_id,
                        ProcessInstance.is_deleted.is_(False),
                    )
                )
            )
        ).scalar_one_or_none()
        if inst is None:
            raise ValidationException(
                f"instance_id={payload.instance_id} 不属于案件 {payload.case_id}"
            )

        node = ProcessNode(
            id=f"pn_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            instance_id=payload.instance_id,
            case_id=payload.case_id,
            task_template_id=None,  # 自定义节点
            task_code=None,
            task_name=payload.task_name,
            node_type=payload.node_type.value,
            status=ProcessNodeStatus.PENDING.value,
            assignee_id=payload.assignee_id,
            priority=payload.priority.value,
            deadline=payload.deadline,
            action_type=payload.action_type.value,
            action_config=payload.action_config,
            required_doc_types=payload.required_doc_types,
            description=payload.description,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(node)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="PROCESS",
            action_type="CREATE",
            action_detail=f"新增自定义节点【{node.task_name}】({node.node_type})",
            target_record_id=node.id,
            before_data=None,
            after_data=_node_snapshot(node),
        )
        await session.refresh(node)
        await session.commit()

    assignee_map = await _load_assignee_names(session, {node.assignee_id} if node.assignee_id else set())
    return _node_to_vo(node, assignee_name=assignee_map.get(node.assignee_id or ""))


async def update_node(
    session: AsyncSession, tenant_id: str, payload: NodeUpdateRequest, user: SysUser
) -> ProcessNodeVO:
    async with session.begin_nested():
        node = await _load_node_or_404(session, tenant_id, payload.node_id, for_update=True)
        await _require_can_manage_process(session, tenant_id, node.case_id, user)

        # Batch B (2026-04-19): 终态节点不可 update
        # 状态机语义: COMPLETED / SKIPPED 是终态, 重开需走 reopen (本期不实现)
        if node.status in _TERMINAL_NODE_STATUSES:
            raise BusinessException(
                code=4204,
                message=f"节点已为终态 {node.status}, 不可再编辑; 如需复盘请另建节点",
            )

        patch_dict = payload.patch.model_dump(exclude_unset=True)
        if not patch_dict:
            raise ValidationException("至少提供一个要更新的字段")

        before = _node_snapshot(node)
        for k, v in patch_dict.items():
            if hasattr(v, "value"):
                v = v.value
            setattr(node, k, v)
        node.updated_by = user.id
        node.updated_at = datetime.now(timezone.utc)
        await session.flush()

        after = _node_snapshot(node)
        before_diff, after_diff = compute_field_diff(before, after)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=node.case_id,
            operator=user,
            action_module="PROCESS",
            action_type="UPDATE",
            action_detail=f"更新节点【{node.task_name}】字段 {sorted(after_diff.keys())}",
            target_record_id=node.id,
            before_data=before_diff,
            after_data=after_diff,
        )
        await session.refresh(node)
        await session.commit()

    assignee_map = await _load_assignee_names(session, {node.assignee_id} if node.assignee_id else set())
    return _node_to_vo(node, assignee_name=assignee_map.get(node.assignee_id or ""))


async def remove_node(
    session: AsyncSession, tenant_id: str, payload: NodeRemoveRequest, user: SysUser
) -> None:
    async with session.begin_nested():
        node = await _load_node_or_404(session, tenant_id, payload.node_id, for_update=True)
        await _require_can_manage_process(session, tenant_id, node.case_id, user)

        # Guard: 模板节点不允许删除, 建议 SKIP (§6.1)
        if node.task_template_id is not None:
            raise BusinessException(
                code=4203,
                message="模板节点不可删除, 请使用 /nodes/skip",
            )

        before = _node_snapshot(node)
        node.is_deleted = True
        node.updated_by = user.id
        node.updated_at = datetime.now(timezone.utc)
        await session.flush()

        reason_suffix = f" (原因: {payload.reason})" if payload.reason else ""
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=node.case_id,
            operator=user,
            action_module="PROCESS",
            action_type="DELETE",
            action_detail=f"删除自定义节点【{node.task_name}】{reason_suffix}",
            target_record_id=node.id,
            before_data=before,
            after_data=None,
        )
        await session.commit()


# =============================================================================
# Tasks (case_action_items)
# =============================================================================


def _task_to_vo(
    task: CaseActionItem,
    *,
    assignee_name: str | None = None,
    resp_dept_name: str | None = None,
) -> CaseActionItemVO:
    return CaseActionItemVO(
        id=task.id,
        case_id=task.case_id,
        process_node_id=task.process_node_id,
        title=task.title,
        description=task.description,
        resp_dept_id=task.resp_dept_id,
        resp_dept_name=resp_dept_name,
        assignee_id=task.assignee_id,
        assignee_name=assignee_name,
        due_date=task.due_date,
        priority=Priority(task.priority or Priority.MEDIUM.value),
        priority_name=label_of(task.priority or Priority.MEDIUM.value, Priority),
        status=CaseActionItemStatus(task.status or CaseActionItemStatus.TODO.value),
        status_name=label_of(task.status or CaseActionItemStatus.TODO.value, CaseActionItemStatus),
        notification_status=task.notification_status,
        completed_at=task.completed_at,
        is_overdue=_is_overdue_task(task.status or "", task.due_date),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


async def list_tasks(
    session: AsyncSession, tenant_id: str, payload: TasksListRequest, user: SysUser
) -> TasksListResponse:
    await _require_case_member_or_admin(session, tenant_id, payload.case_id, user)

    pagination = payload.pagination or TasksPagination()
    filters = [
        CaseActionItem.case_id == payload.case_id,
        CaseActionItem.tenant_id == tenant_id,
        CaseActionItem.is_deleted.is_(False),
    ]
    if payload.status_filter:
        filters.append(
            CaseActionItem.status.in_([s.value for s in payload.status_filter])
        )
    if payload.assignee_id:
        filters.append(CaseActionItem.assignee_id == payload.assignee_id)

    total = (
        await session.execute(select(func.count(CaseActionItem.id)).where(*filters))
    ).scalar() or 0

    rows = (
        await session.execute(
            select(CaseActionItem)
            .where(*filters)
            .order_by(CaseActionItem.due_date.asc().nulls_last(), CaseActionItem.created_at.desc())
            .offset((pagination.page - 1) * pagination.size)
            .limit(pagination.size)
        )
    ).scalars().all()

    assignee_ids = {r.assignee_id for r in rows if r.assignee_id}
    dept_ids = {r.resp_dept_id for r in rows if r.resp_dept_id}
    a_map = await _load_assignee_names(session, assignee_ids)
    d_map = await _load_dept_names(session, dept_ids)

    items = [
        _task_to_vo(
            r,
            assignee_name=a_map.get(r.assignee_id),
            resp_dept_name=d_map.get(r.resp_dept_id) if r.resp_dept_id else None,
        )
        for r in rows
    ]
    return TasksListResponse(
        total=int(total),
        page=pagination.page,
        size=pagination.size,
        items=items,
    )


async def create_task(
    session: AsyncSession, tenant_id: str, payload: TaskCreateRequest, user: SysUser
) -> CaseActionItemVO:
    async with session.begin_nested():
        await _require_can_manage_process(session, tenant_id, payload.case_id, user)

        task = CaseActionItem(
            id=f"ai_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            case_id=payload.case_id,
            process_node_id=payload.process_node_id,
            title=payload.title,
            description=payload.description,
            resp_dept_id=payload.resp_dept_id,
            assignee_id=payload.assignee_id,
            due_date=payload.due_date,
            priority=payload.priority.value,
            status=CaseActionItemStatus.TODO.value,
            notification_status="UNNOTIFIED",
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(task)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="TASK",
            action_type="CREATE",
            action_detail=f"创建协作任务【{task.title}】→ {task.assignee_id}",
            target_record_id=task.id,
            before_data=None,
            after_data=_task_snapshot(task),
        )
        await session.refresh(task)
        await session.commit()

    assignee_map = await _load_assignee_names(session, {task.assignee_id})
    dept_map = await _load_dept_names(session, {task.resp_dept_id} if task.resp_dept_id else set())
    return _task_to_vo(
        task,
        assignee_name=assignee_map.get(task.assignee_id),
        resp_dept_name=dept_map.get(task.resp_dept_id) if task.resp_dept_id else None,
    )


async def update_task_status(
    session: AsyncSession, tenant_id: str, payload: TaskStatusUpdateRequest, user: SysUser
) -> CaseActionItemVO:
    """更新任务状态.

    权限特例 (设计 §3): 若当前用户是 assignee_id, 无需 canManageProcess 即可自我更新;
    否则需要 canManageProcess.
    """
    async with session.begin_nested():
        task = await _load_task_or_404(session, tenant_id, payload.task_id, for_update=True)
        # 权限分支
        if str(user.id) != task.assignee_id:
            await _require_can_manage_process(session, tenant_id, task.case_id, user)
        else:
            # 仍需验案件访问权 (防租户混淆)
            await _load_case_or_404(session, tenant_id, task.case_id)

        old_status = task.status
        task.status = payload.new_status.value
        if payload.new_status == CaseActionItemStatus.DONE:
            task.completed_at = datetime.now(timezone.utc)
        else:
            task.completed_at = None
        task.updated_by = user.id
        task.updated_at = datetime.now(timezone.utc)
        await session.flush()

        detail = f"任务【{task.title}】状态 {old_status} → {task.status}"
        if payload.remark:
            detail += f" (备注: {payload.remark})"
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=task.case_id,
            operator=user,
            action_module="TASK",
            action_type="UPDATE",
            action_detail=detail,
            target_record_id=task.id,
            before_data={"status": old_status},
            after_data={"status": task.status},
        )
        await session.refresh(task)
        await session.commit()

    assignee_map = await _load_assignee_names(session, {task.assignee_id})
    dept_map = await _load_dept_names(session, {task.resp_dept_id} if task.resp_dept_id else set())
    return _task_to_vo(
        task,
        assignee_name=assignee_map.get(task.assignee_id),
        resp_dept_name=dept_map.get(task.resp_dept_id) if task.resp_dept_id else None,
    )


async def remove_task(
    session: AsyncSession, tenant_id: str, payload: TaskRemoveRequest, user: SysUser
) -> None:
    async with session.begin_nested():
        task = await _load_task_or_404(session, tenant_id, payload.task_id, for_update=True)
        await _require_can_manage_process(session, tenant_id, task.case_id, user)

        before = _task_snapshot(task)
        task.is_deleted = True
        task.updated_by = user.id
        task.updated_at = datetime.now(timezone.utc)
        await session.flush()

        reason_suffix = f" (原因: {payload.reason})" if payload.reason else ""
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=task.case_id,
            operator=user,
            action_module="TASK",
            action_type="DELETE",
            action_detail=f"删除任务【{task.title}】{reason_suffix}",
            target_record_id=task.id,
            before_data=before,
            after_data=None,
        )
        await session.commit()
