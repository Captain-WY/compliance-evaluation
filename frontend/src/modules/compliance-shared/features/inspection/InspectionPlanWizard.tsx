import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle2,
  Building2,
  Users,
  User,
  ShieldAlert,
  FileSpreadsheet,
  FileIcon,
  Loader2,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { API_MODE, fileApi, systemApi } from '../../services/api';
import {
  DEFAULT_INSPECTION_PLAN_FREQUENCY_CODE,
  DEFAULT_INSPECTION_PLAN_TYPE_CODE,
} from '../../services/inspectionPlanCodeMapper';
import type { ConfigDictionaryItem } from '../../services/api';

interface InspectionPlanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (planData: any) => Promise<void> | void;
}

const STEPS = [
  { id: 1, title: '基本信息', description: '定义项目范围与周期' },
  { id: 2, title: '项目团队', description: '配置组长与组员' },
  { id: 3, title: '附件预挂载', description: '记录附件接入边界' }
];

type WizardFileKey = 'notice' | 'scheme' | 'workingPaperTemplate' | 'other';
type WizardAttachmentType =
  | 'INSPECTION_NOTICE'
  | 'ONSITE_INSPECTION_SCHEME'
  | 'WORKING_PAPER_TEMPLATE'
  | 'OTHER';

type WizardPersonOption = {
  id?: string;
  name: string;
};

type WizardUploadedAttachment = {
  attachmentType: WizardAttachmentType;
  fileId: string;
  fileName: string;
  fileSize?: number;
  contentType?: string;
  uploadedAt?: string;
};

type WizardAttachmentConfig = {
  key: WizardFileKey;
  attachmentType: WizardAttachmentType;
  title: string;
  description: string;
  required: boolean;
  accept: string;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
};

const REQUIRED_ATTACHMENT_TYPES: WizardAttachmentType[] = [
  'INSPECTION_NOTICE',
  'ONSITE_INSPECTION_SCHEME',
  'WORKING_PAPER_TEMPLATE',
  'OTHER',
];

const ATTACHMENT_TYPE_KEY_BY_CODE: Record<WizardAttachmentType, WizardFileKey> = {
  INSPECTION_NOTICE: 'notice',
  ONSITE_INSPECTION_SCHEME: 'scheme',
  WORKING_PAPER_TEMPLATE: 'workingPaperTemplate',
  OTHER: 'other',
};

const ATTACHMENT_ICON_META: Record<
  WizardAttachmentType,
  { icon: React.ComponentType<{ className?: string }>; iconClassName: string }
> = {
  INSPECTION_NOTICE: { icon: FileText, iconClassName: 'text-red-500' },
  ONSITE_INSPECTION_SCHEME: { icon: FileIcon, iconClassName: 'text-blue-600' },
  WORKING_PAPER_TEMPLATE: { icon: FileSpreadsheet, iconClassName: 'text-green-600' },
  OTHER: { icon: FileIcon, iconClassName: 'text-slate-600' },
};

const PLAN_DICTIONARY_TYPES = [
  'inspection_plan_type',
  'inspection_plan_frequency',
  'inspection_confidentiality_level',
  'inspection_plan_attachment_type',
];

const dictionaryErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '配置字典加载失败';

type TargetGranularity = 'BRANCH_COMPANY' | 'BRANCH_OFFICE' | 'BUSINESS_LINE' | 'PERSONNEL';

interface OrgTreeNode {
  id: string;
  name: string;
  type: 'root' | 'dept' | 'branch' | 'sub-branch';
  children?: OrgTreeNode[];
}

const GRANULARITY_OPTIONS: { value: TargetGranularity; label: string }[] = [
  { value: 'BRANCH_COMPANY', label: '分公司' },
  { value: 'BRANCH_OFFICE', label: '营业部' },
  { value: 'BUSINESS_LINE', label: '业务条线' },
  { value: 'PERSONNEL', label: '岗位（个人）' },
];

const GRANULARITY_TYPE_MAP: Record<TargetGranularity, string[]> = {
  BRANCH_COMPANY: ['branch'],
  BRANCH_OFFICE: ['sub-branch'],
  BUSINESS_LINE: ['dept'],
  PERSONNEL: [],
};

