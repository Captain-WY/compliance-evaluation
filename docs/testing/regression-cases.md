# 案件管理角色业务回归（2026-10-03）

## 结论与范围

以运行中的 `http://127.0.0.1:8010` API 实测，五角色真实登录；案件主链以总部负责人、业务部门协作人、外聘律师为主，管理员登录和分支拒绝/成员边界同时覆盖。未修改产品、公共账号角色、字典或服务配置。并行测试结束后由主任务统一重启backend并追加读回。

**22 项业务检查：18 PASS、4 FAIL；另 2 项下游流程 BLOCKED。** FAIL 对应 4 个缺陷，其中事务错误与系统管理模块同根因，汇总报告应合并计数。此结果不代表全系统、全案件功能或浏览器回归全部通过。

- 主证据：`.local/regression/cases-6fb8d4.json`，逐请求保存角色、路径、请求、HTTP、响应和序号；签名 URL 查询参数已脱敏，密码/token 不落盘。
- 脚本：`scripts/regression/cases.py`。普通运行生成全新 `REG-20261003-CASE-<短码>` 数据；`--verify-existing` 仅复核已有上传文件与提交失败任务状态。
- 案件 `case_b1eec6d5e531`，线索 `b6f2ab7c-e54f-411a-bf3b-6827e47cfa8c`。
- 部门任务 `ai_356a456f4fa3`；律师账号任务 `ai_46050a6f77d3`；律师档案任务 `ai_fd4b66154e20`。
- 文档 `doc_4727581c7ffa`；备注 `memo_d69cbdbf0301`。

## 检查矩阵

以下序号引用主证据的 `evidence[].seq`。每条 PASS 包含返回内容、状态或拒绝结果断言，而非仅 HTTP 200。

| 项 | 角色/流程 | 预期与实际 | 结果 | 证据 |
|---|---|---|---|---|
| 01 | 五角色登录 | 真实认证成功，读回各自公共身份 | PASS | 1–5 |
| 02 | 部门草稿、分支/律师越权删除 | 本人列表可读；他人删除被拒；原草稿仍在 | PASS | 6–10 |
| 03 | 部门线索→总部受理 | 创建和更新内容读回；分派总部成功；分支读取被拒 | PASS | 11–16 |
| 04 | 总部从线索立案 | 预填名称/金额一致，创建预算5000和部门协作成员；线索关联正式案件 | PASS | 17–20 |
| 05 | 分支非成员 | 侧栏、编辑、财务、任务查询全部被拒 | PASS | 21–24 |
| 06 | 总部管理分支关注人 | 加入后只读权限；编辑拒绝；移除后侧栏拒绝 | PASS | 25–29 |
| 07 | 总部新增当事人、部门读回 | 被告名称出现在当事人列表 | PASS | 30–31 |
| 08 | 总部指派部门协作任务 | 部门完成并读回 DONE；分支修改被拒 | PASS | 32–35 |
| 09 | 总部财务、部门限制 | 金额更新，100元诉讼费入待付列表；部门修改财务被拒 | PASS | 36–39 |
| 10 | 总部指派外聘律师 | 指派后律师门户出现本案 | PASS | 40–42 |
| 11 | 律师已分配案件详情 | 预期可读已分派案件基础详情；侧栏直接403，总览/权限后续未执行 | FAIL | 43；CASE-01 |
| 12 | 按账号ID分派律师任务 | 预期门户可见；创建成功但门户无该任务 | FAIL | 44–45；CASE-02 |
| 13 | 按档案ID分派律师任务 | 门户能看到，但提交任务500，完成读回受阻 | FAIL | 46–48；CASE-03 |
| 14 | 部门线索门户 | 原线索 CONVERTED 且 caseId 为正式案件 | PASS | 49 |
| 15 | 部门取证任务列表 | 列表结构正确；仅证明读取，不证明取证提交闭环 | PASS | 50 |
| 16 | 归档前置校验 | 未结案不能归档；检查指出缺失判决文档、未付费、律师在聘、合规清单未完成 | PASS | 63 |
| 17 | 总部结案 | APPROVED结案登记读回，案件CLOSED；新增任务被拒 | PASS | 64–66 |
| 18 | 卷宗目录及上传下载 | 创建目录、签名PUT、上传完成；下载42字节一致，非成员下载拒绝 | PASS | 51–54、81–82、96–97 |
| 19 | 默认流程节点 | 立案流程实例与4节点初始化；逐项完成后4节点读回COMPLETED | PASS | 55–60 |
| 20 | 部门备注 | 保存成功；前端同源MEMO活动查询为空，内容无法读回 | FAIL | 61–62；CASE-04 |
| 21 | 律师提交失败后的状态 | 500之后任务仍PENDING，没有伪报完成 | PASS | 88、98 |
| 22 | 重启后读回 | 本批结案状态CLOSED、UI案件财务测算10000元和部门线索均保留 | PASS | readback-after.json：READ-01/02/06 |

