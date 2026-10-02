import React, { useMemo, useState } from 'react';
import { 
  ChevronRight, 
  Calendar, 
  Building2,
  FileText,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  Settings2,
  ChevronDown,
  Octagon,
  AlertOctagon,
  Lock,
  Send,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InspectionPlan } from '../../types';

export type InspectionPlanTransitionAction =
  | 'submit_approval'
  | 'approve'
  | 'launch'
  | 'suspend'
  | 'resume'
  | 'terminate'
  | 'complete'
  | 'enter_report_preparation';

export type InspectionPlanTransitionPayload = {
  reason?: string;
  comment?: string;
};

type HeaderStatus = 'draft' | 'approving' | 'in_progress' | 'completed' | 'suspended' | 'terminated';

const toHeaderStatus = (status?: InspectionPlan['status']): HeaderStatus => {
  if (status === 'DRAFT') return 'draft';
  if (status === 'APPROVING') return 'approving';
  if (status === 'SUSPENDED') return 'suspended';
  if (status === 'TERMINATED') return 'terminated';
  if (status === 'COMPLETED') return 'completed';
  return 'in_progress';
};

const PLAN_TYPE_LABELS: Record<string, string> = {
  ROUTINE_INSPECTION: '例行检查',
  SPECIAL_INSPECTION: '专项检查',
  DEPARTURE_AUDIT: '离任审计',
};

const PLAN_FREQUENCY_LABELS: Record<string, string> = {
  YEARLY: '年度',
  HALF_YEARLY: '半年度',
  QUARTERLY: '季度',
  AD_HOC: '临时',
};

const labelFor = (value: string | undefined, labels: Record<string, string>, fallback: string) =>
  value ? labels[value] ?? value : fallback;

