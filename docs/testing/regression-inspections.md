# 合规检查真实 API 业务回归

日期：2026-10-03。环境：本地合并系统，API `http://127.0.0.1:8010`。只登记问题，未修改产品。

本批 `REG-20261003-INSP-5201e7`：122 项，**PASS 106 / FAIL 10 / BLOCKED 6**。FAIL 按下列六项缺陷归并；后续增补若出现其他失败，见逐项清单。

## 范围与执行记录

- 五种真实 Casdoor 角色登录；总部计划、审批、分支签收、资料退回重提/审核、底稿、发现、事实确认、申诉裁决及权限拒绝。
- API 验证状态、ID、列表读回、幂等和待办变化；没有用 200 替代全部业务断言。
- 只创建本批前缀业务数据及其关联记录；没有改共享角色、账号、种子、历史数据，没有重启服务。
- `python scripts/regression/inspections.py`：首次 91aeda 批因脚本把 evidenceSubmissionId 写成 submissionId 而中断；该不完整批不计入本报告。修正测试脚本后重新执行完整 5201e7 批。
- `python scripts/regression/inspections.py --resume .local/regression/inspections-REG-20261003-INSP-5201e7.json --followup`：补测跨机构和重新登录读回。
- 未执行浏览器、构建、类型检查、容器重启或重启后持久化验证。重新登录读回不能替代重启验证。
- 原始脱敏请求/响应：`.local/regression/inspections-REG-20261003-INSP-5201e7.json`；密码、token、签名下载地址不写入证据。

## 本批业务 ID

| 对象 | ID |
|---|---|
| mainPlan | `REG-20261003-INSP-5201e7-MAIN` |
| hqFile | `FILE-SEED-0005` |
| branchFile | `FILE-SEED-0006` |
| requirement | `REQ-REG-20261003-INSP-5201e7-MAIN-WLZQ-RBC-GZ-NANSHA` |
| approvedSubmission | `EVSUB-SEED-0003` |
| workingPaper | `WP-SEED-0004` |
| issue1 | `ISSUE-SEED-0013` |
| issue2 | `ISSUE-SEED-0014` |
| appeal | `APPEAL-SEED-0003` |
| earlyClosePlan | `REG-20261003-INSP-5201e7-EARLY-CLOSE` |
| crossOrgPlan | `REG-20261003-INSP-5201e7-CROSS-ORG` |

## INSP-D01 [P1] 新建检查计划无法从资料/执行推进到报告

- 最小复现和实际：总部完成资料审核、底稿转发现、分支事实确认及总部申诉裁决后，计划仍为 IN_PROGRESS/EVIDENCE_COLLECTING。GET plan 返回 allowedActions=[suspend,terminate,complete]；POST transitions {action:enter_report_preparation,idempotencyKey:<新值>,optimisticVersion:6} 返回409 INVALID_STATE。
- 预期对比：应提供合法的执行、事实确认和报告推进路径。实际新建计划没有进入 FACT_CONFIRMATION/ADJUDICATION 的路径。生成草稿和绑定正式PDF也返回409。
- 代码定位：backend/app/modules/compliance/domain/dictionaries.py:692（完整运行时状态表）、inspection_plan_store.py:817；后者仅接受 FACT_CONFIRMATION/ADJUDICATION。
- 影响/受阻下游：报告生成、正式发布、整改派发、整改反馈/复核/归档及正常计划关闭六项受阻。

## INSP-D02 [P1] 无检查权限的部门账号可以下载检查附件

- 最小复现和实际：department_business GET /api/inspection/plans/<mainPlan> 返回403；同账号 GET /api/files/<hqFile>/download 返回200并获得签名URL。用该URL实际 GET 成功返回200及%PDF文件字节。
- 预期对比：无该计划查看权限的角色应被拒绝附件访问。实际下载成功；external_lawyer 同资源返回403。
- 代码定位：backend/app/modules/compliance/domain/evidence_store.py:400 只对具有 PERM-BRANCH-INSPECTION-HANDLE 的用户进行组织检查；api/routes/files.py:79 调用该检查后直接签发URL。
- 影响/受阻下游：检查材料保密边界失效。证据未保存签名URL。

## INSP-D03 [P2] 材料审核通过后分支提交待办仍待处理

