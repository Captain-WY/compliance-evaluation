from fastapi import APIRouter
router=APIRouter()
from app.modules.cases.api.v1 import dicts, search
router.include_router(dicts.router, prefix="/api/v1/dicts", tags=["字典管理"])
router.include_router(search.router, prefix="/api/v1/search", tags=["全局搜索"])

# ---- BFF (Backend For Frontend) 层 ----
from app.modules.cases.api.bff.v1 import cases as bff_cases
router.include_router(
    bff_cases.router,
    prefix="/api/bff/v1/cases",
    tags=["BFF - 案件大厅"],
)

# 2.S11.a: 跨案件财务看板 (Finance Board)
from app.modules.cases.api.bff.v1 import finance_board as bff_finance_board
router.include_router(
    bff_finance_board.router,
    prefix="/api/bff/v1/finance",
    tags=["BFF - 财务看板"],
)

# 2.S12: 资产保全台账 + 到期预警
from app.modules.cases.api.bff.v1 import asset_preservation as bff_asset_preservation
router.include_router(
    bff_asset_preservation.router,
    prefix="/api/bff/v1/assets",
    tags=["BFF - 资产保全"],
)

# 2.S13: 合规中心 (预警 + 数据治理 + 合规规则)
from app.modules.cases.api.bff.v1 import compliance_center as bff_compliance_center
router.include_router(
    bff_compliance_center.router,
    prefix="/api/bff/v1/compliance",
    tags=["BFF - 合规中心"],
)

# 2.S14: 合规报送任务 + AI 物料 (任务/案件圈定/快照/AI摘要/渲染/下载)
from app.modules.cases.api.bff.v1 import compliance_tasks as bff_compliance_tasks
router.include_router(
    bff_compliance_tasks.router,
    prefix="/api/bff/v1/compliance",
    tags=["BFF - 合规报送"],
)

# 2.S15: 线索管理 + 智能收件箱
from app.modules.cases.api.bff.v1 import clues_bff, inbox_bff
router.include_router(
    clues_bff.router,
    prefix="/api/bff/v1/clues",
    tags=["BFF - 线索管理"],
)
router.include_router(
    inbox_bff.router,
    prefix="/api/bff/v1/inbox",
    tags=["BFF - 智能收件箱"],
)


# 2.S16: 字典/RBAC 管理端 (BFF Admin)
from app.modules.cases.api.bff.v1.admin import dicts_admin_bff, roles_bff, menus_bff, role_menus_bff, user_roles_bff
router.include_router(
    dicts_admin_bff.router,
    prefix="/api/bff/v1/admin/dicts",
    tags=["BFF Admin - 字典管理"],
)
router.include_router(
    roles_bff.router,
    prefix="/api/bff/v1/admin/roles",
    tags=["BFF Admin - 角色管理"],
)
router.include_router(
    menus_bff.router,
    prefix="/api/bff/v1/admin/menus",
    tags=["BFF Admin - 菜单管理"],
)
router.include_router(
    role_menus_bff.router,
    prefix="/api/bff/v1/admin/role-menus",
    tags=["BFF Admin - 角色菜单分配"],
)
router.include_router(
    user_roles_bff.router,
    prefix="/api/bff/v1/admin/user-roles",
    tags=["BFF Admin - 用户角色分配"],
)


# 2.S17: 律所 + 外部律师 + 文书模板 + 流程/任务模板 + 法律大脑 (AI Stub)
from app.modules.cases.api.bff.v1 import vendors_bff, lawyers_bff, templates_bff, ai_bff
from app.modules.cases.api.bff.v1.process_templates_bff import process_router as bff_process_templates, task_router as bff_task_templates

router.include_router(
    vendors_bff.router,
    prefix="/api/bff/v1/vendors",
    tags=["BFF - 律所管理"],
)
router.include_router(
    lawyers_bff.router,
    prefix="/api/bff/v1/lawyers",
    tags=["BFF - 外部律师管理"],
)
router.include_router(
    templates_bff.router,
    prefix="/api/bff/v1/templates",
    tags=["BFF - 文书模板管理"],
)
router.include_router(
    bff_process_templates,
    prefix="/api/bff/v1/process-templates",
    tags=["BFF - 流程模板管理"],
)
router.include_router(
    bff_task_templates,
    prefix="/api/bff/v1/task-templates",
    tags=["BFF - 任务模板管理"],
)
router.include_router(
    ai_bff.router,
    prefix="/api/bff/v1/ai",
    tags=["BFF - 法律大脑 (AI Stub)"],
)


# 2.S18: 通知 + 附件 + 统一审批
from app.modules.cases.api.bff.v1 import notifications_bff, attachments_bff, approvals_bff
router.include_router(
    notifications_bff.router,
    prefix="/api/bff/v1/notifications",
    tags=["BFF - 通知中心"],
)
router.include_router(
    attachments_bff.router,
    prefix="/api/bff/v1/attachments",
    tags=["BFF - 附件管理"],
)
router.include_router(
    approvals_bff.router,
    prefix="/api/bff/v1/approvals",
    tags=["BFF - 统一审批"],
)


# 2.S19: 驾驶舱 + 数据快照 + 业务门户 + 外部律师门户
from app.modules.cases.api.bff.v1 import dashboard_bff, snapshots_bff, business_portal_bff, vendor_portal_bff
router.include_router(
    dashboard_bff.router,
    prefix="/api/bff/v1/dashboard",
    tags=["BFF - 驾驶舱"],
)
router.include_router(
    snapshots_bff.router,
    prefix="/api/bff/v1/snapshots",
    tags=["BFF - 数据快照"],
)
router.include_router(
    business_portal_bff.router,
    prefix="/api/bff/v1/business-portal",
    tags=["BFF - 业务门户"],
)
router.include_router(
    vendor_portal_bff.router,
    prefix="/api/bff/v1/vendor-portal",
    tags=["BFF - 外部律师门户"],
)

