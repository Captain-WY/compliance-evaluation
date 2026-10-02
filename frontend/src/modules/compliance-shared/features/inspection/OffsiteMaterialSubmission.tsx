import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Search, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileText, 
  AlertTriangle,
  Paperclip,
  Check,
  X,
  Download,
  FileArchive,
  FolderArchive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { API_MODE, fileApi, inspectionApi, taskApi } from '../../services/api';
import type { EvidenceRequirement, EvidenceSubmission, InspectionPlan, UnifiedTask } from '../../types';

type ProjectMode = 'active' | 'archived';

type MaterialProject = {
  id: string;
  requirementId?: string;
  inspectionPlanId?: string;
  mode: ProjectMode;
  title: string;
  deadline?: string;
  year?: string;
  status: string;
  rejectReason?: string;
  hqFiles: Array<{ name: string; size: string; fileId?: string }>;
  submittedPackage: { name: string; size: string; fileId?: string } | null;
  history: Array<{ date: string; event: string }>;
};

const initialProjects: MaterialProject[] = [
  {
    id: 'p1',
    mode: 'active',
    title: '2026年反洗钱专项现场检查',
    deadline: '2026-05-15',
    status: 'PENDING_RECTIFICATION',
    hqFiles: [
      { name: '关于开展2026反洗钱专项检查的通知.pdf', size: '1.2 MB' },
      { name: '分公司反洗钱资料调阅清单及模板.zip', size: '5.6 MB' }
    ],
    submittedPackage: null as { name: string; size: string; fileId?: string } | null,
    history: [
      { date: '2026-04-01 10:00', event: '总部发布通知' }
    ]
  },
  {
    id: 'p2',
    mode: 'active',
    title: '员工违规代客理财专项排查',
    deadline: '2026-04-19',
    status: 'REJECTED',
    rejectReason: '附件扫描件不清晰，缺少分公司合规官签字，且自查报告图表缺失，请重新整改打包盖章上传。',
    hqFiles: [
      { name: '关于开展违规代客理财排查的通知.pdf', size: '0.8 MB' },
      { name: '专项排查底稿模板.xlsx', size: '2.1 MB' }
    ],
    submittedPackage: { name: '违规代客理财_首次报送包_v1.zip', size: '18.5 MB' },
    history: [
      { date: '2026-04-05 09:00', event: '总部下发通知' },
      { date: '2026-04-12 15:30', event: '机构提交 v1' },
      { date: '2026-04-14 11:20', event: '总部打回' }
    ]
  },
  {
    id: 'p3',
    mode: 'archived',
    title: '2025年分公司常规合规联查',
    year: '2025',
    status: 'CLOSED',
    hqFiles: [
      { name: '2025年度检查通知.pdf', size: '1.5 MB' }
    ],
    submittedPackage: { name: '2025年常规合规检查材料_终版.zip', size: '124.8 MB' },
    history: [
      { date: '2025-05-10 10:00', event: '总部下发通知' },
      { date: '2025-06-01 14:00', event: '机构提交 v1' },
      { date: '2025-06-15 09:30', event: '总部验收通过' }
    ]
  }
];

const formatFileSize = (size: string | number | undefined) => {
  if (typeof size === 'number') return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return size || '后端回读';
};

const latestSubmissionFor = (
  requirement: EvidenceRequirement,
  submissions: EvidenceSubmission[],
): EvidenceSubmission | undefined => {
  const requirementId = requirement.requirementId ?? requirement.id;
  return submissions
    .filter(submission => submission.requirementId === requirementId)
    .sort((a, b) => (b.submitTime ?? '').localeCompare(a.submitTime ?? ''))[0];
};

