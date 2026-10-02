
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

interface GroupHeaderProps {
    title: string;
    defaultOpen?: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}

export const PropertyGroup: React.FC<GroupHeaderProps> = ({ title, defaultOpen = true, children, action }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between w-full py-3 px-4 hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase flex-1 text-left">
                    {title}
                    {isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                </div>
                {action && <div className="ml-2" onClick={e => e.stopPropagation()}>{action}</div>}
            </div>
            {isOpen && <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>}
        </div>
    );
};

interface FieldProps {
    label: string;
    value?: string | number | null;
    icon?: React.ElementType;
    isLink?: boolean;
    highlight?: boolean;
    className?: string;
}

export const PropertyField: React.FC<FieldProps> = ({ label, value, icon: Icon, isLink = false, highlight = false, className = '' }) => {
    return (
        <div className={`mb-3 last:mb-0 group ${className}`}>
            <div className="text-[10px] text-slate-400 font-medium mb-0.5">{label}</div>
            <div className={`flex items-center gap-2 text-sm ${highlight ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {isLink ? (
                    <span className="text-brand-600 hover:underline cursor-pointer flex items-center gap-1 truncate">
                        {value} <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                ) : (
                    <span className="truncate" title={value?.toString()}>{value || <span className="text-slate-300 italic">--</span>}</span>
                )}
            </div>
        </div>
    );
};
