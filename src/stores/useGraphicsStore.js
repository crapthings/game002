import { create } from 'zustand'

export const VIEW_DISTANCE = Object.freeze({ min: 32, max: 160, step: 16, default: 64 })
const key = 'game002:graphics:v1'
function normalize(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(VIEW_DISTANCE.min, Math.min(VIEW_DISTANCE.max, Math.round(number / VIEW_DISTANCE.step) * VIEW_DISTANCE.step)) : VIEW_DISTANCE.default
}
function readDistance() {
  try { return normalize(JSON.parse(localStorage.getItem(key))?.viewDistance ?? VIEW_DISTANCE.default) }
  catch { return VIEW_DISTANCE.default }
}
export const useGraphicsStore = create(set => ({
  viewDistance: readDistance(),
  setViewDistance(value) {
    const viewDistance = normalize(value)
    set({ viewDistance })
    try { localStorage.setItem(key, JSON.stringify({ viewDistance })) } catch { /* 当前会话仍可调整。 */ }
  },
}))
