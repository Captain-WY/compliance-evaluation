# 合规考核五角色 HTTP 回归：补测最终报告

日期：2026-10-03。最终有效检查 **64 PASS / 7 FAIL / 3 BLOCKED**。共6个产品问题：5个P1、1个P2。首轮原始统计53/4/9及逐项证据保留在文末；已解除的前置阻塞不重复计入最终统计。同名补测按场景选取有效记录，原始请求和失败记录均未删除。

## 最终业务结论

- 已通过正常API备份、配置和发布 `WFT-ASSESS-DEFAULT-V001`；自建方案 `ASCH-0006` 成为ACTIVE。首轮“不能改共享初始模板”的测试安排已解除，不再作为终止理由。
- 首个合法持久化周期ACYC-0002：下发→分支草稿/缺证拒绝→真实证据提交/撤回/重提→管理员复核退回→分支补证→管理员核定80分通过→HQ结果生成发布→branch确认→HQ定稿→周期归档，均有真实HTTP与状态证据。
- **HQ业务复核链失败**：已绑定路由明确指定HQ账号，但任务assignee=NULL，HQ列表空、详情和start均403。管理员补测仅证明其权限下后续流程可走通，不计为HQ业务完成。
- 扣分申诉仍受阻：首周期初评80分、最终80分，没有调整扣减，409拒绝申诉符合当前规则。为准备“初评100、扣减20、申诉90”场景另建周期，发现ID碰撞覆盖已归档周期，无法取得新的合法填报任务。没有绕过状态或直接写DB。
- 未改产品代码、账号或角色；仅授权修改并发布初始工作流，原始快照及改动清单见本地证据。主任务统一重启backend后，本任务重新登录核验方案、工作流、结果及档案保留；碰撞造成的父周期错误状态也已持久化。
- ASMT-03现已由主任务真实重启证实：UI创建的LEDGER-0002、title=REG-20261003-UI-LEDGER重启前可见、重启后消失。证据`.local/regression/readback-before.json`和`readback-after.json`的READ-03。此为原台账未落库缺陷的补充证据，不重复计缺陷。

## 新发现的问题

### ASMT-04 / P1：工作流指定HQ审批人，生成的复核任务却无分派人

角色hq_business。最小复现：发布四节点工作流（L0指定branch，其余指定HQ）→绑定自建方案→创建下发周期→branch提交。GET `/api/assessment/review-tasks`为空；从管理员取得真实ID后HQ GET详情及POST start均403（请求264、287–288）。

预期：配置的HQ审批人能看到和处理复核。实际：管理员可见该任务，DB `assessment_review_tasks.assignee_user_id`为空，HQ无法继续。源码`backend/app/modules/compliance/domain/review_store.py:24,291–324`使用旧用户`USER-HQ-COMP-001`及旧组织`WLZQ-HQ-COMPLIANCE`，未从绑定工作流取本次HQ账号；权限判断在776–790。管理员旁路不消除此缺陷。

### ASMT-05 / P2：结果等级忽略方案已发布的等级区间

角色hq_business/branch_business。方案快照只有`gradeCode=PASS,minScore=0,maxScore=null`，故80分应为PASS；生成结果却为B（请求326–327）。源码`domain/result_store.py:468–480`硬编码90/75/60分段与A/B/C/D，未读取方案gradeThresholds。分值80本身与管理员复核一致。

### ASMT-06 / P1：新增周期复用已归档周期ID并覆盖父记录

角色hq_business。最小复现状态为“仅有持久化ACYC-0002”（早前失败的幽灵ACYC-0001已在hydrate时被移除）。

1. 请求343：原`REG-20261003-ASMT-e78d6c-MAIN`周期ACYC-0002归档返回200 ARCHIVED。
2. 请求344：POST `/api/assessment/cycles`，新唯一cycleCode=`REG-20261003-ASMT-e78d6c-APPEAL`，同一个ACTIVE方案、合法日期/组织。预期新独立ID；实际200返回已有ACYC-0002和DRAFT。
3. 请求345：POST `/cycles/ACYC-0002/dispatch`返回409 `Cycle has already been dispatched`。
4. 请求399 GET与只读SQL核实：父记录code已被新值覆盖、status=DRAFT；旧target=CLOSED、review=APPROVED、result=FINALIZED,totalScore=80,grade=B仍挂在同一ID。

