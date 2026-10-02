
import React, { useEffect, useState, useRef } from 'react';
import { ReportTemplate, Case } from '../../types';
import { getTemplates } from '../../services/mock/reporting';
import { getCases } from '../../services/case';
import { FileSpreadsheet, Settings, LayoutTemplate, ArrowRight, FileText, CheckCircle2, RotateCcw, Save, UploadCloud, X, Link, Unlink, Table, Eye, Download, Loader2, AlertCircle, GripVertical } from 'lucide-react';
import Button from '../../components/ui/Button';

// Mock Source Fields available in system (The Data Dictionary)
const SOURCE_FIELDS = [
    { id: 'Index', label: '序号 (自动生成)', type: 'system' },
    { id: 'Case.Code', label: '案件编号', type: 'string' },
    { id: 'Case.Title', label: '案件标题', type: 'string' },
    { id: 'Case.Plaintiff', label: '原告/申请人', type: 'string' },
    { id: 'Case.Defendant', label: '被告/被申请人', type: 'string' },
    { id: 'Case.Cause', label: '标准案由', type: 'string' },
    { id: 'Case.Stage', label: '当前阶段', type: 'string' },
    { id: 'Case.Amount', label: '涉案金额(元)', type: 'money' },
    { id: 'Case.AmountWan', label: '涉案金额(万元)', type: 'money' },
    { id: 'Risk.Level', label: '风险等级', type: 'enum' },
    { id: 'Case.Court', label: '受理法院', type: 'string' },
    { id: 'Case.FilingDate', label: '立案日期', type: 'date' },
    { id: 'Case.NextDeadline', label: '下一截止日', type: 'date' },
    { id: 'Reg.Sector', label: '涉及板块', type: 'string' },
    { id: 'Reg.Security', label: '证券名称', type: 'string' }
];

// Mock Target Columns for a generic Regulatory Excel Template
const INITIAL_TARGET_COLS = [
    { col: 'A', name: '序号', required: false, width: 'w-16' },
    { col: 'B', name: '案号', required: true, width: 'w-32' },
    { col: 'C', name: '案件名称', required: true, width: 'w-48' },
    { col: 'D', name: '原告', required: true, width: 'w-24' },
    { col: 'E', name: '被告', required: true, width: 'w-24' },
    { col: 'F', name: '案由', required: true, width: 'w-32' },
    { col: 'G', name: '涉案金额(万元)', required: true, width: 'w-32' },
    { col: 'H', name: '风险状况', required: false, width: 'w-24' },
    { col: 'I', name: '最新进展', required: false, width: 'w-48' },
];

