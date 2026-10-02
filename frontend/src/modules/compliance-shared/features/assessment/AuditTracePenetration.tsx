import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, CheckCircle2, Activity, Database, FileText, 
  ArrowDown, Code, ArrowRight, ShieldCheck, ChevronRight
} from 'lucide-react';

export interface AuditTracePenetrationProps {
  isOpen: boolean;
  onClose: () => void;
  // In a real app we'd pass the specific trace data based on what the user clicked
}

const traceData = {
  indicator: "反洗钱培训覆盖率 (AML-EDU-01)",
  finalScore: 15,
  scoringMode: "INTERVAL",
  // 1. The processing trace
  formula: "(Y / X) * 100",
  variables: [
    { id: "X", label: "在册总人数", value: 100, source: "API", sourceName: "HR系统", detail: "API Response: {count: 100}" },
    { id: "Y", label: "实到培训人数", value: 95, source: "MANUAL", sourceName: "分支机构上报", detail: "附件: 2026Q1培训签到表.pdf" }
  ],
  processedValue: "95%",
  // 2. The scoring trace
  triggeredRule: { range: "[90, 100]", score: 15 },
  allRules: [
    { id: 'r1', range: "[0, 80)", score: 0 },
    { id: 'r2', range: "[80, 90)", score: 10 },
    { id: 'r3', range: "[90, 100]", score: 15 },
  ]
};

