import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  API_MODE,
  systemApi,
  workflowApi,
  type Personnel,
  type SystemRole,
  type WorkflowApproverSelector,
  type WorkflowNode,
  type WorkflowRouteChain,
  type WorkflowTemplateAggregate,
  type WorkflowTemplateDetail,
  type WorkflowValidationResponse,
} from "../../services/api";

type LoadState = "idle" | "loading" | "ready" | "empty" | "error" | "denied";

const LEVEL_LABELS: Record<WorkflowNode["level"], string> = {
  L0_SELF_CHECK: "L0 自检发起",
  L1_BRANCH_REVIEW: "L1 分支复核",
  L2_LINE_REVIEW: "L2 条线复核",
  L3_HQ_FINAL: "L3 总部终审",
};

const SCOPE_LABELS: Record<string, string> = {
  by_business_line: "按业务条线",
  by_org: "按机构",
  by_region: "按区域",
};

const roleFallbackNames: Record<string, string> = {
  ROLE_BRANCH_COMPLIANCE_OFFICER: "营业部合规专员",
  ROLE_BRANCH_MANAGER: "分支机构负责人",
  ROLE_BUSINESS_LINE_MANAGER: "条线总部管理员",
  ROLE_COMPLIANCE_MANAGER: "总部合规部管理员",
  ROLE_COMPLIANCE_DIRECTOR: "合规总监",
};

const selectorLabel = (
  selector: WorkflowApproverSelector,
  roleNameById: Record<string, string>,
  personnelNameById: Record<string, string>,
) => {
  if (selector.selectorType === "USER") {
    return personnelNameById[selector.userId ?? ""] ?? selector.userId ?? "未指定人员";
  }
  return roleNameById[selector.roleCode ?? ""] ?? roleFallbackNames[selector.roleCode ?? ""] ?? selector.roleCode ?? "未指定角色";
};

const sortedNodes = (chain: WorkflowRouteChain) =>
  [...chain.nodes].sort((left, right) => left.sortOrder - right.sortOrder);

const rebuildSequentialEdges = (chain: WorkflowRouteChain): WorkflowRouteChain => {
  const nodes = sortedNodes(chain);
  return {
    ...chain,
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      edgeId: `WFE-${node.nodeId}-${nodes[index + 1].nodeId}`,
      fromNodeId: node.nodeId,
      toNodeId: nodes[index + 1].nodeId,
      condition: { conditionType: "ALWAYS" },
    })),
  };
};

