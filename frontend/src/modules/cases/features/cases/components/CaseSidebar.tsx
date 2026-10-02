
import React, { useState, useEffect } from 'react';
import { Case, FinancialRecord, RiskLevel, CaseStage, BaseIssue, CaseMember } from '../../../types';
import { 
    User as UserIcon, Calendar, Clock, ShieldAlert, Briefcase, 
    Coins, ChevronDown, ChevronRight, UserCircle, 
    Building2, Hash, ExternalLink, Link2, AlertTriangle, ArrowRight, Lock, Plus, Search, Loader2, X, Shield, UserPlus, Trash2, UserCog
} from 'lucide-react';
import { addCaseLink, updateCaseGeneralInfo, updateCaseStage, updateCaseDeadline, addCaseMember, removeCaseMember, searchCaseMemberCandidates, searchIssues, caseService } from '../../../services/case';
import Button from '../../../components/ui/Button';

interface GroupHeaderProps {
    title: string;
    defaultOpen?: boolean;
    action?: React.ReactNode;
}

const GroupHeader: React.FC<React.PropsWithChildren<GroupHeaderProps>> = ({ title, defaultOpen = true, children, action }) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);
    return (
        <div className="border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between w-full py-3 px-4 hover:bg-slate-50 transition-colors group">
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase flex-1 text-left"
                >
                    {title}
                    {isOpen ? <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" /> : <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                </button>
                {action && <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">{action}</div>}
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
    onEdit?: (newValue: string) => void;
    inputType?: 'text' | 'date' | 'select';
    options?: string[];
}

const Field: React.FC<FieldProps> = ({ label, value, icon: Icon, isLink = false, highlight = false, onEdit, inputType = 'text', options = [] }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value?.toString() || '');

    const handleSave = () => {
        if (onEdit && tempValue !== value) {
            onEdit(tempValue);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') setIsEditing(false);
    };

    return (
        <div className="mb-3 last:mb-0 group">
            <div className="text-[10px] text-slate-400 font-medium mb-1 flex justify-between">
                {label}
                {onEdit && !isEditing && (
                    <button onClick={() => setIsEditing(true)} className="opacity-0 group-hover:opacity-100 text-brand-600 hover:underline">
                        编辑
                    </button>
                )}
            </div>
            
            {isEditing ? (
                <div className="flex gap-1 items-center">
                    {inputType === 'select' ? (
                        <select 
                            autoFocus
                            className="flex-1 text-xs border border-brand-300 rounded px-1.5 py-1 outline-none bg-white"
                            value={tempValue}
                            onChange={e => setTempValue(e.target.value)}
                            onBlur={handleSave}
                        >
                            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    ) : (
                        <input 
                            autoFocus
                            type={inputType}
                            className="flex-1 text-xs border border-brand-300 rounded px-1.5 py-1 outline-none"
                            value={tempValue}
                            onChange={e => setTempValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                        />
                    )}
                </div>
            ) : (
                <div className={`flex items-center gap-2 text-sm ${highlight ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                    {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
                    {isLink ? (
                        <span className="text-brand-600 hover:underline cursor-pointer flex items-center gap-1">
                            {value} <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                    ) : (
                        <span className="truncate" title={value?.toString()}>{value || <span className="text-slate-300 italic">未填写</span>}</span>
                    )}
                </div>
            )}
        </div>
    );
};

interface CaseSidebarProps {
  caseData: Case;
  finance?: FinancialRecord;
  onCaseUpdated?: (updated: Partial<Case>) => void;
}

const CaseSidebar: React.FC<CaseSidebarProps> = ({ caseData: initialCaseData, finance, onCaseUpdated }) => {
  const [caseData, setCaseData] = useState(initialCaseData);
  const [externalCounselName, setExternalCounselName] = useState<string | null>(null);

  // Link Modal State
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BaseIssue[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<BaseIssue | null>(null);
  const [relationType, setRelationType] = useState('RELATES_TO');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  // ACL State
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<{ id: string; name: string; username: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'MEMBER' | 'GUEST'>('MEMBER');

  useEffect(() => {
      setCaseData(initialCaseData);
  }, [initialCaseData]);

  // Load external counsel from sidebar API (de-mock)
  useEffect(() => {
      caseService.getCaseSidebar(caseData.id).then((sidebar) => {
          const counsels = sidebar?.externalCounsels || sidebar?.external_counsels || [];
          if (counsels.length > 0) {
              setExternalCounselName(counsels[0].lawyerName || counsels[0].lawyer_name || null);
          } else {
              setExternalCounselName(null);
          }
      }).catch(() => {
          setExternalCounselName(null);
      });
  }, [caseData.id]);

  // Load Users for ACL
  useEffect(() => {
      if (isAddingMember) {
          searchCaseMemberCandidates('').then(setAvailableUsers);
      }
  }, [isAddingMember]);

  // Handle Inline Updates
  const handleUpdate = async (field: keyof Case, value: any) => {
      // Optimistic update
      setCaseData(prev => ({ ...prev, [field]: value }));

      try {
          if (field === 'stage') {
              const updated = await updateCaseStage(caseData.id, value);
              if (updated && onCaseUpdated) {
                  onCaseUpdated({ stage: updated.stage });
              }
          } else if (field === 'nextDeadline') {
              await updateCaseDeadline(caseData.id, value);
              if (onCaseUpdated) {
                  onCaseUpdated({ nextDeadline: value });
              }
          } else {
              await updateCaseGeneralInfo(caseData.id, { [field]: value });
              if (onCaseUpdated) {
                  onCaseUpdated({ [field]: value } as Partial<Case>);
              }
          }
      } catch {
          // apiClient 拦截器已 toast.error()，回滚由父组件重新加载时处理
      }
  };

  // Search Logic
  useEffect(() => {
      if (searchQuery.length < 2) {
          setSearchResults([]);
          return;
      }
      const timer = setTimeout(async () => {
          setIsSearching(true);
          const results = await searchIssues({ search: searchQuery });
          // Filter out self
          setSearchResults(results.filter(i => i.id !== caseData.id));
          setIsSearching(false);
      }, 300);
      return () => clearTimeout(timer);
  }, [searchQuery, caseData.id]);

  const handleAddLink = async () => {
      if (!selectedIssue) return;
      setIsSubmittingLink(true);
      await addCaseLink(caseData.id, {
          targetId: selectedIssue.id,
          targetKey: selectedIssue.key,
          type: relationType as any
      });
      setIsSubmittingLink(false);
      setIsLinkMode(false);
      setSearchQuery('');
      setSelectedIssue(null);
  };

  const handleAddMember = async () => {
      if (!selectedUserId) return;
      const userToAdd = availableUsers.find(u => u.id === selectedUserId);
      if (!userToAdd) return;

      const newMember: CaseMember = {
          userId: userToAdd.id,
          userName: userToAdd.name,
          role: selectedRole,
          joinedAt: new Date().toISOString().split('T')[0]
      };

      try {
          await addCaseMember(caseData.id, { userId: userToAdd.id, roleCode: selectedRole });
          setCaseData(prev => ({
              ...prev,
              members: [...(prev.members || []), newMember],
          }));
          setIsAddingMember(false);
          setSelectedUserId('');
      } catch {
          // apiClient 标准拦截器已 toast.error()，此处仅阻止乐观更新写入
      }
  };

  const handleRemoveMember = async (userId: string) => {
      if(window.confirm('确定移除该成员的访问权限吗？')) {
          try {
              await removeCaseMember(caseData.id, userId);
              setCaseData(prev => ({
                  ...prev,
                  members: (prev.members || []).filter(m => m.userId !== userId),
              }));
          } catch {
              // apiClient 标准拦截器已 toast.error()
          }
      }
  };

  // Merge legacy relatedCases and new linkedIssues for display
  const allLinks = [
      ...(caseData.linkedIssues || []),
      ...(caseData.relatedCases?.map(r => ({
          targetId: r.targetCaseId,
          targetKey: r.targetCaseId, // Legacy has no key
          type: r.relationType,
          description: r.description
      })) || [])
  ];

  return (
    <div className="w-80 bg-slate-50/50 border-l border-slate-200 flex flex-col h-full overflow-y-auto custom-scrollbar">
        
        {/* Status Group */}
        <div className="p-4 border-b border-slate-200 bg-white">
            <div className="mb-3">
                <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">当前阶段 (Stage)</label>
                <select 
                    className="w-full text-sm font-bold text-slate-700 border border-slate-300 rounded px-2 py-1.5 bg-slate-50 outline-none focus:ring-2 focus:ring-brand-500 hover:bg-white transition-colors cursor-pointer"
                    value={caseData.stage}
                    onChange={(e) => handleUpdate('stage', e.target.value)}
                >
                    {Object.values(CaseStage || {}).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">风险等级 (Risk)</label>
                <div className="relative group">
                    <select 
                        className={`w-full appearance-none pl-9 pr-3 py-1.5 rounded border text-sm font-bold outline-none focus:ring-2 cursor-pointer ${
                            caseData.riskLevel === (RiskLevel?.CRITICAL || '特大') ? 'bg-red-50 border-red-200 text-red-700 focus:ring-red-200' :
                            caseData.riskLevel === (RiskLevel?.HIGH || '重大') ? 'bg-orange-50 border-orange-200 text-orange-700 focus:ring-orange-200' :
                            'bg-slate-50 border-slate-200 text-slate-600 focus:ring-slate-200'
                        }`}
                        value={caseData.riskLevel}
                        onChange={(e) => handleUpdate('riskLevel', e.target.value)}
                    >
                        {Object.values(RiskLevel || {}).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <ShieldAlert className={`w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                        caseData.riskLevel === (RiskLevel?.CRITICAL || '特大') ? 'text-red-600' :
                        caseData.riskLevel === (RiskLevel?.HIGH || '重大') ? 'text-orange-600' : 'text-slate-400'
                    }`} />
                    <ChevronDown className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
            </div>
        </div>

        {/* 1. Details */}
        <GroupHeader title="案件详情 (Details)">
            <Field label="涉案金额 (Claimed)" value={`¥ ${(finance?.claimedAmount || 0).toLocaleString()}`} icon={Coins} highlight />
            <Field 
                label="业务条线" 
                value={caseData.businessLine} 
                icon={Briefcase} 
            />
            <Field 
                label="管辖法院" 
                value={caseData.court} 
                icon={Building2} 
                onEdit={(val) => handleUpdate('court', val)} 
            />
            <Field label="案号" value={caseData.code} icon={Hash} />
        </GroupHeader>

        {/* 2. ACL (Authorized Personnel) */}
        <GroupHeader 
            title="授权成员 (Access)"
            action={
                <button 
                    onClick={() => setIsAddingMember(!isAddingMember)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors" 
                    title="添加成员"
                >
                    <UserPlus className="w-3.5 h-3.5" />
                </button>
            }
        >
            {isAddingMember && (
                <div className="mb-3 p-3 bg-white border border-brand-200 rounded-lg shadow-sm animate-in fade-in zoom-in-95">
                    <div className="text-xs font-bold text-slate-700 mb-2">添加新成员</div>
                    <div className="space-y-2">
                        <select 
                            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 outline-none focus:border-brand-500"
                            value={selectedUserId}
                            onChange={e => setSelectedUserId(e.target.value)}
                        >
                            <option value="">选择用户...</option>
                            {availableUsers.filter(u => !caseData.authorizedMembers?.some(m => m.userId === u.id)).map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                            ))}
                        </select>
                        <select 
                            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 outline-none focus:border-brand-500"
                            value={selectedRole}
                            onChange={e => setSelectedRole(e.target.value as any)}
                        >
                            <option value="MEMBER">成员 (Member)</option>
                            <option value="GUEST">访客 (Guest)</option>
                        </select>
                        <div className="flex justify-end gap-2 pt-1">
                            <Button size="sm" variant="ghost" onClick={() => setIsAddingMember(false)} className="h-6 text-xs px-2">取消</Button>
                            <Button size="sm" onClick={handleAddMember} disabled={!selectedUserId} className="h-6 text-xs px-2">
                                确认添加
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {(caseData.authorizedMembers || []).map((member) => (
                    <div key={member.userId} className="flex items-center justify-between group p-1.5 hover:bg-slate-100 rounded transition-colors">
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                                member.role === 'OWNER' ? 'bg-amber-100 text-amber-700 border-amber-200' : 
                                member.role === 'MEMBER' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                                {member.userName.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-slate-700">{member.userName}</span>
                                <span className="text-[9px] text-slate-400 leading-none">{member.role}</span>
                            </div>
                        </div>
                        {member.role !== 'OWNER' && (
                            <button 
                                onClick={() => handleRemoveMember(member.userId)}
                                className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="移除权限"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                        {member.role === 'OWNER' && <Shield className="w-3 h-3 text-amber-400 fill-amber-100" />}
                    </div>
                ))}
            </div>
        </GroupHeader>

        {/* 3. People (External) */}
        <GroupHeader title="外部人员 (External)">
            <Field
                label="外部律师 (Lawyer)"
                value={externalCounselName || undefined}
                icon={UserCircle}
            />
        </GroupHeader>

        {/* 4. Dates */}
        <GroupHeader title="关键日期 (Dates)">
            <Field 
                label="立案日期" 
                value={caseData.filingDate} 
                icon={Calendar}
                inputType="date"
                onEdit={(val) => handleUpdate('filingDate', val)} 
            />
            <div className="mb-3">
                <div className="text-[10px] text-slate-400 font-medium mb-1 flex justify-between">
                    下一节点 (Deadline)
                </div>
                <div className={`flex items-center gap-2 text-sm font-bold p-1.5 -ml-1.5 rounded transition-colors group cursor-pointer ${
                    caseData.nextDeadline && new Date(caseData.nextDeadline) < new Date() ? 'bg-red-50 text-red-600' : 'hover:bg-slate-100 text-slate-800'
                }`}>
                    <Clock className="w-3.5 h-3.5" />
                    <input 
                        type="date"
                        className="bg-transparent border-none outline-none p-0 text-sm font-bold w-full cursor-pointer"
                        value={caseData.nextDeadline || ''}
                        onChange={(e) => handleUpdate('nextDeadline', e.target.value)}
                    />
                </div>
            </div>
        </GroupHeader>

        {/* 5. Linked Issues (Interactive) */}
        <GroupHeader 
            title="关联事项 (Links)" 
            action={
                <button 
                    onClick={() => setIsLinkMode(!isLinkMode)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors" 
                    title="添加关联"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
            }
        >
            {isLinkMode && (
                <div className="mb-3 p-3 bg-white border border-brand-200 rounded-lg shadow-sm animate-in fade-in zoom-in-95">
                    <div className="text-xs font-bold text-slate-700 mb-2">添加新关联</div>
                    
                    {/* Search Input */}
                    <div className="relative mb-2">
                        <input 
                            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 pl-7 outline-none focus:border-brand-500"
                            placeholder="搜索 Issue Key 或 标题..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                        {isSearching && <Loader2 className="w-3 h-3 text-brand-500 animate-spin absolute right-2 top-2" />}
                    </div>

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && !selectedIssue && (
                        <div className="max-h-32 overflow-y-auto border border-slate-200 rounded bg-white mb-2 shadow-sm custom-scrollbar">
                            {searchResults.map(res => (
                                <div 
                                    key={res.id} 
                                    className="px-2 py-1.5 hover:bg-slate-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                    onClick={() => setSelectedIssue(res)}
                                >
                                    <div className="font-bold text-slate-700">{res.key}</div>
                                    <div className="truncate text-slate-500">{res.title}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Selected Item Preview & Config */}
                    {selectedIssue && (
                        <div className="mb-2">
                            <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-200 text-xs mb-2">
                                <span className="font-mono font-bold text-slate-700">{selectedIssue.key}</span>
                                <button onClick={() => setSelectedIssue(null)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                            </div>
                            <select 
                                className="w-full text-xs border border-slate-300 rounded px-2 py-1 outline-none"
                                value={relationType}
                                onChange={e => setRelationType(e.target.value)}
                            >
                                <option value="RELATES_TO">关联 (Relates to)</option>
                                <option value="BLOCKS">阻塞 (Blocks)</option>
                                <option value="BLOCKED_BY">被阻塞 (Blocked by)</option>
                                <option value="CAUSES">导致 (Causes)</option>
                            </select>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 mt-2">
                        <Button size="sm" variant="ghost" onClick={() => setIsLinkMode(false)} className="h-6 text-xs px-2">取消</Button>
                        <Button size="sm" onClick={handleAddLink} disabled={!selectedIssue} isLoading={isSubmittingLink} className="h-6 text-xs px-2">
                            确认
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {allLinks.length === 0 && !isLinkMode && (
                    <p className="text-xs text-slate-400 italic text-center py-2">暂无关联事项</p>
                )}
                {allLinks.map((link, idx) => (
                    <div key={idx} className="text-xs bg-white border border-slate-200 rounded p-2 shadow-sm group hover:border-slate-300 transition-colors flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 font-bold">
                            {link.type === 'BLOCKS' ? <AlertTriangle className="w-3 h-3 text-red-500" /> : 
                             link.type === 'BLOCKED_BY' ? <Lock className="w-3 h-3 text-amber-500" /> : 
                             <Link2 className="w-3 h-3 text-slate-400" />}
                            <span className={
                                link.type === 'BLOCKS' ? 'text-red-700' : 
                                link.type === 'BLOCKED_BY' ? 'text-amber-700' : 'text-slate-600'
                            }>
                                {link.type === 'BLOCKS' ? '阻塞 (Blocks)' : 
                                 link.type === 'BLOCKED_BY' ? '被阻塞 (Blocked by)' : 
                                 link.type === 'CAUSES' ? '导致 (Causes)' :
                                 '关联 (Relates to)'}
                            </span>
                        </div>
                        <a href={`#/cases/${link.targetId}`} className="flex justify-between items-center text-brand-600 hover:underline font-mono pl-4.5">
                            {link.targetKey}
                            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                        {(link as any).description && <p className="text-slate-400 leading-tight pl-4.5 text-[10px]">{(link as any).description}</p>}
                    </div>
                ))}
            </div>
        </GroupHeader>

        {/* 6. Context */}
        <GroupHeader title="关联上下文 (Context)">
            <Field label="关联证券" value={caseData.regulatoryAttrs?.securityName} icon={Hash} isLink />
            <Field label="关联项目" value={caseData.regulatoryAttrs?.securityCode ? `PROJ-${caseData.regulatoryAttrs.securityCode}` : '未绑定'} icon={Briefcase} isLink />
        </GroupHeader>

        <div className="p-4 text-[10px] text-slate-400 text-center">
            Case ID: {caseData.id} <br/>
            Created: {caseData.createdAt ? new Date(caseData.createdAt).toLocaleDateString('zh-CN') : '—'}
        </div>
    </div>
  );
};

export default CaseSidebar;