卷宗 SHA-256：`d299c8b965c0984367d518beedde83c63b98d5221c4840d3874df9af8db0fe89`。

## 缺陷详情

### CASE-01 / P2：已指派律师的案件详情被路由权限拒绝

- **复现**：总部通过 `/api/bff/v1/cases/counsels/external/assign` 给本案指派律师；律师 `/vendor-portal/my-cases` 能看到本案；再 POST `/cases/detail/sidebar`，body `{"case_id":"case_b1eec6d5e531"}`。
- **预期**：已指派律师能读取其案件基础详情，写权限仍受成员角色约束。
- **实际**：HTTP 403，`FORBIDDEN / Permission denied`。尚未进入业务详情权限逻辑。
- **代码**：`backend/app/seed.py:37` 对律师放行 `/cases/sidebar`、`/cases/overview`、`/cases/permissions`，实际路由是 `backend/app/modules/cases/api/bff/v1/cases.py:525` 的 `/detail/sidebar`（同组 overview/permissions）。当前前端 `CasesPage.tsx:38` 也仅开放律师门户；门户病例卡片未提供详情入口，UI限制需与产品范围一起复核。
- **受阻**：律师侧基础详情、总览、权限读取未能继续；不得把未执行的后两项算通过。

### CASE-02 / P2：律师账号与律师档案的任务负责人ID不统一

- **复现**：总部 POST `/cases/tasks/create`，`case_id=case_b1eec6d5e531`，`assignee_id=55555555-5555-4555-8555-555555555555`（真实律师公共用户ID），标题使用本轮前缀。
- **预期**：分配给该用户的任务出现在其律师门户。
- **实际**：返回任务 `ai_46050a6f77d3`，但律师 `/vendor-portal/tasks/list` 无此ID。改传律师档案ID `996e30a6-56ef-5086-a9d0-6758cfa8de0d` 后，另一个任务能出现在门户。
- **代码**：`backend/app/modules/cases/services/case_process_service.py:1064` 原样保存 `payload.assignee_id`；同文件 `:1110` 以 `user.id` 判定执行人。`vendor_portal_service.py:180`、`:258` 则统一要求 `CaseActionItem.assignee_id == lawyer.id`。缺少公共身份与档案ID转换。
- **受阻**：常规用户ID指派与律师门户接收不连通；任务完成/附件提交不能以此路径闭环。

### CASE-03 / P1：律师任务提交触发重复事务，返回500

- **复现**：使用档案ID分派得到可见任务 `ai_fd4b66154e20`；律师 POST `/api/bff/v1/vendor-portal/tasks/submit`，`{"taskId":"ai_fd4b66154e20","notes":"REG-20261003-CASE-6fb8d4"}`。
- **预期**：提交成功并读回 COMPLETED。
- **实际**：HTTP 500，响应 `Internal Server Error`；随后详情仍为 PENDING。
- **日志**：`.local/regression/cases-transaction-log.txt`；SQLAlchemy `InvalidRequestError: A transaction is already begun on this Session.`
- **代码**：`backend/app/modules/cases/services/vendor_portal_service.py:244` 开始处理；先查律师和任务，`:271` 又 `async with db.begin()`，与查询隐式事务冲突。
- **受阻**：律师任务完成、备注和附件提交；本次无附件提交即失败，附件分支没有验收。与系统管理事务500应合并为同类根因，保留独立业务复现。

