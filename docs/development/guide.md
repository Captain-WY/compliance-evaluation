# 合并项目开发指南

本文提供按需查阅的实现约束和命令。工程边界以根目录 [AGENTS.md](../../AGENTS.md) 为准，任务管理、计划、执行、验收及多会话协作统一见[轻量迭代方法](iteration.md)。

## 从页面需求到真实业务

1. 找到当前页面及对应服务；需要对照时查阅归档 `frontend_backup`，确认入口、字段、操作与视觉效果。
2. 对照实际 API 和数据模型，列出本次涉及的角色、组织范围、资源关系、状态条件及输入输出。旧前端并不是可以直接照搬的后端契约。
3. 将差异控制在本批范围内，按需调整模型或迁移、服务、API、前端适配和验证。普通设计与短计划写入任务；重要状态、数据、权限或跨模块方案才另写必要设计说明。
4. 验证正常路径及关键拒绝路径。持久化不能只看成功提示，要刷新读回；涉及内存工作集时还要验证重启读回。
5. 在统一总表更新问题状态，在模块说明留下验证结论、提交和下一步。后续工作按需读取，不重新扫描全部历史日志。

原项目的 AutoBE、专用浏览器工具和阶段工作包不是当前开发的硬依赖。采用当前环境实际可用的工具，以功能和有意义的验证为交付依据。

## 代码落点与接口边界

| 任务 | 当前落点 |
| --- | --- |
| 统一菜单、页面容器、旧路由兼容 | `frontend/src/app/` |
| 登录状态、token、HTTP 错误处理 | `frontend/src/platform/` |
| 案件页面及 API 适配 | `frontend/src/modules/cases/` |
| 检查与考核业务页面 | `frontend/src/modules/compliance-shared/`；模块入口为 `inspections/`、`assessments/` |
| 系统管理组合入口 | `frontend/src/modules/system/` |
| FastAPI 注册、数据库与配置 | `backend/app/main.py`、`backend/app/core/` |
| 公共能力 | `backend/app/platform/` |
| 业务服务与模型 | `backend/app/modules/cases/`、`backend/app/modules/compliance/` |
| 合规运行时及兼容处理 | `backend/app/adapters/` |
| 迁移与基础种子 | `backend/migrations/`、`backend/app/seed.py` 及模块种子实现 |

公共 API 使用 `/api/platform/auth`、`/api/platform/dictionaries`、`/api/platform/files`。案件保留 `/api/bff/v1/*` 及部分 `/api/v1/*`，合规保留 `/api/inspection/*` 等业务路径。具体方法、字段和响应以当前路由、DTO 和运行中的 `/docs` 为准，不套用旧文档“所有接口统一为 /api/v1”的描述。

当前仍有不同模块的响应封装。共享 transport 处理登录状态和通用错误，模块适配器处理业务结构；日期、ID、金额、空值和枚举转换应集中在适配层。服务端查询沿用所在模块的数据管理方式；采用 React Query 的页面，写入后更新或失效对应查询。

## 业务规则的保留方式

- **字典驱动**：继续从公共库获取业务字典，保留 namespace 和稳定编码。页面显示名与状态编码分离；受保护项、编辑策略和版本号不能在前端绕过。
- **流程模板与实例**：区分模板配置与案件任务、考核流程的运行实例。修改模板时明确对已生成实例的影响，不默认追改历史记录。
- **状态流转**：检查及考核前置条件由服务端检查。打开任务、读通知、签收、审批和完成是不同事件，分别处理状态与副作用。
- **事务与并发**：同库关联修改应有明确提交和回滚边界。案件会话依赖已有请求结束提交行为，进入服务前先检查会话是否已开启事务；不要机械添加嵌套 begin。预算扣减及回调需处理行锁或等效控制、幂等与失败回滚。
- **跨库操作**：公共引用通过 ID 解析，必要时批量查询。业务库和公共库不能依靠同一个 Session 获得跨库原子事务；先说明部分失败如何重试或补偿。
- **软删除与审计**：对已有这些字段的模型保留过滤与审计行为，字段差异以实际模型为准。
- **外部依赖**：优先复用已有 provider 或适配层，避免在页面和路由中散落对象存储、搜索和智能服务调用。尚未接入的外部能力应显式失败或禁用。

