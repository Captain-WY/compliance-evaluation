import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

export interface SchemeConfiguratorStep<TStepId extends string = string> {
  id: TStepId;
  label: string;
  mandatory: boolean;
  helper?: string;
}

interface FrequencyOption {
  value: string;
  label: string;
}

interface AssessmentSchemeConfiguratorProps<TStepId extends string = string> {
  activeStep: TStepId;
  steps: Array<SchemeConfiguratorStep<TStepId>>;
  title: string;
  readOnly: boolean;
  modeLabel: string;
  statusLabel: string;
  versionLabel: string;
  frequencyValue: string;
  frequencyLabel: string;
  frequencyOptions: FrequencyOption[];
  targetScopeLabel: string;
  dirty: boolean;
  commandLoading: string | null;
  canSave: boolean;
  canValidate: boolean;
  canPublish: boolean;
  detailExists: boolean;
  showPublish: boolean;
  nextDisabled: boolean;
  nextDisabledReason?: string;
  baseStepBlockers: string[];
  editCommandReason?: string;
  validateCommandReason?: string;
  publishCommandReason?: string;
  children: React.ReactNode;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onFrequencyChange: (value: string) => void;
  onStepChange: (stepId: TStepId) => void;
  onPreviousStep: () => void;
  onNextStep: () => void;
  onSave: () => void | Promise<unknown>;
  onValidate: () => void | Promise<unknown>;
  onRefetch: () => void | Promise<unknown>;
  onPublish: () => void | Promise<unknown>;
}

export default function AssessmentSchemeConfigurator<TStepId extends string = string>({
  activeStep,
  steps,
  title,
  readOnly,
  modeLabel,
  statusLabel,
  versionLabel,
  frequencyValue,
  frequencyLabel,
  frequencyOptions,
  targetScopeLabel,
  dirty,
  commandLoading,
  canSave,
  canValidate,
  canPublish,
  detailExists,
  showPublish,
  nextDisabled,
  nextDisabledReason,
  baseStepBlockers,
  editCommandReason,
  validateCommandReason,
  publishCommandReason,
  children,
  onClose,
  onTitleChange,
  onFrequencyChange,
  onStepChange,
  onPreviousStep,
  onNextStep,
  onSave,
  onValidate,
  onRefetch,
  onPublish,
}: AssessmentSchemeConfiguratorProps<TStepId>) {
  const currentStepIndex = Math.max(steps.findIndex((step) => step.id === activeStep), 0);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-100"
      data-testid="asch-workbench-shell"
    >
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 shadow-sm" data-testid="asch-authoring-bar">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="asch-workbench-close">
              <ChevronLeft className="h-4 w-4" />
              返回方案列表
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <div className="min-w-[240px] flex-1">
              <Input
                value={title}
                disabled={readOnly}
                placeholder="输入方案名称，例如 2026年Q1营业部综合考核"
                onChange={(event) => onTitleChange(event.target.value)}
                className="h-9 border-0 bg-transparent px-0 text-lg font-bold text-slate-900 shadow-none focus-visible:ring-0"
                data-testid="asch-form-name"
              />
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge variant="outline" data-testid="asch-workbench-mode">
                  {modeLabel}
                </Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                  {statusLabel}
                </Badge>
                <span>{versionLabel}</span>
                <span>{frequencyLabel}</span>
                <span>{targetScopeLabel}</span>
              </div>
            </div>
            <div className="hidden h-10 w-px bg-slate-200 lg:block" />
            <div className="hidden shrink-0 items-center gap-3 lg:flex">
              <Select value={frequencyValue} disabled={readOnly} onValueChange={onFrequencyChange}>
                <SelectTrigger className="w-[128px] bg-slate-50" data-testid="asch-form-frequency">
                  <span className="truncate">{frequencyLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  {frequencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge
                variant="secondary"
                className={dirty ? 'border border-amber-200 bg-amber-50 text-amber-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}
                data-testid="asch-draft-dirty-state"
              >
                {dirty ? '有未保存修改' : '已同步'}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {currentStepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={onPreviousStep} data-testid="asch-step-prev">
                <ChevronLeft className="h-4 w-4" />
                上一步
              </Button>
            )}
            {!readOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSave}
                  disabled={!canSave || commandLoading === 'save'}
                  title={editCommandReason}
                  data-testid="asch-action-save"
                >
                  {commandLoading === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存草稿
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onValidate}
                  disabled={!canValidate || commandLoading === 'validate'}
                  title={validateCommandReason}
                  data-testid="asch-action-validate"
                >
                  {commandLoading === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  校验
                </Button>
              </>
            )}
            {detailExists && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefetch}
                disabled={commandLoading === 'refetch'}
                data-testid="asch-action-refetch"
                title="从真实 API 重新读取详情和命令状态"
              >
                {commandLoading === 'refetch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            )}
            {readOnly && (
              <Badge variant="secondary" className="bg-slate-100 text-slate-600" data-testid="asch-readonly-state">
                <Eye className="mr-1 h-3.5 w-3.5" />
                ACTIVE/ARCHIVED 只读
              </Badge>
            )}
            {showPublish ? (
              <Button
                onClick={onPublish}
                disabled={!canPublish || commandLoading === 'publish'}
                title={publishCommandReason ? '发布条件仍需补齐' : undefined}
                data-testid="asch-action-publish"
              >
                {commandLoading === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发布
              </Button>
            ) : (
              <Button
                onClick={onNextStep}
                disabled={nextDisabled}
                title={nextDisabledReason}
                data-testid="asch-step-next"
              >
                下一步
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {baseStepBlockers.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="asch-base-step-blockers">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-semibold">暂不能进入下一步：</span>
            {baseStepBlockers.map((blocker) => (
              <Badge key={blocker} variant="outline" className="border-amber-200 bg-white text-amber-800">
                {blocker}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-6 py-3" data-testid="asch-step-nav">
        <div className="flex flex-wrap items-center gap-4">
          {steps.map((step, index) => {
            const active = step.id === activeStep;
            const completed = index < currentStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                className={`flex min-w-[160px] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-indigo-300 bg-white text-indigo-700 shadow-sm'
                    : completed
                      ? 'border-emerald-200 bg-white text-slate-600'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white'
                }`}
                onClick={() => onStepChange(step.id)}
                data-testid={`asch-step-${step.id.replace(/_/g, '-')}`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active ? 'bg-indigo-600 text-white' : completed ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'
                }`}>
                  {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span>
                  <span className="block text-xs font-semibold leading-tight">{step.label}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {step.helper ?? (step.mandatory ? '发布前需完成' : '仿真可选，发布需通过预检')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-slate-100/60 p-4" data-testid="asch-step-body-host">
        {children}
      </div>
    </section>
  );
}
