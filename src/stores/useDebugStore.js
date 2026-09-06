import { create } from 'zustand'

const defaults = { revealMap: false, infiniteSprint: false, sprintMultiplier: 1, teleportMode: false }
const key = 'game002:debug:v1'
function normalize(value = {}) {
  return {
    revealMap: value?.revealMap === true,
    infiniteSprint: value?.infiniteSprint === true,
    teleportMode: value?.teleportMode === true,
    sprintMultiplier: [1, 2, 3, 4].includes(value?.sprintMultiplier) ? value.sprintMultiplier : 1,
  }
}
function read() {
  try { return normalize(JSON.parse(localStorage.getItem(key))) } catch { return { ...defaults } }
}
// 仅保存开发偏好，不把地图全显等设置混入探索进度。
export const useDebugStore = create(set => {
  const update = patch => set(state => {
    const next = normalize({ ...state, ...patch })
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* 存储不可用时仍支持本次会话。 */ }
    return next
  })
  return {
    ...read(),
    setRevealMap: value => update({ revealMap: Boolean(value) }),
    setInfiniteSprint: value => update({ infiniteSprint: Boolean(value) }),
    setTeleportMode: value => update({ teleportMode: Boolean(value) }),
    setSprintMultiplier: value => update({ sprintMultiplier: Number(value) }),
    reset: () => update(defaults),
  }
})
