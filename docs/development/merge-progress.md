# 合并执行检查点

唯一计划：本机 docs/superpowers/plans/2026-10-02-system-merge-v2.md。范围为统一服务、Docker启动、基本回归及GitHub交付，不做功能优化。

## 当前进度

| 任务 | 状态 |
|---|---|
| 1 源复核和本地归档 | 完成；4,509个源文件零差异，仓库外归档逐文件校验通过 |
| 2—4 后端/三库/认证字典 | merge_backend 执行，独占backend |
| 5 前端统一 | merge_frontend 执行，独占frontend |
| 6 Docker部署/Casdoor | merge_deploy 执行，独占deploy及bootstrap/start/stop脚本 |
| 7 基本回归 | 待统一接口和服务就绪，由主任务执行 |
| 8 新规范和文档 | 主任务负责 |
| 9 清理旧壳及实际推送 | 待基本回归通过 |

## 执行边界

原始两个项目只读；新代码写顶层frontend/backend/deploy。旧源码、文档、原型和Git在本机仓库外归档，最终不提交。全新开发库保留适配的基础种子，不迁移旧业务记录或附件。本地Casdoor测试凭据不进入Git。

## 验证记录

- 原始source-manifest：4,509个文件零缺失/变化/额外。
- 指定SSH密钥访问目标仓库成功；当前无远端refs。最终使用main正常push，核对SHA。
- 旧测试失败按v2登记，不作为全部功能修复任务。

- 源归档：`E:/weiyu/merge-archives/compliance-evaluation/2026-10-02/sources`（本机参考，不提交）。
- 已处理案件成员和财务历史的三处跨业务/公共库 JOIN，改为公共库批量查询补全，待实际回归。