源码`domain/cycle_store.py:142`用`len(self.cycles)+1`生成ID，`repositories/assessment_runtime.py:187`使用merge更新同一主键。该操作造成业务数据不一致，是新合法请求触发的产品缺陷。没有尝试删除、强改DB或重复创建来人为修正。扣分申诉、裁决、申诉后归档因此BLOCKED。

## 补测逐项结果

| 检查/场景 | 角色 | 结论 | 请求证据 | 预期与实际 |
|---|---|---|---|---|
| B01 备份配置并发布初始工作流 | hq_business | PASS | 240–240 | 已发布模板独立读回ACTIVE，版本WFT-ASSESS-DEFAULT-V001 |
| B02 新方案发布到ACTIVE | hq_business | PASS | 241–243 | 自建方案绑定已发布路由并成为ACTIVE |
| B03 周期创建下发并分支读取 | hq_business | PASS | 244–246 | 自建ACTIVE方案生成独立周期并下发，分支读取任务 |
| B04 分支填报草稿及缺证拒绝 | branch_business | PASS | 258–260 | 草稿读回rate=82，缺证提交422 |
| B05 分支举证提交撤回及重提 | branch_business | PASS | 261–263 | 真实证据提交、复核前撤回和重提均成功 |
| B07 HQ按方案工作流应可复核 | hq_business | FAIL | 287–288 | HQ详情403、开始403；任务assigneeUserId=None，已发布工作流明确指定HQ账号 |
| B08 管理员复核退回及分支重提 | platform_admin | PASS | 289–296 | 管理员开始复核、退回原因门槛、退回、branch补证85分重提、复核重置PENDING |
| B09 管理员评分通过并分支读回 | platform_admin | PASS | 297–301 | 未逐项评分不得通过；管理员核定80分并通过，分支任务ACCEPTED |
| B10 总部生成发布结果及分值读回 | hq_business | PASS | 323–325 | HQ生成发布80分，branch独立读取80分且待确认 |
| B11 结果等级应服从发布方案 | hq_business | FAIL | 326–327 | 方案gradeThresholds=[{'thresholdId': 'ASCH-0006-GRADE-001', 'gradeCode': 'PASS', 'gradeLabel': '合格', 'minScore': 0.0, 'maxScore': None, 'sortOrder': 1}]，实际80分gradeCode=B |
| B15 无扣分结果拒绝申诉并归档 | branch_business | PASS | 340–343 | 80原始分/80最终分无扣减，申诉409符合规则；确认定稿归档成功 |
| B16 创建扣分申诉补测周期 | hq_business | FAIL | 344–345 | HTTP 409; {"code": "INVALID_STATE", "message": "Cycle has already been dispatched", "details": null, "requestId": "cccb9492-6ef0-4826-beec-f35258a442fd"} |
| B17 现存任务结果五角色拒绝边界 | department_business/external_lawyer/branch_business | PASS | 400–411 | 部门/律师现存填报、复核、结果详情及确认/复核操作403；branch总部操作403 |
| B18 主任务重启后考核数据读回 | hq_business | PASS | 422–425 | 主任务重启后：ACTIVE方案/发布路由/FINALIZED80分及1份档案均保留；碰撞损坏的父周期APPEAL/DRAFT同样持久化 |
| B12 分支扣分申诉及开放申诉保护 | branch_business/hq_business | BLOCKED | 未执行 | 首周期无scoreAdjustment扣减，409拒绝申诉符合规则；创建扣分周期发生ACYC-0002主键碰撞，无法取得合法新任务继续。 |
| B13 总部申诉裁决及重新计分 | branch_business/hq_business | BLOCKED | 未执行 | 首周期无scoreAdjustment扣减，409拒绝申诉符合规则；创建扣分周期发生ACYC-0002主键碰撞，无法取得合法新任务继续。 |
| B14 申诉后确认定稿归档 | branch_business/hq_business | BLOCKED | 未执行 | 首周期无scoreAdjustment扣减，409拒绝申诉符合规则；创建扣分周期发生ACYC-0002主键碰撞，无法取得合法新任务继续。 |


