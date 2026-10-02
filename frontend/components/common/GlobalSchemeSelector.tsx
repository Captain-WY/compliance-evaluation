import * as React from "react"
import { ChevronsUpDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { useSchemeStore } from "@/store/useSchemeStore"
import { assessmentApi } from "@/src/modules/compliance-shared/services/api"
import type { AssessmentScheme } from "@/src/modules/compliance-shared/types"

export function GlobalSchemeSelector() {
  const { selectedSchemeId, selectedSchemeName, setSelectedScheme } = useSchemeStore()
  const [schemes, setSchemes] = React.useState<AssessmentScheme[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    assessmentApi.getSchemes({ pageSize: 100 })
      .then((items) => {
        if (cancelled) return
        setSchemes(items)
        if (!selectedSchemeId && items[0]) {
          setSelectedScheme({ id: items[0].id, name: items[0].title })
        }
      })
      .catch((err) => {
        if (cancelled) return
        setSchemes([])
        setError(err instanceof Error ? err.message : "方案列表加载失败")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedSchemeId, setSelectedScheme])

  if (loading) {
    return (
      <div className="inline-flex h-10 w-[340px] items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
        <span className="truncate pr-2">正在加载考核方案</span>
        <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-60" />
      </div>
    )
  }

  if (error || schemes.length === 0) {
    return (
      <div
        title={error ?? "当前没有真实考核方案"}
        className="inline-flex h-10 w-[340px] items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-700"
      >
        <span className="truncate pr-2">{error ? "方案列表加载失败" : "暂无真实考核方案"}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </div>
    )
  }

  return (
    <div className="relative">
      <select
        value={selectedSchemeId ?? ""}
        onChange={(event) => {
          const next = schemes.find((scheme) => scheme.id === event.target.value)
          setSelectedScheme({ id: next?.id ?? null, name: next?.title ?? null })
        }}
        title={selectedSchemeName ?? "选择考核方案"}
        className={cn(
          "h-10 w-[340px] appearance-none rounded-md border border-slate-200 bg-white px-3 pr-10 text-sm font-semibold text-slate-700 shadow-sm outline-none",
          "focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        )}
      >
        {schemes.map((scheme) => (
          <option key={scheme.id} value={scheme.id}>
            {scheme.title || scheme.id}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}
