import { validFog } from '../map/fog.js'
import { validStamina } from '../entities/createStamina.js'
import { START_TIME, validWorldTime } from './createDayNightCycle.js'
import { validFirstLoop } from '../worldLedger/firstLoop.js'

export function createProgress() {
  return { discoveredRegionIds: [], annotations: {}, flags: {}, lastRegionId: null, playerPosition: null, exploredFog: {}, worldTime: START_TIME }
}

export function applyProgress(world, progress, event) {
  if (event.type === 'checkpoint') {
    if (!Array.isArray(event.position) || event.position.length !== 2 || !event.position.every(Number.isFinite)) throw new Error('角色位置无效。')
    if (event.fog !== undefined && !validFog(event.fog)) throw new Error('探索迷雾记录无效。')
    if (event.stamina !== undefined && !validStamina(event.stamina)) throw new Error('体力记录无效。')
    if (event.worldTime !== undefined && !validWorldTime(event.worldTime)) throw new Error('世界时间无效。')
    if (event.ledger !== undefined && (!validFirstLoop(event.ledger, world) || (progress.ledger && event.ledger.revision < progress.ledger.revision))) throw new Error('江湖账本无效或已过期，未覆盖原进度。')
    const exploredFog = { ...(progress.exploredFog || {}) }
    for (const [key, mask] of Object.entries(event.fog || {})) exploredFog[key] = (exploredFog[key] || 0) | mask
    return { ...progress, playerPosition: [...event.position], exploredFog, ...(event.stamina !== undefined ? { stamina: { ...event.stamina } } : {}), ...(event.worldTime !== undefined ? { worldTime: event.worldTime } : {}), ...(event.ledger !== undefined ? { ledger: JSON.parse(JSON.stringify(event.ledger)) } : {}) }
  }
  if (!world.regions.some((region) => region.id === event.regionId)) throw new Error('区域不存在。')
  if (event.type === 'discover') {
    if (progress.discoveredRegionIds.includes(event.regionId)) return progress
    return { ...progress, discoveredRegionIds: [...progress.discoveredRegionIds, event.regionId].sort() }
  }
  if (event.type === 'annotate') {
    const text = String(event.text).trim()
    if (text.length > 160) throw new Error('标注不能超过 160 个字符。')
    const annotations = { ...progress.annotations }
    if (text) annotations[event.regionId] = text
    else delete annotations[event.regionId]
    return { ...progress, annotations }
  }
  if (event.type === 'select') return { ...progress, lastRegionId: event.regionId }
  throw new Error('未知进度事件。')
}
