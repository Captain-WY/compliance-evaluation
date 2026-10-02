
import React, { useEffect, useState, useMemo } from 'react';
import {
  getDossierTree, listDossierDocuments, uploadDocument, createDossierFolder,
  deleteDossierDocument, renameDocument, moveDocument,
  getDocumentDownloadUrl, getDocumentPreviewUrl,
  checkDocumentPermission, requestDocumentAccess, generateEvidenceCatalog,
  type DossierFolder, type DossierItem,
} from '../../services/case';
import * as XLSX from 'xlsx';
import { useAuth } from '../../src/hooks/useAuth';
import { CaseStage } from '../../types';
import { toast } from 'sonner';
import {
  Folder, FolderOpen, FileText, Download, Eye, Search, Upload,
  Trash2, X, Image as ImageIcon, FileSpreadsheet, Lock,
  Loader2, ChevronRight, FolderPlus, Briefcase, CheckSquare, Square, Key, Shield, Send,
  MoreHorizontal, Pencil, ArrowRightLeft, FileUp,
} from 'lucide-react';
import DocumentPreviewModal from './components/DocumentPreviewModal';
import type { PreviewFileType } from './components/DocumentPreviewModal';
import Button from '../../components/ui/Button';

interface ElectronicDossierProps {
  caseId: string;
  stage?: CaseStage;
}

type DocPerm = 'VIEW' | 'DOWNLOAD' | 'EDIT' | null;

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp',
  '.txt', '.rtf', '.csv', '.md',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.wmv',
  '.zip', '.rar', '.7z', '.tar', '.gz',
];

const mapToPreviewType = (type: string): PreviewFileType => {
  const t = type.toLowerCase();
  if (t === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(t)) return t as PreviewFileType;
  if (['xls', 'xlsx'].includes(t)) return t as PreviewFileType;
  if (['ppt', 'pptx'].includes(t)) return t as PreviewFileType;
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(t)) return t as PreviewFileType;
  if (['txt', 'csv', 'md', 'rtf'].includes(t)) return t as PreviewFileType;
  if (['mp3', 'wav'].includes(t)) return t as PreviewFileType;
  if (['mp4', 'avi', 'mov', 'wmv'].includes(t)) return t as PreviewFileType;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(t)) return t as PreviewFileType;
  return 'other';
};

