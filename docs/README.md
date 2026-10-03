# 项目文档索引

本目录只维护合并后项目的有效说明和验证记录。原项目的设计、代码及历史文档通过[归档与参考说明](development/reference-guide.md)查阅，不作为新项目的启动依赖。

## 按任务阅读

| 任务 | 入口 |
| --- | --- |
| 了解项目和首次启动 | [项目 README](../README.md) |
| 开发规范与 AI 接手 | [AGENTS.md](../AGENTS.md)、[CLAUDE.md](../CLAUDE.md) |
| 编码、联调、事务和字典规则 | [开发指南](development/guide.md) |
| 服务边界和数据归属 | [架构说明](architecture/overview.md) |
| Docker 部署、账号及日志 | [本地部署](deployment/local.md) |
| 定位原设计或 mock 页面 | [归档与参考说明](development/reference-guide.md) |
| 查看合并阶段检查点 | [合并执行记录](development/merge-progress.md) |
| 选择修复任务 | [已知问题](known-issues.md)、[五角色问题台账](testing/role-regression-issues.md) |

## 验证记录

- [合并基本回归](testing/smoke-report.md)：合并阶段部署、基础读写及重启读回。
- [五角色回归计划](testing/role-regression-plan.md)、[任务简报](testing/role-regression-report.md)：较完整业务链的实际执行范围和结论。
- 专项报告：[公共平台](testing/regression-platform.md)、[案件](testing/regression-cases.md)、[检查](testing/regression-inspections.md)、[考核](testing/regression-assessments.md)、[页面](testing/regression-ui.md)。
- [左侧导航验收](testing/navigation-regression.md)：导航改造后的页面容器、角色边界及代表性页面检查。

验证记录对应各自日期、代码基线和执行范围。后续回归发现的问题优先于早期基本测试的通过结论；报告中的通过比例不代表全功能覆盖率。

## 维护方式

修改架构、启动方式或公共约定时，更新对应主文档及此索引。业务修复更新问题台账和专项验证记录。README、AGENTS.md 和 CLAUDE.md 不累积长篇执行日志；原项目归档保持只读。
