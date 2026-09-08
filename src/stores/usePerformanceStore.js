import { create } from 'zustand'

export const usePerformanceStore = create(set => ({
  sample: null,
  publish: sample => set({ sample }),
}))
