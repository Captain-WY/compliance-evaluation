import React, { useState } from 'react';
import { AlertCircle, Clock, FileText, CheckCircle2, User, Phone, Briefcase, Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const pendingNotice = {
  id: 'NOT-2026-045',
  projectId: 'INSP-2026-003',
  projectTitle: '2026年反洗钱(AML)专项现场检查',
  sender: '总部合规管理部 - 李合规',
  dispatchTime: '2026-04-05 10:00',
  deadline: '2026-04-07 17:00',
  attachments: [{ name: '检查通知书(盖章版).pdf', url: '#' }, { name: '资料调阅清单.xlsx', url: '#' }]
};

export default function NoticeAcknowledgementTask() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [liaisonName, setLiaisonName] = useState('');
  const [liaisonPhone, setLiaisonPhone] = useState('');
  const [liaisonTitle, setLiaisonTitle] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = () => {
    setIsDialogOpen(false);
    setIsSubmitted(true);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  if (isSubmitted) {
    return (
      <>
        {/* Success Toast */}
        <AnimatePresence>
          {showToast && (
            <motion.div
              initial={{ opacity: 0, y: 50, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 20, x: '-50%' }}
              className="fixed bottom-6 left-1/2 z-50 flex items-center bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg font-bold"
            >
              ✅ 签收成功！检查项目已移入【检查底稿上报】工作台。
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="border border-slate-200 rounded-xl border-l-4 border-l-indigo-600 bg-indigo-50/30 overflow-hidden shadow-sm">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center mb-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">待签收 (Pending Ack)</span>
                <span className="text-sm font-bold text-slate-500 ml-3">检查通知下发</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">{pendingNotice.projectTitle}</h3>
              <p className="text-sm text-slate-600 mb-3 font-medium flex-wrap flex items-center gap-x-4 gap-y-1">
                <span><span className="text-slate-400">下发人:</span> {pendingNotice.sender}</span>
                <span className="flex items-center text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  ⏳ 请在 48 小时内完成签收
                </span>
              </p>
            </div>
            
            <div className="shrink-0 flex items-center">
              <button 
                onClick={() => setIsDialogOpen(true)}
                className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
              >
                立即查阅并签收
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Dialog */}
      <AnimatePresence>
        {isDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pb-20">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsDialogOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold text-slate-800">签收检查通知并指定联络人</h2>
                <button onClick={() => setIsDialogOpen(false)} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-8">
                
                {/* Section A: 通知内容与附件 */}
                <section>
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
                    <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-500 mr-2">A</span>
                    通知内容与附件
                  </h3>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="block text-slate-400 text-xs font-bold mb-1">下发人</span>
                        <span className="font-medium text-slate-800">{pendingNotice.sender}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 text-xs font-bold mb-1">下发时间</span>
                        <span className="font-medium text-slate-800">{pendingNotice.dispatchTime}</span>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-200">
                      <span className="block text-slate-400 text-xs font-bold mb-2">支撑材料与清单</span>
                      <div className="space-y-2">
                        {pendingNotice.attachments.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors cursor-pointer group">
                            <div className="flex items-center text-sm font-medium text-indigo-700">
                              <FileText className="w-4 h-4 mr-2 text-indigo-400" />
                              {file.name}
                            </div>
                            <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                          </div>
                        ))}
                      </div>
                      <p className="flex items-center text-xs text-slate-500 mt-3 font-medium bg-indigo-50/50 text-indigo-700 p-2 rounded border border-indigo-100">
                        <AlertCircle className="w-3.5 h-3.5 mr-1" />
                        请务必下载并阅读检查通知书，以了解检查范围与时间安排。
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section B: 指定本机构联络人 */}
                <section>
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center">
                    <span className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-xs text-indigo-600 mr-2 border border-indigo-100">B</span>
                    指定本机构联络人
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 font-medium mb-4">
                    为确保检查工作顺利开展，请指定1-2名本机构对接联络人，负责后续的底稿上传与沟通协调。
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">联络人姓名 <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="输入姓名或员工号" 
                          value={liaisonName}
                          onChange={(e) => setLiaisonName(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">联系电话 <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="请输入手机或固话" 
                          value={liaisonPhone}
                          onChange={(e) => setLiaisonPhone(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-bold text-slate-700">职务</label>
                      <div className="relative">
                        <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="例如：合规专员" 
                          value={liaisonTitle}
                          onChange={(e) => setLiaisonTitle(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Section C: 签收确认区 */}
                <section>
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <label className="flex items-start cursor-pointer group">
                      <div className="flex items-center h-5 mr-3">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={isChecked}
                          onChange={(e) => setIsChecked(e.target.checked)}
                        />
                      </div>
                      <div className="text-sm font-bold text-slate-800 leading-tight group-hover:text-indigo-900 transition-colors pt-0.5">
                        我方已阅知上述检查通知，并承诺积极配合本次检查工作。
                      </div>
                    </label>
                  </div>
                </section>

              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setIsDialogOpen(false)}
                  className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleSubmit}
                  disabled={!isChecked || !liaisonName.trim()}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold transition-all shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  确认签收并提交联络人
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