const findOrgNameById = (node: OrgTreeNode | null, id: string): string | undefined => {
  if (!node) return undefined;
  if (node.id === id) return node.name;
  for (const child of node.children || []) {
    const found = findOrgNameById(child, id);
    if (found) return found;
  }
  return undefined;
};

const dedupeOrgTree = (node: OrgTreeNode): OrgTreeNode => {
  const seen = new Map<string, OrgTreeNode>();
  const collect = (n: OrgTreeNode): void => {
    const existing = seen.get(n.id);
    if (!existing) {
      seen.set(n.id, { ...n, children: n.children ? [...n.children] : undefined });
    } else {
      const existingHasChildren = (existing.children?.length ?? 0) > 0;
      const newHasChildren = (n.children?.length ?? 0) > 0;
      if (newHasChildren && !existingHasChildren) {
        seen.set(n.id, { ...n, children: n.children ? [...n.children] : undefined });
      }
    }
    n.children?.forEach(collect);
  };
  collect(node);
  const build = (n: OrgTreeNode): OrgTreeNode => ({
    ...seen.get(n.id)!,
    children: seen.get(n.id)!.children?.map(build).filter((c): c is OrgTreeNode => !!c),
  });
  return build(node);
};

const newFormData = () => ({
  title: '',
  inspectCode: `INSP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
  type: DEFAULT_INSPECTION_PLAN_TYPE_CODE,
  frequency: DEFAULT_INSPECTION_PLAN_FREQUENCY_CODE,
  startDate: '',
  endDate: '',
  targetDept: '',
  targetGranularity: 'BRANCH_COMPANY' as TargetGranularity,
  targetOrgIds: [] as string[],
  targetPersonnelIds: [] as string[],
  leader: '',
  leaderUserId: undefined as string | undefined,
  teamMembers: [] as string[],
  teamMemberUserIds: [] as string[],
  confidentialityLevel: 'NORMAL'
});

const isRealUploadMode = API_MODE === 'real' || API_MODE === 'hybrid';

const stringListFromMeta = (value: unknown) =>
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : [];

const isWizardAttachmentType = (value: string): value is WizardAttachmentType =>
  REQUIRED_ATTACHMENT_TYPES.includes(value as WizardAttachmentType);

const buildAttachmentConfigResult = (
  items: ConfigDictionaryItem[],
): { options: WizardAttachmentConfig[]; error: string | null } => {
  if (items.length === 0) {
    return { options: [], error: '附件类型配置暂无可用项' };
  }

  const byCode = new Map(items.map(item => [item.dictCode, item]));
  const unsupported = items
    .map(item => item.dictCode)
    .filter(code => !isWizardAttachmentType(code));
  if (unsupported.length > 0) {
    return {
      options: [],
      error: `附件类型配置包含未受支持的 code：${unsupported.join(', ')}`,
    };
  }

  const missing = REQUIRED_ATTACHMENT_TYPES.filter(code => !byCode.has(code));
  if (missing.length > 0) {
    return {
      options: [],
      error: `附件类型配置缺少：${missing.join(', ')}`,
    };
  }

  const invalid: string[] = [];
  const options = REQUIRED_ATTACHMENT_TYPES.map((code, index) => {
    const item = byCode.get(code)!;
    const meta = item.uiMeta || {};
    const attachmentKey = typeof meta.attachmentKey === 'string' ? meta.attachmentKey : '';
    const allowedExtensions = stringListFromMeta(meta.allowedExtensions);
    const allowedMimeTypes = stringListFromMeta(meta.allowedMimeTypes);
    const maxFileSizeBytes = typeof meta.maxFileSizeBytes === 'number' ? meta.maxFileSizeBytes : 0;
    const required = typeof meta.required === 'boolean' ? meta.required : null;
    const bindingTargetType = typeof meta.bindingTargetType === 'string' ? meta.bindingTargetType : '';
    const expectedKey = ATTACHMENT_TYPE_KEY_BY_CODE[code];
    if (
      attachmentKey !== expectedKey ||
      required === null ||
      !bindingTargetType ||
      allowedExtensions.length === 0 ||
      allowedMimeTypes.length === 0 ||
      maxFileSizeBytes <= 0
    ) {
      invalid.push(code);
    }
    const iconMeta = ATTACHMENT_ICON_META[code];
    return {
      key: expectedKey,
      attachmentType: code,
      title: `${index + 1}. ${item.dictLabel}`,
      description: `${required ? '必填' : '可选'}，绑定到${bindingTargetType === 'InspectionPlan' ? '检查计划' : bindingTargetType}`,
      required: required === true,
      accept: [...allowedExtensions, ...allowedMimeTypes].join(','),
      allowedExtensions,
      allowedMimeTypes,
      maxFileSizeBytes,
      icon: iconMeta.icon,
      iconClassName: iconMeta.iconClassName,
    };
  });

  if (invalid.length > 0) {
    return {
      options: [],
      error: `附件类型配置缺少必要规则：${invalid.join(', ')}`,
    };
  }

  return { options, error: null };
};

const formatFileSize = (size?: number) => {
  if (!size) return '';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
};

export default function InspectionPlanWizard({ isOpen, onClose, onSubmit }: InspectionPlanWizardProps) {
  const submitInFlightRef = useRef(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [orgTree, setOrgTree] = useState<OrgTreeNode | null>(null);
  const [expandedOrgNodes, setExpandedOrgNodes] = useState<Set<string>>(new Set());
  const [staffList, setStaffList] = useState<WizardPersonOption[]>([]);
  const [planTypeOptions, setPlanTypeOptions] = useState<ConfigDictionaryItem[]>([]);
  const [frequencyOptions, setFrequencyOptions] = useState<ConfigDictionaryItem[]>([]);
  const [confidentialityOptions, setConfidentialityOptions] = useState<ConfigDictionaryItem[]>([]);
  const [attachmentTypeOptions, setAttachmentTypeOptions] = useState<ConfigDictionaryItem[]>([]);
  const [isLoadingDictionaries, setIsLoadingDictionaries] = useState(false);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1); // 1 for forward, -1 for backward
  const [isOrgTreeExpanded, setIsOrgTreeExpanded] = useState(true);
  const [attachments, setAttachments] = useState<Partial<Record<WizardFileKey, WizardUploadedAttachment>>>({});
  const [uploadingKey, setUploadingKey] = useState<WizardFileKey | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState(newFormData);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      submitInFlightRef.current = false;
      setIsSubmitting(false);
      setSubmitError(null);
    } else {
      document.body.style.overflow = 'unset';
      submitInFlightRef.current = false;
      setIsSubmitting(false);
      setSubmitError(null);
      // Reset state on close
      setTimeout(() => {
        setCurrentStep(1);
        setFormData(newFormData());
        setAttachments({});
        setUploadError(null);
        setUploadingKey(null);
      }, 300);
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    systemApi.getOrgNames()
      .then(items => {
        if (!cancelled) setDepartments(items.length ? items : ['广州荔湾分公司']);
      })
      .catch(() => {
        if (!cancelled) setDepartments(['广州荔湾分公司']);
      });
    systemApi.getOrgTree()
      .then(tree => {
        if (!cancelled) setOrgTree(tree ? dedupeOrgTree(tree) : null);
      })
      .catch(() => {
        if (!cancelled) setOrgTree(null);
      });
    systemApi.getPersonnel()
      .then(items => {
        if (cancelled) return;
        const people = items
          .filter(person => person.status !== 'inactive' && person.name)
          .map(person => ({ id: person.userId, name: person.name }));
        setStaffList(people.length ? people : [{ name: '当前登录用户' }]);
      })
      .catch(() => systemApi.getPersonnelNames().then(items => {
        if (!cancelled) {
          setStaffList((items.length ? items : ['当前登录用户']).map(name => ({ name })));
        }
      }))
      .catch(() => {
        if (!cancelled) setStaffList([{ name: '当前登录用户' }]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingDictionaries(true);
    setDictionaryError(null);
    systemApi.getConfigDictionaries(PLAN_DICTIONARY_TYPES)
      .then(response => {
        if (cancelled) return;
        setPlanTypeOptions(response.dictionaries.inspection_plan_type ?? []);
        setFrequencyOptions(response.dictionaries.inspection_plan_frequency ?? []);
        setConfidentialityOptions(response.dictionaries.inspection_confidentiality_level ?? []);
        setAttachmentTypeOptions(response.dictionaries.inspection_plan_attachment_type ?? []);
      })
      .catch(error => {
        if (cancelled) return;
        setPlanTypeOptions([]);
        setFrequencyOptions([]);
        setConfidentialityOptions([]);
        setAttachmentTypeOptions([]);
        setDictionaryError(dictionaryErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDictionaries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const attachmentConfig = useMemo(
    () => buildAttachmentConfigResult(attachmentTypeOptions),
    [attachmentTypeOptions],
  );
  const attachmentOptions = attachmentConfig.options;
  const configurationError = dictionaryError || (!isLoadingDictionaries ? attachmentConfig.error : null);
  const hasDictionaryOptions =
    planTypeOptions.length > 0 &&
    frequencyOptions.length > 0 &&
    confidentialityOptions.length > 0 &&
    attachmentOptions.length > 0;
  const dictionariesReady = !isLoadingDictionaries && !configurationError && hasDictionaryOptions;
  // Validation
  const hasTargets = useMemo(() => {
    if (formData.targetGranularity === 'PERSONNEL') {
      return formData.targetPersonnelIds.length > 0;
    }
    return formData.targetOrgIds.length > 0;
  }, [formData.targetGranularity, formData.targetOrgIds, formData.targetPersonnelIds]);
  const isStep1Valid = !!(formData.title && formData.type && formData.frequency && formData.startDate && formData.endDate && hasTargets && dictionariesReady);
  const isStep2Valid = !!(formData.leader && formData.teamMembers.length > 0 && formData.confidentialityLevel && dictionariesReady);
  const dictionarySelectDisabled = isSubmitting || isLoadingDictionaries || Boolean(configurationError) || !hasDictionaryOptions;

  const handleNext = () => {
    if (currentStep < 3) {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  const toggleTeamMember = (member: WizardPersonOption) => {
    setFormData(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.includes(member.name)
        ? prev.teamMembers.filter(m => m !== member.name)
        : [...prev.teamMembers, member.name],
      teamMemberUserIds: member.id
        ? (
          prev.teamMemberUserIds.includes(member.id)
            ? prev.teamMemberUserIds.filter(id => id !== member.id)
            : [...prev.teamMemberUserIds, member.id]
        )
        : prev.teamMemberUserIds,
    }));
  };

  // Org tree helpers
  const toggleOrgNode = (nodeId: string) => {
    setExpandedOrgNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const selectableTypesForGranularity = (granularity: TargetGranularity): string[] => {
    return GRANULARITY_TYPE_MAP[granularity] || [];
  };

  const isNodeSelectable = (node: OrgTreeNode, granularity: TargetGranularity): boolean => {
    const types = selectableTypesForGranularity(granularity);
    return types.includes(node.type);
  };

  const toggleOrgSelection = (nodeId: string) => {
    setFormData(prev => ({
      ...prev,
      targetOrgIds: prev.targetOrgIds.includes(nodeId)
        ? prev.targetOrgIds.filter(id => id !== nodeId)
        : [...prev.targetOrgIds, nodeId],
    }));
  };

  const togglePersonnelSelection = (personId: string) => {
    setFormData(prev => ({
      ...prev,
      targetPersonnelIds: prev.targetPersonnelIds.includes(personId)
        ? prev.targetPersonnelIds.filter(id => id !== personId)
        : [...prev.targetPersonnelIds, personId],
    }));
  };

  const renderOrgTree = (node: OrgTreeNode, depth = 0): React.ReactNode => {
    const isExpanded = expandedOrgNodes.has(node.id);
    const isSelectable = isNodeSelectable(node, formData.targetGranularity);
    const isSelected = formData.targetOrgIds.includes(node.id);
    const hasChildren = (node.children?.length ?? 0) > 0;
    const paddingLeft = depth * 16 + 8;

    return (
      <div key={node.id}>
        <div
          className="flex items-center py-1.5 hover:bg-gray-50 rounded cursor-pointer"
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => {
            if (hasChildren) toggleOrgNode(node.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 mr-1 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 mr-1 shrink-0" />
            )
          ) : (
            <span className="w-3.5 mr-1 shrink-0" />
          )}
          {isSelectable && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                toggleOrgSelection(node.id);
              }}
              className={`mr-2 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-300 bg-white hover:border-blue-400'
              }`}
            >
              {isSelected && <CheckCircle2 className="w-3 h-3" />}
            </button>
          )}
          {!isSelectable && <span className="w-4 mr-2 shrink-0" />}
          <span className={`text-sm break-words min-w-0 ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
            {node.name}
          </span>
          {isSelectable && (
            <span className="ml-2 text-[10px] text-gray-400 shrink-0">
              {node.type === 'branch' ? '分公司' : node.type === 'sub-branch' ? '营业部' : node.type === 'dept' ? '条线' : ''}
            </span>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map(child => renderOrgTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleClose = () => {
    if (submitInFlightRef.current) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (submitInFlightRef.current) return;
    if (!dictionariesReady) {
      setSubmitError(configurationError || '配置字典未就绪，暂不能创建检查计划');
      return;
    }
    const missingRequiredAttachments = attachmentOptions.filter(item => item.required && !attachments[item.key]);
    if (missingRequiredAttachments.length > 0) {
      setSubmitError(`请先上传${missingRequiredAttachments.map(item => item.title.replace(/^\d+\.\s*/, '')).join('、')}`);
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const files = attachmentOptions
        .map(item => attachments[item.key])
        .filter((item): item is WizardUploadedAttachment => Boolean(item))
        .map(item => ({
          attachmentType: item.attachmentType,
          fileId: item.fileId,
        }));
      const targetDeptLabel = formData.targetGranularity === 'PERSONNEL'
        ? formData.targetPersonnelIds.map(id => staffList.find(s => s.id === id)?.name || id).join('、')
        : formData.targetOrgIds.map(id => {
            const findName = (node: OrgTreeNode | null): string | undefined => {
              if (!node) return undefined;
              if (node.id === id) return node.name;
              for (const child of node.children || []) {
                const found = findName(child);
                if (found) return found;
              }
              return undefined;
            };
            return findName(orgTree) || id;
          }).join('、');
      await onSubmit({
        ...formData,
        targetDept: targetDeptLabel,
        files,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '检查计划创建失败');
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleAttachmentUpload = async (item: WizardAttachmentConfig, file?: File) => {
    if (!file) return;
    if (!dictionariesReady) {
      setUploadError(configurationError || '附件类型配置未就绪，暂不能上传');
      return;
    }
    if (!isRealUploadMode) {
      setUploadError('当前 API 模式不允许创建附件上传，以避免生成 mock fileId。');
      return;
    }
    setUploadingKey(item.key);
    setUploadError(null);
    try {
      const uploaded = await fileApi.uploadFile(file);
      const fileId = uploaded.fileId ?? uploaded.id;
      if (!fileId || String(fileId).startsWith('FILE-MOCK-')) {
        throw new Error('文件上传未返回真实 fileId');
      }
      setAttachments(prev => ({
        ...prev,
        [item.key]: {
          attachmentType: item.attachmentType,
          fileId,
          fileName: uploaded.fileName ?? file.name,
          fileSize: uploaded.fileSize ?? file.size,
          contentType: uploaded.contentType ?? file.type,
          uploadedAt: uploaded.uploadedAt,
        },
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '附件上传失败');
    } finally {
      setUploadingKey(null);
    }
  };

  const removeAttachment = (key: WizardFileKey) => {
    setAttachments(prev => ({ ...prev, [key]: null }));
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 50 : -50,
      opacity: 0
    })
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">新增检查计划</h2>
            <p className="text-sm text-gray-500 mt-0.5">配置项目范围、团队及预挂载附件，完成后将发起 EKP 立项审批。</p>
          </div>
          <button 
            onClick={handleClose}
            disabled={isSubmitting}
            data-testid="inspection-plan-wizard-close"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-8 py-6 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-gray-100 -z-10"></div>
            {STEPS.map((step, idx) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              
              return (
                <div key={step.id} className="flex flex-col items-center relative z-10 bg-white px-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 font-semibold transition-colors duration-300 ${
                    isActive ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20' : 
                    isCompleted ? 'border-blue-600 bg-white text-blue-600' : 
                    'border-gray-200 bg-white text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : step.id}
                  </div>
                  <div className="mt-3 text-center">
                    <div className={`text-sm font-bold ${isActive || isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 hidden sm:block">{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 relative overflow-x-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            {/* STEP 1: 基本信息 */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="space-y-6 max-w-3xl mx-auto"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">项目名称 <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      value={formData.title}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      data-testid="inspection-plan-wizard-title"
                      placeholder="例如：2026年廉洁从业专项检查"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">项目编号</label>
                    <input 
                      type="text" 
                      value={formData.inspectCode}
                      disabled
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-gray-500 font-mono"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">检查颗粒度 <span className="text-red-500">*</span></label>
                    <select
                      value={formData.targetGranularity}
                      onChange={e => setFormData({
                        ...formData,
                        targetGranularity: e.target.value as TargetGranularity,
                        targetOrgIds: [],
                        targetPersonnelIds: [],
                      })}
                      data-testid="inspection-plan-wizard-granularity"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
                    >
                      {GRANULARITY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">
                        被检查对象 <span className="text-red-500">*</span>
                        {formData.targetGranularity !== 'PERSONNEL' && (
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            已选择 {formData.targetOrgIds.length} 个
                          </span>
                        )}
                        {formData.targetGranularity === 'PERSONNEL' && (
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            已选择 {formData.targetPersonnelIds.length} 人
                          </span>
                        )}
                      </label>
                      {formData.targetGranularity !== 'PERSONNEL' && orgTree && (
                        <button
                          type="button"
                          onClick={() => setIsOrgTreeExpanded(prev => !prev)}
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          {isOrgTreeExpanded ? (
                            <>
                              收起 <ChevronUp className="w-3 h-3" />
                            </>
                          ) : (
                            <>
                              展开 <ChevronDown className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    {formData.targetGranularity === 'PERSONNEL' ? (
                      <div className="flex flex-wrap gap-2 p-4 bg-white border border-gray-200 rounded-lg shadow-sm max-h-48 overflow-y-auto">
                        {staffList.map((staff, index) => {
                          const isSelected = formData.targetPersonnelIds.includes(staff.id || staff.name);
                          return (
                            <button
                              key={`${staff.name}-${index}`}
                              onClick={() => togglePersonnelSelection(staff.id || staff.name)}
                              data-testid={`inspection-plan-wizard-target-person-${staff.name}`}
                              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              <User className="w-3 h-3 inline mr-1" />
                              {staff.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : orgTree ? (
                      <>
                        {isOrgTreeExpanded ? (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-h-56 overflow-y-auto p-2">
                            {renderOrgTree(orgTree)}
                          </div>
                        ) : (
                          <div
                            className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => setIsOrgTreeExpanded(true)}
                          >
                            {formData.targetOrgIds.length === 0 ? (
                              <span className="text-sm text-gray-400">点击展开选择被检查对象</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {formData.targetOrgIds.map(id => {
                                  const name = findOrgNameById(orgTree, id);
                                  return (
                                    <span key={id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 max-w-full break-words">
                                      {name || id}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500 text-center">
                        组织架构加载中...
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">检查类型 <span className="text-red-500">*</span></label>
                    {configurationError && (
                      <div
                        data-testid="inspection-plan-wizard-dictionary-error"
                        className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                      >
                        {configurationError}
                      </div>
                    )}
                    {!isLoadingDictionaries && !configurationError && !hasDictionaryOptions && (
                      <div
                        data-testid="inspection-plan-wizard-dictionary-empty"
                        className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
                      >
                        检查类型、频率、保密程度或附件类型字典暂无可用项
                      </div>
                    )}
                    <select 
                      value={formData.type}
                      onChange={e => setFormData({...formData, type: e.target.value})}
                      disabled={dictionarySelectDisabled}
                      data-testid="inspection-plan-wizard-type"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="" disabled>
                        {isLoadingDictionaries ? '正在加载字典...' : '请选择'}
                      </option>
                      {planTypeOptions.map(item => (
                        <option
                          key={item.dictId}
                          value={item.dictCode}
                          data-testid={`inspection-plan-wizard-type-option-${item.dictId}`}
                        >
                          {item.dictLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">检查频率 <span className="text-red-500">*</span></label>
                    <select 
                      value={formData.frequency}
                      onChange={e => setFormData({...formData, frequency: e.target.value})}
                      disabled={dictionarySelectDisabled}
                      data-testid="inspection-plan-wizard-frequency"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="" disabled>
                        {isLoadingDictionaries ? '正在加载字典...' : '请选择'}
                      </option>
                      {frequencyOptions.map(item => (
                        <option
                          key={item.dictId}
                          value={item.dictCode}
                          data-testid={`inspection-plan-wizard-frequency-option-${item.dictId}`}
                        >
                          {item.dictLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">计划开始日期 <span className="text-red-500">*</span></label>
                    <input 
                      type="date" 
                      value={formData.startDate}
                      onChange={e => setFormData({...formData, startDate: e.target.value})}
                      data-testid="inspection-plan-wizard-start-date"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">计划结束日期 <span className="text-red-500">*</span></label>
                    <input 
                      type="date" 
                      value={formData.endDate}
                      onChange={e => setFormData({...formData, endDate: e.target.value})}
                      data-testid="inspection-plan-wizard-end-date"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: 项目团队 */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="space-y-8 max-w-3xl mx-auto"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">项目组长 (Leader) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Users className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <select 
                      value={formData.leader}
                      onChange={e => {
                        const selected = staffList.find(staff => staff.name === e.target.value);
                        setFormData({
                          ...formData,
                          leader: e.target.value,
                          leaderUserId: selected?.id,
                        });
                      }}
                      data-testid="inspection-plan-wizard-leader"
                      className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
                    >
                      <option value="" disabled>请选择项目组长</option>
                      {staffList.map((staff, index) => <option key={`${staff.name}-${index}`} value={staff.name}>{staff.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">项目组员 (Team Members) <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                    {staffList.map((staff, index) => {
                      const isSelected = formData.teamMembers.includes(staff.name);
                      return (
                        <button
                          key={`${staff.name}-${index}`}
                          onClick={() => toggleTeamMember(staff)}
                          data-testid={`inspection-plan-wizard-team-${staff.name}`}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                            isSelected 
                              ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {staff.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">已选择 {formData.teamMembers.length} 名组员</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">保密程度 <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-4">
                    {confidentialityOptions.map(item => (
                      <label key={item.dictId} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.confidentialityLevel === item.dictCode ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="confidentialityLevel"
                          value={item.dictCode}
                          checked={formData.confidentialityLevel === item.dictCode}
                          onChange={(e) => setFormData({...formData, confidentialityLevel: e.target.value})}
                          disabled={dictionarySelectDisabled}
                          data-testid={`inspection-plan-wizard-confidentiality-${item.dictCode}`}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-900 flex items-center">
                          {item.dictCode === 'CONFIDENTIAL' && <ShieldAlert className="w-4 h-4 mr-1 text-red-500" />}
                          {item.dictLabel}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 3: 附件预挂载 */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="space-y-6 max-w-3xl mx-auto"
              >
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800 flex items-start">
                    <ShieldAlert className="w-5 h-5 mr-2 shrink-0 mt-0.5 text-blue-600" />
                    <span>创建阶段附件为可选项；上传后将通过真实 /api/files fileId 绑定到检查计划。</span>
                  </p>
                </div>

                {!isRealUploadMode && (
                  <div
                    data-testid="inspection-plan-wizard-attachment-real-mode-disabled"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
                  >
                    当前 API 模式不允许创建附件上传，已禁用上传入口，避免生成 mock fileId。
                  </div>
                )}

                {isLoadingDictionaries && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                    附件类型配置加载中...
                  </div>
                )}

                {!isLoadingDictionaries && configurationError && (
                  <div
                    data-testid="inspection-plan-wizard-attachment-config-error"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
                  >
                    {configurationError}
                  </div>
                )}

                {uploadError && (
                  <div
                    data-testid="inspection-plan-wizard-attachment-upload-error"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
                  >
                    {uploadError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                  {attachmentOptions.map(item => {
                    const Icon = item.icon;
                    const uploaded = attachments[item.key];
                    const isUploading = uploadingKey === item.key;
                    const uploadDisabled = !isRealUploadMode || isSubmitting || isUploading || !dictionariesReady;
                    return (
                      <div key={item.key} className="flex flex-col">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">{item.title}</h4>
                        <div
                          data-testid={`inspection-plan-wizard-attachment-upload-${item.key}`}
                          className="flex-1 border border-dashed border-gray-300 rounded-xl bg-white/70 flex flex-col p-5 min-h-[190px]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <Icon className={`w-9 h-9 ${item.iconClassName}`} />
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                              {item.required ? '必填' : '可选'}
                            </span>
                          </div>
                          <p className="mt-4 text-sm font-medium text-gray-700">{item.description}</p>
                          {uploaded ? (
                            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-left">
                              <div className="text-sm font-semibold text-emerald-800 truncate">{uploaded.fileName}</div>
                              <div className="mt-1 text-xs text-emerald-700">
                                {formatFileSize(uploaded.fileSize)}
                              </div>
                              <div
                                data-testid={`inspection-plan-wizard-attachment-file-id-${item.key}`}
                                className="mt-2 break-all text-[11px] font-mono text-emerald-700"
                              >
                                {uploaded.fileId}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeAttachment(item.key)}
                                disabled={isSubmitting}
                                className="mt-3 inline-flex items-center text-xs font-medium text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                移除
                              </button>
                            </div>
                          ) : (
                            <label
                              className={`mt-4 inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                                !uploadDisabled
                                  ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  : 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                              }`}
                            >
                              {isUploading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <UploadCloud className="mr-2 h-4 w-4" />
                              )}
                              {isUploading ? '上传中...' : '选择并上传'}
                              <input
                                type="file"
                                className="sr-only"
                                disabled={uploadDisabled}
                                data-testid={`inspection-plan-wizard-attachment-input-${item.key}`}
                                accept={item.accept}
                                onChange={event => {
                                  const file = event.target.files?.[0];
                                  event.currentTarget.value = '';
                                  handleAttachmentUpload(item, file);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between shrink-0">
          {submitError && (
            <div className="mr-4 flex-1 text-sm font-medium text-rose-600">
              {submitError}
            </div>
          )}
          {!submitError && <div className="flex-1" />}
          
          <div className="flex space-x-3">
            {currentStep > 1 && (
              <button 
                onClick={handlePrev}
                disabled={isSubmitting}
                data-testid="inspection-plan-wizard-prev"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors flex items-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                上一步
              </button>
            )}
            
            {currentStep < 3 ? (
              <button 
                onClick={handleNext}
                disabled={isSubmitting || (currentStep === 1 ? !isStep1Valid : !isStep2Valid)}
                data-testid="inspection-plan-wizard-next"
                className={`px-6 py-2 rounded-md text-sm font-medium text-white shadow-sm transition-all flex items-center ${
                  (isSubmitting || (currentStep === 1 ? !isStep1Valid : !isStep2Valid))
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                下一步
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            ) : (
              <button 
                onClick={handleSubmit}
                disabled={isSubmitting || !dictionariesReady}
                data-testid="inspection-plan-wizard-submit"
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium shadow-sm transition-colors flex items-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {isSubmitting ? '正在创建...' : '确认创建草稿'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
