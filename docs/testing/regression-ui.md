# 五类角色浏览器回归

日期：2026-10-03。在 Docker 前端 `http://127.0.0.1:3010` 使用五类真实账号逐一登录。页面操作通过浏览器自动化执行，未修改产品代码。截图仅保存在被 Git 忽略的 `.local/regression/screenshots/`。

## 检查矩阵

这里按用户操作分组，不与接口权限检查混为同一覆盖率。共 **22 项：14 PASS / 5 FAIL / 3 BLOCKED**。

| ID | 角色 | 操作及预期 | 结果 | 实际及证据 |
|---|---|---|---|---|
| UI-01 | 管理员 | 四个一级菜单、系统管理入口 | PASS | 案件/检查/考核/系统管理均显示 |
| UI-02 | 管理员 | 角色、菜单、流程模板页面加载 | PASS | 五角色及菜单树、33条流程模板正常显示；不代表维护成功 |
| UI-03 | 管理员 | 新增临时角色并保存 | FAIL | 提示HTTP500，SYS-D01；admin-role-failure.jpg |
| UI-04 | 总部 | 登录及系统管理边界 | PASS | 仅显示三个业务一级菜单，原系统管理URL提示无权限 |
| UI-05 | 总部 | 页面立案并刷新读回 | PASS | REG-20261003-UI-CASE / case_a8817c7dd2d3；法院/案由/日期读回；hq-case-created.jpg |
| UI-06 | 总部 | 财务测算10000元、系数1、保存 | PASS | 提示保存成功；独立接口读回extended_data.regulatory.estimated_risk_capital_deduction=10000 |
| UI-07 | 总部 | 智能收件箱加载 | PASS | 空列表显示“无符合条件的邮件”；未模拟外部来信及解析 |
| UI-08 | 总部 | 检查详情、底稿/问题和报告页签 | PASS | 本批计划显示材料收集中、底稿1、发现2；报告页显示前置清单，不等于报告发布通过 |
| UI-09 | 总部 | 考核方案列表、新建配置入口 | PASS | 自建方案可见；进入配置画布、缺项时下一步禁用；没有把打开表单算成发布成功 |
| UI-10 | 分支 | 资料验收状态与提交待办一致 | FAIL | 同一材料“验收通过”，统一待办仍要求提交；INSP-D03；branch-evidence-approved.jpg、branch-pending-stale.jpg |
| UI-11 | 分支 | 已裁决申诉显示最终结论 | FAIL | API为APPEAL_REJECTED，页面显示“申辩审核中”；UI-D02 |
| UI-12 | 分支 | 日常台账新增、编辑、刷新读回 | PASS | REG-20261003-UI-LEDGER可读；本项仅验证进程内读回，持久化缺陷另见ASMT-03 |
| UI-13 | 分支 | 通过页面办理新周期填报 | BLOCKED | 浏览器检查时暂无任务；后续API补测另见考核报告，不冒充页面操作已完成 |
| UI-14 | 部门 | 一级菜单及禁止进入考核 | PASS | 仅案件管理，保留考核URL时提示无权限 |
| UI-15 | 部门 | 页面上报线索并查看结果 | PASS | REG-20261003-UI-CLUE显示“新线索”；独立门户API也可读；department-clue.jpg |
| UI-16 | 部门 | 协查任务页面加载 | FAIL | 长时间停在“加载任务列表...”；浏览器记录Resource not found，实际旧路径404；UI-D01 |
| UI-17 | 律师 | 专属入口与已分配案件列表 | PASS | 仅案件管理/律师工作台，本批已指派案件可见 |
| UI-18 | 律师 | 从门户进入案件/办理待办 | BLOCKED | 显示4待办但无任务列表或办理按钮，案件卡片点击无变化；能力缺口UI-G01 |
| UI-19 | 律师 | 内部案件页面访问限制 | PASS | 直接访问案件URL提示当前角色无权或未接入；只证明当前拦截存在，可办理范围应结合CASE-01调整 |
| UI-20 | 分支 | 查看补测考核结果和明细 | PASS | ACYC-0002-TARGET-001-RESULT显示80分/B；和API一致，等级计算缺陷另登记；branch-assessment-result.jpg |
| UI-21 | 分支 | 从成绩明细发起申诉 | BLOCKED | 申诉按钮明确禁用，UI-G02；本批结果也无可申诉扣分调整，未伪造成功 |
| UI-22 | 分支 | 保存台账在后端重启后仍可见 | FAIL | READ-03重启前可见LEDGER-0002，重启后接口和刷新页面均消失；ASMT-03；branch-ledger-lost-after-restart.jpg |

