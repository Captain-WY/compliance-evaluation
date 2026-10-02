import React, { useCallback, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  Edit3,
  History,
  ChevronRight,
  Database,
  Hash,
  Percent,
  ToggleLeft,
  X,
  PlusCircle,
  Trash2,
  Save,
  Calculator,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { assessmentApi } from "../../services/api";
import { Indicator, IndicatorVersion, ScoringRule } from "../../types";
import IndicatorEditorSheet from "./IndicatorEditorSheet";

import IntegratedIndicatorConfig from "./IntegratedIndicatorConfig";
import DataCollectionCockpit from "./DataCollectionCockpit";

// Helper to translate data type to icon and label
const getDataTypeInfo = (type: string) => {
  switch (type) {
    case "NUMBER":
      return {
        icon: Hash,
        label: "数值型",
        color: "text-blue-600 bg-blue-50 border-blue-200",
      };
    case "PERCENTAGE":
      return {
        icon: Percent,
        label: "百分比",
        color: "text-emerald-600 bg-emerald-50 border-emerald-200",
      };
    case "BOOLEAN":
      return {
        icon: ToggleLeft,
        label: "布尔型",
        color: "text-purple-600 bg-purple-50 border-purple-200",
      };
    default:
      return {
        icon: Database,
        label: "未知",
        color: "text-slate-600 bg-slate-50 border-slate-200",
      };
  }
};

// Helper to format scoring rule preview
const formatRulePreview = (rule: ScoringRule) => {
  let condition = "";
  if (rule.minVal === rule.maxVal) {
    condition = `=${rule.minVal}`;
  } else if (rule.maxVal === 999) {
    condition = `≥${rule.minVal}`;
  } else if (rule.minVal === 0) {
    condition = `≤${rule.maxVal}`;
  } else {
    condition = `[${rule.minVal}, ${rule.maxVal}]`;
  }

  let effect = "";
  let colorClass = "";
  if (rule.scoreEffect === "DIRECT") {
    effect = `得 ${rule.points}分`;
    colorClass = "text-blue-600 bg-blue-50 border-blue-200";
  } else if (rule.scoreEffect === "DEDUCTION") {
    effect = `扣 ${rule.points}分`;
    colorClass = "text-red-600 bg-red-50 border-red-200";
  } else {
    effect = `加 ${rule.points}分`;
    colorClass = "text-emerald-600 bg-emerald-50 border-emerald-200";
  }

  return { text: `${condition} ${effect}`, colorClass };
};

const statusLabels: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

const formatVersionLabel = (versionNo?: number) =>
  versionNo ? `v${versionNo}` : "暂无版本";

const versionDate = (version: IndicatorVersion) =>
  version.publishedAtRef ? new Date(version.publishedAtRef).toLocaleString("zh-CN") : "未发布";

const chooseEditableVersion = (indicator: Indicator) =>
  indicator.versions?.find((version) => version.status === "DRAFT") ??
  indicator.displayVersion ??
  indicator.version ??
  indicator.latestVersion ??
  null;

export default function IndicatorLibraryView() {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isIntegratedConfigOpen, setIsIntegratedConfigOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "readonly">(
    "create",
  );
  const [editingIndicatorId, setEditingIndicatorId] = useState<string | null>(
    null,
  );
  const [selectedConfigIndicator, setSelectedConfigIndicator] =
    useState<Indicator | null>(null);
  const [selectedConfigVersion, setSelectedConfigVersion] =
    useState<IndicatorVersion | null>(null);
  const [isCommandBusy, setIsCommandBusy] = useState(false);

  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [selectedHistoryIndicator, setSelectedHistoryIndicator] =
    useState<Indicator | null>(null);

  const refreshIndicators = useCallback(
    async (filters?: { keyword?: string; categoryId?: string }) => {
      try {
        const params: Record<string, string | number> = { pageSize: 100 };
        if (filters?.keyword?.trim()) params.keyword = filters.keyword.trim();
        if (filters?.categoryId) params.categoryId = filters.categoryId;
        const items = await assessmentApi.getIndicators(params);
        setIndicators(items);
      } catch {
        setIndicators([]);
        toast.error("指标列表加载失败，请检查真实 API 环境。");
      }
    },
    [],
  );

  // Debounced refetch when search or category filter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      refreshIndicators({
        keyword: searchQuery || undefined,
        categoryId: selectedCategory || undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, refreshIndicators]);

  const handleCreateNew = () => {
    setEditingIndicatorId(null);
    setSelectedConfigIndicator(null);
    setSelectedConfigVersion(null);
    setDrawerMode("create");
    setIsIntegratedConfigOpen(true);
  };

  const openConfig = (
    mode: "create" | "edit" | "readonly",
    indicator: Indicator | null,
    version: IndicatorVersion | null,
  ) => {
    setSelectedConfigIndicator(indicator);
    setSelectedConfigVersion(version);
    setEditingIndicatorId(indicator?.id ?? null);
    setDrawerMode(mode);
    setIsIntegratedConfigOpen(true);
  };

  const handleEdit = async (indicator: Indicator) => {
    const targetVersion = chooseEditableVersion(indicator);
    if (!targetVersion) {
      toast.error("未找到可编辑版本。");
      return;
    }
    setIsCommandBusy(true);
    try {
      if (targetVersion.status === "DRAFT") {
        openConfig("edit", indicator, targetVersion);
        return;
      }
      toast("该指标已发布，系统将复制当前版本生成新草稿。");
      const cloned = await assessmentApi.cloneIndicatorVersion(
        indicator.id,
        targetVersion.versionId,
      );
      await refreshIndicators();
      openConfig("edit", cloned, cloned.version ?? chooseEditableVersion(cloned));
      toast.success("已生成可编辑草稿版本。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成草稿失败");
    } finally {
      setIsCommandBusy(false);
    }
  };

  const handleViewConfig = (version: IndicatorVersion) => {
    setIsVersionModalOpen(false);
    openConfig("readonly", selectedHistoryIndicator, version);
  };

  const handleCloneConfig = async (version: IndicatorVersion) => {
    if (!selectedHistoryIndicator) return;
    setIsCommandBusy(true);
    try {
      const cloned = await assessmentApi.cloneIndicatorVersion(
        selectedHistoryIndicator.id,
        version.versionId,
      );
      await refreshIndicators();
      setIsVersionModalOpen(false);
      openConfig("edit", cloned, cloned.version ?? chooseEditableVersion(cloned));
      toast.success("已复制该版本为新草稿。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制版本失败");
    } finally {
      setIsCommandBusy(false);
    }
  };

  const handleArchive = async (version: IndicatorVersion) => {
    if (!selectedHistoryIndicator) return;
    if (version.status !== "PUBLISHED") {
      toast.error("仅已发布版本可归档。");
      return;
    }
    setIsCommandBusy(true);
    try {
      await assessmentApi.archiveIndicatorVersion(
        selectedHistoryIndicator.id,
        version.versionId,
        { reason: "版本归档" },
      );
      await refreshIndicators();
      setIsVersionModalOpen(false);
      toast.success("版本已归档。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "归档失败");
    } finally {
      setIsCommandBusy(false);
    }
  };

  const handleEditFromModal = (version: IndicatorVersion) => {
    if (!selectedHistoryIndicator) return;
    if (version.status !== "DRAFT") {
      toast.error("仅草稿版本可直接编辑。");
      return;
    }
    setIsVersionModalOpen(false);
    openConfig("edit", selectedHistoryIndicator, version);
  };

  // Extract categories and counts from loaded indicators
  // NOTE: category sidebar counts are computed client-side from the current
  // loaded result set. When a category filter is active, only that category
  // appears because the API already filtered the list.
  const categories = useMemo(() => {
    const groups: Record<
      string,
      { name: string; categoryId: string; count: number }
    > = {};
    indicators.forEach((ind) => {
      const key = ind.categoryId ?? ind.category ?? "UNKNOWN";
      if (!groups[key]) {
        groups[key] = { name: ind.category, categoryId: key, count: 0 };
      }
      groups[key].count += 1;
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [indicators]);

  // API already filters by keyword/categoryId; use indicators directly
  const filteredIndicators = indicators;

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans relative overflow-hidden" data-testid="p1-indicator-page">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center">
              <Database className="w-6 h-6 mr-2 text-indigo-600" />
              合规指标管理 (Indicator Management)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              管理原子合规指标及其动态评分规则引擎
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                data-testid="p1-indicator-search"
                type="text"
                placeholder="搜索指标编号或名称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
              />
            </div>
            <button
              data-testid="p1-indicator-create"
              onClick={handleCreateNew}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              新建原子合规指标
            </button>
          </div>
        </div>
      </div>

      <Tabs
        defaultValue="definition"
        className="flex-1 flex flex-col min-h-0 overflow-hidden w-full"
      >
        <div className="px-6 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
          <TabsList className="bg-slate-200/50">
            <TabsTrigger value="definition" data-testid="p1-indicator-tab-definition">
              指标库定义 (Definitions)
            </TabsTrigger>
            <TabsTrigger value="monitoring" data-testid="p1-indicator-tab-monitoring">
              API 采集监控 (API Monitoring)
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Two-Column Layout */}
        <TabsContent
          value="definition"
          className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden flex"
        >
          {/* Left Panel: Category Tree (20%) */}
          <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-10">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 flex items-center">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                维度分类
              </h3>
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  清除
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-200">
              <button
                data-testid="p1-indicator-category-all"
                onClick={() => setSelectedCategory(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedCategory === null
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>全部指标</span>
                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs font-medium">
                  {indicators.length}
                </span>
              </button>
              {categories.map((cat, idx) => (
                <button
                  key={cat.categoryId}
                  data-testid={`p1-indicator-category-${idx}`}
                  onClick={() => setSelectedCategory(cat.categoryId)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedCategory === cat.categoryId
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate pr-2">{cat.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedCategory === cat.categoryId
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Right Panel: Indicator Registry (80%) */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 scrollbar-thin scrollbar-thumb-slate-300">
            <div className="space-y-4 max-w-6xl mx-auto">
              {filteredIndicators.map((indicator, idx) => {
                const typeInfo = getDataTypeInfo(indicator.dataType);
                const TypeIcon = typeInfo.icon;

                return (
                  <motion.div
                    key={`${indicator.id}-${idx}`}
                    data-testid={`p1-indicator-row-${indicator.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                            {indicator.code}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900 truncate">
                            {indicator.name}
                          </h3>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-indigo-200 bg-indigo-50 text-indigo-700">
                            {formatVersionLabel(indicator.latestVersionNo)}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-help transition-colors">
                            {indicator.schemeLinkCount == null
                              ? "暂无关联数据"
                              : `关联 ${indicator.schemeLinkCount} 个考核方案`}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-emerald-50 text-emerald-700">
                            {statusLabels[indicator.latestStatus ?? indicator.status ?? ""] ??
                              indicator.latestStatus ??
                              indicator.status}
                          </span>
                        </div>

                        <div className="flex items-center space-x-4 text-sm mt-3">
                          <div className="flex items-center text-slate-600">
                            <span className="text-slate-400 mr-2">分类:</span>
                            <span className="font-medium">
                              {indicator.category}
                            </span>
                          </div>
                          <div className="w-px h-4 bg-slate-200"></div>
                          <div className="flex items-center text-slate-600">
                            <span className="text-slate-400 mr-2">
                              数据类型:
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${typeInfo.color}`}
                            >
                              <TypeIcon className="w-3 h-3 mr-1" />
                              {typeInfo.label}
                            </span>
                          </div>
                          <div className="w-px h-4 bg-slate-200"></div>
                          <div className="flex items-center text-slate-600">
                            <span className="text-slate-400 mr-2">
                              默认基准权重:
                            </span>
                            <span className="font-bold text-slate-700">
                              {indicator.defaultWeight}%
                            </span>
                          </div>
                          {indicator.businessLine && (
                            <>
                              <div className="w-px h-4 bg-slate-200"></div>
                              <div className="flex items-center text-slate-600">
                                <span className="text-slate-400 mr-2">
                                  业务条线:
                                </span>
                                <span className="font-medium">
                                  {indicator.businessLine}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="mt-4 bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                            评分规则引擎预览 (Scoring Logic)
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {indicator.scoringRules.length > 0 ? indicator.scoringRules.map((rule) => {
                              const preview = formatRulePreview(rule);
                              return (
                                <div
                                  key={rule.id}
                                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${preview.colorClass}`}
                                  title={rule.description}
                                >
                                  {preview.text}
                                </div>
                              );
                            }) : (
                              <span className="text-xs text-slate-500">
                                {indicator.displayVersion?.scoringRule?.expression
                                  ? `公式: ${indicator.displayVersion.scoringRule.expression}`
                                  : "暂无评分规则预览"}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            后端校验状态: {indicator.scoringValidationStatus ?? "NOT_VALIDATED"}
                          </div>
                        </div>

                        {/* Evidence Template Summary */}
                        {indicator.displayVersion?.evidenceTemplates && indicator.displayVersion.evidenceTemplates.length > 0 && (
                          <div className="mt-3 bg-amber-50 rounded-lg p-3 border border-amber-100">
                            <p className="text-xs font-bold text-amber-700 mb-2 uppercase tracking-wider">
                              佐证材料要求 (Evidence)
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {indicator.displayVersion.evidenceTemplates.map((et, etIdx) => (
                                <span
                                  key={`${indicator.id}-et-${etIdx}`}
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${et.required ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                                  title={et.acceptedFileTags?.join(', ') ?? ''}
                                >
                                  {et.templateName}
                                  {et.required ? ' (必填)' : ' (可选)'}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col space-y-2 shrink-0">
                        <button
                          data-testid={`p1-indicator-edit-${indicator.id}`}
                          onClick={() => handleEdit(indicator)}
                          disabled={isCommandBusy}
                          className="flex items-center justify-center px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
                        >
                          <Edit3 className="w-4 h-4 mr-1.5" />
                          编辑规则
                        </button>
                        <button
                          data-testid={`p1-indicator-history-${indicator.id}`}
                          onClick={() => {
                            setSelectedHistoryIndicator(indicator);
                            setIsVersionModalOpen(true);
                          }}
                          className="flex items-center justify-center px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 transition-colors"
                        >
                          <History className="w-4 h-4 mr-1.5" />
                          历史版本
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {filteredIndicators.length === 0 && (
                <div className="text-center py-20" data-testid="p1-indicator-empty">
                  <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900">
                    未找到匹配的指标
                  </h3>
                  <p className="text-slate-500 mt-1">
                    请尝试调整搜索词或分类过滤条件
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="monitoring"
          className="flex-1 flex overflow-hidden mt-0 data-[state=inactive]:hidden bg-slate-50"
        >
          <div className="flex-1 overflow-auto">
            <DataCollectionCockpit variant="summary" />
          </div>
        </TabsContent>
      </Tabs>

      {/* Editor Sheet */}
      <IndicatorEditorSheet
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        indicatorId={editingIndicatorId}
      />

      <IntegratedIndicatorConfig
        isOpen={isIntegratedConfigOpen}
        onClose={() => setIsIntegratedConfigOpen(false)}
        mode={drawerMode}
        indicator={selectedConfigIndicator}
        version={selectedConfigVersion}
        availableIndicators={indicators}
        onSaved={refreshIndicators}
      />

      {/* Version History Modal (The Time Machine) */}
      <Dialog open={isVersionModalOpen} onOpenChange={setIsVersionModalOpen}>
        <DialogContent className="sm:max-w-[600px] bg-slate-50" data-testid="p1-indicator-version-dialog">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-800">
              指标版本演进轨迹 (Version Timeline:{" "}
              {selectedHistoryIndicator?.name})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="relative pl-8 border-l-2 border-indigo-200 space-y-6 ml-2">
              {(selectedHistoryIndicator?.versions ?? []).map((version, index) => (
                <div className="relative" key={version.versionId}>
                  <div
                    className={`absolute -left-[41px] top-1 w-4 h-4 rounded-full border-2 bg-white shadow-sm ${
                      index === 0
                        ? "border-indigo-600 ring-4 ring-indigo-50"
                        : "border-slate-300"
                    }`}
                  ></div>
                  <div
                    className={`bg-white border text-sm rounded-lg p-4 shadow-sm ${
                      index === 0 ? "border-indigo-200" : "border-slate-200 opacity-90"
                    }`}
                    data-testid={`p1-indicator-version-${version.versionId}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-slate-900">
                        {formatVersionLabel(version.versionNo)} (
                        {statusLabels[version.status] ?? version.status})
                      </span>
                      <span className="text-slate-500 font-mono text-xs">
                        {versionDate(version)}
                      </span>
                    </div>
                    <div className="flex flex-col text-slate-600 text-xs mb-3 space-y-1">
                      <div>
                        <span className="font-semibold text-slate-700">操作人:</span>{" "}
                        {version.publishedByRef ?? "未发布草稿"}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">校验状态:</span>{" "}
                        {version.scoringValidationStatus}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleViewConfig(version)}
                        className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 font-medium hover:bg-indigo-100"
                      >
                        查阅配置 (只读)
                      </button>
                      {version.status === "DRAFT" && (
                        <button
                          onClick={() => handleEditFromModal(version)}
                          disabled={isCommandBusy}
                          className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 font-medium hover:bg-blue-100 disabled:opacity-60"
                        >
                          编辑草稿
                        </button>
                      )}
                      <button
                        onClick={() => handleCloneConfig(version)}
                        disabled={isCommandBusy}
                        className="text-xs bg-slate-50 text-slate-600 px-2 py-1 rounded border border-slate-200 font-medium hover:bg-slate-100 disabled:opacity-60"
                      >
                        复制为新草稿
                      </button>
                      {version.status === "PUBLISHED" && (
                        <button
                          onClick={() => handleArchive(version)}
                          disabled={isCommandBusy}
                          className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-100 font-medium hover:bg-amber-100 disabled:opacity-60"
                        >
                          归档
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(selectedHistoryIndicator?.versions ?? []).length === 0 && (
                <div className="bg-white border border-dashed border-slate-200 rounded-lg p-4 text-sm text-slate-500">
                  暂无后端版本记录。
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