## 证据、数据现状与执行记录

- HTTP/SQL总证据：`.local/regression/assessments-state.json`，包含requests、databaseEvidence、原始results、finalResults、counts与明确排除的测试准备错误。
- 工作流原始模板/版本：`.local/regression/assessments-workflow-before.json`（publishedVersion原为空）。改动清单：`assessments-workflow-change-list.json`。初始校验3个EMPTY_APPROVER_SET，按现有五账号配置USER选择器后校验0错误并正常发布；角色和账号未更改。
- 执行命令：`python -X utf8 scripts/regression/assessments.py prepare_workflow`、`reporting_main`、`review_main`、`results_main`、`appeal_cycle`、`collision_evidence`。SQL全在BEGIN READ ONLY事务中完成。补测仍仅修改脚本、报告和本地证据。
- 当前可用于主任务重启核验：scheme ASCH-0006 ACTIVE；workflow WFT-ASSESS-DEFAULT-V001；cycle ACYC-0002（被碰撞覆盖为APPEAL/DRAFT）；reporting ACYC-0002-REPORT-001 ACCEPTED；review ACYC-0002-REPORT-001-REVIEW APPROVED；result ACYC-0002-TARGET-001-RESULT FINALIZED/80/B。要核查的是保存后的实际状态，不将已覆盖的父周期宣称仍ARCHIVED。
- B01初次脚本误读发布包裹层，HTTP发布已成功，随后GET校正；不计产品失败。第二周期前置失败后对上一周期已结束对象的后续误跑返回409，排除这些连带测试准备错误，不覆盖首周期真实通过。B06空列表与B07明确403属同一HQ分派问题，最终只计B07。
- B12首次无扣分申诉409为规则拒绝，B15明确验证其边界并完成无申诉归档；其后扣分申诉流程仍未测通，绝不改记通过。测试脚本已加前置保护，避免继续复用旧对象。

---

## 首轮历史报告（保留原始统计与当时边界，非最终结论）

### 首轮合规考核五角色 HTTP 回归

日期：2026-10-03（Asia/Shanghai）。API：`http://127.0.0.1:8010`。独立测试前缀：`REG-20261003-ASMT-e78d6c`。

## 结论与边界

最终有效检查 **53 PASS / 4 FAIL / 9 BLOCKED**。4项失败归为3个P1产品问题；缺少可绑定的已发布工作流另列环境/能力阻塞。指标规则、方案草稿与幂等/并发保护、附件上传、台账内存内CRUD、现有对象权限与跨机构拒绝已执行。完整考核链未完成，不能宣称业务回归通过。

只运行真实HTTP、只读SQL及日志核查；未改产品代码、种子、共享角色或账号，未重启服务。新建记录均带前缀；两个测试台账已软删除，指标、草稿方案、证据文件保留供复核。未执行构建、类型检查或后端单元测试，本报告不代表这些检查通过。因约束不重启，未声称验证重启读回；台账未落库是直接SQL证据。

五角色：platform_admin（平台管理员、HQ）、hq_business（总部业务、HQ）、branch_business（南沙分公司）、department_business（部门业务、HQ）、external_lawyer（外部律师）。账号凭据来自本地开发账号文件，仅内存使用；登录与身份响应在请求证据中脱敏。

## P1缺陷

### ASMT-01：API内存种子方案与数据库不一致，合法周期创建500，首次保存后种子列表消失

