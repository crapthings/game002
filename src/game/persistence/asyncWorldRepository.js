import { validateDocument } from './worldRepository.js'
import { generateWorld, normalizeSeed } from '../world/generation/generateWorld.js'
import { createProgress } from '../world/progress.js'

let connection
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('game002-worlds-512-v4', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('worlds')
      request.result.createObjectStore('progress')
    }
    request.onerror = () => { connection = null; reject(request.error) }
    request.onblocked = () => { connection = null; reject(new Error('请关闭其他旧版游戏标签页后重新进入。')) }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); connection = null }
      resolve(db)
    }
  })
  return connection
}

export const asyncWorldRepository = {
  async open(value) {
    const seed = normalizeSeed(value), db = await database()
    let document = await new Promise((resolve, reject) => {
      const tx = db.transaction(['worlds', 'progress'], 'readonly')
      const world = tx.objectStore('worlds').get(seed), progress = tx.objectStore('progress').get(seed)
      tx.oncomplete = () => {
        if (!world.result && !progress.result) { resolve(null); return }
        if (!world.result || !progress.result) { reject(new Error('存档数据不完整，已保留原始记录。')); return }
        resolve({ ...world.result, ...progress.result })
      }
      tx.onabort = () => reject(tx.error || new Error('读取存档失败。'))
    })
    if (!document) {
      // 旧档只在首次导入时读取，原 localStorage 数据作为备份保留。
      const raw = localStorage.getItem('game002:world:512:v4:' + encodeURIComponent(seed))
      document = raw === null ? { schemaVersion: 2, revision: 0, world: generateWorld(seed), progress: createProgress() } : JSON.parse(raw)
      validateDocument(document, seed)
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['worlds', 'progress'], 'readwrite')
        tx.objectStore('worlds').add({ schemaVersion: document.schemaVersion, world: document.world }, seed)
        tx.objectStore('progress').add({ revision: document.revision, progress: document.progress }, seed)
        tx.oncomplete = resolve
        tx.onabort = () => reject(tx.error || new Error('导入存档失败，请重新进入。'))
      })
    } else validateDocument(document, seed)
    localStorage.setItem('game002:active-seed:512:v4', seed)
    return document
  },
  async save(document, progress) {
    const db = await database()
    const next = { ...document, revision: document.revision + 1, progress }
    await new Promise((resolve, reject) => {
      const tx = db.transaction('progress', 'readwrite'), store = tx.objectStore('progress')
      let conflict = false
      const request = store.get(document.world.seed)
      request.onsuccess = () => {
        if (request.result?.revision !== document.revision) { conflict = true; tx.abort(); return }
        // 只写进度；世界规划不再每两秒被解析、校验和序列化。
        store.put({ revision: next.revision, progress }, document.world.seed)
      }
      tx.oncomplete = resolve
      tx.onabort = () => reject(conflict ? new Error('存档已在其他页面更新，请返回菜单重新进入该种子。') : tx.error || new Error('进度保存失败。'))
    })
    return next
  },
}
