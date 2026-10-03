# 合规检查工作说明

执行方式见[轻量迭代方法](../development/iteration.md)；状态只在[需求与问题总表](../testing/role-regression-issues.md)维护。

## 参考与范围

- 角色：总部、分支机构；涉及附件权限时覆盖无检查权限的部门及跨机构账号。
- 原型：按[归档说明](../development/reference-guide.md)定位 `sources/compliance-evaluation/frontend_backup/` 中检查页面。
- 代码：`frontend/src/modules/inspections/`、`frontend/src/modules/compliance-shared/`、`backend/app/modules/compliance/`、`backend/app/adapters/`。
- 历史证据：[检查回归](../testing/regression-inspections.md)、[页面回归](../testing/regression-ui.md)。共享实现涉及考核时只补必要兼容检查。

## 当前批次

尚未启动业务修复。建议先处理 REG-003 检查附件授权，再进入 REG-007/008 正常闭环与完成门槛；每批范围单独收敛。

- 首批目标：有权访问对应检查资源的角色可下载附件；无业务权限或不属资源范围的角色不能获取并使用下载地址。
- 验收：真实附件上传、业务引用、下载成功和拒绝场景；对照五角色及跨机构边界。涉及公共文件代码时先与系统管理确定负责会话。
- 短计划：复现越权 → 核对业务资源与公共文件授权路径 → 最小修复 → 允许与拒绝用例联调。
- 后续候选：REG-007/008、REG-015/016/017。REG-021 的批准前预签收规则需用户决定，不自行解释为确定缺陷。

## 最新结果与交接

2026-10-03：建立工作入口，未执行新业务回归或修复。下一会话先记录实际分支/工作区、基线提交和最终选定批次。

执行后用简短结论更新此节：改动与验证、提交/集成情况、未完成项和下一步。详细日志留在 `.local/`，不在此复制总表状态。
