import { z } from 'zod';
import { RiskLevel, BusinessLine, ProcedureType } from '../../../types';

export const caseCreationSchema = z.object({
  caseName: z.string().min(2, '案件名称至少2个字符').max(100, '案件名称最多100个字符'),
  riskLevel: z.nativeEnum(RiskLevel, { message: '请选择风险等级' }),
  businessLine: z.nativeEnum(BusinessLine, { message: '请选择业务线' }),
  caseCause: z.string().min(2, '案由至少2个字符'),
  procedureType: z.enum(['CIVIL_LITIGATION', 'ARBITRATION', 'LABOR', 'ADMIN'] as const, { message: '请选择程序类型' }),
  ourRole: z.string().min(1, '请选择我方地位'),
  plaintiffName: z.string().min(2, '原告/申请人至少2个字符'),
  defendantName: z.string().min(2, '被告/被申请人至少2个字符'),
  acceptingCourt: z.string().optional(),
  filingDate: z.string().min(1, '请选择立案日期'),
  securityCode: z.string().optional(),
  securityName: z.string().optional(),
  projectCode: z.string().optional(),
  targetAmount: z.number().min(0, '标的额不能为负数').optional(),
  provisionAmount: z.number().min(0, '预计负债不能为负数').optional(),
  legalFeeBudget: z.number().min(0, '预算不能为负数').optional(),
  preliminaryCostBudget: z.number().min(0, '预算不能为负数').optional(),
});

export type CaseCreationFormValues = z.infer<typeof caseCreationSchema>;
