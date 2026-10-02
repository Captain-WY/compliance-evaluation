import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RiskLevel, CaseStage, BusinessLine, ProcedureType, CaseType } from '../../types';
import { caseApi, ConflictWarningVO } from '../../src/services/api/caseApi';
import { useDebounce } from '../../hooks/useDebounce';
import Button from '../../components/ui/Button';
import { Check, Loader2, ShieldAlert, Search, RefreshCw, X, AlertOctagon, AlertTriangle, Briefcase, Gavel, Wallet } from 'lucide-react';
import { caseCreationSchema, CaseCreationFormValues } from './schemas/caseSchema';
import { toast } from 'sonner';
import { useAuth } from '../../src/contexts/AuthContext';

const BACKEND_CODE_TO_BUSINESS_LINE: Record<string, BusinessLine> = {
  'INVESTMENT_BANKING': BusinessLine.IB,
  'IB': BusinessLine.IB,
  'ASSET_MANAGEMENT': BusinessLine.ASSET_MGMT,
  'BROKERAGE': BusinessLine.BROKERAGE,
  'WEALTH_MANAGEMENT': BusinessLine.ASSET_MGMT,
  'PROP_TRADING': BusinessLine.PROPRIETARY,
  'PROPRIETARY': BusinessLine.PROPRIETARY,
  'CREDIT': BusinessLine.CREDIT,
  'OTHER_LINE': BusinessLine.SUPPORT,
  'SUPPORT': BusinessLine.SUPPORT,
  'RESEARCH': BusinessLine.IB,
  'DERIVATIVES': BusinessLine.PROPRIETARY,
  'INTERNATIONAL': BusinessLine.IB,
  'CUSTODY': BusinessLine.ASSET_MGMT,
};

function resolveBusinessLine(raw?: string | null): BusinessLine {
  if (!raw) return BusinessLine.IB;
  return BACKEND_CODE_TO_BUSINESS_LINE[raw] ?? BusinessLine.IB;
}

interface NewCaseFormProps {
  initialData?: {
    clueId?: string;
    title?: string;
    riskLevel?: RiskLevel;
    plaintiff?: string;
    defendant?: string;
    court?: string;
    businessLine?: string;
    estimatedAmount?: number;
  };
  onCancel: () => void;
  onSuccess: (caseId?: string) => void | Promise<void>;
}

