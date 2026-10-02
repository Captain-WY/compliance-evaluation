import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, Users, Building2, Folder, MapPin, ChevronRight, ChevronDown, Crown, Shield, FileText, Eye, Plus, Trash2, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { systemApi } from '../../services/api';
import type { OrgNode, Personnel, RoleAssignment, SystemRole } from '../../services/api';

const roleIconMap = {
  crown: Crown,
  building: Building2,
  fileText: FileText,
  shield: Shield,
  mapPin: MapPin,
  eye: Eye,
} as const;


export default function OrgPermissionMatrix() {
  const [orgTree, setOrgTree] = useState<OrgNode>({
    id: 'ORG-LOADING',
    name: '组织加载中',
    type: 'root',
    children: [],
  });
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'org' | 'role'>('org');

  // Tab 1 state
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tree expanded state
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'org-1': true,
    'org-2': true,
    'org-3': true,
  });

  // Tab 2 state
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  
  // Add Member Modal State
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [modalSelectedOrgId, setModalSelectedOrgId] = useState<string>('');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSelectedPersonnel, setModalSelectedPersonnel] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      systemApi.getOrgTree(),
      systemApi.getPersonnel(),
      systemApi.getRoles(),
      systemApi.getRoleAssignments(),
    ])
      .then(([tree, people, loadedRoles, assignments]) => {
        if (cancelled) return;
        setOrgTree(tree);
        setPersonnel(people);
        setRoles(loadedRoles);
        setRoleAssignments(assignments);
        setSelectedOrgId(current => current || tree.id);
        setModalSelectedOrgId(tree.id);
        setSelectedRoleId(current => current || loadedRoles[0]?.id || '');
        setExpandedNodes({
          [tree.id]: true,
          ...Object.fromEntries((tree.children ?? []).slice(0, 3).map(child => [child.id, true])),
        });
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '组织权限数据加载失败');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const flattenOrgList = (node: OrgNode): OrgNode[] => {
    let list = [node];
    if (node.children) {
      node.children.forEach(child => {
        list = list.concat(flattenOrgList(child));
      });
    }
    return list;
  };

  const getOrgName = (id: string) => {
    const list = flattenOrgList(orgTree);
    return list.find(n => n.id === id)?.name || '未知部门';
  };

  const getOrgPath = (id: string, node: OrgNode = orgTree, path: string = ''): string | null => {
    const currentPath = path ? `${path} / ${node.name}` : node.name;
    if (node.id === id) return currentPath;
    if (node.children) {
      for (const child of node.children) {
        const found = getOrgPath(id, child, currentPath);
        if (found) return found;
      }
    }
    return null;
  };

  const filteredPersonnel = personnel.filter(p => {
    const matchesOrg = p.orgId === selectedOrgId;
    const matchesSearch = p.name.includes(searchQuery) || p.employeeId.includes(searchQuery);
    return matchesOrg && matchesSearch;
  });

  const renderTree = (node: OrgNode, currentSelectedId: string, onSelect: (id: string) => void, level = 0) => {
    const isExpanded = !!expandedNodes[node.id];
    const isSelected = currentSelectedId === node.id;
    const hasChildren = !!node.children && node.children.length > 0;

    let Icon = Folder;
    if (node.type === 'root') Icon = Building2;
    if (node.type === 'branch') Icon = Folder;
    if (node.type === 'sub-branch') Icon = MapPin;

    return (
      <div key={node.id} className="select-none">
        <div 
          className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer transition-colors text-sm ${
            isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onSelect(node.id)}
        >
          <div 
            className="w-4 h-4 mr-1 flex items-center justify-center shrink-0" 
            onClick={(e) => {
              if (hasChildren) {
                e.stopPropagation();
                toggleNode(node.id);
              }
            }}
          >
            {hasChildren && (
              isExpanded ? 
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : 
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </div>
          <Icon className={`w-4 h-4 mr-2 shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
          <span className={`truncate ${isSelected ? 'font-semibold' : ''}`}>{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderTree(child, currentSelectedId, onSelect, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleRemoveRole = async (personnelId: string) => {
    const assignment = roleAssignments.find(r => r.roleId === selectedRoleId && r.personnelId === personnelId);
    if (assignment?.assignmentId) {
      await systemApi.deleteRoleAssignment(assignment.assignmentId);
    }
    setRoleAssignments(prev => prev.filter(r => !(r.roleId === selectedRoleId && r.personnelId === personnelId)));
  };

  const handleOpenAddMemberModal = () => {
    setModalSelectedOrgId(orgTree.id);
    setModalSearchQuery('');
    setModalSelectedPersonnel(new Set());
    setIsAddMemberModalOpen(true);
  };

  const handleConfirmAddMembers = async () => {
    const newAssignments = await Promise.all(Array.from<string>(modalSelectedPersonnel).map(pid => {
      const person = personnel.find(item => item.id === pid);
      return systemApi.createRoleAssignment({
        roleId: selectedRoleId,
        personnelId: pid,
        orgId: person?.orgId || modalSelectedOrgId,
      });
    }));
    
    // Filter out duplicates
    const filteredNewAssignments = newAssignments.filter(na => 
      !roleAssignments.some(ra => ra.roleId === na.roleId && ra.personnelId === na.personnelId)
    );

    setRoleAssignments([...roleAssignments, ...filteredNewAssignments]);
    setIsAddMemberModalOpen(false);
  };

  // --- Render Tab 1 (Org Mirror) ---
  const renderOrgMirror = () => (
    <div className="flex bg-slate-50 flex-1 overflow-hidden h-full">
      {/* 左侧组织树 */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col p-4 overflow-y-auto shrink-0">
        <h2 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4 text-sm uppercase tracking-wider">组织树</h2>
        <div className="flex-1">
          {renderTree(orgTree, selectedOrgId, setSelectedOrgId)}
        </div>
      </div>

      {/* 右侧人员列表 */}
      <div className="flex-1 p-6 overflow-y-auto w-full">
        <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
            <h2 className="text-lg font-bold text-slate-800 flex items-center">
              {getOrgName(selectedOrgId)}
              <Badge variant="secondary" className="ml-3 bg-slate-100 text-slate-600 hover:bg-slate-100">
                共 {filteredPersonnel.length} 人
              </Badge>
            </h2>
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索姓名或工号..." 
                className="pl-9 h-9"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                <TableRow>
                  <TableHead className="w-[120px]">姓名</TableHead>
                  <TableHead className="w-[120px]">工号</TableHead>
                  <TableHead>岗位名称</TableHead>
                  <TableHead className="w-[150px]">外部系统状态</TableHead>
                  <TableHead className="text-right w-[150px]">最后同步日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPersonnel.length > 0 ? (
                  filteredPersonnel.map((person) => (
                    <TableRow key={person.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-900">{person.name}</TableCell>
                      <TableCell className="font-mono text-slate-500 text-sm">{person.employeeId}</TableCell>
                      <TableCell className="text-slate-700">{person.title}</TableCell>
                      <TableCell>
                        {person.status === 'active' ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none shadow-none">
                            在职
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-none shadow-none">
                            已离职
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-slate-500 text-sm">{person.lastSyncDate}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48 text-center text-slate-500">
                      该部门下暂无人员数据或无搜索结果
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );

  // --- Render Tab 2 (Role Matrix) ---
  const renderRoleMatrix = () => {
    const selectedRole = roles.find(r => r.id === selectedRoleId);
    
    // Get assigned personnel for the selected role
    const assignedPersonnelIds = roleAssignments.filter(r => r.roleId === selectedRoleId).map(a => a.personnelId);
    let assignedPersonnel = assignedPersonnelIds.map(id => personnel.find(p => p.id === id)!).filter(Boolean);
    
    if (roleSearchQuery) {
      assignedPersonnel = assignedPersonnel.filter(p => p.name.includes(roleSearchQuery) || p.employeeId.includes(roleSearchQuery));
    }

    return (
      <div className="flex bg-slate-50 flex-1 overflow-hidden h-full">
        {/* 左侧角色列表 */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col p-4 overflow-y-auto shrink-0">
          <h2 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4 text-sm uppercase tracking-wider">系统角色列表</h2>
          <div className="flex-1 space-y-1 mt-2">
            {roles.map((role) => {
              const RoleIcon = roleIconMap[role.iconKey];
              const isSelected = selectedRoleId === role.id;
              return (
                <div 
                  key={role.id}
                  className={`flex items-center p-3 rounded-lg cursor-pointer transition-all ${
                    isSelected ? 'bg-indigo-600 shadow-md transform scale-[1.02]' : 'hover:bg-slate-100'
                  }`}
                  onClick={() => setSelectedRoleId(role.id)}
                >
                  <div className={`p-2 rounded-md mr-3 shrink-0 ${isSelected ? 'bg-indigo-500/30' : 'bg-slate-100 text-slate-500'}`}>
                    <RoleIcon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                      {role.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧角色授权工作台 */}
        <div className="flex-1 p-6 overflow-y-auto w-full">
          <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg shadow-sm">
            {selectedRole && (
              <div className="p-5 border-b border-slate-200 bg-slate-50 rounded-t-lg shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center">
                      当前角色: {selectedRole.name}
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm">{selectedRole.description}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="relative w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input 
                  value={roleSearchQuery}
                  onChange={(e) => setRoleSearchQuery(e.target.value)}
                  placeholder="在当前角色中搜索成员..." 
                  className="pl-9 h-9"
                />
              </div>
              <Button onClick={handleOpenAddMemberModal} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                <Plus className="w-4 h-4 mr-2" />
                添加该角色成员
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <TableRow>
                    <TableHead className="w-[120px]">姓名</TableHead>
                    <TableHead>所属机构</TableHead>
                    <TableHead>OA 岗位</TableHead>
                    <TableHead className="w-[160px]">状态</TableHead>
                    <TableHead className="text-right w-[120px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedPersonnel.length > 0 ? (
                    assignedPersonnel.map((person) => {
                      const isExpired = person.status !== 'active';
                      return (
                        <TableRow key={person.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold mr-3 shrink-0">
                                {person.name.charAt(0)}
                              </div>
                              <div className={isExpired ? 'text-slate-400' : 'text-slate-900'}>
                                {person.name}
                                <div className="text-xs text-slate-500 font-mono mt-0.5">{person.employeeId}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className={isExpired ? 'text-slate-400' : 'text-slate-700'}>
                            {getOrgPath(person.orgId)}
                          </TableCell>
                          <TableCell className={isExpired ? 'text-slate-400' : 'text-slate-700'}>{person.title}</TableCell>
                          <TableCell>
                            {isExpired ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger className="inline-flex cursor-help">
                                    <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-none shadow-none flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      权限已失效
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>OA系统中该员工已离职，权限自动封禁</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none shadow-none">
                                正常
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              onClick={() => handleRemoveRole(person.id)} 
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 px-2"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              移除授权
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center text-slate-500">
                        该角色下暂无人员数据或无搜索结果
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* 顶部状态栏 */}
      <div className="pt-4 px-6 bg-white border-b flex flex-col shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-800 flex items-center">
            {activeTab === 'org' ? (
              <Users className="w-5 h-5 mr-2 text-indigo-600" />
            ) : (
              <Shield className="w-5 h-5 mr-2 text-indigo-600" />
            )}
            组织与权限矩阵
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400">数据最后同步时间: 2026-05-11 09:00</span>
            <Button size="sm" variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100">
              <RefreshCw className="w-4 h-4 mr-2" /> 
              手动同步 OA 数据
            </Button>
          </div>
        </div>
        
        <div className="flex items-center border-b border-transparent space-x-6">
          <button 
            className={`pb-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'org' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
            onClick={() => setActiveTab('org')}
          >
            组织架构镜像 (Read-Only)
          </button>
          <button 
            className={`pb-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'role' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
            onClick={() => setActiveTab('role')}
          >
            角色与权限矩阵
          </button>
        </div>
      </div>

      {loadError && (
        <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex-1 bg-slate-50 p-8 text-center text-slate-500">正在加载真实组织与权限数据...</div>
      ) : activeTab === 'org' ? renderOrgMirror() : renderRoleMatrix()}

      {/* Add Member Modal (Full page overlay) */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[900px] h-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  添加成员至 "{roles.find(r => r.id === selectedRoleId)?.name}"
                </h3>
                <p className="text-sm text-slate-500 mt-1">从左侧组织架构中选择人员并勾选添加。</p>
              </div>
              <button 
                onClick={() => setIsAddMemberModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Tree */}
              <div className="w-64 border-r border-slate-200 p-4 overflow-y-auto bg-slate-50">
                {renderTree(orgTree, modalSelectedOrgId, setModalSelectedOrgId)}
              </div>
              
              {/* Right Personnel Selection */}
              <div className="flex-1 flex flex-col bg-white">
                <div className="p-4 border-b border-slate-100 shrink-0">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input 
                      value={modalSearchQuery}
                      onChange={(e) => setModalSearchQuery(e.target.value)}
                      placeholder="搜索姓名..." 
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <div className="space-y-1">
                    {personnel
                      .filter(p => p.orgId === modalSelectedOrgId && p.status === 'active' && p.name.includes(modalSearchQuery))
                      .map(person => {
                        const isSelected = modalSelectedPersonnel.has(person.id);
                        // Disable if they are already assigned to this role
                        const isAlreadyAssigned = roleAssignments.some(ra => ra.roleId === selectedRoleId && ra.personnelId === person.id);
                        
                        return (
                          <div 
                            key={person.id}
                            onClick={() => {
                              if (isAlreadyAssigned) return;
                              const newSet = new Set(modalSelectedPersonnel);
                              if (isSelected) newSet.delete(person.id);
                              else newSet.add(person.id);
                              setModalSelectedPersonnel(newSet);
                            }}
                            className={`flex items-center justify-between p-3 rounded-lg transition-colors border ${
                              isAlreadyAssigned 
                                ? 'bg-slate-50 border-slate-100 cursor-not-allowed opacity-60' 
                                : isSelected
                                ? 'border-indigo-600 bg-indigo-50/50 cursor-pointer'
                                : 'border-transparent hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-800">{person.name}</span>
                              <span className="text-xs text-slate-500 mt-0.5">{person.employeeId} - {person.title}</span>
                            </div>
                            <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                              isAlreadyAssigned
                                ? 'bg-slate-200 border-slate-300'
                                : isSelected 
                                ? 'bg-indigo-600 border-indigo-600' 
                                : 'border-slate-300'
                            }`}>
                              {(isSelected || isAlreadyAssigned) && (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      
                      {personnel.filter(p => p.orgId === modalSelectedOrgId && p.status === 'active' && p.name.includes(modalSearchQuery)).length === 0 && (
                        <div className="p-8 text-center text-slate-500 text-sm">
                          该部门下没有可分配的人员
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-white shrink-0">
              <span className="text-sm text-slate-500">
                已选择 <strong className="text-indigo-600">{modalSelectedPersonnel.size}</strong> 名成员
              </span>
              <div className="space-x-3">
                <Button variant="outline" onClick={() => setIsAddMemberModalOpen(false)}>取消</Button>
                <Button 
                  onClick={handleConfirmAddMembers} 
                  disabled={modalSelectedPersonnel.size === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  确认授权
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
