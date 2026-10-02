import React, { useEffect, useState, useRef } from 'react';
import {
  listInboxEmails,
  getInboxEmailDetail,
  convertEmailToClue,
  linkEmailToCase,
  ignoreEmail,
  listAttachments,
  deleteAttachment,
  type InboxEmailRecord,
  type AttachmentRecord,
} from '../../services/case';
import { useFileUpload } from '../../src/hooks/useFileUpload';
import {
  Mail, Search, Paperclip, Sparkles, AlertTriangle, Inbox,
  Trash2, CheckCircle2, FileText, X, MoreHorizontal, Loader2,
  Tag, Link2, Upload,
} from 'lucide-react';
import Button from '../../components/ui/Button';

// ── Link-to-Case Modal ──────────────────────────────────────────────────────

interface LinkCaseModalProps {
  onConfirm: (caseId: string, note: string) => void;
  onClose: () => void;
  isProcessing: boolean;
}

const LinkCaseModal: React.FC<LinkCaseModalProps> = ({ onConfirm, onClose, isProcessing }) => {
  const [caseId, setCaseId] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-brand-500" /> 关联到案件
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">案件 ID <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none font-mono"
              placeholder="请输入案件 UUID"
              value={caseId}
              onChange={e => setCaseId(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">备注（可选）</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="例：该邮件为一审判决书"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            onClick={() => caseId.trim() && onConfirm(caseId.trim(), note)}
            disabled={!caseId.trim()}
            isLoading={isProcessing}
          >
            确认关联
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Convert-to-Clue Modal ───────────────────────────────────────────────────

interface ConvertClueModalProps {
  email: InboxEmailRecord;
  onConfirm: (params: { clueTitle: string; description: string; opponentName: string; estimatedAmount: string }) => void;
  onClose: () => void;
  isProcessing: boolean;
}

const ConvertClueModal: React.FC<ConvertClueModalProps> = ({ email, onConfirm, onClose, isProcessing }) => {
  const [form, setForm] = useState({
    clueTitle: email.subject,
    description: email.aiSummary || '',
    opponentName: '',
    estimatedAmount: '',
  });
  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-500" /> 转入线索池
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">线索标题 <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              value={form.clueTitle}
              onChange={e => setForm({ ...form, clueTitle: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">描述（可选）</label>
            <textarea
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none h-20"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">对方当事人</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="可选"
                value={form.opponentName}
                onChange={e => setForm({ ...form, opponentName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">预估金额 (元)</label>
              <input
                type="number"
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="可选"
                value={form.estimatedAmount}
                onChange={e => setForm({ ...form, estimatedAmount: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            onClick={() => form.clueTitle.trim() && onConfirm(form)}
            disabled={!form.clueTitle.trim()}
            isLoading={isProcessing}
          >
            确认转入
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────

type FilterTab = 'UNPROCESSED' | 'PROCESSED' | 'ALL';

const PROCESSING_STATUS_STYLE: Record<string, string> = {
  UNPROCESSED: 'bg-amber-50 text-amber-700 border-amber-200',
  CONVERTED_TO_CLUE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LINKED_TO_CASE: 'bg-brand-50 text-brand-700 border-brand-200',
  IGNORED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const AI_REC_STYLE: Record<string, string> = {
  SUGGEST_CLUE: 'text-amber-600 bg-amber-50 border-amber-200',
  SUGGEST_LINK: 'text-brand-600 bg-brand-50 border-brand-200',
  SPAM: 'text-red-500 bg-red-50 border-red-200',
  INFO: 'text-slate-500 bg-slate-50 border-slate-200',
};

const SmartInbox: React.FC = () => {
  const [emails, setEmails] = useState<InboxEmailRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState<InboxEmailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('UNPROCESSED');
  const [searchQuery, setSearchQuery] = useState('');
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  // S18 附件状态 / 4.S2 直传
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const { uploading: attachUploading, uploadFiles } = useFileUpload({ businessType: 'INBOX_EMAIL' });
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { loadEmails(); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        showActionMenu &&
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setShowActionMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActionMenu]);

  const loadEmails = async () => {
    setLoading(true);
    const result = await listInboxEmails();
    setEmails(result.items);
    setUnreadCount(result.unreadCount);
    if (result.items.length > 0) {
      const first = result.items.find(e => e.processingStatus === 'UNPROCESSED') ?? result.items[0];
      handleSelectEmail(first);
    }
    setLoading(false);
  };

  const handleSelectEmail = async (email: InboxEmailRecord) => {
    setSelectedEmail(email);
    setShowActionMenu(false);
    setAttachments([]);
    setDetailLoading(true);
    const detail = await getInboxEmailDetail(email.emailId);
    setDetailLoading(false);
    if (detail) {
      setSelectedEmail(detail);
      if (!email.isRead) {
        setEmails(prev => prev.map(e => e.emailId === detail.emailId ? { ...e, isRead: true } : e));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    }
    // 加载附件列表
    setAttachLoading(true);
    const res = await listAttachments({ businessType: 'INBOX_EMAIL', businessId: email.emailId });
    setAttachments(res.items);
    setAttachLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedEmail || !e.target.files) return;
    const files = Array.from(e.target.files);
    const uploaded = await uploadFiles(files, selectedEmail.emailId);
    if (uploaded.length > 0) {
      // 上传完成后重新拉取附件列表以获取完整元数据
      const res = await listAttachments({ businessType: 'INBOX_EMAIL', businessId: selectedEmail.emailId });
      setAttachments(res.items);
    }
    // 清空 input 值，允许重复选择同一文件
    e.target.value = '';
  };

  const handleAttachDelete = async (attachmentId: string) => {
    await deleteAttachment(attachmentId);
    setAttachments(prev => prev.filter(a => a.attachmentId !== attachmentId));
  };

  const handleConvertToClue = async (params: {
    clueTitle: string; description: string; opponentName: string; estimatedAmount: string;
  }) => {
    if (!selectedEmail) return;
    setIsProcessing(true);
    const result = await convertEmailToClue({
      emailId: selectedEmail.emailId,
      clueTitle: params.clueTitle,
      description: params.description || null,
      opponentName: params.opponentName || null,
      estimatedAmount: params.estimatedAmount ? parseFloat(params.estimatedAmount) : null,
    });
    setIsProcessing(false);
    setShowConvertModal(false);
    if (result) {
      setEmails(prev => prev.map(e =>
        e.emailId === selectedEmail.emailId
          ? { ...e, processingStatus: 'CONVERTED_TO_CLUE' as const, processingStatusName: '已转线索' }
          : e,
      ));
      setSelectedEmail(prev => prev ? { ...prev, processingStatus: 'CONVERTED_TO_CLUE', processingStatusName: '已转线索' } : prev);
      alert(`✅ 已生成新线索，线索ID: ${result.clueId.slice(0, 8)}…`);
    }
  };

  const handleLinkToCase = async (caseId: string, note: string) => {
    if (!selectedEmail) return;
    setIsProcessing(true);
    const ok = await linkEmailToCase({ emailId: selectedEmail.emailId, caseId, note });
    setIsProcessing(false);
    setShowLinkModal(false);
    if (ok) {
      setEmails(prev => prev.map(e =>
        e.emailId === selectedEmail.emailId
          ? { ...e, processingStatus: 'LINKED_TO_CASE' as const, processingStatusName: '已关联案件' }
          : e,
      ));
      setSelectedEmail(prev => prev ? { ...prev, processingStatus: 'LINKED_TO_CASE', processingStatusName: '已关联案件' } : prev);
    }
  };

  const handleIgnore = async () => {
    if (!selectedEmail) return;
    if (!window.confirm('确认忽略此邮件？此操作不可撤销。')) return;
    const reason = window.prompt('忽略原因（可选）：') ?? '';
    setIsProcessing(true);
    const ok = await ignoreEmail(selectedEmail.emailId, reason || undefined);
    setIsProcessing(false);
    if (ok) {
      setEmails(prev => prev.map(e =>
        e.emailId === selectedEmail.emailId
          ? { ...e, processingStatus: 'IGNORED' as const, processingStatusName: '已忽略' }
          : e,
      ));
      setSelectedEmail(prev => prev ? { ...prev, processingStatus: 'IGNORED', processingStatusName: '已忽略' } : prev);
    }
  };

  const filteredEmails = emails.filter(email => {
    const matchSearch =
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.senderAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.senderName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchTab =
      filterTab === 'ALL' ? true :
      filterTab === 'UNPROCESSED' ? email.processingStatus === 'UNPROCESSED' :
      email.processingStatus !== 'UNPROCESSED';
    return matchSearch && matchTab;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-140px)]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const isUnprocessed = selectedEmail?.processingStatus === 'UNPROCESSED';

  return (
    <>
      {showConvertModal && selectedEmail && (
        <ConvertClueModal
          email={selectedEmail}
          onConfirm={handleConvertToClue}
          onClose={() => setShowConvertModal(false)}
          isProcessing={isProcessing}
        />
      )}
      {showLinkModal && (
        <LinkCaseModal
          onConfirm={handleLinkToCase}
          onClose={() => setShowLinkModal(false)}
          isProcessing={isProcessing}
        />
      )}

      <div className="flex h-[calc(100vh-100px)] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm animate-in fade-in">

        {/* Left: Email List */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50">
          <div className="p-4 border-b border-slate-200 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <Mail className="w-4 h-4 text-brand-500" /> 智能收件箱
              </div>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {([
                { id: 'UNPROCESSED', label: '待办' },
                { id: 'PROCESSED', label: '已处理' },
                { id: 'ALL', label: '全部' },
              ] as { id: FilterTab; label: string }[]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                    filterTab === tab.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索邮件..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-brand-500"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Inbox className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-xs">无符合条件的邮件</p>
              </div>
            ) : filteredEmails.map(email => (
              <div
                key={email.emailId}
                onClick={() => handleSelectEmail(email)}
                className={`p-4 border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-100 border-l-4 ${
                  selectedEmail?.emailId === email.emailId
                    ? 'bg-white border-l-brand-500 shadow-sm'
                    : 'border-l-transparent'
                } ${email.processingStatus !== 'UNPROCESSED' ? 'opacity-60' : ''}`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${PROCESSING_STATUS_STYLE[email.processingStatus] ?? ''}`}>
                    {email.processingStatusName || email.processingStatus}
                  </span>
                  <span className="text-[10px] text-slate-400">{email.receivedAt.slice(0, 10)}</span>
                </div>
                <h4 className={`text-sm mb-1 line-clamp-2 ${!email.isRead ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>
                  {email.subject}
                </h4>
                <p className="text-xs text-slate-400 truncate">{email.senderName || email.senderAddress}</p>
                {email.hasAttachments && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 mt-1">
                    <Paperclip className="w-3 h-3" /> 含附件
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Detail View */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedEmail ? (
            <>
              {/* Header */}
              <div className="px-8 py-5 border-b border-slate-200 bg-white">
                <div className="flex justify-between items-start mb-3">
                  <h2 className="text-lg font-bold text-slate-800 leading-tight flex-1 mr-4">
                    {selectedEmail.subject}
                  </h2>

                  {isUnprocessed && (
                    <div className="flex items-center gap-2 relative shrink-0">
                      <Button
                        size="sm"
                        className="bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                        onClick={() => setShowConvertModal(true)}
                        isLoading={isProcessing}
                      >
                        <Tag className="w-3.5 h-3.5 mr-1" /> 转线索
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowLinkModal(true)}
                        isLoading={isProcessing}
                      >
                        <Link2 className="w-3.5 h-3.5 mr-1" /> 关联案件
                      </Button>
                      <div className="relative">
                        <Button
                          ref={btnRef}
                          variant="outline"
                          size="sm"
                          className="px-2"
                          onClick={() => setShowActionMenu(!showActionMenu)}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                        {showActionMenu && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 top-full mt-2 w-40 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95"
                          >
                            <button
                              onClick={() => { setShowActionMenu(false); handleIgnore(); }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
                            >
                              <Trash2 className="w-4 h-4" /> 忽略此邮件
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!isUnprocessed && (
                    <div className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center border ${PROCESSING_STATUS_STYLE[selectedEmail.processingStatus] ?? ''}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      {selectedEmail.processingStatusName}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="font-bold text-slate-700">{selectedEmail.senderName || selectedEmail.senderAddress}</span>
                  <span className="text-slate-300">|</span>
                  <span>{selectedEmail.senderAddress}</span>
                  <span className="text-slate-300">|</span>
                  <span>接收于 {selectedEmail.receivedAt}</span>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" /> 加载邮件内容...
                  </div>
                ) : (
                  <div className="flex gap-6">
                    {/* Email Body */}
                    <div className="flex-1 space-y-4">
                      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm min-h-[300px]">
                        {selectedEmail.bodyHtml ? (
                          <div
                            className="prose prose-sm max-w-none text-slate-700"
                            dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                          />
                        ) : selectedEmail.bodyText ? (
                          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
                            {selectedEmail.bodyText}
                          </pre>
                        ) : (
                          <p className="text-slate-400 text-sm italic">（邮件正文加载中或为空）</p>
                        )}
                      </div>
                      {/* 附件区块 (S18) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                            <Paperclip className="w-3.5 h-3.5" /> 附件
                            {attachments.length > 0 && (
                              <span className="ml-1 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{attachments.length}</span>
                            )}
                          </h4>
                          <label className={`text-xs flex items-center gap-0.5 cursor-pointer ${attachUploading ? 'text-slate-400 pointer-events-none' : 'text-brand-600 hover:text-brand-700'}`}>
                            <Upload className="w-3.5 h-3.5" />
                            {attachUploading ? '上传中...' : '上传附件'}
                            <input
                              type="file"
                              multiple
                              className="hidden"
                              onChange={handleFileUpload}
                              disabled={attachUploading}
                            />
                          </label>
                        </div>
                        {attachLoading ? (
                          <div className="text-xs text-slate-400 py-2">加载中...</div>
                        ) : attachments.length === 0 ? (
                          <div className="text-xs text-slate-400 py-2">暂无附件</div>
                        ) : (
                          <div className="space-y-1.5">
                            {attachments.map(a => (
                              <div key={a.attachmentId} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <a
                                    href={a.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-brand-600 hover:underline truncate block"
                                  >
                                    {a.fileName}
                                  </a>
                                  {a.description && <p className="text-[10px] text-slate-400 truncate">{a.description}</p>}
                                </div>
                                <button
                                  onClick={() => handleAttachDelete(a.attachmentId)}
                                  className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI Panel (D4=Stub) */}
                    <div className="w-72 shrink-0">
                      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden sticky top-0">
                        <div className="bg-brand-50/50 px-4 py-3 border-b border-brand-100 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-brand-500" />
                          <h4 className="font-bold text-brand-800 text-sm">AI 智能解析</h4>
                          <span className="ml-auto text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Stub</span>
                        </div>
                        <div className="p-4 space-y-4">
                          {selectedEmail.aiRecommendation && (
                            <div>
                              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">AI 建议</label>
                              <span className={`text-xs font-bold px-2 py-1 rounded border ${AI_REC_STYLE[selectedEmail.aiRecommendation] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                {selectedEmail.aiRecommendationName || selectedEmail.aiRecommendation}
                              </span>
                            </div>
                          )}
                          {selectedEmail.aiSummary && (
                            <div>
                              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">摘要</label>
                              <p className="text-xs text-slate-700 leading-relaxed">{selectedEmail.aiSummary}</p>
                            </div>
                          )}
                          {selectedEmail.aiTags.length > 0 && (
                            <div>
                              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">标签</label>
                              <div className="flex flex-wrap gap-1">
                                {selectedEmail.aiTags.map(tag => (
                                  <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="pt-2 border-t border-slate-100">
                            <p className="text-[10px] text-slate-400 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                              AI 语义分析将在 Legal Brain (S17) 接入 Qwen 后启用。当前为占位数据。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <Inbox className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium">选择一封邮件开始处理</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default SmartInbox;