这些是后续实现和修复的要求，不表示当前全部代码已经满足。现存例外及缺陷以[问题台账](../testing/role-regression-issues.md)为修复入口。

## 页面与后端实现细节

- 一级菜单保留案件管理、合规检查、合规考核、系统管理。统一左侧导航在 `frontend/src/app/AppShell.tsx`、`navigation.ts`，兼容路由在 `App.tsx`；考核暂缓不等于删除入口。
- 合规页面自行控制间距和高度，案件页面保留各角色内容容器，不给所有模块再次套统一内边距。相关改动检查详情、查询参数、滚动区域及角色菜单，按需参考[导航验收](../testing/navigation-regression.md)。
- DTO 与页面模型转换放服务或适配层，明确 ID、金额、日期、空值和枚举含义；新增代码提供具体类型，不通过扩大 `any` 隐藏契约问题。
- 保留 loading、error、empty、disabled 和无权限状态，保存失败不显示成功。提交后独立查询确认，不能只检查组件里的临时状态。
- 公共字典保留 namespace、稳定编码、排序、启停、保护策略和版本语义，不新增独立字典或硬编码显示映射。字典项不能替代状态机流转条件。
- 后端沿用路由、服务、模型或 provider 分工，复杂业务放服务层，沿用异步访问和类型声明。各模块异常、HTTP 状态及响应适配按当前约定处理，局部改动不重写全部 API。
- 文件链路验证真实上传、fileId 业务引用、下载权限；任务打开、通知已读、业务完成分别处理。财务写入、审批回调需服务端并发与幂等控制，不能只依赖前端限制。

## 开发和验证命令

默认在仓库根目录运行以下命令，完整启动说明见[本地部署](../deployment/local.md)。

```powershell
./scripts/dev/start.ps1
./scripts/dev/start.ps1 -NoBuild
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml ps
```

前端宿主机开发建议 Node.js 24，与当前 Docker 构建一致：

```powershell
cd frontend
npm ci
npm run build
npm run typecheck
npx tsx --test src/app/navigation.test.ts
# 已有 Docker 前端占用 3010 时，显式使用另一端口
npm run dev -- --port 3011 --strictPort
```

Vite 将 `/api` 代理到 `http://127.0.0.1:8010`。若初始化为后端选用了其他端口，在运行 Vite 前设置 `API_PROXY_TARGET` 为该实际地址。前端本地预览仍使用已运行的统一后端和依赖服务。

回到仓库根目录后，可执行：

```powershell
# 基本回归会创建 MERGE-SMOKE 前缀的开发测试记录
./scripts/dev/smoke.ps1
# 后端重启后，读取上一次基本回归留下的记录
./scripts/dev/smoke.ps1 -VerifyExisting
# 容器内后端测试
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml exec -T backend pytest -q
```

五角色业务回归脚本在 `scripts/regression/`。这些脚本会创建或推进业务测试数据，执行前阅读对应脚本及[回归计划](../testing/role-regression-plan.md)，不要在不明环境中直接全量运行。文档整理或其他低风险改动不需要重跑会写数据的业务回归。

迁移使用 `backend/alembic.ini` 中的 `common`、`cases`、`compliance` 配置段。启动脚本按三段分别执行 `alembic -n <配置段> upgrade head` 及种子初始化；不要使用归档中的单链 `alembic upgrade head`。迁移文件须放到所属数据库目录，并在开发环境验证升级与重复启动。

## 文档和证据

README 说明项目与使用方式；AGENTS.md 是精简工程入口；CLAUDE.md 引用同一规范；`docs/README.md` 是索引。迭代规则集中在 [iteration.md](iteration.md)，不在其他入口重复维护。

需求与问题在[统一总表](../testing/role-regression-issues.md)维护，保留编号、角色、复现或目标、验收条件、当前状态及最新验证引用。模块说明只保留本批计划和交接；普通修复无需新增专项报告。日志、截图、响应样本和临时检查点放在忽略的 `.local/`，公开文档不包含凭据或完整敏感响应。

提交前运行 `git diff --cached --check` 与 `python scripts/dev/check_release.py`。本机档案、原型、生成账号和测试大文件不进入 Git；运行所需的结构化资源必须保存在当前项目中。