const TemplateFactory: React.FC = () => {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [showMapper, setShowMapper] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'CONFIG' | 'SIMULATION'>('CONFIG');
  
  // Data for Simulation
  const [sampleData, setSampleData] = useState<Case[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Mapping State
  const [activeMapping, setActiveMapping] = useState<Record<string, string | null>>({});
  const [selectedSource, setSelectedSource] = useState<string | null>(null); // Click selection
  const [draggedSource, setDraggedSource] = useState<string | null>(null); // DnD selection
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  
  // Interaction State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    getTemplates().then(setTemplates);
    getCases().then(data => setSampleData(data.slice(0, 15))); // Load first 15 for preview
  }, []);

  // Initialize mappings when a template is selected
  const handleSelectTemplate = (id: string) => {
      setSelectedTemplateId(id);
      setShowMapper(true);
      setSaveSuccess(false);
      setSelectedSource(null);
      setViewMode('CONFIG'); // Reset to config view
      
      // Mock: Pre-fill some mappings based on template ID for demo
      const initialMap: Record<string, string> = {};
      if (id) {
          initialMap['A'] = 'Index'; 
          initialMap['B'] = 'Case.Code';
          initialMap['C'] = 'Case.Title';
          initialMap['D'] = 'Case.Plaintiff';
          initialMap['E'] = 'Case.Defendant';
          // Simulate some missing mappings for user to fill
          initialMap['G'] = 'Case.AmountWan';
      }
      setActiveMapping(initialMap);
  };

  // --- Engine: Data Resolver ---
  const resolveCellValue = (c: Case, idx: number, sourceId: string | null) => {
      if (!sourceId) return '';
      
      switch (sourceId) {
          case 'Index': return (idx + 1).toString();
          case 'Case.Title': return c.title;
          case 'Case.Code': return c.code;
          case 'Case.Amount': return (c.regulatoryAttrs?.amountNoInterest || 0).toFixed(2);
          case 'Case.AmountWan': return ((c.regulatoryAttrs?.amountNoInterest || 0) / 10000).toFixed(2);
          case 'Case.Cause': return c.cause;
          case 'Risk.Level': return c.riskLevel;
          case 'Case.Plaintiff': return c.plaintiff;
          case 'Case.Defendant': return c.defendant;
          case 'Case.Court': return c.court;
          case 'Case.FilingDate': return c.filingDate;
          case 'Case.Stage': return c.stage;
          case 'Case.NextDeadline': return c.nextDeadline || '';
          case 'Reg.Sector': return c.regulatoryAttrs?.sector || '';
          case 'Reg.Security': return c.regulatoryAttrs?.securityName || '';
          default: return '';
      }
  };

  // --- Upload Handler ---
  const handleUploadClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setIsUploading(true);
          setTimeout(() => {
              const newTemplate: ReportTemplate = {
                  id: `t-${Date.now()}`,
                  name: file.name.replace('.xlsx', ''),
                  targetOrg: '自定义',
                  fileFormat: 'xlsx',
                  mappingsCount: 0,
                  lastUpdated: new Date().toISOString().split('T')[0]
              };
              setTemplates([newTemplate, ...templates]);
              setIsUploading(false);
              handleSelectTemplate(newTemplate.id); // Auto select
              if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
          }, 1000);
      }
  };

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, fieldId: string) => {
      setDraggedSource(fieldId);
      e.dataTransfer.setData('text/plain', fieldId);
      e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
      e.preventDefault();
      setDragOverTarget(colKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      // Only clear if needed, simple logic here relies on Drop/End
  };

  const handleDrop = (e: React.DragEvent, colKey: string) => {
      e.preventDefault();
      const fieldId = e.dataTransfer.getData('text/plain');
      if (fieldId) {
          setActiveMapping(prev => ({ ...prev, [colKey]: fieldId }));
      }
      setDragOverTarget(null);
      setDraggedSource(null);
  };

  // --- Click Mapping Handlers ---
  const handleSourceSelect = (fieldId: string) => {
      setSelectedSource(selectedSource === fieldId ? null : fieldId);
  };

  const handleTargetClick = (colKey: string) => {
      if (selectedSource) {
          setActiveMapping(prev => ({ ...prev, [colKey]: selectedSource }));
          setSelectedSource(null); 
      }
  };

  const handleUnmap = (colKey: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveMapping(prev => {
          const next = { ...prev };
          delete next[colKey];
          return next;
      });
  };

  const handleSaveMapping = () => {
      setIsSaving(true);
      setSaveSuccess(false);
      setTimeout(() => {
          setTemplates(prev => prev.map(t => 
              t.id === selectedTemplateId 
              ? { ...t, mappingsCount: Object.keys(activeMapping).length, lastUpdated: new Date().toISOString().split('T')[0] } 
              : t
          ));
          setIsSaving(false);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
      }, 800);
  };

  const handleExportSimulation = () => {
      setIsSimulating(true);
      
      // 1. Generate CSV Content
      // Header Row
      const header = INITIAL_TARGET_COLS.map(col => col.name).join(',');
      
      // Rows
      const rows = sampleData.map((row, idx) => {
          return INITIAL_TARGET_COLS.map(col => {
              const val = resolveCellValue(row, idx, activeMapping[col.col]);
              // Escape quotes for CSV
              return `"${val.replace(/"/g, '""')}"`;
          }).join(',');
      });

      const csvContent = [header, ...rows].join('\n');
      
      // 2. Trigger Download
      setTimeout(() => {
          const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const fileName = templates.find(t => t.id === selectedTemplateId)?.name || 'report_simulation';
          link.setAttribute('download', `${fileName}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setIsSimulating(false);
      }, 1000);
  };

  const handleReset = () => {
      if (window.confirm('确定清空当前所有映射关系吗？')) {
          setActiveMapping({});
      }
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-220px)] min-h-[600px]">
       {/* Hidden Input */}
       <input 
           type="file" 
           ref={fileInputRef} 
           className="hidden" 
           accept=".xlsx,.xls" 
           onChange={handleFileChange}
       />

       <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm shrink-0">
           <div>
               <h3 className="text-xl font-bold text-slate-800">监管报表模板工厂 (Template Factory)</h3>
               <p className="text-sm text-slate-500 mt-1">上传监管 Excel 模板，通过拖拽配置字段映射，即时预览生成结果。</p>
           </div>
           <Button variant="outline" onClick={handleUploadClick} isLoading={isUploading}>
               <UploadCloud className="w-4 h-4 mr-2" /> 上传新模板
           </Button>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
           {/* Left: Template List (3 Cols) */}
           <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl flex flex-col h-full overflow-hidden shadow-sm">
               <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 shrink-0">
                   <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                       <FileText className="w-4 h-4 text-brand-600"/> 已配置模板库
                   </h4>
               </div>
               
               <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/30">
                   {templates.length === 0 ? (
                       <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl bg-white">
                           <p className="text-slate-400">暂无模板，请上传</p>
                       </div>
                   ) : (
                       templates.map(tmpl => (
                           <div 
                                key={tmpl.id} 
                                className={`bg-white border rounded-xl p-4 cursor-pointer transition-all group ${
                                    selectedTemplateId === tmpl.id 
                                    ? 'border-brand-500 ring-1 ring-brand-500 shadow-md bg-brand-50/20' 
                                    : 'border-slate-200 hover:border-brand-300 hover:shadow-sm'
                                }`}
                                onClick={() => handleSelectTemplate(tmpl.id)}
                           >
                               <div className="flex justify-between items-start">
                                   <div className="flex items-center gap-4">
                                       <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors ${
                                           selectedTemplateId === tmpl.id ? 'bg-brand-100 text-brand-600 border-brand-200' : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                       }`}>
                                           <FileSpreadsheet className="w-5 h-5" />
                                       </div>
                                       <div>
                                           <h4 className={`font-bold text-sm transition-colors line-clamp-1 ${
                                               selectedTemplateId === tmpl.id ? 'text-brand-700' : 'text-slate-800 group-hover:text-brand-600'
                                           }`}>
                                               {tmpl.name}
                                           </h4>
                                           <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                               <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200">{tmpl.targetOrg}</span>
                                           </div>
                                       </div>
                                   </div>
                               </div>
                               
                               <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
                                   <span>{tmpl.lastUpdated}</span>
                                   <span className={`flex items-center gap-1 font-mono px-2 py-0.5 rounded ${
                                       selectedTemplateId === tmpl.id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                                   }`}>
                                       <LayoutTemplate className="w-3 h-3" /> {tmpl.mappingsCount} 映射
                                   </span>
                               </div>
                           </div>
                       ))
                   )}
               </div>
           </div>

           {/* Right: Work Area (9 Cols) */}
           <div className="lg:col-span-9 bg-slate-50 border border-slate-200 rounded-xl p-1 flex flex-col h-full overflow-hidden shadow-sm">
               <div className="bg-white rounded-lg border border-slate-200 flex-1 flex flex-col overflow-hidden relative">
                   {showMapper && selectedTemplateId ? (
                       <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 h-full">
                           
                           {/* Workspace Header & Tabs */}
                           <div className="flex justify-between items-center px-6 py-3 border-b border-slate-100 shrink-0">
                               <div className="flex items-center gap-2">
                                   <div className="bg-brand-50 p-1.5 rounded text-brand-600">
                                       <LayoutTemplate className="w-5 h-5" />
                                   </div>
                                   <div>
                                       <h4 className="font-bold text-slate-800 text-sm">
                                           {templates.find(t => t.id === selectedTemplateId)?.name}
                                       </h4>
                                       <p className="text-xs text-slate-400">配置报表生成规则</p>
                                   </div>
                               </div>
                               
                               {/* Tab Switcher */}
                               <div className="flex bg-slate-100 p-1 rounded-lg">
                                   <button 
                                       onClick={() => setViewMode('CONFIG')}
                                       className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                                           viewMode === 'CONFIG' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                       }`}
                                   >
                                       <Settings className="w-3 h-3" /> 映射配置
                                   </button>
                                   <button 
                                       onClick={() => setViewMode('SIMULATION')}
                                       className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                                           viewMode === 'SIMULATION' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                       }`}
                                   >
                                       <Eye className="w-3 h-3" /> 数据模拟
                                   </button>
                               </div>
                           </div>
                           
                           {/* --- MODE 1: CONFIGURATION --- */}
                           {viewMode === 'CONFIG' && (
                               <div className="flex-1 flex gap-6 overflow-hidden relative min-h-0 p-6 bg-slate-50/50">
                                   {/* Source Fields */}
                                   <div className="w-1/3 flex flex-col bg-white border border-slate-200 rounded-lg shadow-sm">
                                       <div className="flex justify-between items-center p-3 border-b border-slate-100 shrink-0 bg-slate-50/50 rounded-t-lg">
                                           <p className="text-xs font-bold text-slate-500 uppercase">系统源字段 (Source)</p>
                                           <span className="text-[10px] bg-white border border-slate-200 px-1.5 rounded text-slate-500">{SOURCE_FIELDS.length}</span>
                                       </div>
                                       <div className="flex-1 overflow-y-auto space-y-2 p-3 custom-scrollbar">
                                           {SOURCE_FIELDS.map((field) => (
                                               <div 
                                                    key={field.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, field.id)}
                                                    onClick={() => handleSourceSelect(field.id)}
                                                    className={`p-2.5 rounded-lg text-xs border cursor-grab active:cursor-grabbing transition-all flex justify-between items-center group ${
                                                        selectedSource === field.id 
                                                        ? 'bg-brand-600 text-white border-brand-600 shadow-md ring-2 ring-brand-200' 
                                                        : Object.values(activeMapping).includes(field.id)
                                                            ? 'bg-slate-50 text-slate-400 border-slate-100'
                                                            : 'bg-white text-slate-700 border-slate-200 hover:border-brand-300 hover:shadow-sm hover:text-brand-600'
                                                    }`}
                                               >
                                                   <div className="flex items-center gap-2">
                                                       <GripVertical className={`w-3 h-3 ${selectedSource === field.id ? 'text-white/50' : 'text-slate-300 group-hover:text-brand-400'}`} />
                                                       <span className="font-mono font-bold opacity-80">{field.id.split('.')[1] || field.id}</span>
                                                   </div>
                                                   <span className="truncate">{field.label}</span>
                                               </div>
                                           ))}
                                       </div>
                                   </div>

                                   {/* Connection Visual */}
                                   <div className="w-8 flex flex-col items-center justify-center space-y-2 shrink-0">
                                       {selectedSource || draggedSource ? (
                                           <div className="animate-bounce">
                                               <ArrowRight className="w-6 h-6 text-brand-500" />
                                           </div>
                                       ) : (
                                           <div className="w-px h-full bg-slate-200 border-l border-dashed border-slate-300"></div>
                                       )}
                                   </div>

                                   {/* Target Columns */}
                                   <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-lg shadow-sm">
                                       <div className="flex justify-between items-center p-3 border-b border-slate-100 shrink-0 bg-slate-50/50 rounded-t-lg">
                                           <p className="text-xs font-bold text-emerald-600 uppercase">Excel 目标列 (Target)</p>
                                           <span className="text-[10px] bg-emerald-50 px-1.5 rounded text-emerald-600 border border-emerald-100">
                                               {Object.keys(activeMapping).length} / {INITIAL_TARGET_COLS.length} Mapped
                                           </span>
                                       </div>
                                       <div className="flex-1 overflow-y-auto space-y-2 p-3 custom-scrollbar">
                                           {INITIAL_TARGET_COLS.map((col) => {
                                               const mappedSourceId = activeMapping[col.col];
                                               const mappedSourceLabel = SOURCE_FIELDS.find(s => s.id === mappedSourceId)?.label;
                                               const isTargetForSelection = !!selectedSource;
                                               const isDragOver = dragOverTarget === col.col;

                                               return (
                                                   <div 
                                                        key={col.col}
                                                        onDragOver={(e) => handleDragOver(e, col.col)}
                                                        onDrop={(e) => handleDrop(e, col.col)}
                                                        onDragLeave={handleDragLeave}
                                                        onClick={() => handleTargetClick(col.col)}
                                                        className={`border rounded-lg p-3 text-xs transition-all relative ${
                                                            isDragOver 
                                                                ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-300 scale-[1.02] shadow-lg z-10' 
                                                                : isTargetForSelection && !mappedSourceId 
                                                                    ? 'border-brand-400 bg-brand-50 border-dashed cursor-pointer hover:bg-brand-100' 
                                                                    : mappedSourceId 
                                                                        ? 'border-emerald-300 bg-emerald-50/30' 
                                                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                                        }`}
                                                   >
                                                       <div className="flex justify-between items-center mb-1">
                                                           <div className="flex items-center gap-2">
                                                               <span className={`font-bold text-white w-5 h-5 flex items-center justify-center rounded text-[10px] ${
                                                                   mappedSourceId ? 'bg-emerald-500' : 'bg-slate-400'
                                                               }`}>
                                                                   {col.col}
                                                               </span>
                                                               <span className="font-bold text-slate-700">{col.name}</span>
                                                               {col.required && <span className="text-[10px] text-red-400">*</span>}
                                                           </div>
                                                           {mappedSourceId ? (
                                                               <button 
                                                                    onClick={(e) => handleUnmap(col.col, e)}
                                                                    className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                                                                    title="解除映射"
                                                               >
                                                                   <X className="w-3 h-3" />
                                                               </button>
                                                           ) : isTargetForSelection ? (
                                                               <span className="text-[10px] text-brand-600 font-bold animate-pulse">点击此处映射</span>
                                                           ) : (
                                                               <div className="w-2 h-2 rounded-full bg-slate-100"></div>
                                                           )}
                                                       </div>
                                                       
                                                       {mappedSourceId ? (
                                                           <div className="flex items-center gap-1.5 mt-2 bg-white border border-emerald-200 rounded px-2 py-1.5 shadow-sm">
                                                               <Link className="w-3 h-3 text-emerald-500" />
                                                               <span className="font-mono text-emerald-700 font-bold">{mappedSourceId}</span>
                                                               <span className="text-slate-300">|</span>
                                                               <span className="text-slate-600 truncate">{mappedSourceLabel}</span>
                                                           </div>
                                                       ) : (
                                                           <div className="mt-2 h-6 flex items-center text-slate-300 italic px-2 border border-transparent border-dashed rounded">
                                                               <Unlink className="w-3 h-3 mr-1" /> 拖拽字段至此
                                                           </div>
                                                       )}
                                                   </div>
                                               );
                                           })}
                                       </div>
                                   </div>
                               </div>
                           )}

                           {/* --- MODE 2: SIMULATION --- */}
                           {viewMode === 'SIMULATION' && (
                               <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 relative">
                                   
                                   {/* Simulation Toolbar */}
                                   <div className="bg-white border-b border-slate-200 px-4 py-2 flex justify-between items-center text-xs">
                                       <div className="flex gap-4 items-center">
                                           <span className="text-slate-500">模拟数据源: <span className="font-bold text-slate-800">当前系统案件库 (前15条)</span></span>
                                           <div className="h-4 w-px bg-slate-300"></div>
                                           {Object.keys(activeMapping).length === 0 && (
                                               <span className="text-red-500 flex items-center gap-1 font-bold">
                                                   <AlertCircle className="w-3 h-3"/> 尚未配置任何映射，预览为空
                                               </span>
                                           )}
                                       </div>
                                       <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-7" onClick={handleExportSimulation} isLoading={isSimulating}>
                                           <Download className="w-3 h-3 mr-1" /> 导出模拟 Excel (CSV)
                                       </Button>
                                   </div>

                                   {/* Excel Grid */}
                                   <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                                       <div className="bg-white shadow-sm border border-slate-300 rounded-sm inline-block min-w-full">
                                           <table className="w-full text-xs border-collapse">
                                               {/* Header Row */}
                                               <thead className="bg-slate-50 font-bold text-slate-600 sticky top-0 z-10 shadow-sm">
                                                   <tr>
                                                       <th className="border border-slate-300 p-2 bg-slate-100 text-center w-10 text-slate-400">#</th>
                                                       {INITIAL_TARGET_COLS.map(col => {
                                                           const isMapped = !!activeMapping[col.col];
                                                           return (
                                                               <th key={col.col} className={`border border-slate-300 p-2 min-w-[120px] text-left ${isMapped ? 'bg-emerald-50 text-emerald-800' : ''}`}>
                                                                   <div className="flex flex-col">
                                                                       <span className="text-[10px] text-slate-400">{col.col}</span>
                                                                       <span>{col.name}</span>
                                                                   </div>
                                                               </th>
                                                           );
                                                       })}
                                                   </tr>
                                               </thead>
                                               {/* Data Rows */}
                                               <tbody>
                                                   {sampleData.map((row, idx) => (
                                                       <tr key={row.id} className="hover:bg-blue-50/30">
                                                           <td className="border border-slate-300 bg-slate-50 text-center text-slate-400 font-mono">{idx + 1}</td>
                                                           {INITIAL_TARGET_COLS.map(col => {
                                                               const val = resolveCellValue(row, idx, activeMapping[col.col]);
                                                               return (
                                                                   <td key={col.col} className={`border border-slate-300 p-2 truncate max-w-[200px] ${!val ? 'bg-slate-50/50 italic text-slate-300' : 'text-slate-700'}`}>
                                                                       {val || (activeMapping[col.col] ? <span className="text-red-300">[空]</span> : '')}
                                                                   </td>
                                                               );
                                                           })}
                                                       </tr>
                                                   ))}
                                               </tbody>
                                           </table>
                                       </div>
                                   </div>
                               </div>
                           )}
                           
                           {/* Footer Actions (Only for Config) */}
                           {viewMode === 'CONFIG' && (
                               <div className="mt-auto px-6 py-4 border-t border-slate-100 shrink-0 bg-white">
                                   {saveSuccess ? (
                                       <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg p-3 text-sm flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                                           <CheckCircle2 className="w-5 h-5" />
                                           <span>映射配置已成功保存！下一次生成报表将应用此规则。</span>
                                       </div>
                                   ) : (
                                       <div className="flex gap-3">
                                           <Button variant="ghost" className="flex-1" onClick={handleReset}>
                                               <RotateCcw className="w-4 h-4 mr-2" /> 重置
                                           </Button>
                                           <Button className="flex-[3]" onClick={handleSaveMapping} isLoading={isSaving}>
                                               <Save className="w-4 h-4 mr-2" /> 保存映射配置
                                           </Button>
                                       </div>
                                   )}
                                   {!saveSuccess && (
                                       <p className="text-xs text-slate-400 text-center mt-2">
                                           {selectedSource 
                                            ? `已选中 [${selectedSource}]，请在右侧点击目标列进行绑定` 
                                            : "提示：支持【点击】或【拖拽】左侧字段至右侧目标列进行绑定"}
                                       </p>
                                   )}
                               </div>
                           )}
                       </div>
                   ) : (
                       <div className="flex-1 flex flex-col items-center justify-center text-slate-400 h-full">
                           <div className="bg-slate-50 p-6 rounded-full mb-4">
                               <Table className="w-12 h-12 opacity-30" />
                           </div>
                           <p className="text-sm font-medium">请从左侧列表选择一个模版</p>
                           <p className="text-xs opacity-70 mt-1">查看或编辑其字段映射逻辑</p>
                       </div>
                   )}
               </div>
           </div>
       </div>
    </div>
  );
};

export default TemplateFactory;
