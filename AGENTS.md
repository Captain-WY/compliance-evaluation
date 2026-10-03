# compliance-evaluation 开发入口

本项目提供一个 React 前端、一个 FastAPI 后端，包含案件管理、合规检查、合规考核和系统管理。当前为开发版本，完整业务回归和功能迭代以已知问题清单为起点。

## 当前约定

- 应用代码位于顶层 frontend、backend、deploy。原工程、旧文档和 mock 原型保存在仓库外本地档案，不进入 Git，也不能成为构建依赖。
- 一个API进程，案件case_business、合规compliance_business、公共platform_common各自独立database；Casdoor独立认证库。
- 公共身份、权限、字典由公共层维护，不能以用户名猜测权限。跨库引用使用服务/ID映射，不设置跨库外键。
- 第一层菜单固定为案件管理、合规检查、合规考核、系统管理；保留原业务页面及多角色边界。
- 左侧统一导航在 `frontend/src/app/AppShell.tsx` 和 `navigation.ts`。合规页面自行控制间距和高度，案件页面保留各角色的内容容器；不要再次给所有模块套统一内边距。导航验收见 `docs/testing/navigation-regression.md`。
- 新环境不迁移旧业务数据；保留适配后的基础种子，初始化须幂等。不要操作无关容器或删除未知数据卷。
- 真实env、测试密码、私钥、历史档案和原型都不提交。必要运行YAML放backend/app/resources，应用不得依赖本机档案路径。
- 重要工作保存检查点，记录执行过的命令和结果。原有非阻塞问题进入 docs/known-issues.md，不把历史失败当已通过。
- PowerShell文件操作使用LiteralPath，递归移动/删除前验证绝对路径范围；文本明确UTF-8。

## 目录和命令

- 后端 `app/modules/cases` 是案件业务，`app/modules/compliance` 是检查和考核业务；`app/platform` 是公共能力，`app/core` 管理连接池和注册。
- 前端使用单一登录上下文和 HTTP transport。业务页位于 `src/modules`，统一菜单和兼容路由位于 `src/app`。不得新建第二个入口应用或恢复独立 token。
- 三套 Alembic 迁移位于 `backend/migrations/{common,cases,compliance}`。新迁移须显式归属数据库；公共引用由批量查询补全。
- 根目录运行 `./scripts/dev/bootstrap.ps1`、`./scripts/dev/start.ps1`、`./scripts/dev/smoke.ps1`；停止用 `./scripts/dev/stop.ps1`，保留数据卷。
- 前端在 `frontend` 运行 `npm ci`、`npm run build`、`npm run typecheck`。
- 已部署后端的基础测试：`docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml exec -T backend pytest -q`。
- 发布前暂存准确文件后运行 `python scripts/dev/check_release.py`，核查生成凭据、旧档案、嵌套 Git 和大文件未入索引。

## 验证范围

默认做与改动相称的测试。认证、权限、分库和持久化调整须验证真实拒绝行为及重启后的读回；普通页面修复不要求重跑所有历史测试。构建通过、类型检查结果和功能回归须分开报告，不宣称未执行的检查已通过。

单 API worker 承载当前保留的业务运行时内存状态，数据库提供持久化；在验证多进程一致性前不要增加 worker。外部搜索、智能服务和历史 mock 动作的限制见 `docs/known-issues.md`。

本地部署说明见 `docs/deployment/local.md`，架构见 `docs/architecture/overview.md`，基本测试记录见 `docs/testing/smoke-report.md`。并行协作时先明确文件责任，避免同时改写同一文件。
