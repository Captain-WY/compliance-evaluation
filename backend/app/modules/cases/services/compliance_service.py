"""合规管理 Service 占位存根 (2.S13-PRE 第二轮清理).

旧版本 (S8-PRE 之前) 存在严重模型不对齐:
  - create_compliance_rule 引用不存在字段 threshold_days / severity / is_active
  - create_alert 引用不存在字段 alert_type / alert_date / deadline
  - resolve_alert 引用不存在字段 handler_id / remarks

以上旧方法已全部移除, 避免运行时 AttributeError.

S13 正式施工时将新建以下独立 Service 文件:
  - compliance_alert_service.py  — alerts/list + alerts/handle
  - compliance_rule_service.py   — rules/list + rules/save + rules/toggle
  - data_governance_service.py   — governance/issues/list + governance/scan + governance/issues/ignore

本文件保留作为占位文件, S13 施工完成后可删除.
"""
# S13-PRE 占位文件 — 正式实现见 compliance_alert_service / compliance_rule_service / data_governance_service
