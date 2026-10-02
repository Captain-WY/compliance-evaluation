
import React, { useEffect, useState } from 'react';
import { getRegulatoryCalendar, getReportDefinitions } from '../../services/mock/reporting';
import CalendarView, { CalendarEvent } from '../../components/ui/CalendarView';
import { ReportDefinition } from '../../types';
import { Calendar, AlertCircle, FileText, ArrowRight, Play, Clock, Info } from 'lucide-react';
import Button from '../../components/ui/Button';

// Add prop to allow triggering the wizard from here
interface RegulatoryCalendarProps {
    onInitiateTask?: (defId: string) => void;
}

const RegulatoryCalendar: React.FC<RegulatoryCalendarProps> = ({ onInitiateTask }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  
  // UI State: Right Panel Tab
  const [rightTab, setRightTab] = useState<'AGENDA' | 'OBLIGATIONS'>('AGENDA');

  useEffect(() => {
    const init = async () => {
        const [calData, defs] = await Promise.all([
            getRegulatoryCalendar(),
            getReportDefinitions()
        ]);
        setDefinitions(defs);
        
        // Transform the mock calendar data into CalendarView events
        const calendarEvents: CalendarEvent[] = [];
        calData.forEach(item => {
            item.events.forEach(evtName => {
                calendarEvents.push({
                    id: `evt-${Math.random()}`,
                    date: item.date,
                    title: evtName,
                    type: evtName.includes('临时') ? 'danger' : 'info', // Red for ad-hoc, Blue for periodic
                    data: { name: evtName }
                });
            });
        });
        setEvents(calendarEvents);
        setLoading(false);
    };
    init();
  }, []);

  const selectedDayEvents = events.filter(e => e.date === selectedDate);

  if (loading) return <div className="p-8 text-center text-slate-400">加载监管日历...</div>;

  return (
    <div className="flex flex-col h-[720px] bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand-600" /> 监管披露日历 (Regulatory Calendar)
            </h3>
            <div className="flex gap-3 text-xs">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-brand-500"></div> 定期报告</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> 临时公告</div>
            </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Left: Calendar Component */}
            <div className="flex-1 p-6 overflow-y-auto border-r border-slate-100 bg-slate-50/10">
                <CalendarView 
                    events={events}
                    selectedDate={selectedDate}
                    onDateSelect={(date) => {
                        setSelectedDate(date);
                        setRightTab('AGENDA'); // Auto switch to agenda on date click
                    }}
                    className="shadow-none border-none bg-transparent"
                />
            </div>

            {/* Right: Tabbed Panel (Agenda / Obligations) */}
            <div className="w-96 flex flex-col bg-white border-l border-slate-200 shadow-[rgba(0,0,0,0.03)_0px_0px_10px_inset]">
                
                {/* Tabs */}
                <div className="flex border-b border-slate-200 shrink-0">
                    <button
                        onClick={() => setRightTab('AGENDA')}
                        className={`flex-1 py-3 text-sm font-bold text-center transition-all relative ${
                            rightTab === 'AGENDA' 
                            ? 'text-brand-600 bg-brand-50/30' 
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        当日事项
                        {rightTab === 'AGENDA' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-600 animate-in zoom-in-x duration-300"></div>}
                        {selectedDayEvents.length > 0 && (
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${rightTab === 'AGENDA' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                                {selectedDayEvents.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setRightTab('OBLIGATIONS')}
                        className={`flex-1 py-3 text-sm font-bold text-center transition-all relative ${
                            rightTab === 'OBLIGATIONS' 
                            ? 'text-brand-600 bg-brand-50/30' 
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        报送义务清单
                        {rightTab === 'OBLIGATIONS' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-600 animate-in zoom-in-x duration-300"></div>}
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${rightTab === 'OBLIGATIONS' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                            {definitions.length}
                        </span>
                    </button>
                </div>

                {/* Content Area - SCROLLABLE */}
                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50/30">
                    
                    {/* Tab 1: Agenda */}
                    {rightTab === 'AGENDA' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-bold text-slate-500 uppercase">
                                    {selectedDate} 日程
                                </h4>
                                {selectedDayEvents.length > 0 && <span className="text-[10px] text-slate-400">共 {selectedDayEvents.length} 项</span>}
                            </div>
                            
                            {selectedDayEvents.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm">
                                        <Calendar className="w-5 h-5 opacity-30" />
                                    </div>
                                    <p className="text-xs italic">本日无监管截止事项</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedDayEvents.map((evt, i) => (
                                        <div key={i} className={`p-4 rounded-xl border text-sm shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${evt.type === 'danger' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-white border-slate-200 text-slate-700'}`}>
                                            <div className="font-bold mb-2 flex items-start justify-between">
                                                <span>{evt.title}</span>
                                                {evt.type === 'danger' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0"/>}
                                            </div>
                                            <div className={`text-xs flex items-center gap-1.5 p-2 rounded ${evt.type === 'danger' ? 'bg-red-100/50 text-red-700' : 'bg-slate-50 text-slate-500'}`}>
                                                <Clock className="w-3 h-3" /> 
                                                {evt.type === 'danger' ? '紧急：请务必在 15:00 前提交' : '请关注监管窗口期'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 2: Obligations */}
                    {rightTab === 'OBLIGATIONS' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-700 flex gap-2">
                                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                <p>此处列示了所有需定期或触发式报送的监管义务清单。点击“发起”可手动启动填报流程。</p>
                            </div>

                            <div className="space-y-3">
                                {definitions.map(def => (
                                    <div key={def.id} className="p-4 rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all bg-white group relative">
                                        <div className="flex justify-between items-start mb-2 pr-2">
                                            <span className="font-bold text-sm text-slate-800 leading-tight pr-2">{def.name}</span>
                                            <span className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 border border-slate-100 rounded whitespace-nowrap">
                                                To: {def.targetOrg}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                def.triggerType === 'PERIODIC' 
                                                ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                                                : 'bg-orange-50 text-orange-600 border border-orange-100'
                                            }`}>
                                                {def.triggerType === 'PERIODIC' ? (def.frequency === 'MONTHLY' ? '月报' : '年报') : '事件触发'}
                                            </span>
                                        </div>

                                        <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed bg-slate-50 p-2 rounded">
                                            {def.description}
                                        </p>

                                        {/* Action Area */}
                                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                                                <Clock className="w-3 h-3" />
                                                {def.triggerType === 'PERIODIC' ? `每月 ${def.deadlineDay} 日截止` : '需手动触发'}
                                            </div>
                                            
                                            <button 
                                                onClick={() => onInitiateTask && onInitiateTask(def.id)}
                                                className="flex items-center gap-1 text-xs bg-brand-600 text-white px-3 py-1.5 rounded hover:bg-brand-700 transition-colors font-bold shadow-sm"
                                            >
                                                <Play className="w-3 h-3 fill-white" /> 发起
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default RegulatoryCalendar;