- 检查：A10、A32；角色：hq_business；请求证据66、77–81、202。
- 最小复现：GET `/api/assessment/schemes`选择返回的ACTIVE `ASCH-SEED-2026`；POST `/api/assessment/cycles`，body为 `{"cycleCode":"<prefix>-CYCLE","cycleName":"<prefix>周期","schemeId":"ASCH-SEED-2026","year":2026,"periodStart":"2026-10-01","periodEnd":"2026-10-31","targetOrgIds":["WLZQ-RBC-GZ-NANSHA"]}`。
- 预期：可引用返回的已启用方案创建DRAFT周期。实际：HTTP500，日志明确 `assessment_cycles_scheme_id_fkey`，`ASCH-SEED-2026`不在`assessment_schemes`表。
- 再保存独立草稿`ASCH-0006`成功，随后GET schemes只剩该DRAFT。最初返回的5个种子方案全部消失，包括3个ACTIVE方案；期间未调用删除种子接口。
- 已核验代码：`backend/app/modules/compliance/api/routes/assessment.py:693–709`、`repositories/assessment_runtime.py:112–118,174–198`；hydrate在DB空时保留内存种子，DB非空时整体替换。
- 下游：无法创建合法且落库的周期，阻断下发及其后业务。环境已改变，复现初始500需要相同“DB无方案、运行时有种子”初态；勿通过删除当前数据重造初态。

### ASMT-02：周期落库失败后仍返回未提交的幽灵周期

- 检查：A15；角色：hq_business；GET证据175–176及databaseEvidence。
- 最小复现：接ASMT-01周期POST500后GET `/api/assessment/cycles`和`/api/assessment/cycles/ACYC-0001`。
- 预期：失败写入不进入后续业务视图。实际：HTTP200返回前缀周期ACYC-0001、DRAFT；只读SQL `SELECT cycle_id,cycle_code,status FROM assessment_cycles`为0行。
- 已核验代码：`domain/cycle_store.py:128–167`先修改内存；`api/routes/assessment.py:700–709`随后持久化；`repositories/assessment_runtime.py:120–126`在0行时直接返回，未清除失败内存记录。
- 下游：页面可能显示创建失败的周期；本次未沿此未提交对象继续执行下发并冒充成功链。

### ASMT-03：履职台账创建/编辑成功但未落库

- 检查：A27；角色：branch_business；HTTP证据107–110，databaseEvidence中ledger查询。
- 最小复现：POST `/api/assessment/daily-ledger`（前缀title、occurredDate=2026-10-03、status=AVAILABLE、真实fileIds），PATCH `/daily-ledger/LEDGER-0001`编辑说明，GET列表。
- 预期：成功响应的数据进入持久化库。实际：POST/PATCH/GET均200且字段一致，但 `SELECT ledger_entry_id,title,status FROM daily_compliance_ledger_entries WHERE ledger_entry_id='LEDGER-0001'`为0行。
- 已核验代码：`api/routes/assessment.py:1129–1194`未接session或仓储；`domain/reporting_store.py:255–335`仅修改内存字典。
- 下游：作为后续填报复用的台账缺少数据库保障；重启丢失的实际行为本次未执行，不能将其写为已回归事实。

## 环境/能力阻塞 B-ASMT-01

A09 BLOCKED：`GET /api/workflow/templates`仅返回`WFT-ASSESS-DEFAULT` DRAFT，currentVersionId和publishedVersion均空。方案发布返回422 `workflow_route_required`，符合门槛要求。工作流路由只有查询、修改、校验、发布（`api/routes/workflow.py:37,49,66,87,106`），无新建/复制接口；当前回归禁止改共享种子，因此没有可绑定的发布版本可将新方案启用。不能把门槛正确拒绝本身当产品缺陷。

A16–A23均BLOCKED：无合法且持久化的周期，未执行下发、填报缺证校验/举证提交/撤回、复核退回/重提/通过、计算结果、申诉裁决、确认定稿和归档。结果/复核具体对象的越权写入以及跨组织任务范围也因此未验证；仅其列表权限已实测。

## 每项检查与请求证据

证据序号对应 `.local/regression/assessments-state.json` 的requests.seq。SQL核查记为DB。HTTP摘要只用于定位；PASS还要求脚本内状态、字段、样例分值或数据未改变断言。