- 最小复现和实际：EVSUB状态APPROVED后，branch_business GET /api/tasks?keyword=<prefix> 返回 TASK-BR-EVIDENCE-<mainPlan>-WLZQ-RBC-GZ-NANSHA，status=PENDING；再次报送返回409 SUBMISSION_ALREADY_APPROVED。
- 预期对比：完成材料报送和审核后该提交待办应关闭。实际待办仍提示提交，但提交操作已被禁止。
- 代码定位：backend/app/modules/compliance/domain/evidence_store.py:344-398 审核只更新submission，未关闭材料任务；api/routes/inspection.py:269 对应审核路由。
- 影响/受阻下游：分支待办无法清零，形成不可执行任务。

## INSP-D04 [P1] 资料收集阶段可以绕过报告整改直接完成检查

- 最小复现和实际：独立 EARLY-CLOSE 计划 create→submit_approval→approve→launch；未提交任何材料，POST transitions {action:complete} 返回200；GET读回COMPLETED/CLOSED、progress=100。
- 预期对比：完整检查闭环应在所需报告/整改条件满足后结束。实际空检查可直接声明完成。当前旧运行时表显式允许该跳转，是完整业务闭环的缺口。
- 代码定位：backend/app/modules/compliance/domain/dictionaries.py:734-749；inspection_plan_store.py:495-519 无业务完成性守卫。
- 影响/受阻下游：关闭统计可包含未开展检查，且不能证明完成报告/整改。

## INSP-D05 [P2] 未批准的计划可以由分支提前签收

- 最小复现和实际：独立 EARLY-CLOSE 计划停留 APPROVING/PLAN_SUBMITTED 时，branch_business POST acknowledgement {liaisonName:<prefix>} 返回200 ACKNOWLEDGED。
- 预期对比：应在批准通知下发后签收。实际审批未完成即可写签收；批准后新建通知待办可能与已有签收不一致。
- 代码定位：backend/app/modules/compliance/domain/inspection_plan_store.py:562-573 acknowledgement_phases 包含 PLAN_SUBMITTED。
- 影响/受阻下游：签收时间和审批/下发顺序不可信。

## INSP-D06 [P2] 已关闭检查仍允许新增底稿及发现

- 最小复现和实际：对读回COMPLETED/CLOSED的 EARLY-CLOSE 计划，HQ POST /plans/<id>/working-papers 返回200、新底稿ID；POST /api/inspection/issues 返回200、新发现PENDING_CONFIRMATION。
- 预期对比：检查关闭后应阻止新增业务材料，或先执行明确重开流程。实际可以继续改变已关闭检查的发现集合。
- 代码定位：backend/app/modules/compliance/domain/evidence_store.py:632；issue_store.py:84；创建路径未校验计划生命周期。
- 影响/受阻下游：已关闭检查内容可继续变化，出现关闭计划内未确认发现。

## 逐项结果

`请求#` 对应本批 JSON 的 requests[n]；每条记录含角色、方法、路径、请求体和脱敏响应。无请求编号的 BLOCKED 项未被计为通过。