export default function AuditTracePenetration({ isOpen, onClose }: AuditTracePenetrationProps) {
  const [activeRawDetail, setActiveRawDetail] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-4 md:inset-10 lg:inset-x-32 xl:inset-x-48 bg-slate-50 shadow-2xl z-[101] flex flex-col rounded-2xl border border-slate-200 overflow-hidden"
          >
            {/* Header: 溯源诊断看板 */}
            <div className="bg-slate-900 px-6 py-5 border-b border-slate-800 flex items-center justify-between shrink-0 relative overflow-hidden">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>
               <div className="relative z-10 flex items-center justify-between w-full">
                 <div className="flex items-center gap-6">
                   <div className="w-12 h-12 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-center">
                     <ShieldCheck className="w-6 h-6 text-emerald-400" />
                   </div>
                   <div>
                     <h2 className="text-xl font-black text-white flex items-center">
                       溯源诊断看板 <span className="font-mono text-slate-400 text-sm ml-3 border border-slate-700 bg-slate-800 px-2 py-0.5 rounded">Provenance Diagnosis</span>
                     </h2>
                     <div className="flex items-center mt-1.5 space-x-3 text-sm">
                       <span className="text-slate-300 font-medium">{traceData.indicator}</span>
                       <span className="flex items-center text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-500/20">
                         <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                         计算逻辑已通过校验
                       </span>
                     </div>
                   </div>
                 </div>
                 <div className="flex items-center gap-6">
                   <div className="text-right">
                     <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Final Score</div>
                     <div className="text-4xl font-black text-emerald-400 font-mono drop-shadow-[0_0_12px_rgba(52,211,153,0.3)] leading-none">
                       {traceData.finalScore}
                     </div>
                   </div>
                   <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700">
                     <X className="w-5 h-5" />
                   </button>
                 </div>
               </div>
            </div>

            {/* X-Ray Content Area */}
            <div className="flex-1 overflow-y-auto bg-slate-50 relative p-8">
              {/* Vertical Dashed Line Background - X-Ray feel */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px border-l-2 border-dashed border-slate-300 -translate-x-1/2 z-0"></div>

              <div className="relative z-10 max-w-4xl mx-auto space-y-12 pb-12">
                
                {/* Level 1: 计分规则命中 */}
                <section className="relative">
                  <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-base font-black text-slate-800 flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                        Level 1: 计分规则命中 (Scoring Rule Hit)
                      </h3>
                      <div className="text-indigo-600 font-bold text-sm bg-indigo-50 px-3 py-1 rounded-md border border-indigo-100">
                        区间映射模式 (INTERVAL)
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                       {traceData.allRules.map((rule, idx) => {
                         const isHit = rule.range === traceData.triggeredRule.range;
                         return (
                           <div key={rule.id} className={`flex-1 relative p-4 rounded-xl border-2 transition-all ${
                             isHit 
                              ? 'bg-emerald-50 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.2)]' 
                              : 'bg-slate-50 border-slate-200 opacity-60'
                           }`}>
                             <div className={`text-xs font-bold mb-1 ${isHit ? 'text-emerald-600' : 'text-slate-400'}`}>区间范围</div>
                             <div className={`text-lg font-mono font-black mb-3 ${isHit ? 'text-emerald-700' : 'text-slate-600'}`}>
                               {rule.range}
                             </div>
                             <div className={`text-sm font-bold flex items-center justify-between pt-3 border-t ${isHit ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
                               <span>映射得分</span>
                               <span className="font-mono text-xl">{rule.score}</span>
                             </div>
                             {isHit && (
                               <div className="absolute -top-3 -right-3 w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-md">
                                 <CheckCircle2 className="w-4 h-4" />
                               </div>
                             )}
                           </div>
                         );
                       })}
                    </div>
                  </div>

                  {/* Flow Arrow */}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
                     <ArrowDown className="w-6 h-6 text-slate-400" />
                  </div>
                </section>

                {/* Level 2: 公式解析引擎 */}
                <section className="relative">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-indigo-500/5 pointer-events-none"></div>
                    
                    <h3 className="text-base font-black text-white flex items-center justify-center mb-8">
                      <Code className="w-5 h-5 mr-2 text-indigo-400" />
                      Level 2: 公式解析引擎 (Formula Breakdown)
                    </h3>

                    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 inline-block min-w-[50%]">
                      <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3">定义公式</div>
                      <div className="flex items-center justify-center text-3xl font-mono text-indigo-300 gap-3">
                         ( <span className="px-3 border border-dashed border-indigo-400/50 rounded bg-indigo-500/10">Y</span> / <span className="px-3 border border-dashed border-indigo-400/50 rounded bg-indigo-500/10">X</span> ) * 100
                      </div>
                      
                      <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
                      
                      <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3">执行代入</div>
                      <div className="flex items-center justify-center text-3xl font-mono text-emerald-400 gap-3">
                         ( <span className="text-white hover:text-emerald-300 cursor-pointer underline decoration-dashed underline-offset-4 transition-colors">95</span> / <span className="text-white hover:text-emerald-300 cursor-pointer underline decoration-dashed underline-offset-4 transition-colors">100</span> ) * 100
                      </div>

                      <div className="mt-8 flex items-center justify-center">
                        <span className="text-slate-500 font-bold mr-4">加工结果 =</span>
                        <div className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 font-black font-mono text-2xl tracking-wider">
                          {traceData.processedValue}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Flow Arrow */}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
                     <ArrowDown className="w-6 h-6 text-slate-400" />
                  </div>
                </section>

                {/* Level 3: 原始变量溯源 */}
                <section className="relative pb-8">
                  <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
                    <h3 className="text-base font-black text-slate-800 flex items-center mb-6">
                      <Database className="w-5 h-5 mr-2 text-indigo-600" />
                      Level 3: 原始变量溯源 (Raw Variable Drill-down)
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {traceData.variables.map(variable => (
                        <div key={variable.id} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm group hover:border-indigo-300 transition-all">
                          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center">
                              <div className="w-6 h-6 rounded bg-slate-200 text-slate-700 font-black font-mono flex items-center justify-center text-sm mr-2">{variable.id}</div>
                              <span className="font-bold text-slate-800">{variable.label}</span>
                            </div>
                            {variable.source === 'API' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">API 集成</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">手工提报</span>
                            )}
                          </div>
                          
                          <div className="p-5">
                            <div className="flex items-baseline mb-4">
                              <span className="text-3xl font-black font-mono text-slate-900 group-hover:text-indigo-600 transition-colors">{variable.value}</span>
                            </div>
                            
                            <div className="flex items-center text-xs text-slate-500 mb-6">
                              <span className="font-bold uppercase mr-2">来源渠道:</span>
                              <span className="bg-slate-100 px-2 py-1 rounded text-slate-700 border border-slate-200">{variable.sourceName}</span>
                            </div>

                            {activeRawDetail === variable.id ? (
                              <div className="bg-slate-900 rounded-lg p-3 relative animate-in fade-in zoom-in duration-200">
                                <button 
                                  onClick={() => setActiveRawDetail(null)}
                                  className="absolute top-2 right-2 text-slate-400 hover:text-white"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Raw Payload</div>
                                <div className="font-mono text-xs text-green-400 whitespace-pre-wrap break-all">
                                  {variable.detail}
                                </div>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setActiveRawDetail(variable.id)}
                                className={`w-full py-2.5 rounded-lg flex items-center justify-center text-sm font-bold transition-all border ${
                                  variable.source === 'API' 
                                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' 
                                    : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                                }`}
                              >
                                {variable.source === 'API' ? (
                                  <><Code className="w-4 h-4 mr-2" /> 查看原始报文</>
                                ) : (
                                  <><FileText className="w-4 h-4 mr-2" /> 查看原始附件证据</>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>

            {/* Verification Footer */}
            <div className="bg-white px-6 py-4 border-t border-slate-200 shrink-0 flex items-center justify-between">
              <div className="text-xs text-slate-500 flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-500" />
                <span className="font-mono mr-2">SYS_AUDIT_LOG:</span>
                计算执行于 2026-04-10 10:00:05，系统自动抓取并基于规则引擎定分。
              </div>
              <div className="flex items-center space-x-3">
                 <button className="px-5 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors">
                   手动介入修正 (Adjust Score)
                 </button>
                 <button 
                  onClick={onClose}
                  className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all"
                 >
                   采纳自动计算结果
                 </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
