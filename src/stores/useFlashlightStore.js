import { create } from 'zustand'

export const useFlashlightStore = create(set => ({
  enabled: false, battery: 100,
  toggle: () => set(state => ({ enabled: state.battery > 0 && !state.enabled })),
  publish: value => set(value),
}))
