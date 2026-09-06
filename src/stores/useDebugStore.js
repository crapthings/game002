import { create } from 'zustand'

const defaults = { revealMap: false, infiniteSprint: false, sprintMultiplier: 1, pauseSpawning:false, showSpawns:false }
// 仅当前页面会话，不写入世界、探索迷雾或玩家体力存档。
export const useDebugStore = create(set => ({
  ...defaults,
  setPauseSpawning: value => set({pauseSpawning:Boolean(value)}),
  setShowSpawns: value => set({showSpawns:Boolean(value)}),
  setRevealMap: value => set({ revealMap: Boolean(value) }),
  setInfiniteSprint: value => set({ infiniteSprint: Boolean(value) }),
  setSprintMultiplier: value => set({ sprintMultiplier: [1, 2, 3, 4].includes(Number(value)) ? Number(value) : 1 }),
  reset: () => set(defaults),
}))
