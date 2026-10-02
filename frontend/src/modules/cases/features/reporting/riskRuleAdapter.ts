/**
 * RiskRule ↔ 后端 compliance_rules schema 双向适配层 (PRE-4.S6)
 *
 * 映射策略:
 *   前端 category  → 后端 ruleType (直接透传; 后端扩展了枚举值支持 SINGLE_CASE/CUMULATIVE/INDICATOR)
 *   前端 conditionType/params/scanFrequency → 后端 ruleLogic (JSONB)
 *   前端 targetRiskLevel/triggerType        → 后端 actionConfig (JSONB)
 *
 * 退役范围 (4.S6 主切片):
 *   可退役: getRiskRules / updateRiskRule / addRiskRule (仅 RiskRulesPanel 使用)
 *   保留:   MOCK_NET_ASSETS / scanCaseForRisks / addDisclosureTask (其他消费者)
 */

import { RiskLevel, RiskRule, DisclosureType } from '../../types'

/** 后端 /rules/list 返回的 RuleItem 结构 (S13 + PRE-4.S6 扩展) */
export interface RuleItem {
  ruleId: string
  ruleCode: string
  ruleName: string
  ruleType: string
  ruleType_name: string
  actionType: string
  actionType_name: string
  ruleLogic: Record<string, unknown> | null
  actionConfig: Record<string, unknown> | null
  status: string
  status_name: string
}

/** 后端 /rules/save 请求体 */
export interface RuleSavePayload {
  ruleId?: string | null
  ruleCode: string
  ruleName: string
  ruleType: string
  actionType: string
  ruleLogic: Record<string, unknown>
  actionConfig: Record<string, unknown>
}

/** 将后端 RuleItem 还原为前端 RiskRule */
export function ruleItemToRiskRule(item: RuleItem): RiskRule {
  const logic = item.ruleLogic ?? {}
  const action = item.actionConfig ?? {}

  return {
    id: item.ruleId,
    name: item.ruleName,
    category: item.ruleType as RiskRule['category'],
    conditionType: (logic['conditionType'] as RiskRule['conditionType']) ?? 'AMOUNT_GREATER',
    params: (logic['params'] as RiskRule['params']) ?? {},
    scanFrequency: (logic['scanFrequency'] as RiskRule['scanFrequency']) ?? 'DAILY',
    targetRiskLevel: (action['targetRiskLevel'] as RiskLevel) ?? RiskLevel.MEDIUM,
    triggerType: (action['triggerType'] as DisclosureType) ?? '临时公告',
    isActive: item.status === 'ACTIVE',
    actionType: (item.actionType as RiskRule['actionType']) ?? 'GENERATE_ALERT',
  }
}

/** 将前端 RiskRule 序列化为后端 /rules/save 请求体 */
export function riskRuleToSavePayload(rule: RiskRule): RuleSavePayload {
  return {
    ruleId: rule.id || null,
    ruleCode: rule.id || `RULE_${rule.category}_${Date.now()}`,
    ruleName: rule.name,
    ruleType: rule.category,
    actionType: rule.actionType || 'GENERATE_ALERT',
    ruleLogic: {
      conditionType: rule.conditionType,
      params: rule.params,
      scanFrequency: rule.scanFrequency,
    },
    actionConfig: {
      targetRiskLevel: rule.targetRiskLevel,
      triggerType: rule.triggerType,
    },
  }
}