const PRIMARY_ACTIONS: Array<{
  action: InspectionPlanTransitionAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = [
  {
    action: 'submit_approval',
    label: '提交审批',
    icon: Send,
    className: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
  },
  {
    action: 'approve',
    label: '批准',
    icon: ShieldCheck,
    className: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  },
  {
    action: 'launch',
    label: '启动',
    icon: PlayCircle,
    className: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
  },
  {
    action: 'complete',
    label: '完成',
    icon: CheckCircle2,
    className: 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm',
  },
];

const MORE_ACTIONS: Array<{
  action: InspectionPlanTransitionAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = [
  {
    action: 'suspend',
    label: '暂停计划',
    icon: PauseCircle,
    className: 'text-amber-600 hover:bg-amber-50',
  },
  {
    action: 'resume',
    label: '恢复执行',
    icon: RotateCcw,
    className: 'text-emerald-600 hover:bg-emerald-50',
  },
  {
    action: 'terminate',
    label: '终止计划',
    icon: Octagon,
    className: 'font-bold text-rose-600 hover:bg-rose-50',
  },
];

export default function InspectionPlanHeader({
  plan,
  onBack,
  onEnterReportPreparation,
  onPlanAction,
  isEnteringReportPreparation = false,
  activeAction = null,
  reportPreparationDisabledReason,
}: {
  plan?: InspectionPlan | null;
  onBack?: () => void;
  onEnterReportPreparation?: () => void;
  onPlanAction?: (
    action: InspectionPlanTransitionAction,
    payload?: InspectionPlanTransitionPayload,
  ) => Promise<void> | void;
  isEnteringReportPreparation?: boolean;
  activeAction?: InspectionPlanTransitionAction | null;
  reportPreparationDisabledReason?: string | null;
}) {
  const headerData = useMemo(() => {
    const targetBranches = (plan?.targetDept || '未指定')
      .split(/[、,，]/)
      .map(item => item.trim())
      .filter(Boolean);
    return {
      id: plan?.inspectCode || plan?.id || '未选择计划',
      title: plan?.title || '未选择检查计划',
      type: labelFor(plan?.type, PLAN_TYPE_LABELS, '未指定类型'),
      frequency: labelFor(plan?.frequency, PLAN_FREQUENCY_LABELS, '未指定频率'),
      leadInspector: { name: plan?.leader || '未指定', role: '项目组长' },
      teamMembers: plan?.teamMembers?.length ? plan.teamMembers : ['未指定'],
      targetBranches,
      plannedPeriod: `${plan?.plannedStartDate || '--'} 至 ${plan?.plannedEndDate || '--'}`,
      actualStart: plan?.plannedStartDate || '--',
      delayWarning: false,
    };
  }, [plan]);
  const allowedActions = useMemo(() => new Set(plan?.allowedActions ?? []), [plan?.allowedActions]);
  const planStatus = toHeaderStatus(plan?.status);
  const visiblePrimaryActions = PRIMARY_ACTIONS.filter(item => allowedActions.has(item.action));
  const visibleMoreActions = MORE_ACTIONS.filter(item => allowedActions.has(item.action));
  const hasVisibleActionButtons = visiblePrimaryActions.length > 0
    || visibleMoreActions.length > 0
    || allowedActions.has('enter_report_preparation');
  const isAnyActionRunning = Boolean(activeAction) || isEnteringReportPreparation;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');

  const handleAction = async (
    action: InspectionPlanTransitionAction,
    payload?: InspectionPlanTransitionPayload,
  ) => {
    if (!allowedActions.has(action)) return;
    await onPlanAction?.(action, payload);
  };

  const handleConfirmTerminate = async () => {
    const reason = terminateReason.trim();
    if (!reason) return;
    await handleAction('terminate', {
      reason,
      comment: 'Terminate inspection plan from detail header',
    });
    setShowTerminateModal(false);
    setTerminateReason('');
  };

  return (
    <div className="flex flex-col w-full">
      <div className="bg-white p-6 pb-4 border-b border-slate-200">
        {/* Top Navigation & Actions */}
        <div className="flex items-start justify-between mb-3 gap-4">
          {/* Breadcrumb & Title */}
          <div>
            <div className="flex items-center text-sm text-slate-500 mb-2">
              <span className="hover:text-indigo-600 cursor-pointer transition-colors">合规检查</span>
              <ChevronRight className="w-4 h-4 mx-1 flex-shrink-0" />
              <span className="hover:text-indigo-600 cursor-pointer transition-colors" onClick={onBack}>检查计划大盘</span>
              <ChevronRight className="w-4 h-4 mx-1 flex-shrink-0" />
              <span className="text-slate-900 font-medium">计划详情</span>
            </div>
            {/* Title Bar */}
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
                {headerData.title}
              </h1>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 font-mono text-sm rounded-full border border-slate-200 shadow-sm mt-0.5">
                {headerData.id}
              </span>
              {planStatus === 'draft' && (
                <span className="px-3 py-1 bg-slate-100 text-slate-700 text-sm font-bold rounded-full border border-slate-200 flex items-center shadow-sm mt-0.5">
                  <FileText className="w-4 h-4 mr-1.5" />
                  草稿
                </span>
              )}
              {planStatus === 'approving' && (
                <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-sm font-bold rounded-full border border-indigo-200 flex items-center shadow-sm mt-0.5">
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  审批中
                </span>
              )}
              {planStatus === 'in_progress' && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-sm font-bold rounded-full border border-emerald-200 flex items-center shadow-sm mt-0.5">
                  <PlayCircle className="w-4 h-4 mr-1.5" />
                  进行中
                </span>
              )}
              {planStatus === 'completed' && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-sm font-bold rounded-full border border-emerald-200 flex items-center shadow-sm mt-0.5">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  已结项
                </span>
              )}
              {planStatus === 'suspended' && (
                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-sm font-bold rounded-full border border-amber-200 flex items-center shadow-sm mt-0.5">
                  <PauseCircle className="w-4 h-4 mr-1.5" />
                  已挂起
                </span>
              )}
              {planStatus === 'terminated' && (
                <span className="px-3 py-1 bg-slate-900 text-slate-300 text-sm font-bold rounded-full border border-slate-700 flex items-center shadow-sm mt-0.5">
                  已中止
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {planStatus === 'terminated' && !hasVisibleActionButtons ? (
              <div className="flex items-center text-slate-400 text-sm font-bold bg-slate-100 px-4 py-2 rounded-lg border border-slate-200 shadow-inner">
                <Lock className="w-4 h-4 mr-2"/> 计划已中止/锁定
              </div>
            ) : (
              <>
                {visiblePrimaryActions.map(({ action, label, icon: Icon, className }) => (
                  <Button
                    key={action}
                    className={className}
                    data-testid={`inspection-detail-action-${action}`}
                    disabled={isAnyActionRunning}
                    onClick={() => handleAction(action, {
                      comment: `${label} from inspection plan detail header`,
                    })}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {activeAction === action ? '处理中' : label}
                  </Button>
                ))}
                {plan?.allowedActions?.includes('enter_report_preparation') && (
                  <Button
                    variant="outline"
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    data-testid="inspection-detail-enter-report-preparation"
                    disabled={
                      Boolean(reportPreparationDisabledReason)
                      || isEnteringReportPreparation
                      || Boolean(activeAction)
                    }
                    title={reportPreparationDisabledReason ?? '进入报告编制'}
                    onClick={onEnterReportPreparation}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {isEnteringReportPreparation ? '进入中' : '进入报告编制'}
                  </Button>
                )}
                {visibleMoreActions.length > 0 && (
                  <div className="relative">
                    <Button
                      variant="outline"
                      className="border-slate-200 text-slate-700 hover:bg-slate-50"
                      data-testid="inspection-detail-actions-more"
                      onClick={() => setIsDropdownOpen(prev => !prev)}
                      disabled={isAnyActionRunning}
                    >
                      <Settings2 className="w-4 h-4 mr-2 text-slate-500" />
                      更多流转
                      <ChevronDown className="w-3 h-3 ml-2 text-slate-400" />
                    </Button>
                    {isDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-40 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1">
                        {visibleMoreActions.map(({ action, label, icon: Icon, className }, index) => (
                          <React.Fragment key={action}>
                            {index > 0 && <div className="h-px bg-slate-100 my-1" />}
                            <button
                              type="button"
                              data-testid={`inspection-detail-action-${action}`}
                              onClick={() => {
                                setIsDropdownOpen(false);
                                if (action === 'terminate') {
                                  setShowTerminateModal(true);
                                  return;
                                }
                                handleAction(action, {
                                  comment: `${label} from inspection plan detail header`,
                                });
                              }}
                              className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center transition-colors ${className}`}
                            >
                              <Icon className="w-4 h-4 mr-2" /> {label}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Meta Information Grid */}
        <div className="bg-slate-50 rounded-xl border border-slate-200/60 p-5 lg:p-6 shadow-sm mt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            
            {/* Column 1: Type & Targets */}
            <div className="flex flex-col pt-4 md:pt-0 first:pt-0">
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">分类与频次</p>
                <p className="text-sm font-medium text-slate-900 flex items-center">
                  <Building2 className="w-4 h-4 mr-2 text-indigo-500" />
                  {headerData.type} · {headerData.frequency}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">检查对象</p>
                <div className="flex flex-wrap items-center gap-2">
                  {headerData.targetBranches.slice(0, 2).map((branch) => (
                    <span key={branch} className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-700 font-medium whitespace-nowrap shadow-sm">
                      {branch}
                    </span>
                  ))}
                  
                  {/* HoverCard logic for additional branches */}
                  {headerData.targetBranches.length > 2 && (
                    <div className="relative group">
                      <span className="px-2.5 py-1 text-xs border border-indigo-200 rounded-md bg-indigo-50 text-indigo-700 font-bold cursor-help whitespace-nowrap shadow-sm">
                        +{headerData.targetBranches.length - 2} 家机构
                      </span>
                      {/* Tooltip Popup */}
                      <div className="absolute left-1/2 bottom-full mb-2 hidden group-hover:block w-48 p-2.5 bg-slate-800 text-white rounded-lg shadow-xl z-10 -translate-x-1/2">
                        <p className="text-xs text-slate-400 mb-2 font-medium">所有检查对象：</p>
                        <div className="flex flex-wrap gap-1.5">
                          {headerData.targetBranches.map(b => (
                            <span key={b} className="bg-slate-700 px-2 py-0.5 rounded text-xs font-medium">{b}</span>
                          ))}
                        </div>
                        {/* Arrow */}
                        <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Column 2: Inspection Team */}
            <div className="flex flex-col pt-4 md:pt-0 md:pl-8">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">检查组 (Inspection Team)</p>
              <div className="space-y-4">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm ring-1 ring-slate-100 mr-3">
                    {headerData.leadInspector.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {headerData.leadInspector.name}
                      <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded ml-2">领队</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{headerData.leadInspector.role}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="flex -space-x-2">
                    {headerData.teamMembers.slice(0, 3).map((member, i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold border-2 border-white ring-1 ring-slate-200">
                        {member[0]}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-slate-600 font-medium">
                    及 {headerData.teamMembers.length} 名组员
                  </span>
                </div>
              </div>
            </div>

            {/* Column 3: Timeline & Progress */}
            <div className="flex flex-col pt-4 md:pt-0 md:pl-8">
               <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">实施周期 (Timeline)</p>
               <div className="space-y-3">
                  <div className="flex items-start">
                    <Calendar className="w-4 h-4 text-indigo-400 mr-2 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-slate-900 font-bold tracking-tight">{headerData.plannedPeriod}</p>
                      <p className="text-xs text-slate-500 mt-0.5">计划实施区间</p>
                    </div>
                  </div>
                  
                  {headerData.delayWarning && (
                    <div className="flex items-start bg-rose-50 text-rose-800 p-2.5 rounded-lg border border-rose-200 shadow-sm">
                      <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0 text-rose-600" />
                      <div className="text-xs leading-relaxed">
                        <p className="font-medium text-rose-600 mb-0.5">⚠️ 实际启动延迟 2 天</p>
                        <p className="text-rose-700/80">记录启动时间: {headerData.actualStart}</p>
                      </div>
                    </div>
                  )}
               </div>
            </div>

          </div>
        </div>
      </div>
      
      {planStatus === 'suspended' && (
        <div className="bg-amber-50 text-amber-700 p-2 text-sm text-center flex items-center justify-center font-bold shadow-inner">
          <PauseCircle className="w-4 h-4 mr-2"/> 计划已挂起，所有倒计时时效与业务流转已冻结。
        </div>
      )}

      {planStatus === 'terminated' && (
        <div className="bg-slate-800 text-slate-200 p-2 text-sm text-center flex items-center justify-center font-bold z-50">
          <Octagon className="w-4 h-4 mr-2 text-rose-500"/> 该检查计划已中止，后续流转已锁定。
        </div>
      )}

      {/* Terminate Modal */}
      {showTerminateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border-t-8 border-rose-600 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <AlertOctagon className="w-8 h-8 text-rose-600 animate-pulse" />
              <h3 className="text-xl font-bold text-slate-800">中止检查计划确认</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-rose-600 font-bold mb-4 bg-rose-50 p-3 rounded leading-relaxed">
                ⚠️ 警告：该操作为不可逆的终极指令。一旦确认，本项目将立即彻底结束并归档，所有正在进行的实施与审核任务将强制关闭。请慎重考虑。
              </p>
              <label className="block text-sm font-bold text-slate-700 mb-2">中止原因 (必填) *</label>
              <textarea 
                className="w-full h-32 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all shadow-inner" 
                placeholder="请详细输入中止此计划的具体原因，该信息将永久记录在审计日志中..." 
                value={terminateReason} 
                onChange={(e) => setTerminateReason(e.target.value)} 
              />
            </div>
            <div className="p-4 bg-slate-50 border-t flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowTerminateModal(false)} className="text-slate-600 border-slate-200 hover:bg-slate-100">放弃并取消</Button>
              <Button
                onClick={handleConfirmTerminate}
                disabled={!terminateReason.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activeAction === 'terminate' ? '正在中止' : '确认中止计划'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

