import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, ArrowRight } from 'lucide-react';

const liveDefects = [
  { id: 'DEF-001', title: '大额交易未按规定报送可疑报告', reporter: '李四', risk: 'HIGH', time: '2 分钟前', branch: '深圳分公司' },
  { id: 'DEF-002', title: '客户风险测评(KYC)超期未更新', reporter: '张建国', risk: 'MEDIUM', time: '15 分钟前', branch: '上海分公司' },
  { id: 'DEF-003', title: '营业部大堂代销费率公示不全', reporter: '王芳', risk: 'LOW', time: '1 小时前', branch: '杭州营业部' },
  { id: 'DEF-004', title: '员工私下接受客户委托买卖证券', reporter: '李四', risk: 'HIGH', time: '2 小时前', branch: '广州营业部' }
];

export default function LiveDefectStream() {
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const handleRowClick = (id: string) => {
    setToastMsg(`正在唤起【中央问题库】AI 定性助手，准备处理单据 ${id}...`);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'HIGH':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-transparent">HIGH</span>;
      case 'MEDIUM':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-transparent">MEDIUM</span>;
      case 'LOW':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-transparent">LOW</span>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden relative">
      
      {/* Simulation Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="absolute top-16 left-1/2 z-50 flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg text-xs font-bold whitespace-nowrap border border-indigo-500"
          >
            <span className="mr-2">✨</span> {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white z-10">
        <div className="flex items-center">
          <h3 className="text-base font-bold text-slate-800 tracking-wide">关键缺陷实时流</h3>
          <span className="relative flex h-2.5 w-2.5 ml-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">LIVE</span>
      </div>

      {/* Feed Content */}
      <div className="flex-1 overflow-y-auto min-h-[350px] scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
        <div className="flex flex-col">
          <AnimatePresence>
            {liveDefects.map((defect, index) => (
              <motion.div
                key={defect.id}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                onClick={() => handleRowClick(defect.id)}
                className="group cursor-pointer hover:bg-slate-50 transition-all border-b border-slate-100 last:border-0 p-4"
              >
                <div className="flex items-start justify-between mb-2 gap-3">
                  <span className="text-sm font-bold text-slate-800 line-clamp-2 truncate whitespace-normal leading-snug group-hover:text-indigo-600 transition-colors">
                    {defect.title}
                  </span>
                  <div className="shrink-0 mt-0.5">
                    {getRiskBadge(defect.risk)}
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-slate-500 text-xs mt-3">
                  <span className="font-medium text-slate-500 group-hover:text-slate-600 transition-colors">
                    由 <span className="text-slate-700 font-bold">{defect.reporter}</span> 发现于 <span className="text-slate-700 font-bold">{defect.branch}</span>
                  </span>
                  <span className="flex items-center font-mono opacity-80 shrink-0 ml-4">
                    <Clock className="w-3 h-3 mr-1" />
                    {defect.time}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Action */}
      <div className="p-3 border-t border-slate-200 shrink-0 bg-slate-50">
        <button className="w-full py-2.5 px-4 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-white border hover:border-slate-200 border-transparent text-xs font-bold transition-all flex items-center justify-center group focus:outline-none">
          查看全部积压缺陷 <ArrowRight className="w-3.5 h-3.5 ml-1.5 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </button>
      </div>
    </div>
  );
}
