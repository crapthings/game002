import { create } from 'zustand'

let sequence = 0
// 请求是当前场景的一次性操作，不能随开发偏好持久化。
export const useTeleportStore = create((set, get) => ({
  request: null, progress: 0, message: '',
  begin(x, z, seed) {
    if (get().request || !Number.isFinite(x) || !Number.isFinite(z)) return
    set({ request: { id: ++sequence, x, z, seed }, progress: 0, message: '正在准备落点附近区域…' })
  },
  publish(progress, message) {
    const state = get()
    if (state.progress !== progress || state.message !== message) set({ progress, message })
  },
  finish(message = '') { set({ request: null, progress: 0, message }) },
}))