| 用例 | 状态 | 角色 | 验证内容 | 预期 / 实际摘要 | 请求# / 缺陷 |
|---|---|---|---|---|---|
| INSP-001 | PASS | platform_admin | 真实角色身份 platform_admin | HTTP 200；期望 [200] | 1 / — |
| INSP-002 | PASS | hq_business | 真实角色身份 hq_business | HTTP 200；期望 [200] | 2 / — |
| INSP-003 | PASS | branch_business | 真实角色身份 branch_business | HTTP 200；期望 [200] | 3 / — |
| INSP-004 | PASS | department_business | 真实角色身份 department_business | HTTP 200；期望 [200] | 4 / — |
| INSP-005 | PASS | external_lawyer | 真实角色身份 external_lawyer | HTTP 200；期望 [200] | 5 / — |
| INSP-006 | PASS | hq_business | 上传检查附件 notice | {"http": 200, "fileId": "FILE-SEED-0005"} | 6 / — |
| INSP-007 | PASS | branch_business | 上传检查附件 evidence | {"http": 200, "fileId": "FILE-SEED-0006"} | 7 / — |
| INSP-008 | PASS | hq_business | 总部创建检查计划并验证初始状态 | HTTP 200；期望 [200] | 8 / — |
| INSP-009 | PASS | hq_business | 计划重复编号拒绝 | HTTP 409；期望 [409] | 9 / — |
| INSP-010 | PASS | hq_business | 草稿编辑并读回 | HTTP 200；期望 [200] | 10 / — |
| INSP-011 | PASS | branch_business | 非总部拒绝计划列表 branch_business | HTTP 403；期望 [403] | 11 / — |
| INSP-012 | PASS | branch_business | 非总部拒绝创建计划 branch_business | HTTP 403；期望 [403] | 12 / — |
| INSP-013 | PASS | branch_business | 非总部拒绝编辑 branch_business | HTTP 403；期望 [403] | 13 / — |
| INSP-014 | PASS | department_business | 非总部拒绝计划列表 department_business | HTTP 403；期望 [403] | 14 / — |
| INSP-015 | PASS | department_business | 非总部拒绝创建计划 department_business | HTTP 403；期望 [403] | 15 / — |
| INSP-016 | PASS | department_business | 非总部拒绝编辑 department_business | HTTP 403；期望 [403] | 16 / — |
| INSP-017 | PASS | external_lawyer | 非总部拒绝计划列表 external_lawyer | HTTP 403；期望 [403] | 17 / — |
| INSP-018 | PASS | external_lawyer | 非总部拒绝创建计划 external_lawyer | HTTP 403；期望 [403] | 18 / — |
| INSP-019 | PASS | external_lawyer | 非总部拒绝编辑 external_lawyer | HTTP 403；期望 [403] | 19 / — |
| INSP-020 | PASS | department_business | 无权角色拒绝检查明细 department_business | HTTP 403；期望 [403, 404] | 20 / — |
| INSP-021 | PASS | department_business | 无权角色拒绝检查明细 department_business/execution | HTTP 403；期望 [403, 404] | 21 / — |
| INSP-022 | PASS | department_business | 无权角色拒绝检查明细 department_business/evidence-requirements | HTTP 403；期望 [403, 404] | 22 / — |
| INSP-023 | PASS | department_business | 无权角色拒绝检查明细 department_business/working-papers | HTTP 403；期望 [403, 404] | 23 / — |
| INSP-024 | PASS | department_business | 无权角色拒绝检查明细 department_business/report-workspace | HTTP 403；期望 [403, 404] | 24 / — |
| INSP-025 | FAIL | department_business | 无权角色拒绝下载HQ附件 department_business | HTTP 200；期望 [403, 404] | 25 / INSP-D02 |
| INSP-026 | PASS | external_lawyer | 无权角色拒绝检查明细 external_lawyer | HTTP 403；期望 [403, 404] | 26 / — |
| INSP-027 | PASS | external_lawyer | 无权角色拒绝检查明细 external_lawyer/execution | HTTP 403；期望 [403, 404] | 27 / — |
| INSP-028 | PASS | external_lawyer | 无权角色拒绝检查明细 external_lawyer/evidence-requirements | HTTP 403；期望 [403, 404] | 28 / — |
| INSP-029 | PASS | external_lawyer | 无权角色拒绝检查明细 external_lawyer/working-papers | HTTP 403；期望 [403, 404] | 29 / — |
| INSP-030 | PASS | external_lawyer | 无权角色拒绝检查明细 external_lawyer/report-workspace | HTTP 403；期望 [403, 404] | 30 / — |
| INSP-031 | PASS | external_lawyer | 无权角色拒绝下载HQ附件 external_lawyer | HTTP 403；期望 [403, 404] | 31 / — |
| INSP-032 | PASS | platform_admin | 管理员读取计划 | HTTP 200；期望 [200] | 32 / — |
| INSP-033 | PASS | branch_business | 目标分支读取草稿 | HTTP 200；期望 [200] | 33 / — |
| INSP-034 | PASS | hq_business | 草稿禁止直接批准 | HTTP 409；期望 [409] | 34 / — |
| INSP-035 | PASS | hq_business | 提交审批 | HTTP 200；期望 [200] | 35 / — |
| INSP-036 | PASS | branch_business | 分支禁止审批 | HTTP 403；期望 [403] | 36 / — |
| INSP-037 | PASS | hq_business | 总部批准并产生通知材料待办 | HTTP 200；期望 [200] | 37 / — |
| INSP-038 | PASS | branch_business | 分支待办收到本计划 | HTTP 200；期望 [200] | 38 / — |
| INSP-039 | PASS | hq_business | 批准后禁止编辑 | HTTP 409；期望 [409] | 39 / — |
| INSP-040 | PASS | branch_business | 分支签收关闭通知待办 | HTTP 200；期望 [200] | 40 / — |
| INSP-041 | PASS | branch_business | 分支下载已绑定通知 | HTTP 200；期望 [200] | 41 / — |
| INSP-042 | PASS | hq_business | 启动资料收集 | HTTP 200；期望 [200] | 42 / — |
| INSP-043 | PASS | hq_business | 暂停计划 | HTTP 200；期望 [200] | 43 / — |
| INSP-044 | PASS | hq_business | 恢复原阶段 | HTTP 200；期望 [200] | 44 / — |
| INSP-045 | PASS | branch_business | 分支材料清单目标正确 | HTTP 200；期望 [200] | 45 / — |
| INSP-046 | PASS | department_business | 无权角色拒绝报送 department_business | HTTP 403；期望 [403] | 46 / — |
| INSP-047 | PASS | external_lawyer | 无权角色拒绝报送 external_lawyer | HTTP 403；期望 [403] | 47 / — |
| INSP-048 | PASS | branch_business | 分支首次报送 | HTTP 200；期望 [200] | 48 / — |
| INSP-049 | PASS | branch_business | 待审材料禁止重复提交 | HTTP 409；期望 [409] | 49 / — |
| INSP-050 | PASS | hq_business | 驳回材料必须填写原因 | HTTP 422；期望 [422] | 50 / — |
| INSP-051 | PASS | hq_business | 总部退回材料 | HTTP 200；期望 [200] | 51 / — |
| INSP-052 | PASS | branch_business | 分支退回后重新提交 | HTTP 200；期望 [200] | 52 / — |
| INSP-053 | PASS | branch_business | 分支不能自审 | HTTP 403；期望 [403] | 53 / — |
| INSP-054 | PASS | hq_business | 总部材料通过 | HTTP 200；期望 [200] | 54 / — |
| INSP-055 | PASS | hq_business | 材料审核幂等重放 | HTTP 200；期望 [200] | 55 / — |
| INSP-056 | PASS | branch_business | 通过材料禁止再次报送 | HTTP 409；期望 [409] | 56 / — |
| INSP-057 | PASS | branch_business | 读取材料通过后待办 | HTTP 200；期望 [200] | 57 / — |
| INSP-058 | FAIL | branch_business | 资料通过关闭分支材料待办 | [{"taskId": "TASK-BR-EVIDENCE-REG-20261003-INSP-5201e7-MAIN-WLZQ-RBC-GZ-NANSHA", "category": "INSPECTION", "actionType": "SUBMIT", "title": "提交检查材料：REG-20261003-INSP-5201e7-updated", "description": "请按要求整理并上传非现场检查材料。", "priority": "HIGH", "dueDate": "2026-11-02", "status": "PENDING", "sourceId": "RE… | 57 / INSP-D03 |
| INSP-059 | PASS | branch_business | 非总部拒绝底稿创建 branch_business | HTTP 403；期望 [403] | 58 / — |
| INSP-060 | PASS | department_business | 非总部拒绝底稿创建 department_business | HTTP 403；期望 [403] | 59 / — |
| INSP-061 | PASS | external_lawyer | 非总部拒绝底稿创建 external_lawyer | HTTP 403；期望 [403] | 60 / — |
| INSP-062 | PASS | hq_business | 总部建立执行底稿 | HTTP 200；期望 [200] | 61 / — |
| INSP-063 | PASS | hq_business | 重复底稿编号拒绝 | HTTP 409；期望 [409] | 62 / — |
| INSP-064 | PASS | hq_business | 底稿结果保存 | HTTP 200；期望 [200] | 63 / — |
| INSP-065 | PASS | hq_business | 底稿转检查发现 | HTTP 200；期望 [200] | 64 / — |
| INSP-066 | PASS | hq_business | 底稿转发现幂等 | HTTP 200；期望 [200] | 65 / — |
| INSP-067 | PASS | branch_business | 分支发现清单可见本机构记录 | HTTP 200；期望 [200] | 66 / — |
| INSP-068 | PASS | department_business | 无权角色拒绝事实确认 department_business | HTTP 403；期望 [403] | 67 / — |
| INSP-069 | PASS | external_lawyer | 无权角色拒绝事实确认 external_lawyer | HTTP 403；期望 [403] | 68 / — |
| INSP-070 | PASS | branch_business | 分支事实确认 | HTTP 200；期望 [200] | 69 / — |
| INSP-071 | PASS | hq_business | 创建申诉分支发现 | HTTP 200；期望 [200] | 70 / — |
| INSP-072 | PASS | branch_business | 空申诉理由拒绝 | HTTP 422；期望 [422] | 71 / — |
| INSP-073 | PASS | branch_business | 分支提交申诉 | HTTP 200；期望 [200] | 72 / — |
| INSP-074 | PASS | branch_business | 禁止重复活跃申诉 | HTTP 409；期望 [409] | 73 / — |
| INSP-075 | PASS | branch_business | 分支不能自裁决 | HTTP 403；期望 [403] | 74 / — |
| INSP-076 | PASS | hq_business | 裁决必须有理由 | HTTP 422；期望 [422] | 75 / — |
| INSP-077 | PASS | hq_business | 总部驳回申诉 | HTTP 200；期望 [200] | 76 / — |
| INSP-078 | PASS | hq_business | 已裁决禁止重复裁决 | HTTP 409；期望 [409] | 77 / — |
| INSP-079 | PASS | hq_business | 发现状态读回 | HTTP 200；期望 [200] | 78 / — |
| INSP-080 | PASS | hq_business | 准备结束检查计划阶段读回 | HTTP 200；期望 [200] | 79 / — |
| INSP-081 | FAIL | hq_business | 资料/底稿/事实完成后提供进入报告的合法动作 | {"phase": "EVIDENCE_COLLECTING", "allowedActions": ["suspend", "terminate", "complete"]} | 79 / INSP-D01 |
| INSP-082 | FAIL | hq_business | 完成事实裁决后进入报告准备 | HTTP 409；期望 [200] | 80 / INSP-D01 |
| INSP-083 | PASS | hq_business | 进入报告受阻时生成草稿的实际响应 | HTTP 409；期望 [409] | 81 / — |
| INSP-084 | PASS | hq_business | 上传检查附件 final-report | {"http": 200, "fileId": "FILE-SEED-0007"} | 82 / — |
| INSP-085 | PASS | hq_business | 进入报告受阻时绑定正式稿的实际响应 | HTTP 409；期望 [409] | 83 / — |
| INSP-086 | BLOCKED | hq_business | 报告草稿生成和内容核对 | "新计划停留 EVIDENCE_COLLECTING；未伪造状态或修改历史种子" | — / INSP-D01 |
| INSP-087 | BLOCKED | hq_business | 正式报告发布及整改派发 | "新计划停留 EVIDENCE_COLLECTING；未伪造状态或修改历史种子" | — / INSP-D01 |
| INSP-088 | BLOCKED | branch_business | 分支开始整改 | "新计划停留 EVIDENCE_COLLECTING；未伪造状态或修改历史种子" | — / INSP-D01 |
| INSP-089 | BLOCKED | branch_business | 分支整改反馈及退回重提 | "新计划停留 EVIDENCE_COLLECTING；未伪造状态或修改历史种子" | — / INSP-D01 |
| INSP-090 | BLOCKED | hq_business | 总部整改验收和归档 | "新计划停留 EVIDENCE_COLLECTING；未伪造状态或修改历史种子" | — / INSP-D01 |
| INSP-091 | BLOCKED | hq_business | 全部整改完成后检查计划关闭 | "新计划停留 EVIDENCE_COLLECTING；未伪造状态或修改历史种子" | — / INSP-D01 |
| INSP-092 | PASS | hq_business | 创建提前关闭负向测试计划 | HTTP 200；期望 [200] | 84 / — |
| INSP-093 | PASS | hq_business | 负向计划提交审批 | HTTP 200；期望 [200] | 85 / — |
| INSP-094 | FAIL | branch_business | 未获批准前分支禁止签收 | HTTP 200；期望 [409] | 86 / INSP-D05 |
| INSP-095 | PASS | hq_business | 负向计划批准 | HTTP 200；期望 [200] | 87 / — |
| INSP-096 | PASS | hq_business | 负向计划启动 | HTTP 200；期望 [200] | 88 / — |
| INSP-097 | FAIL | hq_business | 未报送资料无报告整改时禁止直接完成 | HTTP 200；期望 [409] | 89 / INSP-D04 |
| INSP-098 | PASS | hq_business | 提前关闭实际状态读回 | HTTP 200；期望 [200] | 90 / — |
| INSP-099 | FAIL | hq_business | 提前关闭未破坏业务状态 | {"phase": "CLOSED", "status": "COMPLETED"} | 90 / INSP-D04 |
| INSP-100 | FAIL | hq_business | 已关闭计划禁止新增底稿 | HTTP 200；期望 [409] | 91 / INSP-D06 |
| INSP-101 | FAIL | hq_business | 已关闭计划禁止新增发现 | HTTP 200；期望 [409] | 92 / INSP-D06 |
| INSP-102 | FAIL | department_business | 无检查权限的部门用户不能读取检查附件字节 | {"metadataHttp": 200, "actualPdfRetrieved": true} | 93 / INSP-D02 |
| INSP-103 | PASS | hq_business | 总部报告工作区读取当前阻塞原因 | HTTP 200；期望 [200] | 94 / — |
| INSP-104 | PASS | hq_business | 新计划尚未派发整改不得出现整改问题 | HTTP 200；期望 [200] | 95 / — |
| INSP-105 | PASS | hq_business | 总部创建异机构隔离测试计划 | HTTP 200；期望 [200] | 101 / — |
| INSP-106 | PASS | branch_business | 南沙分支不能读取深圳检查  | HTTP 403；期望 [403, 404] | 102 / — |
| INSP-107 | PASS | branch_business | 南沙分支不能读取深圳检查 /execution | HTTP 403；期望 [403, 404] | 103 / — |
| INSP-108 | PASS | branch_business | 南沙分支不能读取深圳检查 /evidence-requirements | HTTP 403；期望 [403, 404] | 104 / — |
| INSP-109 | PASS | branch_business | 南沙分支不能读取深圳检查 /working-papers | HTTP 403；期望 [403, 404] | 105 / — |
| INSP-110 | PASS | branch_business | 南沙分支不能读取深圳检查 /report-workspace | HTTP 403；期望 [403, 404] | 106 / — |
| INSP-111 | PASS | branch_business | 南沙分支不能签收深圳检查 | HTTP 403；期望 [403, 404] | 107 / — |
| INSP-112 | PASS | hq_business | 创建异机构检查发现 | HTTP 200；期望 [200] | 108 / — |
| INSP-113 | PASS | branch_business | 南沙分支不能列出深圳检查发现 | HTTP 200；期望 [200] | 109 / — |
| INSP-114 | PASS | branch_business | 南沙分支不能确认深圳发现 | HTTP 403；期望 [403, 404] | 110 / — |
| INSP-115 | PASS | branch_business | 南沙分支不能申诉深圳发现 | HTTP 403；期望 [403, 404] | 111 / — |
| INSP-116 | PASS | None | 匿名拒绝计划明细 | HTTP 401；期望 [401] | 112 / — |
| INSP-117 | PASS | department_business | 无权角色拒绝检查发现列表 department_business | HTTP 403；期望 [403] | 113 / — |
| INSP-118 | PASS | department_business | 部门角色整改列表不暴露记录 | HTTP 200；期望 [200] | 114 / — |
| INSP-119 | PASS | external_lawyer | 无权角色拒绝检查发现列表 external_lawyer | HTTP 403；期望 [403] | 115 / — |
| INSP-120 | PASS | external_lawyer | 无权角色拒绝整改列表 external_lawyer | HTTP 403；期望 [403] | 116 / — |
| INSP-121 | PASS | hq_business | 重新登录读回材料审核结果 | HTTP 200；期望 [200] | 117 / — |
| INSP-122 | PASS | hq_business | 重新登录读回底稿及发现关联 | HTTP 200；期望 [200] | 118 / — |