const buildHqFiles = (
  requirement: EvidenceRequirement,
  inspectionPlan?: InspectionPlan,
): Array<{ name: string; size: string; fileId?: string }> => {
  // 优先从检查计划附件提取真实文件信息
  const planFiles = inspectionPlan?.files;
  if (planFiles) {
    const entries = Object.entries(planFiles)
      .filter(([, file]) => file != null && file.name)
      .map(([, file]) => ({
        name: file!.name,
        size: file!.fileSize != null ? `${(file!.fileSize / 1024 / 1024).toFixed(1)} MB` : '--',
        fileId: file!.fileId ?? file!.id,
      }));
    if (entries.length > 0) return entries;
  }
  // 次优：从 requirement.templateFiles 读取（后端扩展后可启用）
  if (requirement.templateFiles && requirement.templateFiles.length > 0) {
    return requirement.templateFiles.map(f => ({
      name: f.name,
      size: typeof f.size === 'number' ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : (f.size || '--'),
      fileId: f.fileId,
    }));
  }
  // Fallback：保持文件名提示，但 size 不再使用"后端生成"固定文案
  return [{ name: `${requirement.title}_调阅要求.txt`, size: '--' }];
};

const buildHistory = (
  requirement: EvidenceRequirement,
  submission?: EvidenceSubmission,
  inspectionPlan?: InspectionPlan,
): Array<{ date: string; event: string }> => {
  const history: Array<{ date: string; event: string }> = [];
  if (inspectionPlan) {
    history.push({
      date: inspectionPlan.plannedStartDate || '--',
      event: '总部发布检查通知',
    });
  }
  if (submission) {
    history.push({
      date: submission.submitTime || '--',
      event: '机构提交材料',
    });
    if (submission.reviewDecision === 'REJECT') {
      history.push({
        date: submission.reviewedAt || '--',
        event: `总部打回${submission.hqFeedback ? '：' + submission.hqFeedback : ''}`,
      });
    } else if (submission.reviewDecision === 'APPROVE') {
      history.push({
        date: submission.reviewedAt || '--',
        event: '总部验收通过',
      });
    }
  }
  if (history.length === 0) {
    history.push({ date: requirement.dueDate || '--', event: '等待机构提交材料' });
  }
  return history;
};

const toProject = (
  requirement: EvidenceRequirement,
  inspectionPlanId = requirement.inspectionPlanId ?? requirement.inspectionId,
  submissions: EvidenceSubmission[] = [],
  inspectionPlan?: InspectionPlan,
): MaterialProject => {
  const requirementId = requirement.requirementId ?? requirement.id;
  const submission = latestSubmissionFor(requirement, submissions);
  const submittedFile = submission?.files?.[0];
  const status = submission?.status === 'SUBMITTED'
    ? 'PENDING_VERIFICATION'
    : submission?.status ?? 'PENDING_RECTIFICATION';
  return {
    id: requirementId,
    requirementId,
    inspectionPlanId,
    mode: 'active',
    title: requirement.title,
    deadline: requirement.dueDate,
    status,
    rejectReason: submission?.hqFeedback,
    hqFiles: buildHqFiles(requirement, inspectionPlan),
    submittedPackage: submission ? {
      name: submittedFile?.fileName ?? submittedFile?.name ?? submission.fileIds?.[0] ?? '已提交材料包',
      size: formatFileSize((submittedFile as any)?.fileSize ?? submittedFile?.size),
      fileId: submittedFile?.fileId ?? submission.fileIds?.[0],
    } : null,
    history: buildHistory(requirement, submission, inspectionPlan),
  };
};

const extractInspectionPlanIds = (tasks: UnifiedTask[]): string[] => {
  const planIds = tasks.flatMap(task => {
    const params = task.actionTarget?.params ?? {};
    const sourceId = task.sourceId?.startsWith('INSP-PLAN') ? task.sourceId : undefined;
    return [
      params.inspectionPlanId,
      params.planId,
      (task as any).projectId,
      sourceId,
    ];
  });
  return [...new Set(planIds.filter((value): value is string => Boolean(value)))];
};