| 检查 | 角色 | 结论 | 严重性 | 请求/响应摘要 | 预期与实际 |
|---|---|---|---|---|---|
| A01 总部新建指标并读回 | hq_business | PASS | — | #38 POST indicators → 200；#39 GET indicators?pageSize=100 → 200 | 草稿创建且独立列表请求读回 |
| A02 非法评分规则拒绝 | hq_business | PASS | — | #40 POST indicators/AIND-0003/versions/AIND-0003-V001/validate-scoring → 422 | 未声明变量被422拒绝 |
| A03 合法规则计算结果 | hq_business | PASS | — | #41 POST indicators/AIND-0003/versions/AIND-0003-V001/validate-scoring → 200 | 样例rate=82，计算结果82 |
| A04 指标发布并读回 | hq_business | PASS | — | #42 POST indicators/AIND-0003/versions/AIND-0003-V001/publish → 200；#43 GET indicators?pageSize=100 → 200 | 发布状态及列表快照一致 |
| A05 发布后禁止改草稿 | hq_business | PASS | — | #44 PATCH indicators/AIND-0003/versions/AIND-0003-V001 → 409 | {'code': 'INVALID_STATE', 'message': 'Only DRAFT indicator versions can be updated', 'details': None, 'requestId': '5c7f3b5e-f7bb-484a-885a-c7d077ab8dd2'} |
| A06 新方案草稿保存读回 | hq_business | PASS | — | #77 POST schemes → 200；#78 GET schemes/ASCH-0006 → 200 | 创建及读回通过 |
| A10 创建独立周期 | hq_business | FAIL | P1 | #66 POST cycles → 500 | HTTP 500; {"nonJson": "Internal Server Error"} |
| A07 方案创建幂等 | hq_business | PASS | — | #79 POST schemes → 200 | 相同幂等键返回同一方案ID |
| A08 方案发布路由门槛 | hq_business | PASS | — | #80 POST schemes/ASCH-0006/publish → 422 | 缺少已发布路由的方案不能发布 |
| A09 新方案合法发布到ACTIVE | hq_business | BLOCKED | — | 未执行：上游阻断 | 仅有WFT-ASSESS-DEFAULT草稿，无publishedVersion；路由无新建接口，约束禁止修改共享种子。后续周期只引用既有ACTIVE种子方案。 |
| A24 分支真实证据文件上传 | branch_business | PASS | — | #106 POST /api/files → 200 | 真实multipart附件上传，文件ID及大小验证通过 |
| A25 分支台账创建与独立读回 | branch_business | PASS | — | #107 POST daily-ledger → 200；#108 GET daily-ledger?pageSize=100 → 200 | 状态及返回内容断言通过 |
| A26 分支台账编辑与读回 | branch_business | PASS | — | #109 PATCH daily-ledger/LEDGER-0001 → 200；#110 GET daily-ledger?pageSize=100 → 200 | 状态及返回内容断言通过 |
| A27 台账落库一致性 | branch_business | FAIL | P1 | DB | 创建与编辑返回200，GET可读；数据库按ledger_entry_id查询0行。路由未使用session及持久化仓储。 |
| A28 台账软删除和删除后禁止编辑 | branch_business | PASS | — | #111 DELETE daily-ledger/LEDGER-0001 → 200；#112 GET daily-ledger?pageSize=100 → 200；#113 PATCH daily-ledger/LEDGER-0001 → 409 | 状态及返回内容断言通过 |
| AUTH department_business拒绝读取indicators | department_business | PASS | — | #124 GET indicators → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝读取schemes | department_business | PASS | — | #125 GET schemes → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝读取cycles | department_business | PASS | — | #126 GET cycles → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝读取reporting-tasks | department_business | PASS | — | #127 GET reporting-tasks → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝读取daily-ledger | department_business | PASS | — | #128 GET daily-ledger → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝读取review-tasks | department_business | PASS | — | #129 GET review-tasks → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝读取results | department_business | PASS | — | #130 GET results → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝现存方案详情 | department_business | PASS | — | #132 GET schemes/ASCH-0006 → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝读取indicators | external_lawyer | PASS | — | #133 GET indicators → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝读取schemes | external_lawyer | PASS | — | #134 GET schemes → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝读取cycles | external_lawyer | PASS | — | #135 GET cycles → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝读取reporting-tasks | external_lawyer | PASS | — | #136 GET reporting-tasks → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝读取daily-ledger | external_lawyer | PASS | — | #137 GET daily-ledger → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝读取review-tasks | external_lawyer | PASS | — | #138 GET review-tasks → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝读取results | external_lawyer | PASS | — | #139 GET results → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝现存方案详情 | external_lawyer | PASS | — | #141 GET schemes/ASCH-0006 → 403 | 预期403拒绝；实际全部403 |
| AUTH branch_business拒绝新建指标 | branch_business | PASS | — | #142 POST indicators → 403 | 预期403拒绝；实际全部403 |
| AUTH branch_business拒绝修改现存方案 | branch_business | PASS | — | #143 PATCH schemes/ASCH-0006 → 403 | 预期403拒绝；实际全部403 |
| AUTH branch_business拒绝新建周期 | branch_business | PASS | — | #144 POST cycles → 403 | 预期403拒绝；实际全部403 |
| AUTH branch_business拒绝总部复核列表 | branch_business | PASS | — | #145 GET review-tasks → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝新建指标 | department_business | PASS | — | #146 POST indicators → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝修改现存方案 | department_business | PASS | — | #147 PATCH schemes/ASCH-0006 → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝新建周期 | department_business | PASS | — | #148 POST cycles → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝总部复核列表 | department_business | PASS | — | #149 GET review-tasks → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝新建指标 | external_lawyer | PASS | — | #150 POST indicators → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝修改现存方案 | external_lawyer | PASS | — | #151 PATCH schemes/ASCH-0006 → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝新建周期 | external_lawyer | PASS | — | #152 POST cycles → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝总部复核列表 | external_lawyer | PASS | — | #153 GET review-tasks → 403 | 预期403拒绝；实际全部403 |
| AUTH department_business拒绝分支台账新增 | department_business | PASS | — | #154 POST daily-ledger → 403 | 预期403拒绝；实际全部403 |
| AUTH external_lawyer拒绝分支台账新增 | external_lawyer | PASS | — | #155 POST daily-ledger → 403 | 预期403拒绝；实际全部403 |
| AUTH 平台管理员读取indicators | platform_admin | PASS | — | #156 GET indicators → 200 | 预期管理员可读取该列表；实际200且成功解包业务响应（不代表下游流程通过） |
| AUTH 平台管理员读取schemes | platform_admin | PASS | — | #157 GET schemes → 200 | 预期管理员可读取该列表；实际200且成功解包业务响应（不代表下游流程通过） |
| AUTH 平台管理员读取cycles | platform_admin | PASS | — | #158 GET cycles → 200 | 预期管理员可读取该列表；实际200且成功解包业务响应（不代表下游流程通过） |
| AUTH 平台管理员读取reporting-tasks | platform_admin | PASS | — | #159 GET reporting-tasks → 200 | 预期管理员可读取该列表；实际200且成功解包业务响应（不代表下游流程通过） |
| AUTH 平台管理员读取daily-ledger | platform_admin | PASS | — | #160 GET daily-ledger → 200 | 预期管理员可读取该列表；实际200且成功解包业务响应（不代表下游流程通过） |
| AUTH 平台管理员读取review-tasks | platform_admin | PASS | — | #161 GET review-tasks → 200 | 预期管理员可读取该列表；实际200且成功解包业务响应（不代表下游流程通过） |
| AUTH 平台管理员读取results | platform_admin | PASS | — | #162 GET results → 200 | 预期管理员可读取该列表；实际200且成功解包业务响应（不代表下游流程通过） |
| AUTH 拒绝写入后数据未改变 | hq_business | PASS | — | #163 GET schemes/ASCH-0006 → 200；#164 GET indicators?pageSize=100 → 200 | 状态及返回内容断言通过 |
| A15 周期创建失败后的API/数据库一致性 | hq_business | FAIL | P1 | DB | POST周期500后GET仍返回DRAFT周期，但assessment_cycles为0行；接口存在未提交的幽灵周期 |
| A16 周期下发生成填报任务 | hq_business | BLOCKED | — | 未执行：上游阻断 | 新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。 |
| A17 分支填报草稿及缺证提交拒绝 | branch_business | BLOCKED | — | 未执行：上游阻断 | 新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。 |
| A18 分支举证提交和撤回 | branch_business | BLOCKED | — | 未执行：上游阻断 | 新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。 |
| A19 总部复核开始、打分及退回 | hq_business | BLOCKED | — | 未执行：上游阻断 | 新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。 |
| A20 分支补证重提及总部通过 | hq_business | BLOCKED | — | 未执行：上游阻断 | 新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。 |
| A21 生成并发布结果及分值核验 | hq_business | BLOCKED | — | 未执行：上游阻断 | 新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。 |
| A22 分支申诉及总部裁决 | branch_business | BLOCKED | — | 未执行：上游阻断 | 新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。 |
| A23 分支确认、结果定稿及周期归档 | hq_business | BLOCKED | — | 未执行：上游阻断 | 新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。 |
| A29 分支跨机构台账拒绝及无写入 | branch_business | PASS | — | #191 POST daily-ledger → 200；#192 GET daily-ledger?pageSize=100 → 200；#193 PATCH daily-ledger/LEDGER-0003 → 403；#194 DELETE daily-ledger/LEDGER-0003 → 403；#195 GET daily-ledger?pageSize=100 → 200；#196 DELETE daily-ledger/LEDGER-0003 → 200 | 总部台账对分支列表隐藏；直接PATCH/DELETE均403，管理员读回未被修改 |
| A30 台账不存在附件拒绝 | branch_business | PASS | — | #197 POST daily-ledger → 404 | 不存在附件不能写入台账 |
| A31 方案编辑及并发版本保护 | hq_business | PASS | — | #198 GET schemes/ASCH-0006 → 200；#199 PATCH schemes/ASCH-0006 → 200；#200 PATCH schemes/ASCH-0006 → 409；#201 GET schemes/ASCH-0006 → 200 | 保存后版本递增，旧版本409拒绝且说明未被覆盖 |
| A32 保存新方案不应删除已有列表方案 | hq_business | FAIL | P1 | #202 GET schemes?pageSize=100 → 200 | 首次保存独立草稿后原API方案消失：ASCH-SEED-2025-ARCHIVED,ASCH-SEED-2026,ASCH-SEED-2026-MONTHLY,ASCH-SEED-2026-Q2,ASCH-SEED-2026-SPEC |

