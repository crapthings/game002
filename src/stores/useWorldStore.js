import { create } from 'zustand'
import { createWorldRepository } from '../game/persistence/worldRepository.js'
import { applyProgress } from '../game/world/progress.js'

const repository = () => createWorldRepository(window.localStorage)
let operations = Promise.resolve()
const enqueue = (task) => {
  const operation = operations.then(task)
  operations = operation.catch(() => {})
  return operation
}
const asyncRepository = async () => (await import('../game/persistence/asyncWorldRepository.js')).asyncWorldRepository

export const useWorldStore = create((set, get) => ({
  document: null,
  error: null,
  seed: 'first-light',
  initialize: () => {
    if (get().document) return
    try { set({ seed: repository().getActiveSeed(), error: null }) }
    catch (error) { set({ error: error.message }) }
  },
  openWorld: (seed) => enqueue(async () => {
    try {
      const document = await (await asyncRepository()).open(seed)
      set({ document, seed: document.world.seed, error: null })
      return true
    } catch (error) {
      set({ error: `保存或读取失败：${error.message}` })
      return false
    }
  }),
  addNewRegions: () => {
    try {
      const document = get().document
      if (!document) return false
      set({ document: repository().extend(document), error: null })
      return true
    } catch (error) {
      set({ error: `区域扩展失败：${error.message}` })
      return false
    }
  },
  dispatch: (event) => {
    const owner = get().document?.world
    return enqueue(async () => {
      try {
        const document = get().document
        if (!document || document.world !== owner) return false
        const progress = applyProgress(document.world, document.progress, event)
        if (progress === document.progress) return true
        const next = await (await asyncRepository()).save(document, progress,{archivePages:event.archivePages??[]})
        set({ document: next, error: null })
        return true
      } catch (error) {
        set({ error: `进度未保存：${error.message}` })
        return false
      }
    })
  },
}))
