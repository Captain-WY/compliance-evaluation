
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  data?: any;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  onDateSelect?: (date: string) => void;
  selectedDate?: string;
  className?: string;
}

const CalendarView: React.FC<CalendarViewProps> = ({ events, onDateSelect, selectedDate, className = '' }) => {
  const [currentDate, setCurrentDate] = useState(selectedDate ? new Date(selectedDate) : new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const days = [];
  // Padding for empty start days
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  // Actual days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const formatDate = (day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getEventsForDay = (day: number) => {
    const dateStr = formatDate(day);
    return events.filter(e => e.date === dateStr);
  };

  const getTypeColor = (type: string) => {
      switch(type) {
          case 'danger': return 'bg-red-500';
          case 'warning': return 'bg-amber-500';
          case 'success': return 'bg-emerald-500';
          case 'info': return 'bg-brand-500';
          default: return 'bg-slate-300';
      }
  };

  return (
    <div className={`bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <h3 className="font-bold text-slate-800 text-lg">
          {year}年 {month + 1}月
        </h3>
        <div className="flex gap-1">
          <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 rounded text-slate-500">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 rounded text-slate-500">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content Area (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {/* Week Headers */}
        <div className="grid grid-cols-7 mb-2 text-center sticky top-0 bg-white z-10">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => (
            <div key={d} className="text-xs font-bold text-slate-400 uppercase py-1">{d}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 lg:gap-2">
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="h-24 bg-slate-50/50 rounded-lg"></div>;
            
            const dateStr = formatDate(day);
            const dayEvents = getEventsForDay(day);
            const isSelected = selectedDate === dateStr;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            return (
              <div 
                key={dateStr}
                onClick={() => onDateSelect && onDateSelect(dateStr)}
                className={`h-24 border rounded-lg p-1 relative cursor-pointer transition-all hover:shadow-md flex flex-col items-center justify-start pt-2 ${
                  isSelected 
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' 
                    : isToday 
                        ? 'border-brand-200 bg-white font-bold text-brand-600' 
                        : 'border-slate-100 bg-white text-slate-600 hover:border-brand-200'
                }`}
              >
                <span className="text-sm leading-none z-10">{day}</span>
                
                {/* Event Dots */}
                <div className="flex flex-wrap justify-center gap-1 mt-auto pb-1 w-full px-1">
                    {dayEvents.slice(0, 4).map((evt, i) => (
                        <div 
                            key={i} 
                            className={`w-1.5 h-1.5 rounded-full ${getTypeColor(evt.type)}`} 
                            title={evt.title}
                        />
                    ))}
                    {dayEvents.length > 4 && (
                        <span className="text-[8px] text-slate-400 scale-75">+</span>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
