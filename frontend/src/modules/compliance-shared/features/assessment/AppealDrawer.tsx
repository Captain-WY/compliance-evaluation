import React, { useState, useEffect } from 'react';
import { X, UploadCloud, FileText, AlertCircle, CheckCircle2, Trash2, Info } from 'lucide-react';
import { AssessmentResult, Evidence } from '../../types';

interface AppealDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  deductedItems: AssessmentResult[];
  onSubmitSuccess: (itemId: string) => void;
}

export default function AppealDrawer({ isOpen, onClose, deductedItems, onSubmitSuccess }: AppealDrawerProps) {
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (deductedItems.length > 0) {
        setSelectedItemId(deductedItems[0].id);
      }
      setReason('');
      setEvidenceList([]);
      setShowToast(false);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, deductedItems]);

  const selectedItem = deductedItems.find(item => item.id === selectedItemId);

  const handleMockUpload = () => {
    const newEvidence: Evidence = {
      id: `EV-APPEAL-${Date.now()}`,
      fileName: `申诉补充材料_${Math.floor(Math.random() * 1000)}.pdf`,
      fileSize: '2.1 MB',
      uploadTime: new Date().toISOString()
    };
    setEvidenceList([...evidenceList, newEvidence]);
  };

  const handleDeleteEvidence = (id: string) => {
    setEvidenceList(evidenceList.filter(e => e.id !== id));
  };

  const isError = reason.trim().length > 0 && evidenceList.length === 0;
  const canSubmit = selectedItemId && reason.trim().length > 0 && evidenceList.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
      onSubmitSuccess(selectedItemId);
      onClose();
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="relative z-50" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
      {/* Background backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
            {/* Sliding panel */}
            <div className="pointer-events-auto w-screen max-w-2xl transform transition ease-in-out duration-500 sm:duration-700 translate-x-0">
              <div className="flex h-full flex-col bg-white shadow-2xl">
                
                {/* Header */}
                <div className="px-6 py-6 border-b border-gray-200 bg-gray-50/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900" id="slide-over-title">
                        发起考核异议申诉
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        针对系统初评扣分项，您可以提交补充材料并申请重新核定。
                      </p>
                    </div>
                    <div className="ml-3 flex h-7 items-center">
                      <button
                        type="button"
                        className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        onClick={onClose}
                      >
                        <span className="sr-only">Close panel</span>
                        <X className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Body (Form Area) */}
                <div className="relative flex-1 overflow-y-auto p-6">
                  {/* Toast Notification */}
                  {showToast && (
                    <div className="absolute top-4 right-6 z-50 flex items-center bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                      <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
                      <span className="text-sm font-medium">申诉已提交至总部合规部进行实质复核</span>
                    </div>
                  )}

                  {deductedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                      <CheckCircle2 className="w-12 h-12 text-green-400 mb-4" />
                      <p>当前没有可申诉的扣分项</p>
                    </div>
                  ) : (
                    <form className="space-y-6">
                      {/* Select Indicator */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">选择申诉项</label>
                        <select 
                          value={selectedItemId}
                          onChange={(e) => setSelectedItemId(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {deductedItems.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.category} - {item.indicatorName} (扣 {item.maxScore - item.systemScore} 分)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Indicator Info (Read-only) */}
                      {selectedItem && (
                        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                          <h4 className="text-sm font-medium text-gray-900 mb-2">扣分详情</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">标准分：</span>
                              <span className="font-medium text-gray-900">{selectedItem.maxScore} 分</span>
                            </div>
                            <div>
                              <span className="text-gray-500">初评得分：</span>
                              <span className="font-bold text-red-600">{selectedItem.systemScore} 分</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-gray-500">扣分归因：</span>
                              <p className="mt-1 text-red-700 bg-red-50 p-2 rounded border border-red-100">
                                {selectedItem.deductionReason || '无说明'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Appeal Reason */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          申诉理由 <span className="text-red-500">*</span>
                        </label>
                        <textarea 
                          rows={4}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          placeholder="请详细说明申诉理由，说明为何该扣分项不合理或已满足得分条件..."
                        ></textarea>
                      </div>

                      {/* New Evidence Upload */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          补充佐证材料 <span className="text-red-500">*</span>
                        </label>
                        
                        {/* Dropzone */}
                        <div 
                          onClick={handleMockUpload}
                          className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors mb-4 ${
                            isError 
                              ? 'border-red-300 bg-red-50/50 hover:bg-red-50' 
                              : 'border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-400'
                          }`}
                        >
                          <UploadCloud className={`w-8 h-8 mb-2 ${isError ? 'text-red-400' : 'text-gray-400'}`} />
                          <p className="text-sm font-medium text-gray-700">点击上传文件或拖拽至此处</p>
                          <p className="text-xs text-gray-500 mt-1">支持 PDF, Excel, Word, JPG (最大 50MB)</p>
                        </div>

                        {/* File List */}
                        <div className="space-y-2">
                          {evidenceList.length === 0 ? (
                            <p className="text-sm text-gray-400 italic text-center py-2">暂无文件</p>
                          ) : (
                            evidenceList.map((file) => (
                              <div key={file.id} className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-md shadow-sm group">
                                <div className="flex items-center overflow-hidden">
                                  <FileText className="w-4 h-4 text-blue-500 mr-2 shrink-0" />
                                  <span className="text-sm text-gray-700 truncate">{file.fileName}</span>
                                  <span className="text-xs text-gray-400 ml-2 shrink-0">{file.fileSize}</span>
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => handleDeleteEvidence(file.id)}
                                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Error Alert */}
                      {isError && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start animate-in fade-in slide-in-from-top-2">
                          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 shrink-0" />
                          <div>
                            <h4 className="text-sm font-medium text-red-800">⚠️ 申诉规则提示</h4>
                            <p className="text-sm text-red-700 mt-1">
                              发起异议申诉必须上传补充佐证材料/证明文件，否则无法提交。
                            </p>
                          </div>
                        </div>
                      )}
                    </form>
                  )}
                </div>

                {/* Footer (Sticky) */}
                <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center text-xs text-gray-500">
                      <Info className="w-4 h-4 mr-1.5 text-blue-500" />
                      本申诉将同步发起 EKP 工作沟通流程进行层级审批
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit || deductedItems.length === 0}
                      className={`inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                        !canSubmit || deductedItems.length === 0
                          ? 'bg-gray-300 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      确认提交申诉
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
