import { create } from 'zustand'

export const VIEW_DISTANCE = Object.freeze({ min: 32, max: 160, step: 16, default: 64 })
export const RENDER_SCALE = Object.freeze({ min: .5, max: 2, step: .25, default: 1 })
const key = 'game002:graphics:v1'
function normalize(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(VIEW_DISTANCE.min, Math.min(VIEW_DISTANCE.max, Math.round(number / VIEW_DISTANCE.step) * VIEW_DISTANCE.step)) : VIEW_DISTANCE.default
}
function normalizeScale(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(RENDER_SCALE.min, Math.min(RENDER_SCALE.max, Math.round(number / RENDER_SCALE.step) * RENDER_SCALE.step)) : RENDER_SCALE.default
}
function read() {
  let saved
  try { saved = JSON.parse(localStorage.getItem(key)) } catch { /* 默认画质。 */ }
  return { viewDistance: normalize(saved?.viewDistance ?? VIEW_DISTANCE.default), renderScale: normalizeScale(saved?.renderScale ?? RENDER_SCALE.default), showPerformance: saved?.showPerformance === true }
}
export const useGraphicsStore = create(set => {
  const update = patch => set(state => {
    const next = { viewDistance: state.viewDistance, renderScale: state.renderScale, showPerformance: state.showPerformance, ...patch }
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* 当前会话仍可调整。 */ }
    return next
  })
  return {
    ...read(),
    setViewDistance: value => update({ viewDistance: normalize(value) }),
    setRenderScale: value => update({ renderScale: normalizeScale(value) }),
    setShowPerformance: value => update({ showPerformance: Boolean(value) }),
  }
})