## UI-D01 [P1] 业务部门协查任务接口路径不一致，页面一直加载

- 复现：department_user登录 → 案件管理 → 协查任务 `/cases/tasks`。
- 实际：页面持续“加载任务列表...”，无错误提示或重试。浏览器日志 `AxiosError: Resource not found`。
- 真实HTTP复核：`POST /api/bff/v1/business-portal/my-tasks`，`{"status":null,"page":1,"pageSize":50}` → 404；同账号 `POST /api/bff/v1/business-portal/evidence-tasks/list` `{}` → 200、空列表。
- 定位：`frontend/src/modules/cases/src/services/api/businessPortalBffApi.ts:34` 使用旧 `/my-tasks`；后端 `api/bff/v1/business_portal_bff.py:49` 实际是 `/evidence-tasks/list`。`EvidenceResponse.tsx:20` 的loadTasks没有catch/finally，拒绝后未清除loading。
- 关联风险：前端提交使用 `/submit-evidence`，后端为 `/evidence-tasks/submit`，需与列表一并校正并验证请求/响应字段。
- 证据：`.local/regression/readback-before.json` UI-API-01/02、department-tasks-loading.jpg。

## UI-D02 [P2] 检查申诉已裁决，分支仍显示审核中

- 复现：branch_user → 结论核对与申辩，选择 `REG-20261003-INSP-5201e7-MAIN`。
- 实际：`ISSUE-SEED-0013` 显示“已无异议”；已被总部驳回的 `ISSUE-SEED-0014` 却显示“申辩审核中”。API已读回 `APPEAL_REJECTED/VALID`。
- 定位：`frontend/src/modules/compliance-shared/features/inspection/BranchFactConfirmation.tsx:62` 将除待确认/事实确认外的状态一律转成DISPUTED，`:386` 把DISPUTED渲染为审核中。终局裁决被丢弃。
- 影响：分支无法准确判断是否还需等待总部；APPEAL_ADOPTED同样落入该映射（代码推断，未另行页面实测）。
- 截图：branch-appeal-wrong-status.jpg。

## UI-G01 [P1，能力缺口] 律师门户没有案件详情及任务办理入口

- 门户显示本批4个已委托案件和4待办任务，但只有案件摘要卡片。点击案件标题没有导航，页面中没有任务列表、提交任务或上传材料入口。
- `VendorDashboard.tsx:98` 的卡片为无点击事件的div；`CasesPage.tsx:38` 对律师只开放门户。直接访问本批已委托案件仍显示“无权或尚未接入”。
- 与CASE-01/02/03分开看待：后端权限/ID/事务修复后，还须接入可用的前端任务工作台才能完成律师业务。属于现状能力缺口，不宣称是本次合并新引入。
- 证据：lawyer-no-task-entry.jpg。待用户迭代范围确认后实现。

## UI-G02 [P2，能力缺口] 考核成绩申诉页面尚未接入

- 进入真实结果明细后，发起申诉按钮禁用；提示“成绩申诉需真实扣分项、附件上传和状态语义完整绑定；当前清理包不启用本地申诉成功”。
- 定位：`frontend/src/modules/compliance-shared/features/assessment/AssessmentScoreCheck.tsx:40,236`。这是页面明确声明的未接入功能，不将提示本身认定为错误提交。
- 本轮结果80分没有scoreAdjustment类型的扣分记录；申诉业务API按门槛拒绝是正确行为。另建扣分场景被周期ID冲突阻断，故页面完整申诉闭环没有验收。
- 证据：branch-assessment-result.jpg。

## 其他观察及限制

- 台账新建日期默认固定为2026-04-26（`BranchDailyComplianceLedger.tsx:107,158`）。日期控件自动化修改后读回仍为该日期，尚未排除工具对原生日期事件的影响，不将“日期修改丢失”计作确认缺陷；建议人工补测，默认值可另行改为当天。
- 审批、报告、律所、知识、通知入口有初次加载观察，未逐一完成稳定态及子操作，不计为通过。报表导出、AI检索、真实OA/EKP、浏览器文件拖拽、移动端及全部筛选组合未覆盖。
- 首次页面定位因合并文本节点和日期输入类型失败，均按工具/测试准备问题处理，未计入产品缺陷。
- 本轮截图和接口证据互相补充；权限拒绝用例、提交状态和数据持久性以真实接口/数据库结果为准。