### CASE-04 / P2：备注保存成功后前端读取不到

- **复现**：部门协作人 POST `/cases/memos/add`，`case_id=case_b1eec6d5e531`、`memo_type=GENERAL`、`content=REG-20261003-CASE-6fb8d4-协作备注`；返回 `memo_d69cbdbf0301`。随后按前端调用 POST `/cases/activities/query`，`{"case_id":"case_b1eec6d5e531","action_modules":["MEMO"]}`。
- **预期**：重新读取后仍能展示该备注正文。
- **实际**：保存HTTP200，查询HTTP200但items为空。
- **代码**：前端 `frontend/src/modules/cases/services/case.ts:858` 的 `getMemos` 读 `MEMO` 活动并取 `item.content`；服务 `backend/app/modules/cases/services/case_memo_service.py:128` 却将审计写入 `CASES`，`:138` 只保存content_length等元信息，未在活动响应提供正文。评论读取同文件前端`:391`也使用MEMO筛选。
- **受阻**：备注/评论刷新后的历史显示。备注创建返回成功并不证明页面能重新显示。

## BLOCKED与未覆盖

| 项 | 状态 | 原因与已验证边界 |
|---|---|---|
| 部门取证任务分派→提交→审核 | BLOCKED | 活跃OpenAPI仅有business-portal取证list/submit；代码检索CrossDeptRequest只有门户读/提交，未找到创建或分派入口。没有直接插数据库绕过业务；仅列表读取已测 |
| 财务支付→最终归档 | BLOCKED | 已完成支出登记和结案；已登记100元仍PENDING。活跃OpenAPI未发现支付状态更新接口，不能把未结清流水强改；结案后归档校验仍false。此外缺判决文档、合规清单、律师解聘条件，最终归档未执行 |
| 重启后持久化读回 | PASS | 并行阶段为避免打断测试暂缓；最终由主任务重启本项目backend并验证，纳入检查22。没有要求或执行数据库/数据卷清空 |

未覆盖的扩展范围：完整诉讼各阶段跳转、终本提醒、资产保全、内部外聘合同、预算调整审批、批量导出、全文检索、所有文档密级/授权组合、跨租户、自定义权限组合、并发/幂等压力测试；外部AI和EKP不在本轮案件主链内。UI由主回归任务单独记录。

## 执行记录与探索请求校正

1. 读取 AGENTS、smoke.py、Live OpenAPI、案件schema/service及前端调用，未依赖旧档案运行。
2. `python scripts/regression/cases.py`：主证据6fb8d4完成20项；原始统计15 PASS/5 FAIL，其中卷宗下载URL字段在测试端误读产生1个测试失败。
3. 修正脚本使用 `presigned_url`；`python scripts/regression/cases.py --verify-existing .local/regression/cases-6fb8d4.json`：卷宗下载/隔离与失败任务状态2项通过。业务统计将18R归入18，新增21，所以21项17 PASS/4 FAIL。原始记录保留，不篡改历史FAIL。
4. `docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml logs --since 45m backend`：定位并保存事务异常片段。
5. 64bd90、87caa7、917259、f59f59是探索轮证据，不累加测试统计。探索中ASSIGNEE/FOLLOWER改用真实枚举BUSINESS_COLLABORATOR/VIEWER；拒绝状态校正为HTTP400业务码；活动参数校正action_modules；TRIAL非法阶段属于测试输入问题，未计产品缺陷。localhost直传先用urllib发生客户端异常，后使用requests实传完成，不计产品故障。
6. 只读协助核验主任务UI案件 `case_a8817c7dd2d3 / 2026-IB-0001`：cases/views/list读回 `extended_data.regulatory.estimated_risk_capital_deduction=10000`、risk_coefficient=1。summary实际字段为in_progress；当时in_progress=0、pending=3、closed=4、total=7，UI新案本身PENDING，不直接认定统计值错误。

本轮未运行前端构建、类型检查、全量后端pytest或release索引检查；不宣称这些检查通过。回归脚本仅记录发现，不修复产品。测试数据保留供复现，未删除其他数据。
