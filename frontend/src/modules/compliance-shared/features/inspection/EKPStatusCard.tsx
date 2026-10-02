import React from 'react';
import { motion } from 'motion/react';
import { X, ExternalLink, CheckCircle2, Clock, Circle, FileText } from 'lucide-react';
import { InspectionPlan } from '../../types';

interface EKPStatusCardProps {
  isOpen: boolean;
  onClose: () => void;
  plan: InspectionPlan | null;
}

export default function EKPStatusCard({ isOpen, onClose, plan }: EKPStatusCardProps) {
  if (!isOpen || !plan) return null;

  const flowId = plan.ekpFlow?.flowId || 'EKP-INSP-20260411-001';
  const flowTitle = plan.ekpFlow?.title || `关于《${plan.title}》的立项申请`;
  const currentHandler = plan.ekpFlow?.currentHandler || '合规部负责人(王总)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-blue-50/50">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mr-3">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">EKP 流程实时状态</h2>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">单据号: {flowId}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 bg-white">
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-500 mb-1">流程标题</h3>
            <p className="text-base font-semibold text-gray-900">{flowTitle}</p>
          </div>

          {/* Horizontal Steps */}
          <div className="mb-10">
            <h3 className="text-sm font-medium text-gray-500 mb-4">当前节点</h3>
            <div className="flex items-center justify-between relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-gray-100 -z-10"></div>
              
              {/* Step 1 */}
              <div className="flex flex-col items-center relative z-10 bg-white px-2">
                <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center border-2 border-white shadow-sm">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-gray-900 mt-2">拟稿</span>
              </div>

              {/* Step 2 (Active) */}
              <div className="flex flex-col items-center relative z-10 bg-white px-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border-2 border-blue-600 shadow-sm relative">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                </div>
                <span className="text-xs font-bold text-blue-600 mt-2">部门审核</span>
                <span className="text-[10px] text-blue-500 mt-0.5">({currentHandler})</span>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center relative z-10 bg-white px-2">
                <div className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center border-2 border-gray-200">
                  <Circle className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-gray-400 mt-2">分管领导审批</span>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col items-center relative z-10 bg-white px-2">
                <div className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center border-2 border-gray-200">
                  <Circle className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-gray-400 mt-2">结束</span>
              </div>
            </div>
          </div>

          {/* Vertical Timeline */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-4">流转记录</h3>
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              
              {/* Event 1 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-blue-500 bg-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10"></div>
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border border-blue-100 bg-blue-50 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-blue-900 text-sm">到达节点：部门审核</span>
                    <span className="text-xs text-blue-500 font-mono">11:15</span>
                  </div>
                  <div className="text-xs text-blue-700">等待 {currentHandler} 处理</div>
                </div>
              </div>

              {/* Event 2 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-slate-300 bg-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10"></div>
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-700 text-sm">拟稿提交</span>
                    <span className="text-xs text-slate-500 font-mono">10:30</span>
                  </div>
                  <div className="text-xs text-slate-500">发起人：系统自动提交</div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-300 rounded-md transition-colors"
          >
            关闭
          </button>
          <button 
            onClick={() => {
              alert('即将跳转至企业内部 EKP 系统...');
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center shadow-sm"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            跳转至 EKP 处理
          </button>
        </div>
      </motion.div>
    </div>
  );
}
