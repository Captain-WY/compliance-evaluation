import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2, Server, Package, Link as LinkIcon } from 'lucide-react';

interface EKPLaunchOverlayProps {
  isOpen: boolean;
  onComplete: () => void;
}

export default function EKPLaunchOverlay({ isOpen, onComplete }: EKPLaunchOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      setStage(0);
      return;
    }

    // Stage 1: 30%
    const t1 = setTimeout(() => {
      setProgress(30);
      setStage(1);
    }, 500);

    // Stage 2: 60%
    const t2 = setTimeout(() => {
      setProgress(60);
      setStage(2);
    }, 1500);

    // Stage 3: 100%
    const t3 = setTimeout(() => {
      setProgress(100);
      setStage(3);
    }, 3000);

    // Auto-close
    const t4 = setTimeout(() => {
      onComplete();
    }, 5000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [isOpen, onComplete]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-8 overflow-hidden"
        >
          {/* Tech Background Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-blue-500/20 blur-[50px] rounded-full pointer-events-none"></div>

          <div className="relative z-10 flex flex-col items-center text-center">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-6 shadow-inner relative">
              {stage === 3 ? (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </motion.div>
              ) : (
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              )}
              
              {/* Scanning line */}
              {stage < 3 && (
                <motion.div
                  className="absolute left-0 right-0 h-0.5 bg-blue-400/50 shadow-[0_0_8px_2px_rgba(96,165,250,0.5)]"
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>

            <h3 className="text-xl font-bold text-white mb-2">发起 EKP 立项审批</h3>
            
            {/* Dynamic Text */}
            <div className="h-12 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {stage === 0 && (
                  <motion.p key="0" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-slate-400 text-sm flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 初始化流程引擎...
                  </motion.p>
                )}
                {stage === 1 && (
                  <motion.p key="1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-blue-300 text-sm flex items-center">
                    <Package className="w-4 h-4 mr-2" /> 📦 正在打包检查方案与底稿模板...
                  </motion.p>
                )}
                {stage === 2 && (
                  <motion.p key="2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-purple-300 text-sm flex items-center">
                    <LinkIcon className="w-4 h-4 mr-2" /> 🔗 正在与 EKP 系统建立安全通讯...
                  </motion.p>
                )}
                {stage === 3 && (
                  <motion.p key="3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-green-400 text-sm font-medium flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> ✅ 流程已创建，单据号：EKP-INSP-20260411-001
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Progress Bar */}
            <div className="w-full mt-6">
              <div className="flex justify-between text-xs font-medium text-slate-400 mb-2">
                <span>处理进度</span>
                <span className={stage === 3 ? 'text-green-400' : 'text-blue-400'}>{progress}%</span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <motion.div 
                  className={`h-full rounded-full ${stage === 3 ? 'bg-green-500' : 'bg-blue-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
