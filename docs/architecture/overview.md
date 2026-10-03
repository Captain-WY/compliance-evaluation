# 统一项目架构

## 服务边界

浏览器访问同一 React 应用，四个一级模块为案件管理、合规检查、合规考核和系统管理。Nginx 提供静态文件并将 `/api` 转发到唯一 FastAPI 服务；应用内保留原业务模块代码和必要兼容路由。

后端公共层管理 Casdoor 身份映射、会话失效、Casbin 权限、字典及共享文件。业务模块通过公共用户 ID 和组织 ID 引用身份，不能凭用户名推断管理员权限。

## 数据库

| 数据库 | 内容 |
|---|---|
| `case_business` | 案件、成员关系、流程、财务及其他案件业务表 |
| `compliance_business` | 检查计划、检查任务、考核方案和指标等业务表 |
| `platform_common` | 用户、组织、角色、权限策略、统一字典和公共文件元数据 |
| Casdoor 独立数据库 | 认证应用、用户凭据和认证配置 |

同一 PostgreSQL 实例可以承载多个数据库。后端使用独立 SQLAlchemy metadata 和连接池；跨库引用在应用中批量查询补全，不设跨库外键，不执行跨库 JOIN。跨库操作不具备单库原子事务语义，开发时应明确提交边界。

字典使用 namespace 区分共享及业务条目，保留受保护字段和版本信息。对象文件保存在 MinIO，Redis 为业务缓存及服务依赖。运行时 YAML 放在 `backend/app/resources/`，不依赖历史文档目录。

## 代码与运行边界

- 前端统一入口和页面容器在 `frontend/src/app/`，公共登录及 transport 在 `frontend/src/platform/`；业务页面保留在 `src/modules/`。桌面导航统一放左侧，按角色展示四个一级模块。
- 后端入口为 `backend/app/main.py`；`app/platform` 管理公共能力，`app/modules/cases` 与 `app/modules/compliance` 承载原业务。兼容及运行时适配位于 `app/adapters`。
- 迁移分为 `backend/migrations/common`、`cases`、`compliance`，分别注册所属 metadata。公共身份与字典迁入公共库后，业务模块仍保留部分兼容 API，不要求所有旧接口一次性改名。
- 当前只运行一个 API worker。合规部分逻辑仍保留内存工作集和持久化适配，完整持久化及多实例一致性不能由分库结构自动保证。
- 本地默认依赖为 PostgreSQL、Redis、MinIO、Casdoor。Elasticsearch 使用可选 profile；外部 AI、OA、EKP 等能力需按具体接口核实，不能将依赖包存在视为接入完成。

## 验证状态

合并阶段已验证部署、基本查询、草稿保存、公共字典、文件和部分权限边界，见[基本回归](../testing/smoke-report.md)。后续[五角色业务回归](../testing/role-regression-report.md)发现持久化、权限及流程缺陷，当前未通过完整业务验收。

[导航验收](../testing/navigation-regression.md)记录左侧导航、页面容器和代表性页面检查，不代表所有状态的逐像素一致。性能、生产部署和多实例一致性仍未验收。开发要求见[开发指南](../development/guide.md)，已知差距见[问题台账](../testing/role-regression-issues.md)。