const isPermissionError = (message: string) =>
  /permission|forbidden|403|无权|未授权|denied/i.test(message);

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function WorkflowRoutingDesigner() {
  const isRealBacked = API_MODE === "real" || API_MODE === "hybrid";
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [draft, setDraft] = useState<WorkflowTemplateAggregate | null>(null);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validation, setValidation] = useState<WorkflowValidationResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const roleNameById = useMemo(
    () => Object.fromEntries(roles.map(role => [role.id, role.name])),
    [roles],
  );
  const personnelNameById = useMemo(
    () => Object.fromEntries(personnel.map(person => [person.id, person.name])),
    [personnel],
  );

  const roleChoices = useMemo(() => {
    const fromTemplate = new Set<string>();
    draft?.chains.forEach(chain => {
      chain.nodes.forEach(node => {
        if (node.approverSelector.roleCode) fromTemplate.add(node.approverSelector.roleCode);
      });
    });
    return [
      ...roles.map(role => ({ id: role.id, name: role.name })),
      ...[...fromTemplate]
        .filter(roleId => !roles.some(role => role.id === roleId))
        .map(roleId => ({ id: roleId, name: roleFallbackNames[roleId] ?? roleId })),
    ];
  }, [draft?.chains, roles]);

  const personnelChoices = useMemo(
    () => personnel.map(person => ({ id: person.id, name: person.name })),
    [personnel],
  );

  const loadTemplate = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    setActionError(null);
    setValidation(null);
    try {
      const [page, roleRows, peopleRows] = await Promise.all([
        workflowApi.listTemplates(),
        systemApi.getRoles().catch(error => {
          setSelectorError(errorMessage(error, "审批角色选项加载失败"));
          return [];
        }),
        systemApi.getPersonnel().catch(error => {
          setSelectorError(errorMessage(error, "审批人员选项加载失败"));
          return [];
        }),
      ]);
      setRoles(roleRows);
      setPersonnel(peopleRows);
      const first = page.items[0];
      if (!first) {
        setDetail(null);
        setDraft(null);
        setLoadState("empty");
        return;
      }
      const templateDetail = await workflowApi.getTemplate(first.templateId);
      setDetail(templateDetail);
      setDraft(templateDetail.template);
      setDirty(false);
      setLoadState("ready");
    } catch (error) {
      const message = errorMessage(error, "工作流模板加载失败");
      setLoadError(message);
      setLoadState(isPermissionError(message) ? "denied" : "error");
    }
  }, []);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  const updateDraft = (updater: (template: WorkflowTemplateAggregate) => WorkflowTemplateAggregate) => {
    setDraft(previous => {
      if (!previous) return previous;
      const next = updater(previous);
      setDirty(true);
      setValidation(null);
      setActionError(null);
      return next;
    });
  };

  const updateChain = (
    chainId: string,
    updater: (chain: WorkflowRouteChain) => WorkflowRouteChain,
  ) => {
    updateDraft(template => ({
      ...template,
      chains: template.chains.map(chain => chain.chainId === chainId ? updater(chain) : chain),
    }));
  };

  const updateNode = (
    chainId: string,
    nodeId: string,
    updater: (node: WorkflowNode) => WorkflowNode,
  ) => {
    updateChain(chainId, chain => ({
      ...chain,
      nodes: chain.nodes.map(node => node.nodeId === nodeId ? updater(node) : node),
    }));
  };

  const addNode = (chainId: string) => {
    updateChain(chainId, chain => {
      const nodes = sortedNodes(chain);
      const finalNode = nodes.find(node => node.isFinal);
      const insertOrder = finalNode ? finalNode.sortOrder - 1 : nodes.length * 10 + 10;
      const newNode: WorkflowNode = {
        nodeId: `WFN-DRAFT-${Date.now()}`,
        level: "L2_LINE_REVIEW",
        nodeType: "ORG_ROLE",
        approverSelector: {
          selectorType: "ORG_ROLE",
          roleCode: "ROLE_COMPLIANCE_MANAGER",
          orgScopeRule: "HQ_GLOBAL",
        },
        sortOrder: insertOrder,
        isFinal: false,
        label: "新增复核节点",
      };
      return rebuildSequentialEdges({
        ...chain,
        nodes: [...nodes, newNode].map((node, index) => ({
          ...node,
          sortOrder: (index + 1) * 10,
        })),
      });
    });
  };

  const removeNode = (chainId: string, nodeId: string) => {
    updateChain(chainId, chain => {
      const nextNodes = chain.nodes.filter(node => node.nodeId !== nodeId);
      return rebuildSequentialEdges({
        ...chain,
        nodes: nextNodes.map((node, index) => ({ ...node, sortOrder: (index + 1) * 10 })),
      });
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setActionError(null);
    try {
      const nextDetail = await workflowApi.saveDraft(draft.templateId, {
        name: draft.name,
        scopeMode: draft.scopeMode,
        chains: draft.chains,
      });
      setDetail(nextDetail);
      setDraft(nextDetail.template);
      setDirty(false);
      toast.success("工作流草稿已保存");
    } catch (error) {
      const message = errorMessage(error, "工作流草稿保存失败");
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    if (!draft) return;
    setValidating(true);
    setActionError(null);
    try {
      const result = await workflowApi.validate(draft.templateId);
      setValidation(result);
      if (result.summary.errorCount > 0) {
        toast.error(`校验发现 ${result.summary.errorCount} 个阻断项`);
      } else {
        toast.success("工作流模板校验通过");
      }
    } catch (error) {
      const message = errorMessage(error, "工作流模板校验失败");
      setActionError(message);
      toast.error(message);
    } finally {
      setValidating(false);
    }
  };

  const handlePublish = async () => {
    if (!draft) return;
    setPublishing(true);
    setActionError(null);
    try {
      const result = await workflowApi.publish(draft.templateId);
      setDetail(result.template);
      setDraft(result.template.template);
      setDirty(false);
      setValidation(null);
      toast.success(result.duplicate ? "工作流模板已是当前发布版本" : "工作流模板已发布");
    } catch (error) {
      const message = errorMessage(error, "工作流模板发布失败");
      setActionError(message);
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  const validationSummary = validation?.summary ?? detail?.lastValidationSummary;
  const canEdit = draft?.status === "DRAFT";
  const publishBlockedByErrors = (validationSummary?.errorCount ?? 0) > 0;

  if (loadState === "loading" || loadState === "idle") {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载工作流模板...
      </div>
    );
  }

  if (loadState === "denied") {
    return (
      <div className="h-full bg-slate-50 p-6">
        <Alert variant="destructive" className="max-w-3xl">
          <AlertTriangle />
          <AlertTitle>无权访问工作流路由设计器</AlertTitle>
          <AlertDescription>{loadError ?? "当前账号缺少工作流模板权限。"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="h-full bg-slate-50 p-6">
        <Alert variant="destructive" className="max-w-3xl">
          <AlertTriangle />
          <AlertTitle>工作流模板加载失败</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button className="mt-4" variant="outline" onClick={() => void loadTemplate()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          重新加载
        </Button>
      </div>
    );
  }

  if (loadState === "empty" || !draft) {
    return (
      <div className="h-full bg-slate-50 p-6">
        <Alert className="max-w-3xl border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle />
          <AlertTitle>没有可编辑的 seeded/bootstrap 模板</AlertTitle>
          <AlertDescription>
            冻结契约没有公开创建模板 API；需要后端 seed 或内部 bootstrap draft 后才能继续。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">考核审批路由模板</h1>
              <Badge variant={draft.status === "ACTIVE" ? "default" : "secondary"}>
                {draft.status}
              </Badge>
              <Badge variant="outline">{API_MODE}</Badge>
              {dirty && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">草稿未保存</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {detail?.templateId} · {SCOPE_LABELS[draft.scopeMode] ?? draft.scopeMode} · {draft.chains.length} 条路由链
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void loadTemplate()} disabled={saving || validating || publishing}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
            <Button variant="outline" onClick={() => void handleSave()} disabled={!canEdit || !dirty || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              保存草稿
            </Button>
            <Button variant="outline" onClick={() => void handleValidate()} disabled={dirty || validating}>
              {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              服务端校验
            </Button>
            <Button onClick={() => void handlePublish()} disabled={!canEdit || dirty || publishBlockedByErrors || publishing}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              发布版本
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          {isRealBacked && actionError && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>真实 API 操作失败</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          {selectorError && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle />
              <AlertTitle>审批人选项未完整加载</AlertTitle>
              <AlertDescription>{selectorError}</AlertDescription>
            </Alert>
          )}
          {!canEdit && (
            <Alert>
              <Shield />
              <AlertTitle>当前模板已发布</AlertTitle>
              <AlertDescription>
                已发布版本保持不可变；冻结契约尚未提供公开创建新草稿或归档接口。
              </AlertDescription>
            </Alert>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-4 md:grid-cols-[1fr_220px_220px]">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">模板名称</span>
                <Input
                  value={draft.name}
                  disabled={!canEdit}
                  onChange={event => updateDraft(template => ({ ...template, name: event.target.value }))}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">目标范围模式</span>
                <Select
                  value={draft.scopeMode}
                  disabled={!canEdit}
                  onValueChange={value => updateDraft(template => ({ ...template, scopeMode: value as WorkflowTemplateAggregate["scopeMode"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="by_business_line">按业务条线</SelectItem>
                    <SelectItem value="by_org">按机构</SelectItem>
                    <SelectItem value="by_region">按区域</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-700">校验摘要</span>
                <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  ERROR {validationSummary?.errorCount ?? 0} · WARNING {validationSummary?.warningCount ?? 0}
                </div>
              </div>
            </div>
          </section>

          {draft.chains.map(chain => (
            <section key={chain.chainId} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{chain.name}</h2>
                    <Badge variant="outline">{chain.approvalPolicy}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {chain.chainId} · {chain.targetScope.businessLine ?? "ALL"} · {chain.targetScope.targetOrgIds.join(", ") || "全部机构"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => addNode(chain.chainId)} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  增加节点
                </Button>
              </div>

              <div className="mt-5 overflow-x-auto pb-2">
                <div className="flex min-w-max items-stretch gap-2">
                  {sortedNodes(chain).map((node, index, nodes) => (
                    <React.Fragment key={node.nodeId}>
                      <div className="w-72 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <Badge className={node.isFinal ? "bg-slate-800 text-white hover:bg-slate-800" : "bg-blue-100 text-blue-700 hover:bg-blue-100"}>
                              {LEVEL_LABELS[node.level]}
                            </Badge>
                            <div className="mt-2 text-xs text-slate-500">{node.nodeId}</div>
                          </div>
                          {!node.isFinal && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-red-600"
                              onClick={() => removeNode(chain.chainId, node.nodeId)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="space-y-3">
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-slate-600">节点名称</span>
                            <Input
                              value={node.label}
                              disabled={!canEdit}
                              onChange={event => updateNode(chain.chainId, node.nodeId, item => ({ ...item, label: event.target.value }))}
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-slate-600">审批层级</span>
                            <Select
                              value={node.level}
                              disabled={!canEdit || node.isFinal}
                              onValueChange={value => updateNode(chain.chainId, node.nodeId, item => ({ ...item, level: value as WorkflowNode["level"] }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-slate-600">选择方式</span>
                            <Select
                              value={node.approverSelector.selectorType}
                              disabled={!canEdit || node.isFinal}
                              onValueChange={value => updateNode(chain.chainId, node.nodeId, item => ({
                                ...item,
                                nodeType: value === "USER" ? "USER" : "ORG_ROLE",
                                approverSelector: {
                                  ...item.approverSelector,
                                  selectorType: value as WorkflowApproverSelector["selectorType"],
                                },
                              }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ORG_ROLE">机构角色</SelectItem>
                                <SelectItem value="ROLE">全局角色</SelectItem>
                                <SelectItem value="USER">指定人员</SelectItem>
                              </SelectContent>
                            </Select>
                          </label>
                          {node.approverSelector.selectorType === "USER" ? (
                            <label className="space-y-1">
                              <span className="text-xs font-medium text-slate-600">审批人员</span>
                              <Select
                                value={node.approverSelector.userId ?? ""}
                                disabled={!canEdit}
                                onValueChange={value => updateNode(chain.chainId, node.nodeId, item => ({
                                  ...item,
                                  approverSelector: { ...item.approverSelector, userId: value },
                                }))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="选择人员" />
                                </SelectTrigger>
                                <SelectContent>
                                  {personnelChoices.map(person => (
                                    <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                          ) : (
                            <label className="space-y-1">
                              <span className="text-xs font-medium text-slate-600">审批角色</span>
                              <Select
                                value={node.approverSelector.roleCode ?? ""}
                                disabled={!canEdit}
                                onValueChange={value => updateNode(chain.chainId, node.nodeId, item => ({
                                  ...item,
                                  approverSelector: { ...item.approverSelector, roleCode: value },
                                }))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="选择角色" />
                                </SelectTrigger>
                                <SelectContent>
                                  {roleChoices.map(role => (
                                    <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                          )}
                          <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-500">
                            当前解析：{selectorLabel(node.approverSelector, roleNameById, personnelNameById)}
                          </div>
                        </div>
                      </div>
                      {index < nodes.length - 1 && (
                        <div className="flex items-center text-slate-300">
                          <ChevronRight className="h-5 w-5" />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </section>
          ))}

          {validation && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h2 className="text-base font-semibold text-slate-900">服务端校验结果</h2>
              </div>
              {validation.findings.length === 0 ? (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  没有发现 ERROR/WARNING/INFO。
                </div>
              ) : (
                <div className="space-y-2">
                  {validation.findings.map(finding => (
                    <div key={finding.findingId} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={finding.severity === "ERROR" ? "destructive" : "secondary"}>
                          {finding.severity}
                        </Badge>
                        <span className="font-medium text-slate-900">{finding.code}</span>
                        <span className="text-xs text-slate-500">{finding.chainId ?? finding.nodeId ?? finding.edgeId}</span>
                      </div>
                      <p className="mt-1 text-slate-600">{finding.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