export default function OffsiteMaterialSubmission() {
  const [mode, setMode] = useState<ProjectMode>('active');
  const [projects, setProjects] = useState<MaterialProject[]>(API_MODE === 'mock' ? initialProjects : []);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const filteredProjects = projects.filter(p => p.mode === mode);
  
  const [selectedProjectId, setSelectedProjectId] = useState(
    filteredProjects.length > 0 ? filteredProjects[0].id : null
  );

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProjects = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);
    try {
      const nextProjects = API_MODE === 'mock'
        ? await inspectionApi.getEvidenceRequirements().then(async requirements => {
          if (requirements.length > 0) {
            const firstPlanId = requirements[0]?.inspectionPlanId ?? requirements[0]?.inspectionId;
            let inspectionPlan: InspectionPlan | undefined;
            if (firstPlanId) {
              try {
                inspectionPlan = await inspectionApi.getPlan(firstPlanId);
              } catch { /* mock 模式下 getPlan 可能不可用，忽略 */ }
            }
            return requirements.map(requirement => toProject(requirement, undefined, [], inspectionPlan));
          }
          return initialProjects;
        })
        : await taskApi.getBranchTasks('INSPECTION').then(async tasks => {
          const planIds = extractInspectionPlanIds(tasks);
          const groups = await Promise.all(
            planIds.map(async planId => {
              const detail = await inspectionApi.getExecutionDetail(planId);
              const requirements = detail.evidenceRequirements ?? [];
              const submissions = detail.evidenceSubmissions ?? [];
              const inspectionPlan = detail.inspectionPlan as InspectionPlan | undefined;
              return requirements.map((requirement: EvidenceRequirement) =>
                toProject(requirement, planId, submissions, inspectionPlan)
              );
            })
          );
          return groups.flat();
        });

      setProjects(nextProjects);
      setSelectedProjectId(previous =>
        nextProjects.some(project => project.id === previous)
          ? previous
          : nextProjects[0]?.id ?? null
      );
    } catch (error) {
      setProjects(API_MODE === 'mock' ? initialProjects : []);
      setSelectedProjectId(null);
      setLoadError(error instanceof Error ? error.message : '材料要求加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // When mode changes, auto-select the first item in the new list
  const handleModeSwitch = (newMode: ProjectMode) => {
    setMode(newMode);
    const firstOfMode = projects.find(p => p.mode === newMode);
    setSelectedProjectId(firstOfMode ? firstOfMode.id : null);
    setSelectedFile(null); // Clear selected file when switching context
  };

  const currentProject = projects.find(p => p.id === selectedProjectId) || filteredProjects[0];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (currentProject?.mode === 'archived') return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (currentProject?.mode === 'archived') return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !currentProject || currentProject.mode === 'archived') return;
    
    setIsSubmitting(true);

    try {
      const uploaded = await fileApi.uploadFile(selectedFile);
      await inspectionApi.submitEvidence((currentProject as any).requirementId || currentProject.id, [uploaded.fileId]);
      setSelectedFile(null);
      await loadProjects();
      toast.success('项目资料包上传成功，已流转至总部验收。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目资料包上传失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRealBackedHistory = API_MODE !== 'mock';

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'APPROVED': 
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 验收通过</span>;
      case 'REJECTED': 
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700"><AlertCircle className="w-3.5 h-3.5 mr-1" /> 被打回</span>;
      case 'PENDING_VERIFICATION': 
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700"><Clock className="w-3.5 h-3.5 mr-1" /> 审核中</span>;
      case 'CLOSED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-500"><FolderArchive className="w-3.5 h-3.5 mr-1" /> 已归档</span>;
      default: 
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700"><UploadCloud className="w-3.5 h-3.5 mr-1" /> 待上报</span>;
    }
  };

  const isUploadLocked = currentProject?.status === 'APPROVED' || currentProject?.status === 'PENDING_VERIFICATION';
  const isSubmitDisabled = !selectedFile || isUploadLocked;
  const submitButtonLabel = isSubmitting
    ? '正在提交...'
    : currentProject?.status === 'REJECTED'
      ? '重新提交报送'
      : '确认并提交报送';

  const handleDownloadSubmittedPackage = async (fileId?: string) => {
    if (!fileId) {
      toast.error('当前材料包尚未绑定真实文件资产。');
      return;
    }
    setDownloadingFileId(fileId);
    try {
      const download = await fileApi.getDownloadUrl(fileId);
      if (!download?.downloadUrl) {
        throw new Error('后端暂未签发下载地址');
      }
      window.open(download.downloadUrl, '_blank', 'noopener,noreferrer');
      toast.success('已签发文件下载地址。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '文件下载失败');
    } finally {
      setDownloadingFileId(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-slate-500" data-testid="materials-loading">材料要求加载中...</div>;
  }

  if (!currentProject) {
    return (
      <div className="p-8 text-slate-500" data-testid="materials-empty">
        当前机构暂无可报送的检查材料任务。
        {loadError ? <div className="mt-2 text-sm text-rose-600">{loadError}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] w-full overflow-hidden bg-white">
      {/* Left Column: Project Navigator */}
      <aside className="w-84 flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col h-full w-[340px]">
        {/* Header & Toggle */}
        <div className="p-4 bg-white border-b border-slate-200 shrink-0">
          <div className="flex bg-slate-100 p-1 rounded-lg mb-3">
            <button
              onClick={() => handleModeSwitch('active')}
              data-testid="materials-tab-active"
              className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${mode === 'active' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🔥 进行中计划
            </button>
            <button
              onClick={() => handleModeSwitch('archived')}
              data-testid="materials-tab-archived"
              className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${mode === 'archived' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🗄️ 历史归档
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索检查项目..." 
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
            />
          </div>
        </div>
        
        {/* Project List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
          {filteredProjects.map(proj => {
            const isSelected = proj.id === selectedProjectId;
            
            return (
              <div 
                key={proj.id}
                data-testid={`materials-project-${proj.id}`}
                onClick={() => {
                  setSelectedProjectId(proj.id);
                  setSelectedFile(null);
                }}
                className={`
                  p-4 border-b border-slate-100 cursor-pointer transition-colors
                  ${isSelected ? 'bg-indigo-50 border-r-2 border-r-indigo-600' : 'hover:bg-slate-100/50'}
                `}
              >
                <div className="flex justify-between items-start mb-2 gap-3">
                  <h4 className={`text-sm font-bold line-clamp-2 leading-snug ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>
                    {proj.title}
                  </h4>
                </div>
                <div className="flex items-center justify-between text-xs mt-3">
                  {proj.mode === 'active' ? (
                    <div className="flex items-center text-slate-500 font-medium">
                      <Clock className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                      截止: {proj.deadline}
                    </div>
                  ) : (
                    <div className="flex items-center text-slate-500 font-medium">
                      <FolderArchive className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                      {proj.year}
                    </div>
                  )}
                  <div className="shrink-0 scale-90 origin-right">
                    {getStatusBadge(proj.status)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right Column: Project Console */}
      <main className="flex-1 flex flex-col h-full bg-white overflow-hidden relative">
        
        {/* Watermark for Archived Mode */}
        {mode === 'archived' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[120px] font-black text-slate-50/50 pointer-events-none select-none z-0 transform -rotate-12">
            ARCHIVED
          </div>
        )}

        {/* Header Area */}
        <div className="px-8 py-6 border-b border-slate-100 shrink-0 relative z-10 bg-white/80 backdrop-blur-sm">
          {loadError && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700" data-testid="materials-load-error">
              {loadError}
            </div>
          )}
          <div className="flex justify-between items-start mb-2">
            <h2 className={`text-2xl font-bold ${mode === 'archived' ? 'text-slate-600' : 'text-slate-800'}`}>{currentProject.title}</h2>
            <div>{getStatusBadge(currentProject.status)}</div>
          </div>
          {mode === 'active' ? (
            <div className="text-sm text-slate-500 flex items-center mt-2">
              <Clock className="w-4 h-4 mr-1.5" /> 截止提交日期: <span className="font-bold text-slate-700 ml-1">{currentProject.deadline}</span>
            </div>
          ) : (
            <div className="text-sm text-slate-500 flex items-center mt-2 font-medium bg-slate-100 px-3 py-1 rounded inline-block">
              ⚠️ 该项目已结束，当前处于只读归档模式，材料不可更改。
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto w-full flex flex-col relative z-10">
          
          {/* Section B: Feedback Banner */}
          {mode === 'active' && currentProject.status === 'REJECTED' && (
            <div className="mx-8 mt-6 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start shadow-sm shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-500 mr-3 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-rose-700 mb-1">总部审核打回意见：</h4>
                <p className="text-sm text-rose-600 font-medium leading-relaxed">
                  {currentProject.rejectReason}
                </p>
              </div>
            </div>
          )}

          {/* Section A: HQ Reference Materials */}
          <div className="px-8 mt-8 shrink-0">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
              <Download className="w-4 h-4 mr-2 text-indigo-500" /> 总部下发要求与模板
            </h3>
            <div className="flex flex-wrap gap-3">
              {currentProject.hqFiles.map((file, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if (file.fileId) {
                      void handleDownloadSubmittedPackage(file.fileId);
                    } else {
                      toast.error('该文件尚未绑定真实文件资产，暂不支持下载。');
                    }
                  }}
                  className="flex items-center p-3 bg-white border border-slate-200 rounded-md shadow-sm hover:border-indigo-300 transition-colors cursor-pointer group w-full max-w-sm"
                >
                  <FileText className="w-5 h-5 text-slate-400 mr-3 shrink-0 group-hover:text-indigo-500 transition-colors" />
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="text-sm font-bold text-slate-700 truncate group-hover:text-indigo-700 transition-colors">{file.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{file.size}</div>
                  </div>
                  <Download className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Section C: Asset Submission Area */}
          <div className="px-8 py-8 flex-1 flex flex-col min-h-0">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center shrink-0">
              <UploadCloud className="w-4 h-4 mr-2 text-indigo-500" /> 报送资料包
            </h3>
            
            {mode === 'active' ? (
              <>
                <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-4 rounded-md border border-slate-100 shrink-0 font-medium">
                  请将该项目涉及的非现场材料按照清单要求整理后，<span className="text-indigo-600 font-bold">上传真实文件资产</span>。单个文件不超过 100MB。
                </p>

                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => {
                    if (!isUploadLocked) fileInputRef.current?.click();
                  }}
                  data-testid="materials-upload-dropzone"
                  className={`
                    border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer flex-1 min-h-[220px] max-h-[320px]
                    ${isDragging ? 'border-indigo-500 bg-indigo-50/80' : 'border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50/60'}
                    ${isUploadLocked ? 'opacity-70 cursor-not-allowed' : ''}
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    data-testid="materials-upload-input"
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files?.[0]) setSelectedFile(event.target.files[0]);
                      event.target.value = '';
                    }}
                  />
                  <div className={`p-4 rounded-full mb-4 transition-colors ${isDragging ? 'bg-indigo-200 text-indigo-700' : 'bg-white border border-indigo-100 text-indigo-500 shadow-sm'}`}>
                    <FileArchive className={`w-8 h-8 ${isDragging ? 'animate-bounce' : ''}`} />
                  </div>
                  <h4 className={`text-base font-bold mb-1 ${isDragging ? 'text-indigo-800' : 'text-slate-700'}`}>
                    点击或拖拽上传材料文件
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mb-6">
                    {isUploadLocked ? '该材料当前已提交/已通过，需总部退回后才能重传。' : '当前限制: 100MB；支持 PDF、DOCX、XLSX、PNG/JPG、TXT'}
                  </p>

                  {/* File Selection Status */}
                  <div className="flex flex-col items-center w-full max-w-lg gap-3">
                    {currentProject.status === 'REJECTED' && isRealBackedHistory && !selectedFile && (
                      <div className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                        最新材料已被总部退回，请选择新文件重新提交。
                      </div>
                    )}
                    {/* Already submitted file placeholder before new selection */}
                    {currentProject.submittedPackage && !selectedFile && (
                      <div className="w-full flex items-center p-3 bg-white border border-slate-200 rounded-md shadow-sm">
                        <FileArchive className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
                        <div className="flex-1 min-w-0 flex flex-col items-start pr-3">
                          <span className="text-sm font-bold text-slate-700 truncate w-full text-left">
                            {currentProject.submittedPackage.name}
                          </span>
                          <span className="text-xs text-slate-500 mt-0.5">{currentProject.submittedPackage.size}</span>
                        </div>
                        {currentProject.status !== 'APPROVED' && currentProject.status !== 'PENDING_VERIFICATION' && (
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">上一版本</span>
                        )}
                        {(currentProject.status === 'APPROVED' || currentProject.status === 'PENDING_VERIFICATION') && (
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">已提交</span>
                        )}
                        {currentProject.submittedPackage.fileId && (
                          <button
                            type="button"
                            data-testid="materials-submitted-download"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDownloadSubmittedPackage(currentProject.submittedPackage?.fileId);
                            }}
                            disabled={downloadingFileId === currentProject.submittedPackage.fileId}
                            className="ml-2 inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {downloadingFileId === currentProject.submittedPackage.fileId ? '签发中' : '下载'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Newly dragged file */}
                    {selectedFile && (
                      <div className="w-full flex items-center p-3 bg-white border border-indigo-400 rounded-md shadow-sm relative group ring-2 ring-indigo-500/20">
                        <Check className="w-5 h-5 text-emerald-500 mr-3 shrink-0" />
                        <div className="flex flex-col items-start truncate overflow-hidden flex-1 pr-8">
                          <span className="text-sm font-bold text-indigo-900 truncate w-full text-left">
                            {selectedFile.name}
                          </span>
                          <span className="text-xs text-indigo-600 font-medium mt-0.5">即将覆盖上传</span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                          className="absolute right-3 p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              // Archived Mode Submission Area
              <div className="border border-slate-200 rounded-lg p-5 bg-slate-50 flex items-center justify-between shadow-sm">
                <div className="flex items-center">
                  <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm mr-4">
                    <FileArchive className="w-8 h-8 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-base mb-1">{currentProject.submittedPackage?.name || '无材料包'}</h4>
                    <span className="text-xs text-slate-500 font-medium">文件大小: {currentProject.submittedPackage?.size || '--'} • 于项目结项前最终固化</span>
                  </div>
                </div>
                {currentProject.submittedPackage && (
                  <Button variant="outline" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 shadow-sm font-bold">
                    <Download className="w-4 h-4 mr-2" /> 下载备份
                  </Button>
                )}
              </div>
            )}
            
            {/* Section D: Status History Timeline */}
            <div className="mt-8 shrink-0">
              <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
                <Clock className="w-4 h-4 mr-2 text-slate-400" /> 交互走查历史
              </h4>
              <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2 text-sm text-slate-600 bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                {currentProject.history.map((h, i) => (
                  <React.Fragment key={i}>
                    <div className="flex items-center">
                      <span className="font-mono text-slate-400 mr-2 text-xs bg-white px-1.5 rounded border border-slate-200 shadow-sm">{h.date}</span>
                      <span className="font-bold text-slate-700">{h.event}</span>
                    </div>
                    {i < currentProject.history.length - 1 && (
                      <div className="hidden sm:block text-slate-300 font-bold mx-2">
                        →
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
            
          </div>
        </div>

        {/* Bottom Action (Only visible in active mode) */}
        {mode === 'active' && (
          <div className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0 relative z-10">
            <Button 
              disabled={isSubmitDisabled || isSubmitting}
              onClick={handleSubmit}
              data-testid="materials-submit-button"
              className={`min-w-[140px] font-bold ${
                isSubmitDisabled 
                ? 'bg-slate-200 text-slate-400 hover:bg-slate-200' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
              }`}
            >
              {submitButtonLabel}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

