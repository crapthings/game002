import { validateDocument,validateProgressEnvelope } from './worldRepository.js'
import { validateLiving } from '../living/persistence.js'
import { verifyGameplayAdvance } from '../gameplay/runtime.js'
import { historyCanonical,historyPage,installHistoryPages } from '../gameplay/historyArchive.js'
import { generateWorld, normalizeSeed } from '../world/generation/generateWorld.js'
import { createProgress } from '../world/progress.js'

let connection
// Private baselines are made only by full replay or a verified incremental save.
const verified=new WeakMap()
const copy=value=>structuredClone(value)
const pageKey=(seed,archiveId,index)=>[seed,archiveId,index]
const schemaFor=(p,fallback)=>p.living?.version===4?6:p.living?.version===3?5:p.living?.version===2?4:p.living?3:fallback
function remember(document,catalog) {
  verified.set(document,{world:document.world,seed:document.world.seed,revision:document.revision,living:document.progress.living?copy(document.progress.living):null,catalog})
}
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('game002-worlds-512-v10', 2)
    request.onupgradeneeded = () => {
      for(const name of ['worlds','progress','history'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name)
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
function verifyProgress(document,progress,archivePages) {
  const baseline=verified.get(document)
  if(!baseline||baseline.world!==document.world||baseline.seed!==document.world.seed||baseline.revision!==document.revision)throw new Error('存档基线尚未校验，请重新进入。')
  validateProgressEnvelope(progress,document.world)
  const saved=progress.living,previous=baseline.living
  if(!saved){if(previous)throw new Error('不能丢弃已有江湖记录。');return null}
  if(previous) {
    if(saved.version<previous.version||historyCanonical(saved.legacy)!==historyCanonical(previous.legacy)||
      previous.version>=2&&(historyCanonical(saved.layout)!==historyCanonical(previous.layout)||historyCanonical(saved.migration)!==historyCanonical(previous.migration)))throw new Error('存档布局或旧档来源发生冲突。')
    const now=saved.checkpoint,old=previous.checkpoint
    if(now.version!==1||!Number.isSafeInteger(now.sequence)||![old.sequence,old.sequence+1].includes(now.sequence)||
      !Number.isSafeInteger(now.simulationAt)||!Number.isSafeInteger(now.simulationAt+100000)||now.simulationAt<old.simulationAt||now.simulationAt<now.gameplay.at)throw new Error('存档时序无效。')
    if(old.gameplay.version===2&&now.gameplay.version===2) {
      if(now.sequence===old.sequence&&historyCanonical(now)!==historyCanonical(old))throw new Error('检查点没有递增。')
      const result=verifyGameplayAdvance(old.gameplay,baseline.catalog,now.gameplay,{pages:archivePages})
      if(!result.ok)throw new Error(`增量记录校验失败：${result.code}，保留原档。`)
      return result.catalog
    }
  }
  if(archivePages.length)throw new Error('首次分页必须从已校验的江湖基线开始。')
  return validateLiving(saved,document.world).catalog
}

export const asyncWorldRepository = {
  async open(value) {
    const seed = normalizeSeed(value), db = await database()
    let loadedPages=[]
    let document = await new Promise((resolve, reject) => {
      const tx = db.transaction(['worlds', 'progress','history'], 'readonly')
      const world = tx.objectStore('worlds').get(seed), progress = tx.objectStore('progress').get(seed),reads=[]
      progress.onsuccess=()=>{
        const archive=progress.result?.progress?.living?.checkpoint.gameplay.archive?.history
        if(!archive)return
        if(!Array.isArray(archive.pages)){tx.abort();return}
        for(const page of archive.pages)reads.push(tx.objectStore('history').get(pageKey(seed,archive.id,page.index)))
      }
      tx.oncomplete = () => {
        if (!world.result && !progress.result) { resolve(null); return }
        if (!world.result || !progress.result) { reject(new Error('存档数据不完整，已保留原始记录。')); return }
        if(reads.some(r=>!r.result)){reject(new Error('历史页缺失，已保留原始记录。'));return}
        loadedPages=reads.map(r=>r.result)
        resolve({ ...world.result, ...progress.result })
      }
      tx.onabort = () => reject(tx.error || new Error('读取存档失败。'))
    })
    let validated
    if (!document) {
      // Import world, progress and any bundled pages atomically. Keep old bytes.
      const raw = localStorage.getItem('game002:world:512:v10:' + encodeURIComponent(seed))
      document = raw === null ? { schemaVersion: 2, revision: 0, world: generateWorld(seed), progress: createProgress() } : JSON.parse(raw)
      validateDocument(document, seed,{onLivingValidated:value=>{validated=value}})
      loadedPages=document.historyPages??[]
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['worlds', 'progress','history'], 'readwrite')
        tx.objectStore('worlds').add({ schemaVersion: document.schemaVersion, world: document.world }, seed)
        tx.objectStore('progress').add({ schemaVersion:document.schemaVersion,revision: document.revision, progress: document.progress }, seed)
        for(const page of loadedPages)tx.objectStore('history').add(page,pageKey(seed,page.archiveId,page.index))
        tx.oncomplete = resolve
        tx.onabort = () => reject(tx.error || new Error('导入存档失败，请重新进入。'))
      })
      document={schemaVersion:document.schemaVersion,revision:document.revision,world:document.world,progress:document.progress}
    } else {
      const archive=document.progress.living?.checkpoint.gameplay.archive?.history
      if(archive)installHistoryPages(archive.id,loadedPages)
      validateDocument(document, seed,{onLivingValidated:value=>{validated=value}})
    }
    remember(document,validated?.catalog??null)
    localStorage.setItem('game002:active-seed:512:v10', seed)
    return document
  },
  async save(document, progress,{archivePages=[]}={}) {
    const catalog=verifyProgress(document,progress,archivePages)
    const oldArchive=verified.get(document).living?.checkpoint.gameplay.archive?.history,newArchive=progress.living?.checkpoint.gameplay.archive?.history
    const oldCount=oldArchive?.pages.length??0
    if(archivePages.length!==((newArchive?.pages.length??0)-oldCount)||archivePages.some((p,i)=>p.archiveId!==newArchive.id||p.index!==oldCount+i))throw new Error('历史页与存档指针不一致。')
    const db = await database()
    const next = { ...document, schemaVersion:schemaFor(progress,document.schemaVersion), revision: document.revision + 1, progress }
    if(!Number.isSafeInteger(next.revision))throw new Error('存档序号已超过有效范围。')
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['progress','history'], 'readwrite'), store = tx.objectStore('progress')
      let conflict = false
      const request = store.get(document.world.seed)
      request.onsuccess = () => {
        if (request.result?.revision !== document.revision) { conflict = true; tx.abort(); return }
        // A quota error or duplicate page aborts both additions and the pointer.
        for(const page of archivePages)tx.objectStore('history').add(page,pageKey(document.world.seed,page.archiveId,page.index))
        store.put({ schemaVersion:next.schemaVersion, revision: next.revision, progress }, document.world.seed)
      }
      tx.oncomplete = resolve
      tx.onabort = () => reject(conflict ? new Error('存档已在其他页面更新，请返回菜单重新进入该种子。') : tx.error || new Error('进度保存失败，保留原档及历史页。'))
    })
    if(archivePages.length)installHistoryPages(newArchive.id,archivePages)
    remember(next,catalog)
    return next
  },
  async readHistoryPage(document,index) {
    const archive=document.progress.living?.checkpoint.gameplay.archive?.history
    if(!archive?.pages.some(p=>p.index===index))throw new Error('历史页不属于当前存档。')
    const db=await database()
    const page=await new Promise((resolve,reject)=>{
      const tx=db.transaction('history','readonly'),request=tx.objectStore('history').get(pageKey(document.world.seed,archive.id,index))
      tx.oncomplete=()=>resolve(request.result)
      tx.onabort=()=>reject(tx.error||new Error('读取历史页失败。'))
    })
    if(!page||historyCanonical(page)!==historyCanonical(historyPage(archive.id,index)))throw new Error('历史页校验失败，保留原档。')
    return page
  },
}
