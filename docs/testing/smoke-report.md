# 合并基本回归报告

日期：2026-10-03。环境：Windows / Docker Desktop，Python 3.12、PostgreSQL 18、React 19、Vite 6。范围是统一服务启动和基本使用。

## 已验证

| 检查 | 结果 |
|---|---|
| 单前端 `npm ci`、生产构建、Docker 构建 | 通过 |
| 单后端 Docker 构建、三库 Alembic、幂等种子 | 通过 |
| PostgreSQL、Redis、MinIO、Casdoor、后端、前端 | 6 服务 healthy |
| 后端基础测试 | 容器内 12/12 通过 |
| 实际 HTTP 基本回归 | 19/19 通过 |
| 浏览器四模块、五类角色入口 | 通过 |
| 案件和检查详情刷新、考核指标显示 | 通过 |
| 公共字典页面保存备注、刷新读回 | 通过 |
| 原源文件归档校验 | 4,509 文件无差异 |

HTTP 使用真实 Casdoor 账号和数据库，包含案件草稿、正式案件、检查计划、指标草稿、字典新增修改、两业务读取同一字典及 MinIO 文件校验和。已直接查询 PostgreSQL，确认案件/草稿位于 `case_business`，检查/指标位于 `compliance_business`，字典位于 `platform_common`。

权限负例包括匿名请求、登出后 token、律师系统管理、非成员案件、分支读取及修改他人线索、跨用户文件下载、受保护字典改码，以及省略 Content-Type 的附件访问。律师列表只包含有效委托或成员关系的案件。

浏览器验收发现并修复了字典树必填参数遗漏和律师案件列表路由缺失；补充了加载错误处理和针对性测试。仅修复本次基本路径阻塞。

## 证据与复现

```powershell
./scripts/dev/smoke.ps1
./scripts/dev/smoke.ps1 -VerifyExisting
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml exec -T backend pytest -q
```

本地 `.local/smoke-results.json`、`.local/smoke-restart-results.json` 记录 HTTP 结果；`.local/screenshots/` 保留浏览器截图；日志和实际凭据均不提交。

## 验收边界

TypeScript 检查仍有 32 条历史诊断；完整业务审批、所有角色操作、搜索、AI/EKP、性能及生产部署未做全面验收。详细限制和依赖审计结果见 [已知问题](../known-issues.md)。本报告不替代后续业务回归。

重启和干净目录启动结果在最终交付检查后补充。
