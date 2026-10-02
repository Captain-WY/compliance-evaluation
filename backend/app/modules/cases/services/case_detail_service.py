"""案件详情与抽屉 BFF Service (切片 2.S2.a).

为 2 个 BFF 端点提供业务逻辑:
  - drawer_summary: 抽屉概要 (CASE / CLUE / EXECUTABLE_TASK 多态)
  - update_base_info: 统一基础信息局部更新 (右侧栏/抽屉/概览 Tab 共用)

设计原则:
  1. 所有查询严格 is_deleted == False 过滤 (铁律 4)
  2. 租户隔离: tenant_id = current_user.tenant_id
  3. Enum 翻译: 走 label_of(), 不查 sys_dicts
  4. 字典翻译: 走 DictService 批量加载 (N+1 规避)
  5. 写操作: async with session.begin() 显式事务 (铁律 2)
  6. 业务异常: BusinessException, 不抛原生 Exception (铁律 5)
  7. extended_data: 严格白名单 (regulatory / summary_detail / tags), 超出拒绝
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums import (
    CaseStatus,
    OurRole,
    ProcedureType,
    RiskLevel,
    Sector,
    label_of,
)
from ..models.case_clues import CaseClue
from ..models.cases import Case
from ..models.process_nodes import ProcessNode
from ..models.sys_departments import SysDepartment
from ..models.sys_dicts import SysDict
from ..models.sys_users import SysUser
from ..schemas.case_hall import (
    CaseDrawerVO,
    ClueDrawerVO,
    DrawerItemType,
    DrawerSummaryData,
    TaskDrawerVO,
)
from ..schemas.cases import CaseBaseInfoPatch


# ==================================================================
# extended_data 白名单 (与 04_cases.md §2.1 一致)
# ==================================================================
EXTENDED_DATA_ALLOWED_KEYS: frozenset[str] = frozenset({"regulatory", "summary_detail", "tags", "next_deadline"})

# /base-info/update 可修改字段白名单 (与 sidebar_api_plan §2.3 一致)
BASE_INFO_ALLOWED_FIELDS: frozenset[str] = frozenset({
    "description",
    "risk_level",
    "is_investor_protection",
    "is_major",
    "sector",
    "business_line",
    "presiding_judge",
    "judge_contact",
    "accepting_court",
    "latest_progress",
    "extended_data",
})


# ==================================================================
# 字典翻译辅助 (仅字典字段: CASE_TYPE / CAUSE_OF_ACTION / BUSINESS_LINE / CASE_STAGE)
# ==================================================================
_DICT_TYPES_FOR_DRAWER = ("CASE_TYPE", "CAUSE_OF_ACTION", "BUSINESS_LINE", "CASE_STAGE")


async def _load_dict_map(session: AsyncSession) -> dict[str, dict[str, str]]:
    """批量加载 drawer 用到的字典 -> {dict_type: {dict_code: dict_name}}."""
    rows = (
        await session.execute(
            select(SysDict.dict_type, SysDict.dict_code, SysDict.dict_name).where(
                SysDict.dict_type.in_(_DICT_TYPES_FOR_DRAWER),
                SysDict.is_deleted.is_(False),
                SysDict.is_active.is_(True),
            )
        )
    ).all()
    out: dict[str, dict[str, str]] = {}
    for dt, code, name in rows:
        out.setdefault(dt, {})[code] = name
    return out


# ==================================================================
# 主 Service 类
# ==================================================================
class CaseDetailService:
    """案件详情抽屉 / 局部更新 服务."""

    # -------------------- drawer_summary --------------------
    @staticmethod
    async def drawer_summary(
        session: AsyncSession,
        tenant_id: str,
        target_id: str,
        item_type: DrawerItemType,
    ) -> DrawerSummaryData:
        """抽屉概要 (多态).

        Args:
            session: AsyncSession
            tenant_id: 当前租户
            target_id: 事项 ID (案件/线索/任务)
            item_type: CASE / CLUE / EXECUTABLE_TASK

        Returns:
            CaseDrawerVO | ClueDrawerVO | TaskDrawerVO

        Raises:
            NotFoundException: 目标事项不存在或已删除或不属于当前租户
        """
        if item_type == "CASE":
            return await CaseDetailService._drawer_case(session, tenant_id, target_id)
        if item_type == "CLUE":
            return await CaseDetailService._drawer_clue(session, tenant_id, target_id)
        if item_type == "EXECUTABLE_TASK":
            return await CaseDetailService._drawer_task(session, tenant_id, target_id)
        raise BusinessException(
            code=4001,
            message=f"非法的 item_type: {item_type!r}",
        )

    @staticmethod
    async def _drawer_case(
        session: AsyncSession, tenant_id: str, case_id: str
    ) -> CaseDrawerVO:
        """CASE 多态的抽屉概要."""
        stmt = select(Case).where(
            and_(
                Case.id == case_id,
                Case.tenant_id == tenant_id,
                Case.is_deleted.is_(False),
            )
        )
        case: Case | None = (await session.execute(stmt)).scalar_one_or_none()
        if case is None:
            raise NotFoundException(resource="案件", resource_id=case_id)

        dict_map = await _load_dict_map(session)

        def tr(dict_type: str, code: str | None) -> str | None:
            if not code:
                return None
            return dict_map.get(dict_type, {}).get(code)

        # assignee: 从 handling_lawyer_id 查姓名
        assignee_name: str | None = None
        if case.handling_lawyer_id:
            user = (
                await session.execute(
                    select(SysUser.real_name).where(
                        SysUser.id == case.handling_lawyer_id,
                        SysUser.is_deleted.is_(False),
                    )
                )
            ).scalar_one_or_none()
            assignee_name = user

        # 下一截止日: 优先从 extended_data.next_deadline 读取, 否则回退到最近的未完成 ProcessNode
        ext = case.extended_data or {}
        next_deadline_row = ext.get("next_deadline")
        if next_deadline_row is None:
            next_deadline_row = (
                await session.execute(
                    select(ProcessNode.deadline)
                    .where(
                        ProcessNode.case_id == case.id,
                        ProcessNode.tenant_id == tenant_id,
                        ProcessNode.is_deleted.is_(False),
                        ProcessNode.deadline.is_not(None),
                        ProcessNode.status != "COMPLETED",
                    )
                    .order_by(ProcessNode.deadline.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()

        return CaseDrawerVO(
            id=case.id,
            key=case.internal_case_no,
            title=case.case_name,
            item_type="CASE",
            assignee=assignee_name or case.handling_lawyer_id,
            recent_activities=[],  # 2.S2.a 暂空, 2.S4 审计模块补齐
            code=case.internal_case_no,
            case_type_code=case.case_type_code,
            case_type_name=tr("CASE_TYPE", case.case_type_code),
            stage_code=case.current_stage_code,
            stage_name=tr("CASE_STAGE", case.current_stage_code),
            risk_level=case.risk_level,
            risk_level_name=label_of(case.risk_level, RiskLevel),
            case_status=case.case_status,
            case_status_name=label_of(case.case_status, CaseStatus),
            target_amount=case.target_amount,
            provision_amount=case.provision_amount,
            accepting_court=case.accepting_court,
            cause_of_action=case.case_cause,
            cause_of_action_name=tr("CAUSE_OF_ACTION", case.case_cause),
            business_line=case.business_line,
            business_line_name=tr("BUSINESS_LINE", case.business_line),
            filing_date=case.filing_date,
            close_date=case.close_date,
            description=case.description,
            latest_progress=case.latest_progress,
            is_main_case=bool(case.is_main_case),
            main_case_id=case.main_case_id,
            is_investor_protection=bool(case.is_investor_protection),
            is_major=bool(case.is_major),
            sector=case.sector,
            sector_name=label_of(case.sector, Sector) if case.sector else None,
            our_role=case.our_role,
            our_role_name=label_of(case.our_role, OurRole),
            procedure_type=case.procedure_type,
            procedure_type_name=label_of(case.procedure_type, ProcedureType),
            handling_lawyer_id=case.handling_lawyer_id,
            next_deadline=next_deadline_row,
            extended_data=case.extended_data,
        )

    @staticmethod
    async def _drawer_clue(
        session: AsyncSession, tenant_id: str, clue_id: str
    ) -> ClueDrawerVO:
        """CLUE 多态的抽屉概要."""
        stmt = select(CaseClue).where(
            and_(
                CaseClue.id == clue_id,
                CaseClue.tenant_id == tenant_id,
                CaseClue.is_deleted.is_(False),
            )
        )
        clue: CaseClue | None = (await session.execute(stmt)).scalar_one_or_none()
        if clue is None:
            raise NotFoundException(resource="线索", resource_id=clue_id)

        # assignee: 从 assignee_id 查姓名
        assignee_name: str | None = None
        if clue.assignee_id:
            assignee_name = (
                await session.execute(
                    select(SysUser.real_name).where(
                        SysUser.id == clue.assignee_id,
                        SysUser.is_deleted.is_(False),
                    )
                )
            ).scalar_one_or_none()

        # reporter: created_by 对应的 SysUser
        reporter_name: str | None = None
        if clue.created_by:
            reporter_name = (
                await session.execute(
                    select(SysUser.real_name).where(
                        SysUser.id == clue.created_by,
                        SysUser.is_deleted.is_(False),
                    )
                )
            ).scalar_one_or_none()

        return ClueDrawerVO(
            id=clue.id,
            key=clue.id,  # CaseClue 模型无独立 code 字段, 以 id 作为 key
            title=clue.clue_title,
            item_type="CLUE",
            assignee=assignee_name or clue.assignee_id,
            recent_activities=[],
            status=clue.status,
            source_type=clue.source_type,
            reporter=reporter_name or clue.created_by,
            report_date=clue.created_at.date() if clue.created_at else None,
            content=clue.description,
            cleaned_plaintiff=clue.opponent_name,
            cleaned_amount=clue.estimated_amount,
            risk_level=None,
            risk_level_name=None,
            attachments=[],  # 2.S5 切片补齐
        )

    @staticmethod
    async def _drawer_task(
        session: AsyncSession, tenant_id: str, task_id: str
    ) -> TaskDrawerVO:
        """EXECUTABLE_TASK 多态的抽屉概要."""
        stmt = select(ProcessNode).where(
            and_(
                ProcessNode.id == task_id,
                ProcessNode.tenant_id == tenant_id,
                ProcessNode.is_deleted.is_(False),
            )
        )
        node: ProcessNode | None = (await session.execute(stmt)).scalar_one_or_none()
        if node is None:
            raise NotFoundException(resource="任务", resource_id=task_id)

        # 关联案件标题
        case_row = (
            await session.execute(
                select(Case.case_name, Case.tenant_id).where(
                    Case.id == node.case_id,
                    Case.is_deleted.is_(False),
                )
            )
        ).one_or_none()
        case_title = case_row[0] if case_row else None

        # assignee + 部门
        assignee_name: str | None = None
        dept_name: str | None = None
        if node.assignee_id:
            user_row = (
                await session.execute(
                    select(SysUser.real_name, SysUser.department_id).where(
                        SysUser.id == node.assignee_id,
                        SysUser.is_deleted.is_(False),
                    )
                )
            ).one_or_none()
            if user_row:
                assignee_name = user_row[0]
                if user_row[1]:
                    dept_name = (
                        await session.execute(
                            select(SysDepartment.dept_name).where(
                                SysDepartment.id == user_row[1],
                                SysDepartment.is_deleted.is_(False),
                            )
                        )
                    ).scalar_one_or_none()

        # 发起人
        creator_name: str | None = None
        if node.created_by:
            creator_name = (
                await session.execute(
                    select(SysUser.real_name).where(
                        SysUser.id == node.created_by,
                        SysUser.is_deleted.is_(False),
                    )
                )
            ).scalar_one_or_none()

        return TaskDrawerVO(
            id=node.id,
            key=node.task_code or node.id,
            title=node.task_name,
            item_type="EXECUTABLE_TASK",
            assignee=assignee_name or node.assignee_id,
            recent_activities=[],
            status=node.status,
            description=node.description,
            case_id=node.case_id,
            case_title=case_title,
            assignee_dept=dept_name,
            creator=creator_name or node.created_by,
            deadline=node.deadline,
            attachments=[],
        )

    # -------------------- update_base_info --------------------
    @staticmethod
    async def update_base_info(
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
        current_user: SysUser,
        payload: CaseBaseInfoPatch,
    ) -> CaseDrawerVO:
        """局部更新案件基础字段.

        流程:
          1. 查锁定案件 (is_deleted=FALSE + tenant_id)
          2. 结案自动锁定: case_status=CLOSED 时仅允许 description 变更
          3. extended_data 合并 (深度合并一级键; 禁止未登记键)
          4. 事务内更新 + updated_by/updated_at
          5. 写 CASES/UPDATE 审计日志 (4.S4 §4.3 补齐)
          6. 返回刷新后的 CaseDrawerVO
        """
        only_set = payload.model_dump(exclude_unset=True)
        if not only_set:
            raise BusinessException(code=4000, message="未提供任何可更新字段")

        # 权限检查 + 审计日志 (放事务内避免 autobegin 冲突; TROUBLESHOOTING §5.9)
        from .audit_log_service import write_audit_log
        from .case_detail_ext_service import _compute_permissions

        # 使用 begin_nested() 兼容 FastAPI 依赖注入中 get_current_user 已触发 autobegin 的场景
        async with session.begin_nested():
            user_id = str(current_user.id)
            perms = await _compute_permissions(session, tenant_id, case_id, user_id)
            # description 归 canEditOverview; 其它字段归 canEditBaseInfo
            needs_base_info = bool(set(only_set.keys()) - {"description"})
            needs_overview = "description" in only_set
            if needs_base_info and not perms.can_edit_base_info:
                raise BusinessException(
                    code=4003, message="无权编辑该案件基础字段 (缺少 canEditBaseInfo)"
                )
            if needs_overview and not perms.can_edit_overview:
                raise BusinessException(
                    code=4003, message="无权编辑案情简述 (缺少 canEditOverview)"
                )

            case = (
                await session.execute(
                    select(Case)
                    .where(
                        and_(
                            Case.id == case_id,
                            Case.tenant_id == tenant_id,
                            Case.is_deleted.is_(False),
                        )
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()

            if case is None:
                raise NotFoundException(resource="案件", resource_id=case_id)

            # 结案自动锁定 (与 sidebar §2.4 权限矩阵一致)
            if case.case_status == CaseStatus.CLOSED.value:
                disallowed_on_closed = set(only_set.keys()) - {"description"}
                if disallowed_on_closed:
                    raise BusinessException(
                        code=4103,
                        message="案件已结案, 除案情简述外其他字段不可修改",
                        details={"disallowed_fields": sorted(disallowed_on_closed)},
                    )

            # extended_data 合并与白名单校验
            if "extended_data" in only_set:
                new_ext = only_set["extended_data"] or {}
                if not isinstance(new_ext, dict):
                    raise BusinessException(
                        code=4001, message="extended_data 必须是对象"
                    )
                bad_keys = set(new_ext.keys()) - EXTENDED_DATA_ALLOWED_KEYS
                if bad_keys:
                    raise BusinessException(
                        code=4001,
                        message="extended_data 包含未登记的一级键",
                        details={"invalid_keys": sorted(bad_keys)},
                    )
                # 整键替换 (payload 中的每个键覆盖原值, 未在 payload 中的键保留)
                merged: dict[str, Any] = dict(case.extended_data or {})
                for k, v in new_ext.items():
                    merged[k] = v
                only_set["extended_data"] = merged

            # Enum 字段: Pydantic 已校验并转为 Enum 实例, 取 .value 落库
            for field in ("risk_level", "sector"):
                if field in only_set and only_set[field] is not None:
                    v = only_set[field]
                    only_set[field] = v.value if hasattr(v, "value") else v

            # 快照变更前字段值 (仅记录被修改的键)
            before_data = {k: getattr(case, k, None) for k in only_set}

            # 写入
            for k, v in only_set.items():
                setattr(case, k, v)
            case.updated_by = user_id
            case.updated_at = datetime.now(timezone.utc)

            # 4.S4 §4.3 补 CASES/UPDATE 审计日志
            await write_audit_log(
                session,
                tenant_id=tenant_id,
                case_id=case_id,
                operator=current_user,
                action_module="CASES",
                action_type="UPDATE",
                action_detail=f"案件基础信息更新: {', '.join(only_set.keys())}",
                target_record_id=case_id,
                before_data=before_data,
                after_data=dict(only_set),
            )

        # 显式提交外层事务（FastAPI get_db 共享 session 时 get_current_user 已触发 autobegin）
        await session.commit()
        # 事务已提交, 返回最新抽屉数据
        return await CaseDetailService._drawer_case(session, tenant_id, case_id)

    # -------------------- change_stage (2.S2.a 简版 + 2.S4 补审计) --------------------
    @staticmethod
    async def change_stage(
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
        current_user: SysUser,
        new_stage_code: str,
        remark: str | None = None,
    ) -> CaseDrawerVO:
        """案件阶段变更 (2.S2.a 简版 + 2.S4 STAGE 审计集成).

        流程:
          1. 校验 new_stage_code 是字典 CASE_STAGE 内有效 code
          2. 结案自动锁定: case_status=CLOSED 时拒绝变更
          3. 更新 current_stage_code + latest_progress
          4. 写 STAGE/UPDATE 审计日志 (2.S4 决策 D7 轻联动: 仅审计, 不生成新节点)
          5. 返回刷新后的 CaseDrawerVO

        注意:
          - 节点生成/联动逻辑不在本方法内, 由 2.S4 `/process/stage/advance` 独立端点承担
        """
        # 2.S2.b: 权限检查 (canChangeStage) 放事务内避免 autobegin 冲突
        from .audit_log_service import write_audit_log
        from .case_detail_ext_service import _compute_permissions

        user_id = str(current_user.id)
        # 使用 begin_nested() 兼容 FastAPI 依赖注入中 get_current_user 已触发 autobegin 的场景
        async with session.begin_nested():
            perms = await _compute_permissions(session, tenant_id, case_id, user_id)
            if not perms.can_change_stage:
                raise BusinessException(
                    code=4003, message="无权变更该案件阶段 (缺少 canChangeStage)"
                )

            # 1. 字典校验 (在事务内, 避免 autobegin 冲突)
            valid = (
                await session.execute(
                    select(SysDict.dict_code).where(
                        SysDict.dict_type == "CASE_STAGE",
                        SysDict.dict_code == new_stage_code,
                        SysDict.is_deleted.is_(False),
                        SysDict.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
            if not valid:
                raise BusinessException(
                    code=4001,
                    message=f"无效的 new_stage_code: {new_stage_code!r}",
                )

            case = (
                await session.execute(
                    select(Case)
                    .where(
                        and_(
                            Case.id == case_id,
                            Case.tenant_id == tenant_id,
                            Case.is_deleted.is_(False),
                        )
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if case is None:
                raise NotFoundException(resource="案件", resource_id=case_id)

            # 结案自动锁定
            if case.case_status == CaseStatus.CLOSED.value:
                raise BusinessException(
                    code=4103,
                    message="案件已结案, 不可变更阶段",
                )

            old_stage = case.current_stage_code
            case.current_stage_code = new_stage_code
            if remark:
                progress_prefix = f"[{datetime.now(timezone.utc).date()} 阶段变更 {old_stage or '—'} → {new_stage_code}] "
                case.latest_progress = progress_prefix + remark
            case.updated_by = user_id
            case.updated_at = datetime.now(timezone.utc)

            # 2.S4 补 STAGE/UPDATE 审计日志 (Q2 §4.3 清账)
            await write_audit_log(
                session,
                tenant_id=tenant_id,
                case_id=case_id,
                operator=current_user,
                action_module="STAGE",
                action_type="UPDATE",
                action_detail=f"阶段变更: {old_stage or '(无)'} → {new_stage_code}"
                              + (f" (备注: {remark})" if remark else ""),
                target_record_id=case_id,
                before_data={"current_stage_code": old_stage},
                after_data={"current_stage_code": new_stage_code},
            )

        # 显式提交外层事务（FastAPI get_db 共享 session 时 get_current_user 已触发 autobegin）
        await session.commit()
        return await CaseDetailService._drawer_case(session, tenant_id, case_id)