const NewCaseForm: React.FC<NewCaseFormProps> = ({ initialData, onCancel, onSuccess }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [generatedCode, setGeneratedCode] = useState('');
  const [conflictWarnings, setConflictWarnings] = useState<ConflictWarningVO[]>([]);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);

  // Draft list query
  const draftsQuery = useQuery({
    queryKey: ['case-drafts'],
    queryFn: () => caseApi.listDraftsBff({ page: 1, size: 5 }),
    staleTime: 30000,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<CaseCreationFormValues>({
    resolver: zodResolver(caseCreationSchema),
    defaultValues: {
      caseName: initialData?.title || '',
      riskLevel: initialData?.riskLevel || RiskLevel.LOW,
      businessLine: resolveBusinessLine(initialData?.businessLine),
      caseCause: '证券虚假陈述责任纠纷',
      procedureType: 'CIVIL_LITIGATION',
      ourRole: 'DEFENDANT',
      plaintiffName: initialData?.plaintiff || '',
      defendantName: initialData?.defendant || '我司',
      acceptingCourt: initialData?.court || '',
      filingDate: new Date().toISOString().split('T')[0],
      securityCode: '',
      securityName: '',
      projectCode: '',
      targetAmount: initialData?.estimatedAmount ?? 0,
      provisionAmount: 0,
      legalFeeBudget: 0,
      preliminaryCostBudget: 0,
    }
  });

  const watchedValues = watch();

  // Mock Case Code Generation
  useEffect(() => {
    const generateCode = () => {
      const year = new Date().getFullYear();
      const riskPrefix = watchedValues.riskLevel === '特大' ? 'TD' : watchedValues.riskLevel === '重大' ? 'ZD' : 'PT';
      
      let causeCode = 'QT';
      if (watchedValues.procedureType === 'ARBITRATION') causeCode = 'ZCS';
      else if (watchedValues.procedureType === 'LABOR') causeCode = 'LD';
      else if (watchedValues.caseCause?.includes('证券')) causeCode = 'XJCS';
      else if (watchedValues.caseCause?.includes('债券')) causeCode = 'ZQ';
      
      const randomSeq = Math.floor(Math.random() * 900) + 100;
      return `${riskPrefix}-${causeCode}-${year}-${randomSeq}`;
    };
    setGeneratedCode(generateCode());
  }, [watchedValues.riskLevel, watchedValues.caseCause, watchedValues.procedureType]);

  // Debounced values for conflict check
  const debouncedPlaintiff = useDebounce(watchedValues.plaintiffName, 800);
  const debouncedDefendant = useDebounce(watchedValues.defendantName, 800);

  // 2.S3: BFF /conflict-check 以单字段为单位查询, 前端对原被告分别调用后合并
  const conflictCheckMutation = useMutation({
    mutationFn: async (names: { plaintiff?: string; defendant?: string }) => {
      const [plaintiffHits, defendantHits] = await Promise.all([
        names.plaintiff ? caseApi.conflictCheck({ partyName: names.plaintiff }) : Promise.resolve([]),
        names.defendant ? caseApi.conflictCheck({ partyName: names.defendant }) : Promise.resolve([]),
      ]);
      // 合并 + 按 relatedCaseId 去重
      const seen = new Set<string>();
      const merged: ConflictWarningVO[] = [];
      for (const w of [...plaintiffHits, ...defendantHits]) {
        const key = `${w.type}:${w.relatedCaseId || w.relatedCaseCode || w.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(w);
        }
      }
      return merged;
    },
    onSuccess: (data) => {
      setConflictWarnings(data || []);
    },
    onError: (error) => {
      console.error('Conflict check failed', error);
      // 后台静默检查, 不打扰用户
    }
  });

  useEffect(() => {
    if (debouncedPlaintiff || debouncedDefendant) {
      conflictCheckMutation.mutate({
        plaintiff: debouncedPlaintiff,
        defendant: debouncedDefendant,
      });
    } else {
      setConflictWarnings([]);
    }
  }, [debouncedPlaintiff, debouncedDefendant]);

  // Mock Security Lookup (Keep this for UX convenience, or move to an API)
  const handleSecurityLookup = (code: string) => {
      setValue('securityCode', code);
      if (code.length === 6) {
          let name = '';
          if (code === '600030') name = '中信证券';
          if (code === '688999') name = 'TechNova';
          if (code === '002345') name = '深南实业';
          if (name) setValue('securityName', name);
      }
  };

  // 2.S10 主切片: 前端 form 字段 -> BFF CaseCreateRequest 字段映射
  // (见 11_case_creation_api_plan.md §3.1 + §10 施工速查)
  //
  // 注: 前端 TS Enum (RiskLevel/BusinessLine) 的 value 是中文标签 ("一般"/"投资银行" 等),
  //     而后端 Pydantic Enum 期待 code (GENERAL/IB 等). 映射在此处集中处理.
  const RISK_LEVEL_CODE_MAP: Record<string, string> = {
    [RiskLevel.LOW]: 'GENERAL',       // 一般 → GENERAL
    [RiskLevel.MEDIUM]: 'IMPORTANT',  // 关注 → IMPORTANT
    [RiskLevel.HIGH]: 'MAJOR',        // 重大 → MAJOR
    [RiskLevel.CRITICAL]: 'MAJOR',    // 特大 → MAJOR (后端值集 4 值合并)
  };
  const BUSINESS_LINE_CODE_MAP: Record<string, string> = {
    [BusinessLine.IB]: 'IB',
    [BusinessLine.PROPRIETARY]: 'PROPRIETARY',
    [BusinessLine.BROKERAGE]: 'BROKERAGE',
    [BusinessLine.ASSET_MGMT]: 'ASSET_MGMT',
    [BusinessLine.CREDIT]: 'CREDIT',
    [BusinessLine.SUPPORT]: 'SUPPORT',
  };

  const mapFormToBffPayload = (data: CaseCreationFormValues, draftId?: string | null) => {
    const budgetTotal = (data.legalFeeBudget ?? 0) + (data.preliminaryCostBudget ?? 0);
    const budgetNotes: string[] = [];
    if (data.legalFeeBudget) budgetNotes.push(`法律费用 ${data.legalFeeBudget}`);
    if (data.preliminaryCostBudget) budgetNotes.push(`前期成本 ${data.preliminaryCostBudget}`);

    // 组装 parties[]: 原告 + 被告
    const parties: Array<{
      party_type: string;
      party_name: string;
      is_our_side: boolean;
      identity_type: string;
    }> = [];
    if (data.plaintiffName?.trim()) {
      parties.push({
        party_type: 'PLAINTIFF',
        party_name: data.plaintiffName.trim(),
        is_our_side: data.ourRole === 'PLAINTIFF',
        identity_type: 'NATURAL_PERSON',
      });
    }
    if (data.defendantName?.trim()) {
      parties.push({
        party_type: 'DEFENDANT',
        party_name: data.defendantName.trim(),
        is_our_side: data.ourRole === 'DEFENDANT',
        identity_type: 'LEGAL_ENTITY',
      });
    }

    // 组装 members[]: 创建者自动作为 OWNER
    const members: Array<{ user_id: string; role_code: string }> = [];
    if (user?.id) {
      members.push({ user_id: user.id, role_code: 'OWNER' });
    }

    return {
      case_name: data.caseName,
      case_type_code: 'CIVIL_LITIGATION', // MVP: 固定民事, 后续可按 procedureType 映射
      case_source: initialData?.clueId ? 'CLUE_CONVERSION' : 'MANUAL',
      business_line: BUSINESS_LINE_CODE_MAP[data.businessLine] ?? 'IB',
      case_cause: data.caseCause,
      risk_level: RISK_LEVEL_CODE_MAP[data.riskLevel] ?? 'GENERAL',
      our_role: data.ourRole as 'PLAINTIFF' | 'DEFENDANT' | 'THIRD_PARTY',
      procedure_type: data.procedureType === 'CIVIL_LITIGATION' ? 'FIRST_INSTANCE' : 'ARBITRATION',
      plaintiff_name: data.plaintiffName,
      defendant_name: data.defendantName,
      target_amount: data.targetAmount,
      provision_amount: data.provisionAmount,
      accepting_court: data.acceptingCourt || null,
      filing_date: data.filingDate,
      source_clue_id: initialData?.clueId ?? null,
      draft_id: draftId ?? null,
      budget: budgetTotal > 0 ? {
        total_budget: budgetTotal.toFixed(2),
        currency: 'CNY',
        notes: budgetNotes.join(' + ') || null,
      } : null,
      parties,
      members,
      // securityCode / securityName / projectCode 预留, 当前不映射 (S17 证券主表切片接管)
    };
  };

  // BUG-005 fix: useRef lock to prevent double-click duplicate submissions
  const isSubmittingRef = useRef(false);

  const createCaseMutation = useMutation({
    mutationFn: (data: CaseCreationFormValues) =>
      caseApi.createCaseBff(mapFormToBffPayload(data)),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('立案登记成功');
      const caseId = response?.caseId;
      setTimeout(async () => {
          await onSuccess(caseId);
      }, 800);
    },
    onError: (error: any) => {
      console.error(error);
      toast.error(error?.response?.data?.message || error?.message || '立案失败，请重试');
    },
    onSettled: () => {
      isSubmittingRef.current = false;
    }
  });

  const saveDraftMutation = useMutation({
    mutationFn: (data: CaseCreationFormValues) =>
      caseApi.saveDraftBff({
        draftId: loadedDraftId,
        draftData: data as unknown as Record<string, unknown>,
        sourceClueId: initialData?.clueId ?? null,
      }),
    onSuccess: (response: any) => {
      toast.success('草稿保存成功');
      if (response?.draftId) setLoadedDraftId(response.draftId);
      queryClient.invalidateQueries({ queryKey: ['case-drafts'] });
      // BUG-007/008 fix: 保存草稿后保持模态框打开，让用户继续编辑或手动关闭
    },
    onError: (error: any) => {
      console.error(error);
      toast.error(error?.response?.data?.message || error?.message || '草稿保存失败，请重试');
    }
  });

  const loadDraft = (draftData: Record<string, unknown>) => {
    if (draftData.caseName) setValue('caseName', String(draftData.caseName));
    if (draftData.businessLine) setValue('businessLine', String(draftData.businessLine) as BusinessLine);
    if (draftData.procedureType) setValue('procedureType', String(draftData.procedureType) as ProcedureType);
    if (draftData.caseCause) setValue('caseCause', String(draftData.caseCause));
    if (draftData.acceptingCourt) setValue('acceptingCourt', String(draftData.acceptingCourt));
    if (draftData.filingDate) setValue('filingDate', String(draftData.filingDate));
    if (draftData.ourRole) setValue('ourRole', String(draftData.ourRole) as 'PLAINTIFF' | 'DEFENDANT' | 'THIRD_PARTY');
    if (draftData.plaintiffName) setValue('plaintiffName', String(draftData.plaintiffName));
    if (draftData.defendantName) setValue('defendantName', String(draftData.defendantName));
    if (typeof draftData.targetAmount === 'number') setValue('targetAmount', draftData.targetAmount);
    if (typeof draftData.provisionAmount === 'number') setValue('provisionAmount', draftData.provisionAmount);
    if (draftData.riskLevel) setValue('riskLevel', String(draftData.riskLevel) as RiskLevel);
    if (typeof draftData.legalFeeBudget === 'number') setValue('legalFeeBudget', draftData.legalFeeBudget);
    if (typeof draftData.preliminaryCostBudget === 'number') setValue('preliminaryCostBudget', draftData.preliminaryCostBudget);
    if (draftData.securityCode) setValue('securityCode', String(draftData.securityCode));
    if (draftData.securityName) setValue('securityName', String(draftData.securityName));
    if (draftData.projectCode) setValue('projectCode', String(draftData.projectCode));
    toast.success('草稿已加载');
  };

  const onSaveDraft = () => {
    saveDraftMutation.mutate(watchedValues);
  };

  const onSubmit = (data: CaseCreationFormValues) => {
    // BUG-005: synchronous ref guard against double-click race condition
    if (isSubmittingRef.current) return;
    if (createCaseMutation.isPending || saveDraftMutation.isPending) return;
    if (conflictWarnings.some(w => w.type === 'BLACKLIST')) {
      toast.error('存在黑名单冲突，禁止立案');
      return;
    }
    isSubmittingRef.current = true;
    createCaseMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-5xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-900 px-8 py-5 flex justify-between items-center text-white shrink-0">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <ShieldAlert className="w-6 h-6 text-brand-400" /> 
                        立案登记 (Case Initiation)
                    </h2>
                    <p className="text-slate-400 text-xs mt-1">创建案件档案 · 分配唯一标识 · 利益冲突排查</p>
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Draft Recovery Banner */}
            {draftsQuery.data?.items?.length > 0 && !loadedDraftId && (
              <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">发现未完成的立案草稿</span>
                </div>
                <div className="flex gap-3 overflow-x-auto">
                  {draftsQuery.data.items.map((draft: any) => (
                    <button
                      key={draft.draftId}
                      onClick={() => {
                        if (draft.draftData) {
                          loadDraft(draft.draftData);
                          setLoadedDraftId(draft.draftId);
                        }
                      }}
                      className="flex-shrink-0 bg-white border border-amber-200 rounded-lg px-4 py-2 text-left hover:border-amber-400 hover:shadow-sm transition-all"
                    >
                      <p className="text-sm font-medium text-slate-700 truncate max-w-[200px]">
                        {draft.caseName || '未命名草稿'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {draft.lastSavedAt ? new Date(draft.lastSavedAt).toLocaleString('zh-CN') : ''}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                {/* Left Side: Form */}
                <div className="w-2/3 p-8 overflow-y-auto border-r border-slate-100">
                    <form id="case-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {/* Section 1: Basic Info */}
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">基础信息</h3>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">案件标题</label>
                                    <input 
                                        type="text"
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.caseName ? 'border-red-500' : 'border-slate-300'}`}
                                        placeholder="例如：关于 XX公司 诉 我司 证券虚假陈述责任纠纷案"
                                        {...register('caseName')}
                                    />
                                    {errors.caseName && <p className="text-red-500 text-xs mt-1">{errors.caseName.message}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">业务条线</label>
                                    <select 
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.businessLine ? 'border-red-500' : 'border-slate-300'}`}
                                        {...register('businessLine')}
                                    >
                                        {Object.values(BusinessLine).map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                    {errors.businessLine && <p className="text-red-500 text-xs mt-1">{errors.businessLine.message}</p>}
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">程序类型</label>
                                    <select 
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.procedureType ? 'border-red-500' : 'border-slate-300'}`}
                                        {...register('procedureType')}
                                    >
                                        <option value="CIVIL_LITIGATION">民事诉讼 (一审/二审)</option>
                                        <option value="ARBITRATION">商事仲裁 (一裁终局)</option>
                                        <option value="LABOR">劳动仲裁</option>
                                        <option value="ADMIN">行政监管/听证</option>
                                    </select>
                                    {errors.procedureType && <p className="text-red-500 text-xs mt-1">{errors.procedureType.message}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">标准案由</label>
                                    <select 
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.caseCause ? 'border-red-500' : 'border-slate-300'}`}
                                        {...register('caseCause')}
                                    >
                                        <option value="证券虚假陈述责任纠纷">证券虚假陈述责任纠纷</option>
                                        <option value="公司债券交易纠纷">公司债券交易纠纷</option>
                                        <option value="融资融券交易纠纷">融资融券交易纠纷</option>
                                        <option value="股票质押式回购纠纷">股票质押式回购纠纷</option>
                                        <option value="资产管理合同纠纷">资产管理合同纠纷</option>
                                        <option value="劳动争议仲裁">劳动争议仲裁</option>
                                    </select>
                                    {errors.caseCause && <p className="text-red-500 text-xs mt-1">{errors.caseCause.message}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        {watchedValues.procedureType === 'ARBITRATION' ? '受理仲裁机构' : '受理法院'}
                                    </label>
                                    <input 
                                        type="text"
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.acceptingCourt ? 'border-red-500' : 'border-slate-300'}`}
                                        placeholder={watchedValues.procedureType === 'ARBITRATION' ? '例如：深圳国际仲裁院' : '例如：上海金融法院'}
                                        {...register('acceptingCourt')}
                                    />
                                    {errors.acceptingCourt && <p className="text-red-500 text-xs mt-1">{errors.acceptingCourt.message}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">立案日期</label>
                                    <input 
                                        type="date"
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.filingDate ? 'border-red-500' : 'border-slate-300'}`}
                                        {...register('filingDate')}
                                    />
                                    {errors.filingDate && <p className="text-red-500 text-xs mt-1">{errors.filingDate.message}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">我方地位</label>
                                    <select
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.ourRole ? 'border-red-500' : 'border-slate-300'}`}
                                        {...register('ourRole')}
                                    >
                                        <option value="PLAINTIFF">原告 / 申请人</option>
                                        <option value="DEFENDANT">被告 / 被申请人</option>
                                        <option value="THIRD_PARTY">第三人</option>
                                    </select>
                                    {errors.ourRole && <p className="text-red-500 text-xs mt-1">{errors.ourRole.message}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Parties & Risk */}
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">当事人与风险</h3>
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">原告 / 申请人</label>
                                    <div className="relative">
                                        <input 
                                            type="text"
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none pr-8 ${errors.plaintiffName ? 'border-red-500' : 'border-slate-300'}`}
                                            {...register('plaintiffName')}
                                        />
                                        <div className="absolute right-2 top-2.5">
                                            {conflictCheckMutation.isPending && <RefreshCw className="w-4 h-4 text-brand-500 animate-spin" />}
                                        </div>
                                    </div>
                                    {errors.plaintiffName ? (
                                        <p className="text-red-500 text-xs mt-1">{errors.plaintiffName.message}</p>
                                    ) : (
                                        <p className="text-[10px] text-slate-400 mt-1">输入后自动触发利益冲突检索</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">被告 / 被申请人</label>
                                    <input 
                                        type="text"
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.defendantName ? 'border-red-500' : 'border-slate-300'}`}
                                        {...register('defendantName')}
                                    />
                                    {errors.defendantName && <p className="text-red-500 text-xs mt-1">{errors.defendantName.message}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">涉案金额 (元) *风险评估依据</label>
                                    <input 
                                        type="number"
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.targetAmount ? 'border-red-500' : 'border-slate-300'}`}
                                        {...register('targetAmount', { valueAsNumber: true })}
                                    />
                                    {errors.targetAmount && <p className="text-red-500 text-xs mt-1">{errors.targetAmount.message}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">初始风险评级</label>
                                    <select 
                                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.riskLevel ? 'border-red-500' : 'border-slate-300'}`}
                                        {...register('riskLevel')}
                                    >
                                        {Object.values(RiskLevel).map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    {errors.riskLevel && <p className="text-red-500 text-xs mt-1">{errors.riskLevel.message}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Initial Budget (Task C) */}
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                                <Wallet className="w-4 h-4" /> 前期费用预算 (Initial Budget)
                            </h3>
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">律师费预算 (Legal Fee)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2 text-slate-400 font-bold">¥</span>
                                        <input 
                                            type="number"
                                            className={`w-full pl-7 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.legalFeeBudget ? 'border-red-500' : 'border-slate-300'}`}
                                            placeholder="预估外聘律师费用"
                                            {...register('legalFeeBudget', { valueAsNumber: true })}
                                        />
                                    </div>
                                    {errors.legalFeeBudget ? (
                                        <p className="text-red-500 text-xs mt-1">{errors.legalFeeBudget.message}</p>
                                    ) : (
                                        <p className="text-[10px] text-slate-400 mt-1">包含一审、二审及执行阶段的预估总额</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">前期办案费 (Preliminary)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2 text-slate-400 font-bold">¥</span>
                                        <input 
                                            type="number"
                                            className={`w-full pl-7 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.preliminaryCostBudget ? 'border-red-500' : 'border-slate-300'}`}
                                            placeholder="诉讼费/保全费/差旅费"
                                            {...register('preliminaryCostBudget', { valueAsNumber: true })}
                                        />
                                    </div>
                                    {errors.preliminaryCostBudget ? (
                                        <p className="text-red-500 text-xs mt-1">{errors.preliminaryCostBudget.message}</p>
                                    ) : (
                                        <p className="text-[10px] text-slate-400 mt-1">立案及一审前期必须支出的杂费</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Subject Binding */}
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Briefcase className="w-3 h-3" /> 涉案标的绑定 (Subject Binding)
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">证券代码 / 股票</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            className={`w-24 border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.securityCode ? 'border-red-500' : 'border-slate-300'}`}
                                            placeholder="600XXX"
                                            {...register('securityCode')}
                                            onChange={(e) => {
                                                register('securityCode').onChange(e);
                                                handleSecurityLookup(e.target.value);
                                            }}
                                        />
                                        <input 
                                            type="text" disabled
                                            className="flex-1 bg-white border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-500"
                                            placeholder="自动回填简称"
                                            {...register('securityName')}
                                        />
                                    </div>
                                    {errors.securityCode && <p className="text-red-500 text-xs mt-1">{errors.securityCode.message}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">关联项目编号</label>
                                    <input 
                                        type="text" 
                                        className={`w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none ${errors.projectCode ? 'border-red-500' : 'border-slate-300'}`}
                                        placeholder="如 PROJ-2025-IB-001"
                                        {...register('projectCode')}
                                    />
                                    {errors.projectCode && <p className="text-red-500 text-xs mt-1">{errors.projectCode.message}</p>}
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> 绑定后可精确核算单项目的法律成本与损益
                            </p>
                        </div>
                    </form>
                </div>

                {/* Right Side: Identity & Intelligence */}
                <div className="w-1/3 bg-slate-50 p-8 flex flex-col gap-6">
                    {/* Identity Card */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">拟生成案件标识 (Identity)</h4>
                        <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-center">
                            <span className="text-xl font-mono font-bold text-slate-800 tracking-wide">{generatedCode}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                            <span className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-slate-500">{watchedValues.riskLevel}</span>
                            <span className={`px-2 py-1 rounded text-[10px] border flex items-center gap-1 ${watchedValues.procedureType === 'ARBITRATION' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                                {watchedValues.procedureType === 'ARBITRATION' && <Gavel className="w-3 h-3" />}
                                {watchedValues.procedureType}
                            </span>
                            <span className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-slate-500">{new Date().getFullYear()}</span>
                        </div>
                    </div>

                    {/* Conflict Radar */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex-1">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                            <Search className="w-3 h-3" /> 利益冲突雷达
                        </h4>
                        
                        {conflictCheckMutation.isPending ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-3">
                                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                                <p className="text-xs text-slate-500">正在扫描历史案件库与黑名单...</p>
                            </div>
                        ) : conflictWarnings.length > 0 ? (
                            <div className="space-y-3">
                                {conflictWarnings.map((warning, idx) => (
                                    <div key={idx} className={`p-4 rounded-lg border ${
                                        warning.type === 'BLACKLIST' ? 'bg-red-50 border-red-100' :
                                        warning.type === 'ONGOING' ? 'bg-amber-50 border-amber-100' :
                                        'bg-blue-50 border-blue-100'
                                    }`}>
                                        <div className="flex items-center gap-3 mb-2">
                                            {warning.type === 'BLACKLIST' && <AlertOctagon className="w-6 h-6 text-red-600" />}
                                            {warning.type === 'ONGOING' && <AlertTriangle className="w-6 h-6 text-amber-600" />}
                                            {warning.type === 'HISTORY' && <Briefcase className="w-6 h-6 text-blue-600" />}
                                            
                                            <div>
                                                <p className={`font-bold ${
                                                    warning.type === 'BLACKLIST' ? 'text-red-700' :
                                                    warning.type === 'ONGOING' ? 'text-amber-700' : 'text-blue-700'
                                                }`}>
                                                    {warning.type === 'BLACKLIST' ? '黑名单冲突' :
                                                     warning.type === 'ONGOING' ? '进行中案件冲突' : '历史关联'}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-600 leading-relaxed">
                                            {warning.message}
                                        </p>
                                        {warning.relatedCaseCode && (
                                            <p className="text-xs text-slate-500 mt-2">
                                                关联案件：{warning.relatedCaseCode}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (debouncedPlaintiff || debouncedDefendant) ? (
                            <div className="p-4 rounded-lg border bg-emerald-50 border-emerald-100">
                                <div className="flex items-center gap-3 mb-2">
                                    <Check className="w-6 h-6 text-emerald-600" />
                                    <div>
                                        <p className="font-bold text-emerald-700">未发现明显冲突</p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    主体信誉良好，无我司历史涉诉记录。
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-40 text-slate-300">
                                <p className="text-xs">等待输入当事人...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-8 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
                <Button 
                    type="button" 
                    variant="outline" 
                    onClick={onSaveDraft}
                    disabled={saveDraftMutation.isPending || createCaseMutation.isPending}
                >
                    {saveDraftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    保存草稿
                </Button>
                <Button type="submit" disabled={createCaseMutation.isPending || saveDraftMutation.isPending} className="px-8" form="case-form">
                    {createCaseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Gavel className="w-4 h-4 mr-2" />}
                    确认立案
                </Button>
            </div>
        </div>
    </div>
  );
};

export default NewCaseForm;
