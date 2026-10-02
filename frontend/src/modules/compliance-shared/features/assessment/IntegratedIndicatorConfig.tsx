import React, { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Settings2,
  Database,
  Calculator,
  ListOrdered,
  Play,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Activity,
  Save,
  Send,
  Code,
  Check,
  ChevronDown,
} from "lucide-react";

interface Variable {
  id: string;
  label: string;
  mode: "API" | "MANUAL";
  source: string;
  path: string;
  allowAllTime?: boolean;
}

interface ScoringRule {
  id: string;
  min: number;
  max: number;
  score: number;
}

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { toast } from "sonner";
import { assessmentApi } from "../../services/api";
import type { Indicator, IndicatorVersion } from "../../types";

const DEFAULT_CATEGORY_OPTIONS = [
  { id: "AICAT-P1-FOUNDATION-GOVERNANCE", label: "治理与制度" },
  { id: "AICAT-P1-FOUNDATION-OPERATIONS", label: "经营与操作" },
  { id: "AICAT-P1-FOUNDATION-BRANCH-COMPLIANCE", label: "分支合规" },
];

const SOURCE_SYSTEM_OPTIONS = [
  { value: "HR_SYS", label: "HR_SYS (人力资源 · sandbox/deferred)" },
  { value: "CRM_SYS", label: "CRM_SYS (客户管理 · sandbox/deferred)" },
  { value: "OA_SYS", label: "OA_SYS (协同办公 · sandbox/deferred)" },
  { value: "CORE_TRADE", label: "CORE_TRADE (核心交易 · sandbox/deferred)" },
  { value: "AML_SYS", label: "AML_SYS (反洗钱 · sandbox/deferred)" },
];

const versionLabel = (version?: IndicatorVersion | null) =>
  version ? `v${version.versionNo}` : "新版本";

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const draftCode = () => `WLZQ-AIND-SIT-${Date.now()}`;

const emptyConfig = () => ({
  basic: {
    name: "新建合规指标",
    id: draftCode(),
    category: "分支合规",
    type: "PERCENTAGE",
  },
  variables: [
    {
      id: "X",
      label: "完成数",
      mode: "MANUAL",
      source: "",
      path: "",
      allowAllTime: true,
    } as Variable,
    {
      id: "Y",
      label: "总数",
      mode: "MANUAL",
      source: "",
      path: "",
      allowAllTime: true,
    } as Variable,
  ],
  calculation: { formula: "round(X / Y * 100, 2)" },
  scoring: {
    mode: "INTERVAL" as "BASIC" | "INTERVAL",
    rules: [
      { id: "r1", min: 90, max: 100, score: 100 },
      { id: "r2", min: 60, max: 90, score: 80 },
      { id: "r3", min: 0, max: 60, score: 0 },
    ] as ScoringRule[],
  },
  compliance: {
    basis: "SIT-AIM sandbox 指标口径；外部源系统仅为 deferred 配置候选。",
  },
});

