import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Clock, 
  AlertTriangle, 
  FileText, 
  UploadCloud, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  Info,
  Archive,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RectificationRecord } from '../../types';
import { toast } from 'sonner';

interface RectificationFeedbackDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  record: RectificationRecord | null;
  onSubmit: (id: string, feedback: any, files?: File[]) => Promise<void> | void;
  isArchived?: boolean;
}

export default function RectificationFeedbackDrawer({ 
  isOpen, 
  onClose, 
  record,
  onSubmit,
  isArchived = false
}: RectificationFeedbackDrawerProps) {
  const [content, setContent] = useState('');
  const [manager, setManager] = useState('张三');
  const [files, setFiles] = useState<Array<{ name: string; size: string; type: string; file?: File }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Reset state when record changes
  useEffect(() => {
    if (isOpen && record) {
      setContent(record.feedback?.content || '');
      setManager(record.feedback?.submittedBy || '张三');
      setFiles((record.feedback?.attachments || []).map(file => ({
        name: file.name,
        size: '',
        type: file.type,
      })));
      setIsSubmitting(false);
      setIsSuccess(false);
    }
  }, [isOpen, record]);

  if (!record) return null;

  const isReadOnly = isArchived || record.status === 'PENDING_VERIFICATION' || record.status === 'CLOSED' || record.status === 'ARCHIVED' || isSuccess;
  const requiresStartBeforeFeedback = record.status === 'PENDING_RECTIFICATION';
  const isValid = content.length >= 20 && files.length > 0 && manager.trim().length > 0;

  const appendFiles = (selectedFiles: FileList | File[]) => {
    if (isReadOnly) return;
    const nextFiles = Array.from(selectedFiles).map(file => ({
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      type: file.type || file.name.split('.').pop() || '',
      file,
    }));
    setFiles(prev => [...prev, ...nextFiles]);
  };

  const handleRemoveFile = (index: number) => {
    if (isReadOnly) return;
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!isValid || isReadOnly) return;
    
    setIsSubmitting(true);

    try {
      await onSubmit(record.id, {
        content,
        attachments: files.map(({ file: _file, ...attachment }) => attachment),
        submittedBy: manager,
        submittedAt: new Date().toISOString()
      }, files.map(item => item.file).filter(Boolean) as File[]);
      setIsSubmitting(false);
      setIsSuccess(true);
      
      toast.success('提交成功！单据已锁定，正等待总部核实。', {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />
      });

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      setIsSubmitting(false);
      toast.error(error instanceof Error ? error.message : '整改反馈提交失败');
    }
  };

  const renderRiskLevel = (level?: 'HIGH' | 'MEDIUM' | 'LOW') => {
    switch (level) {
      case 'HIGH':
        return <span className="font-bold text-rose-600">HIGH (高风险)</span>;
      case 'MEDIUM':
        return <span className="font-bold text-amber-600">MEDIUM (中风险)</span>;
      case 'LOW':
        return <span className="font-bold text-blue-600">LOW (低风险)</span>;
      default:
        return <span className="font-bold text-slate-600">UNKNOWN</span>;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            data-testid="rectification-feedback-drawer"
            className="fixed inset-y-0 right-0 w-[650px] bg-white shadow-2xl flex flex-col z-50 border-l border-slate-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
              <h2 className="text-lg font-bold text-slate-800">
                {isArchived
                  ? `查看案卷 - ${record.id}`
                  : `${requiresStartBeforeFeedback ? '开始整改并反馈' : '反馈整改结果'} - ${record.id}`}
              </h2>
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Archived Banner */}
            {isArchived && (
              <div className="bg-slate-100 text-slate-600 p-3 text-sm flex items-center justify-center font-bold border-b border-slate-200 shrink-0">
                <Archive className="w-4 h-4 mr-2"/> 该案卷已闭环销号，当前为只读归档模式，内容不可更改。
              </div>
            )}

            {/* Read-Only HQ Snapshot section */}
            <div className="p-5 border-b border-slate-100 bg-slate-50 overflow-y-auto max-h-[30%] shrink-0">
              <h4 className="text-xs font-bold text-slate-500 mb-3 flex items-center">
                <Info className="w-4 h-4 mr-1.5"/> 违规事实与定性回顾
              </h4>
              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div>
                  <span className="text-slate-400 text-xs block">风险等级</span>
                  {renderRiskLevel(record.riskLevel)}
                </div>
                <div>
                  <span className="text-slate-400 text-xs block">风控编号</span>
                  <span className="font-mono text-slate-700">{record.sourceIssueId}</span>
                </div>
              </div>
              <div className="mb-3">
                <span className="text-slate-400 text-xs block mb-1">违规事实描述</span>
                <p className="text-sm text-slate-700 bg-white p-2 border border-slate-200 rounded">{record.issueDescription}</p>
              </div>
              <div>
                <span className="text-slate-400 text-xs block mb-1">总部整改要求</span>
                <p className="text-sm text-indigo-900 font-medium bg-indigo-50 p-2 border border-indigo-100 rounded">{record.rectificationGoal}</p>
              </div>
            </div>

            {/* Submission Form Section */}
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-5 relative">
              {isSuccess && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl"
                >
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">提交成功</h3>
                  <p className="text-sm text-slate-500">单据已锁定，正等待总部核实</p>
                </motion.div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  整改落实情况 <span className="text-rose-500">*</span>
                </label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={isReadOnly}
                  data-testid="rectification-feedback-content"
                  placeholder="请详细阐述您已采取的整改措施、落实效果及后续控制机制..."
                  className={`min-h-[150px] resize-none ${isArchived ? 'bg-slate-50 border-transparent disabled:opacity-100 disabled:cursor-default disabled:text-slate-700' : ''}`}
                />
                {!isReadOnly && (
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-slate-500">至少输入 20 个字符</span>
                    <span className={`text-xs font-medium ${content.length >= 20 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {content.length} / 20
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  证明材料上传 <span className="text-rose-500">*</span>
                </label>
                
                {!isArchived && !isReadOnly && (
                  <div 
                    data-testid="rectification-feedback-upload-dropzone"
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                      isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); appendFiles(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      data-testid="rectification-feedback-file-input"
                      className="hidden"
                      onChange={(event) => {
                        if (event.target.files) appendFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">点击或拖拽文件到此处上传</p>
                    <p className="text-xs text-slate-500 mt-1">支持 PDF, Word, Excel, 图片等格式</p>
                  </div>
                )}

                {files.length > 0 && (
                  <div className={`mt-4 ${isArchived ? 'flex flex-wrap gap-2' : 'space-y-2'}`}>
                    {files.map((file, idx) => (
                      isArchived ? (
                         <div key={idx} className="flex items-center p-2 bg-slate-50 border border-slate-200 rounded text-sm text-indigo-600 hover:underline cursor-pointer w-fit">
                           <Download className="w-3.5 h-3.5 mr-2"/> {file.name}
                         </div>
                      ) : (
                        <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                            <div className="truncate">
                              <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                              <p className="text-xs text-slate-400">{file.size || '未知大小'}</p>
                            </div>
                          </div>
                          {!isReadOnly && (
                            <button 
                              onClick={() => handleRemoveFile(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  整改负责人 <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="text"
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  disabled={isReadOnly}
                  data-testid="rectification-feedback-manager"
                  placeholder="输入负责人姓名..."
                  className={isArchived ? "bg-slate-50 border-transparent disabled:opacity-100 disabled:cursor-default disabled:text-slate-700" : ""}
                />
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex justify-end gap-3">
              {isArchived ? (
                 <Button variant="outline" className="w-full" onClick={onClose}>关闭案卷</Button>
              ) : !isReadOnly ? (
                <>
                  <Button variant="outline" onClick={onClose}>取消</Button>
                  <Button 
                    onClick={handleSubmit}
                    disabled={!isValid || isSubmitting}
                    data-testid="rectification-feedback-submit"
                    className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        正在上传凭证并上链...
                      </span>
                    ) : (
                      requiresStartBeforeFeedback ? '开始整改并提交核实' : '正式提交核实 (Submit)'
                    )}
                  </Button>
                </>
              ) : (
                <Button onClick={onClose} className="bg-slate-800 text-white hover:bg-slate-900 shadow-sm">
                  关闭 (Close)
                </Button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
