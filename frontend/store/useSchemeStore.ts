import { create } from 'zustand'

interface SchemeStore {
  selectedSchemeId: string | null
  selectedSchemeName: string | null
  setSelectedSchemeId: (id: string | null) => void
  setSelectedScheme: (scheme: { id: string | null; name?: string | null }) => void
}

export const useSchemeStore = create<SchemeStore>((set) => ({
  selectedSchemeId: null,
  selectedSchemeName: null,
  setSelectedSchemeId: (id) => set({ selectedSchemeId: id }),
  setSelectedScheme: (scheme) => set({
    selectedSchemeId: scheme.id,
    selectedSchemeName: scheme.name ?? null,
  }),
}))