export default function IntegratedIndicatorConfig({
  isOpen,
  onClose,
  mode = "edit",
  indicator,
  version,
  availableIndicators = [],
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  mode?: "create" | "edit" | "readonly";
  indicator?: Indicator | null;
  version?: IndicatorVersion | null;
  availableIndicators?: Indicator[];
  onSaved?: () => void | Promise<void>;
}) {
  const [activeVariableId, setActiveVariableId] = useState<string | null>(null);

  const [categories, setCategories] = useState([
    "治理与制度",
    "经营与操作",
    "分支合规",
  ]);
  const [selectedCategory, setSelectedCategory] = useState("分支合规");
  const [categorySearch, setCategorySearch] = useState("");
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [defaultWeight, setDefaultWeight] = useState(15);

  const [config, setConfig] = useState(emptyConfig);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastValidation, setLastValidation] = useState<string | null>(null);

  const [sandboxInputs, setSandboxInputs] = useState<Record<string, number>>({
    X: 90,
    Y: 100,
  });

  const [evidenceRequirements, setEvidenceRequirements] = useState([
    {
      id: "1",
      description: "请上传指标口径对应的系统截图或业务凭证",
      fileTypes: ["PDF", "PNG"],
      customExtension: "",
      required: true,
    },
  ]);

  const [qualitativeScoringMode, setQualitativeScoringMode] = useState<
    "deductive" | "matrix"
  >("deductive");

  const [deductiveConfig, setDeductiveConfig] = useState({
    baseScore: 100,
    deductionPerFlaw: 5,
    maxDeduction: 20,
  });

  const [rubricRows, setRubricRows] = useState([
    {
      id: "1",
      name: "优秀",
      min: 90,
      max: 100,
      desc: "制度完善且执行留痕清晰...",
    },
    {
      id: "2",
      name: "合格",
      min: 60,
      max: 89,
      desc: "有制度，但执行留痕不全...",
    },
    { id: "3", name: "不合格", min: 0, max: 59, desc: "无制度..." },
  ]);

  const categoryOptions = useMemo(() => {
    const options = new Map(DEFAULT_CATEGORY_OPTIONS.map((item) => [item.id, item]));
    availableIndicators.forEach((item) => {
      if (item.categoryId) {
        options.set(item.categoryId, {
          id: item.categoryId,
          label: item.categoryName ?? item.category,
        });
      }
    });
    return Array.from(options.values());
  }, [availableIndicators]);

  const categoryIdForLabel = (label: string) =>
    categoryOptions.find((item) => item.label === label)?.id;

  useEffect(() => {
    if (!isOpen) return;
    const labels = unique(categoryOptions.map((item) => item.label));
    setCategories(labels);
    setCategorySearch("");
    setIsCategoryOpen(false);
    setLastValidation(null);

    const sourceVersion =
      version ?? indicator?.version ?? indicator?.displayVersion ?? indicator?.latestVersion ?? null;
    if (!indicator || !sourceVersion || mode === "create") {
      const next = emptyConfig();
      setConfig(next);
      setSelectedCategory(DEFAULT_CATEGORY_OPTIONS[2].label);
      setDefaultWeight(15);
      setSandboxInputs({ X: 90, Y: 100 });
      setEvidenceRequirements([
        {
          id: "1",
          description: "请上传指标口径对应的系统截图或业务凭证",
          fileTypes: ["PDF", "PNG"],
          customExtension: "",
          required: true,
        },
      ]);
      return;
    }

    const variables =
      sourceVersion.variables.length > 0
        ? sourceVersion.variables.map((item) => ({
            id: item.variableCode,
            label: item.variableName,
            mode: "MANUAL" as const,
            source: "",
            path: "",
            allowAllTime: true,
          }))
        : emptyConfig().variables;
    const scoringRule = sourceVersion.scoringRule;
    const bands = scoringRule?.bands ?? [];
    const categoryLabel = indicator.categoryName ?? indicator.category;
    setConfig({
      basic: {
        name: indicator.name,
        id: indicator.code,
        category: categoryLabel,
        type: indicator.dataType,
      },
      variables,
      calculation: { formula: scoringRule?.expression ?? "" },
      scoring: {
        mode: bands.length > 0 ? "INTERVAL" : "BASIC",
        rules: bands.map((band, index) => ({
          id: `${sourceVersion.versionId}-RULE-${index + 1}`,
          min: Number(band.minValue ?? 0),
          max: Number(band.maxValue ?? 100),
          score: Number(band.score ?? 0),
        })),
      },
      compliance: {
        basis: indicator.description ?? "",
      },
    });
    setSelectedCategory(categoryLabel);
    setDefaultWeight(sourceVersion.weightDefault);
    setSandboxInputs(
      Object.fromEntries(variables.map((item) => [item.id, item.id === "Y" ? 100 : 90])),
    );
    setEvidenceRequirements(
      sourceVersion.evidenceTemplates.length > 0
        ? sourceVersion.evidenceTemplates.map((item, index) => ({
            id: item.evidenceTemplateId ?? `${index + 1}`,
            description: item.templateName || item.description || "佐证材料",
            fileTypes: item.acceptedFileTags.length > 0 ? item.acceptedFileTags : ["PDF"],
            customExtension: "",
            required: item.required ?? true,
          }))
        : [
            {
              id: "1",
              description: "请上传指标口径对应的系统截图或业务凭证",
              fileTypes: ["PDF", "PNG"],
              customExtension: "",
              required: true,
            },
          ],
    );
  }, [availableIndicators, categoryOptions, indicator, isOpen, mode, version]);

  const addRubricRow = () => {
    setRubricRows([
      ...rubricRows,
      { id: Date.now().toString(), name: "", min: 0, max: 100, desc: "" },
    ]);
  };

  const removeRubricRow = (id: string) => {
    setRubricRows(rubricRows.filter((row) => row.id !== id));
  };

  const updateRubricRow = (id: string, field: string, value: any) => {
    setRubricRows(
      rubricRows.map((row) =>
        row.id === id ? { ...row, [field]: value } : row,
      ),
    );
  };

  const addEvidenceRequirement = () => {
    setEvidenceRequirements([
      ...evidenceRequirements,
      {
        id: Date.now().toString(),
        description: "",
        fileTypes: [],
        customExtension: "",
        required: true,
      },
    ]);
  };

  const removeEvidenceRequirement = (id: string) => {
    setEvidenceRequirements(
      evidenceRequirements.filter((req) => req.id !== id),
    );
  };

  const updateEvidenceRequirement = (
    id: string,
    field: string,
    value: string,
  ) => {
    setEvidenceRequirements(
      evidenceRequirements.map((req) =>
        req.id === id ? { ...req, [field]: value } : req,
      ),
    );
  };

  const toggleFileType = (id: string, type: string) => {
    setEvidenceRequirements(
      evidenceRequirements.map((req) => {
        if (req.id === id) {
          const types = req.fileTypes.includes(type)
            ? req.fileTypes.filter((t) => t !== type)
            : [...req.fileTypes, type];
          return { ...req, fileTypes: types };
        }
        return req;
      }),
    );
  };

  const addCustomFileType = (id: string, customType: string) => {
    setEvidenceRequirements(
      evidenceRequirements.map((req) => {
        if (req.id === id && !req.fileTypes.includes(customType)) {
          return { ...req, fileTypes: [...req.fileTypes, customType] };
        }
        return req;
      }),
    );
  };

  // Sandbox values are submitted to backend validate-scoring; local UI does not execute formulas.
  const simulationResult = useMemo(() => {
    return {
      result: lastValidation ?? "等待后端校验",
      score: lastValidation === "VALID" ? "有效" : "-",
    };
  }, [
    lastValidation,
  ]);

  // Handlers
  const addVariable = () => {
    const nextCode = String.fromCharCode(65 + config.variables.length); // A, B, C... (assume starts from X ideally, but simple char code for demo)
    // Find next available var name starting from X, Y, Z, A, B...
    const usedIds = config.variables.map((v) => v.id);
    let newId = "A";
    for (let c = 88; c <= 90; c++) {
      if (!usedIds.includes(String.fromCharCode(c))) {
        newId = String.fromCharCode(c);
        break;
      }
    }
    if (newId === "A") {
      for (let c = 65; c <= 87; c++) {
        if (!usedIds.includes(String.fromCharCode(c))) {
          newId = String.fromCharCode(c);
          break;
        }
      }
    }

    setConfig((prev) => ({
      ...prev,
      variables: [
        ...prev.variables,
        { id: newId, label: "新增变量", mode: "MANUAL", source: "", path: "" },
      ],
    }));
  };

  const removeVariable = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      variables: prev.variables.filter((v) => v.id !== id),
    }));
  };

  const updateVariable = (id: string, field: keyof Variable, value: any) => {
    setConfig((prev) => ({
      ...prev,
      variables: prev.variables.map((v) =>
        v.id === id ? { ...v, [field]: value } : v,
      ),
    }));
  };

  const addRule = () => {
    const newRule: ScoringRule = {
      id: Math.random().toString(),
      min: 0,
      max: 0,
      score: 0,
    };
    setConfig((prev) => ({
      ...prev,
      scoring: { ...prev.scoring, rules: [...prev.scoring.rules, newRule] },
    }));
  };

  const removeRule = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      scoring: {
        ...prev.scoring,
        rules: prev.scoring.rules.filter((r) => r.id !== id),
      },
    }));
  };

  const updateRule = (id: string, field: keyof ScoringRule, value: number) => {
    setConfig((prev) => ({
      ...prev,
      scoring: {
        ...prev.scoring,
        rules: prev.scoring.rules.map((r) =>
          r.id === id ? { ...r, [field]: value } : r,
        ),
      },
    }));
  };

  const buildPayload = () => {
    const hasApiVariable = config.variables.some((item) => item.mode === "API");
    const evidenceTemplates = evidenceRequirements
      .filter((item) => item.description.trim() !== "")
      .map((item) => ({
        templateName: item.description.trim(),
        required: item.required ?? true,
        acceptedFileTags: item.fileTypes.length > 0 ? item.fileTypes : ["PDF"],
        description: item.description.trim(),
      }));
    const scoringRule =
      config.scoring.mode === "INTERVAL"
        ? {
            ruleType: "INTERVAL",
            effect: "DIRECT_SCORE",
            requireContinuousBands: false,
            bands: config.scoring.rules.map((item) => ({
              minValue: item.min,
              maxValue: item.max,
              score: item.score,
            })),
          }
        : {
            ruleType: "FORMULA",
            effect: "DIRECT_SCORE",
            expression: config.calculation.formula.trim(),
          };
    return {
      indicatorCode: config.basic.id.trim(),
      indicatorName: config.basic.name.trim(),
      categoryId: categoryIdForLabel(selectedCategory),
      businessLine: indicator?.businessLine ?? "财富管理",
      dataType: "QUANTITATIVE",
      valueType: config.basic.type === "BOOLEAN" ? "BOOLEAN" : "NUMBER",
      inputMode: hasApiVariable ? "SYSTEM_CALCULATED" : "MANUAL",
      dataSourceMode: hasApiVariable ? "FILE_EVIDENCE" : "MANUAL",
      description: hasApiVariable
        ? `${config.compliance.basis}\n\nSource systems are sandbox/deferred only under DEC-037.`
        : config.compliance.basis,
      weightDefault: defaultWeight,
      maxScore: 100,
      variables: config.variables.map((item) => ({
        variableCode: item.id,
        variableName: item.label || item.id,
        valueType: "NUMBER",
        required: true,
      })),
      scoringRule,
      evidenceTemplates:
        evidenceTemplates.length > 0
          ? evidenceTemplates
          : [
              {
                templateName: "指标佐证材料",
                required: true,
                acceptedFileTags: ["PDF"],
                description: "发布前必须保留至少一项佐证材料要求。",
              },
            ],
    };
  };

  const getErrorMessage = (error: any, fallback: string): string => {
    if (!error) return fallback;
    if (typeof error === "object") {
      if (Array.isArray(error.details)) {
        const detailsMsg = error.details
          .map((d: any) => d.message || d.reason || JSON.stringify(d))
          .join("; ");
        if (detailsMsg) {
          return `${error.message || "请求失败"}: ${detailsMsg}`;
        }
      }
      if (error.message) return error.message;
    }
    if (error instanceof Error) return error.message;
    return fallback;
  };

  const persistDraft = async () => {
    const payload = buildPayload();
    if (mode === "edit" && indicator && version?.versionId) {
      return assessmentApi.updateIndicatorDraft(indicator.id, version.versionId, payload);
    }
    return assessmentApi.createIndicator(payload);
  };

  const handleSaveDraft = async () => {
    setIsSubmitting(true);
    try {
      await persistDraft();
      await onSaved?.();
      toast.success("指标草稿已保存并回读列表。");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "保存草稿失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    try {
      const saved = await persistDraft();
      const savedVersion = saved.version ?? saved.displayVersion ?? saved.latestVersion;
      if (!savedVersion) throw new Error("后端未返回可发布版本。");
      const sampleValues = Object.fromEntries(
        config.variables.map((item) => [item.id, sandboxInputs[item.id] ?? 1]),
      );
      const validation = await assessmentApi.validateIndicatorScoring(
        saved.id,
        savedVersion.versionId,
        { sampleValues },
      );
      setLastValidation(validation.status ?? "VALID");
      await assessmentApi.publishIndicatorVersion(saved.id, savedVersion.versionId);
      await onSaved?.();
      toast.success("评分校验通过，指标版本已发布。");
      onClose();
    } catch (error) {
      setLastValidation("INVALID");
      toast.error(getErrorMessage(error, "发布失败，评分或佐证材料未通过后端校验"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[800px] max-w-[90vw] bg-slate-50 shadow-2xl z-[101] flex flex-col border-l border-slate-200"
          >
            {/* Header */}
            <div className="bg-white px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-800 flex items-center">
                  <Database className="w-5 h-5 mr-2 text-blue-600" />
                  配置原子合规指标 (Integrated Indicator)
                  <div className="flex ml-4 gap-2">
                    {mode === "readonly" ? (
                      <Badge
                        variant="outline"
                        className="text-slate-500 font-bold border-slate-300"
                      >
                        历史版本 (只读)
                      </Badge>
                    ) : (
                      <>
                        <Badge
                          variant="outline"
                          className="text-slate-500 font-bold border-slate-300"
                        >
                          {versionLabel(version)}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-700 hover:bg-amber-100 font-bold border-transparent shadow-none"
                        >
                          {mode === "create"
                            ? "新草稿 (Draft)"
                            : "草稿 (Draft)"}
                        </Badge>
                      </>
                    )}
                  </div>
                </h2>
                <div className="flex items-center mt-2 space-x-3 text-sm">
                  <span className="font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {config.basic.id}
                  </span>
                  <span className="font-bold text-slate-700">
                    {config.basic.name}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <fieldset
              disabled={mode === "readonly"}
              className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-300"
            >
              {/* Basic Metadata */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-black text-slate-800 flex items-center mb-4">
                  <span className="w-5 h-5 flex items-center justify-center bg-indigo-100 text-indigo-700 rounded mr-2">
                    🏷️
                  </span>
                  基础属性 (Basic Metadata)
                </h3>
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">
                      指标编号 (Indicator Code)
                    </label>
                    <Input
                      value={config.basic.id}
                      disabled={mode !== "create"}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          basic: { ...prev.basic, id: e.target.value },
                        }))
                      }
                      className="bg-white font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500">
                      已发布指标编号不可在草稿版本中变更。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">
                      指标名称 (Indicator Name)
                    </label>
                    <Input
                      value={config.basic.name}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          basic: { ...prev.basic, name: e.target.value },
                        }))
                      }
                      className="bg-white text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">
                      指标维度分类 (Dimension Category)
                    </label>
                    <div className="relative w-full">
                      {/* 1. The Trigger Button */}
                      <div
                        onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                        className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                      >
                        <span className="truncate">{selectedCategory || "请选择分类..."}</span>
                        <span className="text-slate-400 text-xs">▼</span>
                      </div>

                      {/* 2. The Custom Absolute Dropdown */}
                      {isCategoryOpen && (
                        <div className="absolute top-[calc(100%+4px)] left-0 z-[9999] w-full rounded-md border border-slate-200 bg-white shadow-xl overflow-hidden">
                          {/* Search Input */}
                          <div className="p-2 border-b border-slate-100">
                            <input
                              autoFocus
                              type="text"
                              placeholder="搜索或输入新分类..."
                              className="w-full rounded bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                              value={categorySearch}
                              onChange={(e) => setCategorySearch(e.target.value)}
                            />
                          </div>

                          {/* Options List */}
                          <div className="max-h-60 overflow-y-auto py-1">
                            {categorySearch.trim() !== "" && !categories.includes(categorySearch.trim()) && (
                              <div className="px-3 py-3 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                                未命中字典分类。新增分类需先维护后端字典/Seed，本页不会创建本地-only 分类。
                              </div>
                            )}

                            {/* Filtered Existing Categories */}
                            {categories
                              .filter((cat) => cat.toLowerCase().includes(categorySearch.toLowerCase()))
                              .map((cat) => (
                                <div
                                  key={cat}
                                  className={`flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 ${
                                    selectedCategory === cat ? "bg-slate-50 font-medium text-slate-900" : "text-slate-700"
                                  }`}
                                  onClick={() => {
                                    setSelectedCategory(cat);
                                    setCategorySearch("");
                                    setIsCategoryOpen(false);
                                  }}
                                >
                                  {cat}
                                </div>
                              ))}

                            {/* Empty State Fallback */}
                            {categories.filter((cat) => cat.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && categorySearch.trim() === "" && (
                              <div className="px-3 py-4 text-center text-sm text-slate-500">暂无选项</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 3. Invisible Backdrop to close dropdown when clicking outside */}
                      {isCategoryOpen && (
                        <div 
                          className="fixed inset-0 z-[9998]" 
                          onClick={() => setIsCategoryOpen(false)} 
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">
                      默认基准权重 (Default Weight)
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={defaultWeight}
                        onChange={(e) =>
                          setDefaultWeight(Number(e.target.value))
                        }
                        className="pr-8 bg-white"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                        %
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      在被引入考核方案时的建议初始权重。
                    </p>
                  </div>
                </div>
              </div>

              {/* Compliance Basis */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center text-sm font-bold text-blue-900 mb-2">
                  <AlertCircle className="w-4 h-4 mr-1.5 text-blue-600" />
                  合规依据及口径说明 (Legal Basis)
                </div>
                <textarea
                  disabled={mode === "readonly"}
                  value={config.compliance.basis}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      compliance: { ...prev.compliance, basis: e.target.value },
                    }))
                  }
                  className="w-full text-sm bg-white border border-blue-200 rounded-lg p-3 text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[80px]"
                  placeholder="在此输入相关监管法条、公司内控制度依据..."
                />
              </div>

              <Tabs defaultValue="quantitative" className="w-full mt-6">
                <TabsList className="grid grid-cols-2 w-full mb-6">
                  <TabsTrigger value="quantitative">
                    📊 定量数据指标 (Quantitative)
                  </TabsTrigger>
                  <TabsTrigger value="qualitative">
                    📝 定性评估指标 (Qualitative)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="quantitative" className="space-y-6">
                  {/* Step 1: Variables */}
                  <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-800 flex items-center">
                        <ListOrdered className="w-4 h-4 mr-2 text-slate-500" />
                        1. 变量声明与数据溯源 (Variable Mapping)
                      </h3>
                      {mode !== "readonly" && (
                        <button
                          onClick={addVariable}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center bg-blue-50 px-2 py-1 rounded border border-blue-200"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> 添加计算变量
                        </button>
                      )}
                    </div>
                    <div className="p-5 space-y-4">
                      {config.variables.map((v) => (
                        <div
                          key={v.id}
                          className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 hover:border-blue-300 transition-colors group"
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded bg-blue-100 text-blue-700 font-black font-mono flex items-center justify-center shrink-0 border border-blue-200">
                              {v.id}
                            </div>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                  变量别名
                                </label>
                                <input
                                  value={v.label}
                                  onChange={(e) =>
                                    updateVariable(
                                      v.id,
                                      "label",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                  数据源模式
                                </label>
                                <div className="flex bg-slate-200/70 p-1 rounded-md">
                                  <button
                                    onClick={() =>
                                      updateVariable(v.id, "mode", "API")
                                    }
                                    className={`flex-1 text-xs font-bold py-1 rounded transition-colors ${v.mode === "API" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                                  >
                                    API 集成
                                  </button>
                                  <button
                                    onClick={() =>
                                      updateVariable(v.id, "mode", "MANUAL")
                                    }
                                    className={`flex-1 text-xs font-bold py-1 rounded transition-colors ${v.mode === "MANUAL" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}
                                  >
                                    手工填报
                                  </button>
                                </div>
                              </div>

                              {v.mode === "API" && (
                                <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4 border-t border-slate-200 pt-3 mt-1">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                                      集成系统代号 (Source SYS)
                                    </label>
                                    <div className="relative">
                                      <select
                                        value={v.source}
                                        onChange={(e) =>
                                          updateVariable(
                                            v.id,
                                            "source",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full text-xs font-mono border border-slate-300 rounded px-2 py-1.5 focus:border-blue-500 outline-none bg-white appearance-none pr-6"
                                      >
                                        <option value="">请选择系统代号</option>
                                        {SOURCE_SYSTEM_OPTIONS.map((source) => (
                                          <option key={source.value} value={source.value}>
                                            {source.label}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="absolute inset-y-0 right-0 flex items-center px-1.5 pointer-events-none">
                                        <svg
                                          className="w-3.5 h-3.5 text-slate-400"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M19 9l-7 7-7-7"
                                          ></path>
                                        </svg>
                                      </div>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                                      API Endpoint Path
                                    </label>
                                    <input
                                      value={v.path}
                                      onChange={(e) =>
                                        updateVariable(
                                          v.id,
                                          "path",
                                          e.target.value,
                                        )
                                      }
                                      placeholder="/api/v1/..."
                                      className="w-full text-xs font-mono border border-slate-300 rounded px-2 py-1.5 focus:border-blue-500 outline-none bg-white"
                                    />
                                  </div>
                                  <div className="col-span-1 md:col-span-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 space-y-1">
                                    <p><strong>Source system 当前仅为 sandbox/deferred 配置候选（DEC-037）。</strong> 不代表 HR/CRM/OA/交易/AML 已真实接入。</p>
                                    <p>保存时 <code>dataSourceMode</code> 将降级为 <code>FILE_EVIDENCE</code> 或 <code>MANUAL</code>，不会提交 <code>API_SOURCE</code> 作为 active backend 模式。</p>
                                  </div>
                                </div>
                              )}

                              {v.mode === "MANUAL" && (
                                <div className="col-span-1 md:col-span-2 border-t border-slate-200 pt-3 mt-1 flex items-center">
                                  <label className="flex items-center text-sm font-medium text-slate-700 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={v.allowAllTime}
                                      onChange={(e) =>
                                        updateVariable(
                                          v.id,
                                          "allowAllTime",
                                          e.target.checked,
                                        )
                                      }
                                      className="mr-2 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                    />
                                    允许全时段填报 (不受限于检查周期)
                                  </label>
                                </div>
                              )}
                            </div>
                            {mode !== "readonly" && (
                              <button
                                onClick={() => removeVariable(v.id)}
                                className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Step 2: Calculation Engine */}
                  <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                      <h3 className="text-sm font-black text-slate-800 flex items-center">
                        <Calculator className="w-4 h-4 mr-2 text-slate-500" />
                        2. 逻辑计算内核 (Calculation Engine)
                      </h3>
                    </div>
                    <div className="p-5">
                      <div className="relative font-mono">
                        <Code className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                        <input
                          value={config.calculation.formula}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              calculation: { formula: e.target.value },
                            }))
                          }
                          className="w-full bg-slate-900 text-green-400 text-lg rounded-lg pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="输入数学表达式，例: (X / Y) * 100"
                        />
                      </div>
                      <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-500 mr-2">
                          可用变量芯片:
                        </span>
                        {config.variables.map((v) => (
                          <button
                            key={v.id}
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                calculation: {
                                  formula: prev.calculation.formula + v.id,
                                },
                              }))
                            }
                            className="flex items-center text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                          >
                            <span className="w-4 h-4 bg-white rounded flex items-center justify-center mr-1.5 shadow-sm border border-blue-100">
                              {v.id}
                            </span>
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Step 3: Scoring Engine */}
                  <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-800 flex items-center">
                        <Settings2 className="w-4 h-4 mr-2 text-slate-500" />
                        3. 得分映射规则 (Scoring Engine)
                      </h3>
                      <div className="flex bg-slate-200 p-0.5 rounded-md">
                        <button
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              scoring: { ...prev.scoring, mode: "BASIC" },
                            }))
                          }
                          className={`px-3 py-1 text-xs font-bold rounded ${config.scoring.mode === "BASIC" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                        >
                          基础直出
                        </button>
                        <button
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              scoring: { ...prev.scoring, mode: "INTERVAL" },
                            }))
                          }
                          className={`px-3 py-1 text-xs font-bold rounded ${config.scoring.mode === "INTERVAL" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                        >
                          阶梯区间
                        </button>
                      </div>
                    </div>

                    {config.scoring.mode === "INTERVAL" ? (
                      <div className="p-0">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                            <tr>
                              <th className="px-5 py-2">区间下限 (Min)</th>
                              <th className="px-5 py-2">区间上限 (Max)</th>
                              <th className="px-5 py-2 text-indigo-700">
                                映射得分 (Score)
                              </th>
                              <th className="px-5 py-2 w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {config.scoring.rules.map((rule) => (
                              <tr key={rule.id}>
                                <td className="px-5 py-2">
                                  <input
                                    type="number"
                                    value={rule.min}
                                    onChange={(e) =>
                                      updateRule(
                                        rule.id,
                                        "min",
                                        Number(e.target.value),
                                      )
                                    }
                                    className="w-24 text-sm border border-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                  />
                                </td>
                                <td className="px-5 py-2 flex items-center">
                                  <span className="text-slate-400 font-bold mx-2">
                                    ≤ x ≤
                                  </span>
                                  <input
                                    type="number"
                                    value={rule.max}
                                    onChange={(e) =>
                                      updateRule(
                                        rule.id,
                                        "max",
                                        Number(e.target.value),
                                      )
                                    }
                                    className="w-24 text-sm border border-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                  />
                                </td>
                                <td className="px-5 py-2">
                                  <div className="flex items-center">
                                    <span className="text-slate-400 font-black mr-2">
                                      ➜
                                    </span>
                                    <input
                                      type="number"
                                      value={rule.score}
                                      onChange={(e) =>
                                        updateRule(
                                          rule.id,
                                          "score",
                                          Number(e.target.value),
                                        )
                                      }
                                      className="w-20 text-sm border font-bold text-indigo-700 bg-indigo-50 border-indigo-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                    />
                                  </div>
                                </td>
                                <td className="px-5 py-2 text-right">
                                  {mode !== "readonly" && (
                                    <button
                                      onClick={() => removeRule(rule.id)}
                                      className="text-slate-400 hover:text-rose-500 p-1"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="p-3 border-t border-slate-200 bg-slate-50">
                          {mode !== "readonly" && (
                            <button
                              onClick={addRule}
                              className="text-xs font-bold text-slate-600 hover:text-slate-800 flex items-center"
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" /> 添加映射区间
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-sm text-slate-500">
                        <p>公式计算结果即为最终得分，无需额外映射。</p>
                      </div>
                    )}
                  </section>

                  {/* Step 4: Live Sandbox */}
                  <section className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden text-slate-300 relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
                    <div className="px-5 py-3 border-b border-slate-800 flex items-center relative z-10">
                      <Activity className="w-5 h-5 mr-2 text-emerald-500" />
                      <h3 className="text-sm font-black text-white">
                        4. 实时演练沙盒 (Live Sandbox)
                      </h3>
                    </div>
                    <div className="p-5 flex flex-col md:flex-row gap-6 relative z-10">
                      {/* Mock Inputs */}
                      <div className="flex-1 space-y-3 border-r border-slate-800 pr-6">
                        <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                          注入模拟值
                        </div>
                        {config.variables.map((v) => (
                          <div key={v.id} className="flex items-center">
                            <span className="w-8 h-8 rounded bg-slate-800 text-blue-400 font-black font-mono flex items-center justify-center shrink-0 border border-slate-700 mr-3">
                              {v.id}
                            </span>
                            <input
                              type="number"
                              value={sandboxInputs[v.id] ?? ""}
                              onChange={(e) =>
                                setSandboxInputs((prev) => ({
                                  ...prev,
                                  [v.id]: Number(e.target.value),
                                }))
                              }
                              className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none text-white font-mono text-sm"
                              placeholder={`模拟 ${v.label}`}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Output */}
                      <div className="flex-1 flex flex-col justify-center">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-bold text-slate-500 uppercase">
                            公式运算结果 (Raw)
                          </span>
                          <span className="text-xl font-mono text-slate-300">
                            {simulationResult.result}
                          </span>
                        </div>
                        <div className="h-px w-full bg-slate-800 mb-4"></div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white uppercase tracking-wider text-sm flex items-center">
                            <Play className="w-4 h-4 mr-2 text-emerald-500" />
                            最终诊断得分
                          </span>
                          <span className="text-4xl font-black text-emerald-500 font-mono drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                            {simulationResult.score}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>
                </TabsContent>

                <TabsContent value="qualitative" className="space-y-6">
                  {/* Global Normalization Notice */}
                  <div className="bg-blue-50/50 text-blue-600 border border-blue-100 text-xs p-2 rounded flex items-center gap-2">
                    <span className="text-base">ℹ️</span>
                    <span>
                      系统基座默认：为配合后续考核方案的权重计算，本指标最终得分将被统一归一化为
                      0-100 的百分制标准分。
                    </span>
                  </div>

                  {/* Section 1: Evidence Requirements */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-black text-slate-800 flex items-center mb-4">
                      <span className="w-5 h-5 flex items-center justify-center bg-blue-100 text-blue-700 rounded mr-2">
                        📎
                      </span>
                      佐证材料要求 (Evidence Requirements)
                    </h3>
                    <div className="space-y-2">
                      {evidenceRequirements.length === 0 ? (
                        <div className="text-slate-500 text-sm text-center py-4 bg-slate-50 rounded border border-dashed border-slate-200">
                          尚未添加佐证材料要求，请点击下方按钮开始配置。
                        </div>
                      ) : (
                        evidenceRequirements.map((req, index) => (
                          <div
                            key={req.id}
                            className="flex gap-3 items-start bg-slate-50 border border-slate-200 p-3 rounded text-sm transition-all duration-300"
                          >
                            <span className="text-slate-500 font-medium pt-2">
                              {index + 1}.
                            </span>
                            <div className="flex-grow space-y-2">
                              <Input
                                placeholder="输入佐证材料描述，例如：请上传晨会纪要..."
                                value={req.description}
                                onChange={(e) =>
                                  updateEvidenceRequirement(
                                    req.id,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                className="bg-white text-sm"
                              />
                              {mode !== "readonly" && (
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                  <Checkbox
                                    checked={req.required}
                                    onCheckedChange={(checked) =>
                                      setEvidenceRequirements(
                                        evidenceRequirements.map((r) =>
                                          r.id === req.id
                                            ? { ...r, required: checked === true }
                                            : r,
                                        ),
                                      )
                                    }
                                  />
                                  <span>{req.required ? "必填佐证材料" : "可选佐证材料"}</span>
                                </label>
                              )}
                              {mode === "readonly" && (
                                <span className="text-xs text-slate-500">
                                  {req.required ? "必填佐证材料" : "可选佐证材料"}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-2 shrink-0 w-64 pt-0.5">
                              <Popover>
                                <PopoverTrigger
                                  nativeButton={false}
                                  render={
                                    <div className="flex flex-wrap gap-1 items-center border border-slate-200 rounded-md p-1 bg-white min-h-[36px] cursor-text" />
                                  }
                                >
                                  {req.fileTypes.map((type) => (
                                    <span
                                      key={type}
                                      className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-md"
                                    >
                                      {type}
                                      {mode !== "readonly" && (
                                        <X
                                          className="w-3 h-3 cursor-pointer hover:text-slate-900"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            toggleFileType(req.id, type);
                                          }}
                                        />
                                      )}
                                    </span>
                                  ))}
                                  <input
                                    placeholder={
                                      req.fileTypes.length === 0
                                        ? "选择或输入格式..."
                                        : ""
                                    }
                                    className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-sm px-1 text-slate-700"
                                    onKeyDown={(e) => {
                                      if (
                                        e.key === "Enter" &&
                                        e.currentTarget.value.trim() !== ""
                                      ) {
                                        e.preventDefault();
                                        addCustomFileType(
                                          req.id,
                                          e.currentTarget.value.trim(),
                                        );
                                        e.currentTarget.value = "";
                                      }
                                    }}
                                  />
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-64 p-2 bg-white border border-slate-200 shadow-md"
                                  align="start"
                                >
                                  <div className="space-y-1">
                                    {[
                                      { label: "📄 PDF", value: "PDF" },
                                      {
                                        label: "🖼️ PNG 图片",
                                        value: "PNG",
                                      },
                                      {
                                        label: "🖼️ JPEG 图片",
                                        value: "JPEG",
                                      },
                                      {
                                        label: "📝 Word (DOCX)",
                                        value: "DOCX",
                                      },
                                      {
                                        label: "📊 Excel (XLSX)",
                                        value: "XLSX",
                                      },
                                      {
                                        label: "📄 纯文本 (TXT)",
                                        value: "TXT",
                                      },
                                    ].map((option) => (
                                      <button
                                        key={option.value}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          toggleFileType(req.id, option.value);
                                        }}
                                        className="flex items-center justify-between w-full p-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md transition-colors"
                                      >
                                        <span>{option.label}</span>
                                        {req.fileTypes.includes(
                                          option.value,
                                        ) && (
                                          <Check className="w-4 h-4 text-blue-600" />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                            {mode !== "readonly" && (
                              <button
                                onClick={() =>
                                  removeEvidenceRequirement(req.id)
                                }
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded hover:bg-slate-200/50 mt-1 shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    {mode !== "readonly" && (
                      <Button
                        variant="outline"
                        onClick={addEvidenceRequirement}
                        className="w-full border-dashed border-slate-300 text-slate-500 mt-3 hover:bg-slate-50 hover:text-slate-600 bg-white"
                      >
                        + 添加佐证材料要求
                      </Button>
                    )}
                  </div>

                  {/* Section 2: Scoring Rubric */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-black text-slate-800 flex items-center mb-4">
                      <span className="w-5 h-5 flex items-center justify-center bg-blue-100 text-blue-700 rounded mr-2">
                        📏
                      </span>
                      人工评分量表 (Scoring Rubric)
                    </h3>
                    <div className="space-y-4">
                      {/* Mode Switcher */}
                      <div className="flex bg-slate-100 p-0.5 rounded-lg w-fit">
                        <button
                          onClick={() => setQualitativeScoringMode("deductive")}
                          className={`flex items-center px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${qualitativeScoringMode === "deductive" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          ➖ 扣分制 (Deductive)
                        </button>
                        <button
                          onClick={() => setQualitativeScoringMode("matrix")}
                          className={`flex items-center px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${qualitativeScoringMode === "matrix" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          📊 分档评价 (Rubric)
                        </button>
                      </div>

                      {qualitativeScoringMode === "deductive" ? (
                        <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg space-y-3 text-sm text-slate-700">
                          <div className="flex items-center gap-2 font-medium">
                            基础分{" "}
                            <Input
                              type="number"
                              value={deductiveConfig.baseScore}
                              onChange={(e) =>
                                setDeductiveConfig({
                                  ...deductiveConfig,
                                  baseScore: Number(e.target.value),
                                })
                              }
                              className="w-20 bg-white"
                            />{" "}
                            分 (固定)
                          </div>
                          <div className="flex items-center gap-2">
                            每发现一次
                            <Input
                              defaultValue="瑕疵/违规"
                              className="w-32 bg-white"
                            />
                            扣
                            <Input
                              type="number"
                              value={deductiveConfig.deductionPerFlaw}
                              onChange={(e) =>
                                setDeductiveConfig({
                                  ...deductiveConfig,
                                  deductionPerFlaw: Number(e.target.value),
                                })
                              }
                              className="w-20 bg-white"
                            />
                            分
                          </div>
                          <div className="flex items-center gap-2">
                            本项最高扣分上限{" "}
                            <Input
                              type="number"
                              value={deductiveConfig.maxDeduction}
                              onChange={(e) =>
                                setDeductiveConfig({
                                  ...deductiveConfig,
                                  maxDeduction: Number(e.target.value),
                                })
                              }
                              className="w-20 bg-white"
                            />{" "}
                            分
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {rubricRows.map((row) => (
                            <div
                              key={row.id}
                              className="flex items-center gap-2"
                            >
                              <Input
                                value={row.name}
                                onChange={(e) =>
                                  updateRubricRow(
                                    row.id,
                                    "name",
                                    e.target.value,
                                  )
                                }
                                placeholder="档位名称"
                                className="w-24 text-sm"
                              />
                              <Input
                                type="number"
                                value={row.min}
                                onChange={(e) =>
                                  updateRubricRow(
                                    row.id,
                                    "min",
                                    Number(e.target.value),
                                  )
                                }
                                className="w-16 text-sm text-center"
                              />
                              <span className="text-slate-400 font-mono">
                                -
                              </span>
                              <Input
                                type="number"
                                value={row.max}
                                onChange={(e) =>
                                  updateRubricRow(
                                    row.id,
                                    "max",
                                    Number(e.target.value),
                                  )
                                }
                                className="w-16 text-sm text-center"
                              />
                              <span className="text-sm text-slate-500 w-6">
                                分
                              </span>
                              <Input
                                value={row.desc}
                                onChange={(e) =>
                                  updateRubricRow(
                                    row.id,
                                    "desc",
                                    e.target.value,
                                  )
                                }
                                placeholder="描述要求..."
                                className="flex-1 text-sm"
                              />
                              {mode !== "readonly" && (
                                <button
                                  onClick={() => removeRubricRow(row.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded hover:bg-slate-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          {mode !== "readonly" && (
                            <Button
                              variant="ghost"
                              onClick={addRubricRow}
                              className="text-blue-600 text-sm hover:!bg-blue-50 hover:text-blue-700 h-8 px-2 -ml-2 mt-2"
                            >
                              + 添加评分档位
                            </Button>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        * 所有评分最终将映射至 0-100
                        标准分区间以确保权重计算的一致性。
                      </p>
                    </div>
                  </div>

                  {/* Section 3: AI Prompt Guidelines */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-black text-slate-800 flex items-center mb-4">
                      <span className="w-5 h-5 flex items-center justify-center bg-purple-100 text-purple-700 rounded mr-2">
                        🤖
                      </span>
                      AI 辅助校验规则 (AI Prompt Guidelines)
                    </h3>
                    <Textarea
                      placeholder="请描述您希望 AI 扮演的角色和审查标准。例如：‘你是一个合规审计员，请重点检查上传的PDF合同中是否包含甲乙双方的印章’"
                      className="min-h-[100px] text-sm text-slate-700 focus-visible:ring-purple-500"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {/* Bottom padding to prevent hiding content behind fixed footer */}
              <div className="h-10"></div>
            </fieldset>

            {/* Footer */}
            <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors"
              >
                {mode === "readonly" ? "关闭" : "取消"}
              </button>
              {mode === "readonly" ? (
                <button
                  onClick={onClose}
                  className="flex items-center px-6 py-2.5 text-sm font-bold text-white bg-blue-600 shadow border border-transparent rounded-lg hover:bg-blue-700 transition-all"
                >
                  关闭查阅
                </button>
              ) : (
                <div className="flex space-x-3">
                  <button
                    data-testid="p1-indicator-save-draft"
                    onClick={handleSaveDraft}
                    disabled={isSubmitting}
                    className="flex items-center px-5 py-2.5 text-sm font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-60"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSubmitting ? "处理中..." : "保存草稿"}
                  </button>
                  <button
                    data-testid="p1-indicator-publish"
                    onClick={handlePublish}
                    disabled={isSubmitting}
                    className="flex items-center px-6 py-2.5 text-sm font-bold text-white bg-blue-600 shadow border border-transparent rounded-lg hover:bg-blue-700 transition-all hover:shadow-md disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {isSubmitting ? "后端校验中..." : "校验并发布"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