const ElectronicDossier: React.FC<ElectronicDossierProps> = ({ caseId, stage }) => {
  const { user: currentUser } = useAuth();
  const isReadonly = stage === CaseStage.CLOSED || stage === CaseStage.ARCHIVED;

  const [dossierTree, setDossierTree] = useState<DossierFolder[]>([]);
  const [currentFolderDocs, setCurrentFolderDocs] = useState<DossierItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);

  // Selection
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [activeDocForAction, setActiveDocForAction] = useState<DossierItem | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  // Forms
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Permission
  const [selectedDocPermission, setSelectedDocPermission] = useState<DocPerm>(null);
  const [permLoading, setPermLoading] = useState(false);

  // Request form
  const [requestReason, setRequestReason] = useState('');
  const [requestPermission, setRequestPermission] = useState<'VIEW' | 'DOWNLOAD'>('VIEW');
  const [isRequesting, setIsRequesting] = useState(false);

  // --- Init ---

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const tree = await getDossierTree(caseId);
        setDossierTree(tree);
        if (tree.length > 0) {
          const first = tree[0];
          setSelectedCategory(first.name);
          setSelectedCategoryId(first.id);
          setCurrentFolderId(first.id);
          const docs = await listDossierDocuments(caseId, first.id);
          setCurrentFolderDocs(docs);
        }
      } catch {
        // apiClient 拦截器已 toast.error
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [caseId]);

  // 点击外部关闭操作菜单
  useEffect(() => {
    const handler = () => setActionMenuOpen(null);
    if (actionMenuOpen) {
      window.addEventListener('click', handler);
      return () => window.removeEventListener('click', handler);
    }
  }, [actionMenuOpen]);

  const loadFolderDocs = async (folderId: string) => {
    try {
      const docs = await listDossierDocuments(caseId, folderId);
      setCurrentFolderDocs(docs);
    } catch {
      //
    }
  };

  // --- Derived Data ---

  const findFolderChildren = (folders: DossierFolder[], targetId: string): DossierFolder[] | null => {
    for (const f of folders) {
      if (f.id === targetId) return f.children;
      const found = findFolderChildren(f.children, targetId);
      if (found !== null) return found;
    }
    return null;
  };

  const currentSubFolders = useMemo<DossierFolder[]>(() => {
    if (!currentFolderId) return [];
    return findFolderChildren(dossierTree, currentFolderId) ?? [];
  }, [dossierTree, currentFolderId]);

  const currentItems = useMemo<DossierItem[]>(() => {
    const subFolderItems: DossierItem[] = currentSubFolders.map(f => ({
      id: f.id,
      name: f.name,
      type: 'folder',
      size: '',
      uploadDate: '',
      uploader: '',
      isFolder: true,
      documentCount: f.documentCount,
    }));
    const docs = [...currentFolderDocs].sort((a, b) => {
      if (a.evidenceNo && b.evidenceNo)
        return a.evidenceNo.localeCompare(b.evidenceNo, undefined, { numeric: true });
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    return [...subFolderItems, ...docs];
  }, [currentSubFolders, currentFolderDocs]);

  const selectedDoc = useMemo(
    () => currentFolderDocs.find(d => d.id === selectedFileId),
    [currentFolderDocs, selectedFileId],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    dossierTree.forEach(f => { counts[f.name] = f.documentCount; });
    return counts;
  }, [dossierTree]);

  // --- Handlers: Navigation ---

  const handleCategoryClick = async (folder: DossierFolder) => {
    setSelectedCategory(folder.name);
    setSelectedCategoryId(folder.id);
    setCurrentFolderId(folder.id);
    setFolderStack([]);
    setSelectedFileId(null);
    setSelectedRowIds(new Set());
    setSelectedDocPermission(null);
    await loadFolderDocs(folder.id);
  };

  const handleFolderClick = async (item: DossierItem) => {
    setCurrentFolderId(item.id);
    setFolderStack([...folderStack, { id: item.id, name: item.name }]);
    setSelectedFileId(null);
    setSelectedRowIds(new Set());
    setSelectedDocPermission(null);
    await loadFolderDocs(item.id);
  };

  const handleBreadcrumbClick = async (index: number) => {
    let targetId: string | null;
    let newStack: { id: string; name: string }[];
    if (index === -1) {
      targetId = selectedCategoryId;
      newStack = [];
    } else {
      const target = folderStack[index];
      targetId = target.id;
      newStack = folderStack.slice(0, index + 1);
    }
    setCurrentFolderId(targetId);
    setFolderStack(newStack);
    setSelectedRowIds(new Set());
    setSelectedDocPermission(null);
    if (targetId) await loadFolderDocs(targetId);
  };

  // --- Handlers: Selection ---

  const toggleSelectRow = (id: string) => {
    const newSet = new Set(selectedRowIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedRowIds(newSet);
    if (newSet.size === 1) {
      const singleId = Array.from(newSet)[0];
      const singleDoc = currentFolderDocs.find(d => d.id === singleId);
      if (singleDoc) handleFileClick(singleDoc);
    } else {
      setSelectedFileId(null);
    }
  };

  const handleFileClick = async (doc: DossierItem) => {
    if (!doc || doc.isFolder) return;
    setSelectedFileId(doc.id);
    setSelectedDocPermission(null);
    setPermLoading(true);
    try {
      const perm = await checkDocumentPermission(caseId, doc.id);
      setSelectedDocPermission(perm);
    } catch {
      //
    } finally {
      setPermLoading(false);
    }
  };

  // --- Handlers: CRUD ---

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createDossierFolder(caseId, currentFolderId ?? undefined, newFolderName.trim());
      setNewFolderName('');
      setIsCreateFolderOpen(false);
      const tree = await getDossierTree(caseId);
      setDossierTree(tree);
    } catch {
      //
    }
  };

  const validateFileType = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(`不支持的文件类型: ${ext}。允许的类型: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return false;
    }
    return true;
  };

  const handleUpload = async () => {
    if (!uploadFile || !currentFolderId) return;
    if (!validateFileType(uploadFile)) {
      setUploadFile(null);
      return;
    }
    setIsUploading(true);
    try {
      const evidenceNo = selectedCategory === '证据卷'
        ? `A-${currentFolderDocs.length + 1}`
        : undefined;
      await uploadDocument(caseId, currentFolderId, uploadFile, { evidenceNo });
      setIsUploadModalOpen(false);
      setUploadFile(null);
      await loadFolderDocs(currentFolderId);
      const tree = await getDossierTree(caseId);
      setDossierTree(tree);
    } catch {
      //
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (!window.confirm(`确认删除选中的 ${ids.length} 个文件/文件夹？此操作不可恢复。`)) return;
    try {
      for (const id of ids) {
        await deleteDossierDocument(id);
      }
      setSelectedRowIds(new Set());
      setSelectedFileId(null);
      setSelectedDocPermission(null);
      if (currentFolderId) await loadFolderDocs(currentFolderId);
    } catch {
      //
    }
  };

  const handleRename = async () => {
    if (!activeDocForAction || !newFolderName.trim()) return;
    try {
      await renameDocument(activeDocForAction.id, newFolderName.trim());
      setNewFolderName('');
      setIsRenameModalOpen(false);
      setActiveDocForAction(null);
      if (currentFolderId) await loadFolderDocs(currentFolderId);
    } catch {
      //
    }
  };

  const handleMove = async (targetFolderId: string) => {
    if (!activeDocForAction) return;
    try {
      await moveDocument(activeDocForAction.id, targetFolderId);
      setIsMoveModalOpen(false);
      setActiveDocForAction(null);
      if (currentFolderId) await loadFolderDocs(currentFolderId);
      const tree = await getDossierTree(caseId);
      setDossierTree(tree);
    } catch {
      //
    }
  };

  const handleUploadVersion = async () => {
    if (!uploadFile || !currentFolderId || !activeDocForAction) return;
    if (!validateFileType(uploadFile)) {
      setUploadFile(null);
      return;
    }
    setIsUploading(true);
    try {
      await uploadDocument(caseId, currentFolderId, uploadFile, {
        parentDocId: activeDocForAction.id,
      });
      setIsUploadModalOpen(false);
      setUploadFile(null);
      setActiveDocForAction(null);
      await loadFolderDocs(currentFolderId);
      const tree = await getDossierTree(caseId);
      setDossierTree(tree);
    } catch {
      //
    } finally {
      setIsUploading(false);
    }
  };

  // --- Handlers: Permission-Aware Actions ---

  const checkAccessAndProceed = async (action: 'PREVIEW' | 'DOWNLOAD') => {
    if (!selectedDoc) return;
    if (!selectedDocPermission) {
      setIsRequestModalOpen(true);
      return;
    }
    if (action === 'DOWNLOAD' && selectedDocPermission === 'VIEW') {
      alert('您仅有预览权限，无法下载源文件。');
      return;
    }
    setIsDownloading(true);
    try {
      if (action === 'PREVIEW') {
        const url = await getDocumentPreviewUrl(selectedDoc.id);
        if (url) {
          setPreviewUrl(url);
          setIsPreviewOpen(true);
        }
      } else {
        const url = await getDocumentDownloadUrl(selectedDoc.id);
        if (url) window.open(url, '_blank');
      }
    } catch {
      //
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedDoc || !requestReason.trim()) return;
    setIsRequesting(true);
    try {
      await requestDocumentAccess({
        caseId,
        docId: selectedDoc.id,
        requestedPermission: requestPermission,
        reason: requestReason.trim(),
      });
      setIsRequestModalOpen(false);
      setRequestReason('');
      alert('权限申请已提交，请等待审批。');
    } catch {
      //
    } finally {
      setIsRequesting(false);
    }
  };

  const handleGenerateEvidenceCatalog = async () => {
    setIsDownloading(true);
    try {
      const data = await generateEvidenceCatalog(caseId);
      const items: any[] = data?.items ?? [];
      if (items.length === 0) {
        toast.info('该案件暂无证据文档');
        return;
      }

      const rows = items.map((it: any, idx: number) => ({
        序号: idx + 1,
        证据编号: it.evidenceNo || '-',
        证据名称: it.docName,
        证明目的: it.proofPurpose || '-',
        文件类型: it.docType?.toUpperCase() || '-',
        文件大小: it.docSize ? `${(it.docSize / 1024).toFixed(1)} KB` : '-',
        上传人: it.uploaderName || '-',
        上传时间: it.uploadTime ? new Date(it.uploadTime).toLocaleDateString() : '-',
        所在位置: it.folderPath || '-',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '证据目录');

      const caseName = data?.caseName || caseId;
      const fileName = `证据目录_${caseName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch {
      toast.error('生成证据目录失败，请稍后重试');
    } finally {
      setIsDownloading(false);
    }
  };

  // --- Icons ---

  const getFileIcon = (type: string) => {
    if (type === 'folder') return <Folder className="w-5 h-5 text-blue-400 fill-blue-50" />;
    if (type === 'pdf') return <FileText className="w-5 h-5 text-red-500" />;
    if (type === 'docx' || type === 'doc') return <FileText className="w-5 h-5 text-blue-600" />;
    if (type === 'xlsx' || type === 'xls') return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    if (['jpg', 'png'].includes(type)) return <ImageIcon className="w-5 h-5 text-purple-600" />;
    return <FileText className="w-5 h-5 text-slate-400" />;
  };

  const permLabel = (perm: DocPerm) => {
    if (perm === 'EDIT') return '完全访问 (编辑/下载/预览)';
    if (perm === 'DOWNLOAD') return '下载/预览';
    if (perm === 'VIEW') return '仅预览';
    return null;
  };

  return (
    <div className="flex h-[700px] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm relative">

      {/* 1. Left Sidebar: Directories */}
      <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> 卷宗目录
          </h4>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && dossierTree.length === 0 ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : (
            dossierTree.map(folder => (
              <div key={folder.id}>
                <button
                  onClick={() => handleCategoryClick(folder)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors group ${
                    selectedCategoryId === folder.id
                      ? 'bg-white text-brand-700 font-bold shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {folder.name === '内部卷' ? <Lock className="w-4 h-4 text-amber-500" /> :
                     selectedCategoryId === folder.id ? <FolderOpen className="w-4 h-4 text-brand-500" /> :
                     <Folder className="w-4 h-4 text-slate-400" />}
                    {folder.name}
                  </div>
                  {categoryCounts[folder.name] > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      selectedCategoryId === folder.id
                        ? 'bg-brand-100 text-brand-700'
                        : 'bg-slate-200 text-slate-500 group-hover:bg-slate-300'
                    }`}>
                      {categoryCounts[folder.name]}
                    </span>
                  )}
                </button>
                {selectedCategoryId === folder.id && folder.children.length > 0 && (
                  <div className="ml-6 border-l border-slate-200 pl-2 mt-1 space-y-1">
                    {folder.children.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => handleFolderClick({
                          id: sub.id, name: sub.name, type: 'folder',
                          size: '', uploadDate: '', uploader: '', isFolder: true,
                        })}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors ${
                          currentFolderId === sub.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <Folder className="w-3 h-3" />
                        {sub.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. Middle: File List */}
      <div className="flex-1 flex flex-col border-r border-slate-200 min-w-0 bg-white relative">
        {/* Toolbar */}
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-white z-10 relative">
          <div className="flex items-center gap-2 overflow-hidden flex-1 mr-4">
            <button onClick={() => handleBreadcrumbClick(-1)} className="p-1 hover:bg-slate-100 rounded text-slate-500">
              <Folder className="w-4 h-4" />
            </button>
            {folderStack.map((f, i) => (
              <div key={f.id} className="flex items-center text-sm text-slate-600">
                <ChevronRight className="w-4 h-4 text-slate-300" />
                <button onClick={() => handleBreadcrumbClick(i)} className="hover:text-brand-600 px-1 truncate max-w-[100px]">
                  {f.name}
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateEvidenceCatalog}
              disabled={isDownloading}
              className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded"
              title="生成证据目录"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
            {!isReadonly && (
              <>
                {selectedRowIds.size > 0 && (
                  <Button
                    size="sm" variant="ghost"
                    className="text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50 border-r border-slate-200 mr-1 pr-3"
                    onClick={() => handleDelete(Array.from(selectedRowIds))}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> 删除 ({selectedRowIds.size})
                  </Button>
                )}
                <button onClick={() => setIsCreateFolderOpen(true)} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded" title="新建文件夹">
                  <FolderPlus className="w-4 h-4" />
                </button>
                <button onClick={() => setIsUploadModalOpen(true)} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded" title="上传文件">
                  <Upload className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* List Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex text-xs font-bold text-slate-500 items-center">
          <div className="w-8 flex justify-center">
            <Square className="w-4 h-4 text-slate-300" />
          </div>
          <div className="flex-1 pl-2">名称</div>
          <div className="w-12 text-center">版本</div>
          <div className="w-20 text-right">大小</div>
          <div className="w-24 text-right">日期</div>
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto pb-24 scroll-smooth" onClick={() => setSelectedFileId(null)}>
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm">加载中...</p>
            </div>
          ) : currentItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <FolderOpen className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm">暂无文件</p>
            </div>
          ) : (
            currentItems.map(doc => (
              <div
                key={doc.id}
                className={`flex items-center px-4 py-2.5 border-b border-slate-50 text-sm hover:bg-slate-50 cursor-pointer group transition-colors ${
                  selectedFileId === doc.id ? 'bg-blue-50/60' : ''
                }`}
                onClick={e => {
                  e.stopPropagation();
                  if (doc.isFolder) handleFolderClick(doc);
                  else handleFileClick(doc);
                }}
              >
                <div className="w-8 flex justify-center" onClick={e => { e.stopPropagation(); if (!doc.isFolder) toggleSelectRow(doc.id); }}>
                  {selectedRowIds.has(doc.id)
                    ? <CheckSquare className="w-4 h-4 text-brand-600" />
                    : <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />}
                </div>

                <div className="flex-1 flex items-center gap-3 min-w-0 pl-2">
                  {getFileIcon(doc.type)}
                  <span className={`truncate ${doc.isFolder ? 'font-bold text-slate-700' : 'text-slate-600'}`}>
                    {doc.name}
                  </span>
                  {doc.evidenceNo && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded border border-amber-200 shrink-0">
                      {doc.evidenceNo}
                    </span>
                  )}
                </div>

                <div className="w-12 text-center text-xs text-slate-400">
                  {!doc.isFolder && doc.version ? `v${doc.version}` : ''}
                </div>

                <div className="w-20 text-right text-xs text-slate-400 font-mono">
                  {doc.size}
                </div>

                <div className="w-24 text-right text-xs text-slate-400">
                  {doc.uploadDate}
                </div>

                <div className="w-8 flex justify-center relative">
                  {!doc.isFolder && !isReadonly && (
                    <div className="relative">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setActionMenuOpen(actionMenuOpen === doc.id ? null : doc.id);
                        }}
                        className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {actionMenuOpen === doc.id && (
                        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setActionMenuOpen(null);
                              setActiveDocForAction(doc);
                              setNewFolderName(doc.name);
                              setIsRenameModalOpen(true);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Pencil className="w-3 h-3" /> 重命名
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setActionMenuOpen(null);
                              setActiveDocForAction(doc);
                              setIsMoveModalOpen(true);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <ArrowRightLeft className="w-3 h-3" /> 移动到...
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setActionMenuOpen(null);
                              setActiveDocForAction(doc);
                              setIsUploadModalOpen(true);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <FileUp className="w-3 h-3" /> 上传新版本
                          </button>
                          <div className="border-t border-slate-100 my-1" />
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setActionMenuOpen(null);
                              if (window.confirm(`确认删除 ${doc.name}？此操作不可恢复。`)) {
                                handleDelete([doc.id]);
                              }
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-3 h-3" /> 删除
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Right: Inspector Panel */}
      <div className="w-80 bg-slate-50 flex flex-col border-l border-slate-200 shrink-0 transition-all">
        {selectedDoc ? (
          <>
            <div className="p-6 border-b border-slate-200 bg-white text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-xl mx-auto flex items-center justify-center mb-4 shadow-inner">
                {getFileIcon(selectedDoc.type)}
              </div>
              <h3 className="font-bold text-slate-800 break-words line-clamp-2 px-2">{selectedDoc.name}</h3>
              <p className="text-xs text-slate-500 mt-2">{selectedDoc.size} • {selectedDoc.type.toUpperCase()}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* Permission Status Card */}
              <div className={`rounded-lg border p-3 ${
                permLoading ? 'bg-slate-50 border-slate-200' :
                !selectedDocPermission ? 'bg-slate-100 border-slate-200' :
                'bg-emerald-50 border-emerald-200'
              }`}>
                <h5 className="text-xs font-bold uppercase mb-1 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> 访问权限
                </h5>
                {permLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> 检查中...
                  </div>
                ) : !selectedDocPermission ? (
                  <p className="text-xs text-slate-500">您没有此文档的访问权限。</p>
                ) : (
                  <p className="text-xs font-bold text-slate-700">{permLabel(selectedDocPermission)}</p>
                )}
              </div>

              {/* Meta Section */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-slate-400 uppercase">基础元数据</h5>
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">上传人</span>
                    <span className="text-slate-800">{selectedDoc.uploader}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">上传时间</span>
                    <span className="text-slate-800">{selectedDoc.uploadDate}</span>
                  </div>
                  {selectedDoc.version && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">版本</span>
                      <span className="text-slate-800">v{selectedDoc.version}</span>
                    </div>
                  )}
                  {selectedDoc.evidenceNo && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">证据编号</span>
                      <span className="text-amber-600 font-medium">{selectedDoc.evidenceNo}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-4">
                <Button
                  className="w-full"
                  onClick={() => checkAccessAndProceed('PREVIEW')}
                  variant={!selectedDocPermission ? 'secondary' : 'primary'}
                  disabled={isDownloading}
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> :
                   selectedDocPermission ? <Eye className="w-4 h-4 mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                  {selectedDocPermission ? '安全预览' : '申请查看权限'}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => checkAccessAndProceed('DOWNLOAD')}
                  disabled={isDownloading}
                >
                  <Download className="w-4 h-4 mr-2" /> 下载文件
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Search className="w-6 h-6 opacity-30" />
            </div>
            <p className="text-sm font-medium">选择文件查看详情</p>
            <p className="text-xs mt-2 opacity-70">支持细粒度权限控制与审计。</p>
          </div>
        )}
      </div>

      {/* --- Request Modal --- */}
      {isRequestModalOpen && selectedDoc && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-[400px]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Key className="w-5 h-5 text-brand-600" /> 申请访问权限
              </h3>
              <button onClick={() => setIsRequestModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                您正在申请访问 <span className="font-bold text-slate-800">{selectedDoc.name}</span>。
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">申请权限级别</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRequestPermission('VIEW')}
                    className={`flex-1 py-2 text-xs rounded border ${requestPermission === 'VIEW' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-slate-200'}`}
                  >
                    仅预览
                  </button>
                  <button
                    onClick={() => setRequestPermission('DOWNLOAD')}
                    className={`flex-1 py-2 text-xs rounded border ${requestPermission === 'DOWNLOAD' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-slate-200'}`}
                  >
                    下载/打印
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">申请事由 (必填)</label>
                <textarea
                  className="w-full border border-slate-300 rounded p-2 text-sm h-20 outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="请详细说明查阅原因..."
                  value={requestReason}
                  onChange={e => setRequestReason(e.target.value)}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 rounded-b-xl">
              <Button variant="ghost" onClick={() => setIsRequestModalOpen(false)}>取消</Button>
              <Button onClick={handleSubmitRequest} isLoading={isRequesting} disabled={!requestReason.trim()}>
                <Send className="w-4 h-4 mr-1" /> 提交申请
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {isCreateFolderOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h3 className="font-bold text-slate-800 mb-4">新建文件夹</h3>
            <input
              autoFocus
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-brand-500 mb-4"
              placeholder="输入文件夹名称"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setIsCreateFolderOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleCreateFolder}>创建</Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-96 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800">{activeDocForAction ? '上传新版本' : '上传文件'}</h3>
              <button onClick={() => { setIsUploadModalOpen(false); setActiveDocForAction(null); }}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            {activeDocForAction && (
              <div className="bg-slate-50 p-3 rounded text-xs text-slate-600 mb-4">
                为 <span className="font-bold">{activeDocForAction.name}</span> 上传新版本
              </div>
            )}
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50 hover:bg-white transition-colors relative mb-4">
              <input
                type="file"
                accept={ALLOWED_EXTENSIONS.join(',')}
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={e => e.target.files && setUploadFile(e.target.files[0])}
              />
              {uploadFile ? (
                <div className="text-brand-600">
                  <FileText className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm truncate">{uploadFile.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="text-slate-400">
                  <Upload className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">点击选择文件</p>
                </div>
              )}
            </div>
            <Button
              className="w-full"
              onClick={activeDocForAction ? handleUploadVersion : handleUpload}
              disabled={!uploadFile || isUploading}
              isLoading={isUploading}
            >
              {activeDocForAction ? '确认上传新版本' : '确认上传至当前目录'}
            </Button>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {isRenameModalOpen && activeDocForAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h3 className="font-bold text-slate-800 mb-4">重命名文件</h3>
            <input
              autoFocus
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-brand-500 mb-4"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setIsRenameModalOpen(false); setActiveDocForAction(null); }}>取消</Button>
              <Button size="sm" onClick={handleRename}>确认</Button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {isMoveModalOpen && activeDocForAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80 max-h-[60vh] flex flex-col">
            <h3 className="font-bold text-slate-800 mb-4">移动到文件夹</h3>
            <div className="flex-1 overflow-y-auto space-y-1 mb-4">
              {dossierTree.map(folder => (
                <div key={folder.id}>
                  <button
                    onClick={() => handleMove(folder.id)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded flex items-center gap-2"
                  >
                    <Folder className="w-4 h-4 text-slate-400" />
                    {folder.name}
                  </button>
                  {folder.children.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => handleMove(sub.id)}
                      className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 rounded flex items-center gap-2 ml-6"
                    >
                      <Folder className="w-3 h-3 text-slate-400" />
                      {sub.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setIsMoveModalOpen(false); setActiveDocForAction(null); }}>取消</Button>
            </div>
          </div>
        </div>
      )}

      {/* Secure Preview Modal */}
      {isPreviewOpen && selectedDoc && (
        <DocumentPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => { setIsPreviewOpen(false); setPreviewUrl(null); }}
          previewUrl={previewUrl}
          fileName={selectedDoc.name}
          fileType={mapToPreviewType(selectedDoc.type)}
          onDownload={() => checkAccessAndProceed('DOWNLOAD')}
        />
      )}

    </div>
  );
};

export default ElectronicDossier;