## 代码核验与执行记录

- 请求DTO与合法流程：`backend/app/modules/compliance/schemas/assessment.py`，路由`api/routes/assessment.py`，业务`domain/indicator_store.py`、`scheme_store.py`、`cycle_store.py`、`reporting_store.py`、`review_store.py`、`result_store.py`。
- 权限校验：指标`indicator_store.py:769–782`，方案`scheme_store.py:2726–2739`，台账及组织范围`reporting_store.py:552,745,789`，复核`review_store.py:806`，结果`result_store.py:794–811`。权限拒绝实际得到403，并独立读取确认越权写入未生效；没有将422/500当拒绝通过。
- 已运行阶段：`python -X utf8 scripts/regression/assessments.py discover`、`indicator`、`scheme`、`cycle`、`diagnostics`、`ledger`、`permissions`、`boundaries`。脚本按阶段保留状态，证据中的旧失败不覆盖；报告取有效检查的最新结果。
- 只读SQL：通过`docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml exec -T postgres psql -U postgres -d compliance_business`执行`BEGIN READ ONLY; ... COMMIT;`，查询方案、周期和测试台账，未执行更新。
- 日志：`docker compose ... logs --tail 6000 backend`筛出周期外键异常，存`.local/regression/assessments-cycle-error.txt`。未将其他并行回归的异常归到本模块。
- 原始HTTP证据：`.local/regression/assessments-state.json`；复现脚本：`scripts/regression/assessments.py`。这些本地证据不含密码/token。

## 测试准备纠正（不计产品失败）

1. 首次A06请求55将最终等级区间maxScore设置为100，违反“终止区间无上界”；删除maxScore后请求77–78成功。
2. 请求131/140访问了不存在的指标详情GET路由，404不能证明对象权限；已移除该检查。真实指标列表/新增权限通过403验证。
3. 诊断脚本初次用HQ请求branch专属填报列表获403，改用branch后读取成功。此项不作为产品缺陷。
