import { validFog } from '../map/fog.js'
import { validStamina } from '../entities/createStamina.js'
import { START_TIME, validWorldTime } from './createDayNightCycle.js'
import { createInventory, updateInventory } from '../inventory/inventory.js'
import { itemCatalog } from '../inventory/items.js'
import { createSurvival } from '../entities/survival.js'
import { validFlashlight } from '../entities/createFlashlight.js'
import { getSpawnPlan } from '../spawning/createSpawnPlan.js'

export function createProgress() {
  return { discoveredRegionIds: [], annotations: {}, flags: {}, lastRegionId: null, playerPosition: null, exploredFog: {}, worldTime: START_TIME, inventory: createInventory(), survival: createSurvival() }
}

export function applyProgress(world, progress, event) {
  if (event.type === 'zombie-killed') {
    if (!getSpawnPlan(world).points.some(point=>point.id===event.id)) throw new Error('感染者编号不存在。')
    const killed=progress.killedZombieIds || []
    return killed.includes(event.id) ? progress : { ...progress,killedZombieIds:[...killed,event.id] }
  }
  if (event.type === 'survival-tick') {
    if (![event.food,event.water].every(value => Number.isFinite(value) && value >= 0)) throw new Error('生存状态变化无效。')
    const needs = progress.survival ?? createSurvival()
    return { ...progress, survival: { food: Math.max(0, needs.food-event.food), water: Math.max(0, needs.water-event.water) } }
  }
  if (event.type === 'consume') {
    const inventory = progress.inventory ?? createInventory()
    if (!Number.isInteger(event.index) || event.index < 0 || event.index >= inventory.slots.length) throw new Error('物品格子无效。')
    const stack = inventory.slots[event.index], effects = stack && itemCatalog[stack.itemId]?.effects
    if (!effects) throw new Error('该物品暂时无法使用。')
    const needs = progress.survival ?? createSurvival()
    if (!Object.keys(effects).some(key => needs[key] < 100)) throw new Error('当前状态已满，无需消耗物品。')
    const slots = inventory.slots.map((entry,index) => index !== event.index ? entry : entry.count > 1 ? { ...entry, count: entry.count-1 } : null)
    return { ...progress, inventory: { ...inventory, slots }, survival: { food: Math.min(100,needs.food+(effects.food || 0)), water: Math.min(100,needs.water+(effects.water || 0)) } }
  }
  if (event.type === 'inventory') return { ...progress, inventory: updateInventory(progress.inventory ?? createInventory(), event) }
  if (event.type === 'checkpoint') {
    if (!Array.isArray(event.position) || event.position.length !== 2 || !event.position.every(Number.isFinite)) throw new Error('角色位置无效。')
    if (event.fog !== undefined && !validFog(event.fog)) throw new Error('探索迷雾记录无效。')
    if (event.stamina !== undefined && !validStamina(event.stamina)) throw new Error('体力记录无效。')
    if (event.worldTime !== undefined && !validWorldTime(event.worldTime)) throw new Error('世界时间无效。')
    if (event.flashlight !== undefined && !validFlashlight(event.flashlight)) throw new Error('手电状态无效。')
    const exploredFog = { ...(progress.exploredFog || {}) }
    for (const [key, mask] of Object.entries(event.fog || {})) exploredFog[key] = (exploredFog[key] || 0) | mask
    return { ...progress, playerPosition: [...event.position], exploredFog, ...(event.stamina !== undefined ? { stamina: { ...event.stamina } } : {}), ...(event.worldTime !== undefined ? { worldTime: event.worldTime } : {}), ...(event.flashlight !== undefined ? { flashlight: { ...event.flashlight } } : {}) }
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
