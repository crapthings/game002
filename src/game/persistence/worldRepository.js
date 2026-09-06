import { roadPoints } from '../world/roads/roadGeometry.js'
import { generateWorld, normalizeSeed, appendNewRegions } from '../world/generation/generateWorld.js'
import { createProgress } from '../world/progress.js'
import { WORLD_BOUNDS, WORLD_SIZE } from '../world/worldConfig.js'
import { biomeCatalog } from '../world/biomes/catalog.js'
import { validFog } from '../map/fog.js'
import { validStamina } from '../entities/createStamina.js'
import { validWorldTime } from '../world/createDayNightCycle.js'
import { validInventory } from '../inventory/inventory.js'
import { validSurvival } from '../entities/survival.js'
import { validFlashlight } from '../entities/createFlashlight.js'
import { getSpawnPlan } from '../spawning/createSpawnPlan.js'
import { zombieCatalog } from '../assets/zombies/catalog.js'

const SCHEMA_VERSION = 2
const PREFIX = 'game001:world:v2:'
const ACTIVE_KEY = 'game001:active-seed:v2'
const validPath = (road) => Array.isArray(roadPoints(road)) && roadPoints(road).length >= 2 && roadPoints(road).every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))

export function validateDocument(document, seed) {
  if (document?.schemaVersion !== SCHEMA_VERSION) throw new Error('存档版本不兼容，已保留原始数据。')
  const world = document.world, progress = document.progress
  if (world?.seed !== seed || world.generatorVersion !== 2 || world.planVersion !== 2 || !Array.isArray(world.regions) || world.regions.length === 0 || !Number.isInteger(document.revision)) throw new Error('世界存档无效，已保留原始数据。')
  if (world.hierarchy) {
    const h = world.hierarchy
    if (h.version !== 1 || !Array.isArray(h.macros) || h.macros.length !== 4 || !Array.isArray(h.cells) || h.cells.length !== 64 || !Array.isArray(h.warpPhase) || h.warpPhase.length !== 2 || !h.warpPhase.every(Number.isFinite)) throw new Error('分层规划无效。')
    if (!h.cells.every((cell, index) => cell.id === `cell-${Math.floor(index / 8)}-${index % 8}` && biomeCatalog[cell.biome] && Array.isArray(cell.center) && cell.center.length === 2 && cell.center.every(Number.isFinite) && world.regions.some(region => region.id === cell.parentId))) throw new Error('细分生态规划无效。')
  }
  if (world.topography) {
    const field = world.topography
    if (!world.hierarchy || field.version !== 1 || !Array.isArray(field.anchors) || field.anchors.length !== 4 || !field.anchors.every(anchor => anchor && ['x', 'z', 'height', 'moisture'].every(key => Number.isFinite(anchor[key])) && anchor.moisture >= 0 && anchor.moisture <= 1) || !Array.isArray(field.waves) || field.waves.length !== 3 || !field.waves.every(wave => wave && ['wavelength', 'amplitude', 'angle', 'phase'].every(key => Number.isFinite(wave[key])) && wave.wavelength > 0)) throw new Error('地形底图无效。')
  }
  if (world.spawnPlan) {
    const spawn=world.spawnPlan, ids=new Set(), assets=new Set(zombieCatalog.map(item=>item.assetId))
    if (spawn.version!==1 || !Array.isArray(spawn.points) || spawn.points.length>4096) throw new Error('感染者出生规划无效。')
    for (const point of spawn.points) {
      if (!point || typeof point.id!=='string' || !/^infected-v1\/-?\d+\/-?\d+\/\d+$/.test(point.id) || ids.has(point.id) || !assets.has(point.assetId) || ![point.x,point.z,point.rotation].every(Number.isFinite) || Math.abs(point.x)>=1024 || Math.abs(point.z)>=1024 || !world.regions.some(region=>region.id===point.regionId)) throw new Error('感染者出生点无效。')
      ids.add(point.id)
    }
  }
  if (world.unitSize !== 1 || world.size !== WORLD_SIZE || world.terrainVersion !== 2 || world.environmentVersion !== 1 || !world.bounds || !Object.entries(WORLD_BOUNDS).every(([key, value]) => world.bounds[key] === value) || !Array.isArray(world.spawn) || world.spawn.length !== 2 || !world.spawn.every(Number.isFinite)) throw new Error('2048 米世界规格无效。')
  if (!Array.isArray(world.roads) || !world.roads.every((road) => Array.isArray(road.from) && road.from.length === 2 && road.from.every(Number.isFinite) && Array.isArray(road.to) && road.to.length === 2 && road.to.every(Number.isFinite) && Number.isFinite(road.width) && road.width > 0 && validPath(road))) throw new Error('区域道路存档无效。')
  if (!world.roads.every(road => !road.routing || (road.routing.version === 1 && road.routing.gridSize === 16 && ['length', 'wetLength', 'maxSlope'].every(key => Number.isFinite(road.routing[key]) && road.routing[key] >= 0)))) throw new Error('区域道路寻路数据无效。')
  const ids = new Set()
  for (const region of world.regions) {
    if (typeof region.id !== 'string' || ids.has(region.id) || typeof region.name !== 'string' || typeof region.color !== 'string' || !Array.isArray(region.tags) || !region.tags.every((tag) => typeof tag === 'string') || !Array.isArray(region.center) || region.center.length !== 2 || !region.center.every(Number.isFinite) || !Number.isFinite(region.radius) || region.radius <= 0 || !Array.isArray(region.placements)) throw new Error('区域存档无效，已保留原始数据。')
    const b = region.bounds
    if (!b || !Object.values(b).every(Number.isFinite) || !(b.minX < b.maxX && b.minZ < b.maxZ) || b.minX < WORLD_BOUNDS.minX || b.maxX > WORLD_BOUNDS.maxX || b.minZ < WORLD_BOUNDS.minZ || b.maxZ > WORLD_BOUNDS.maxZ || !biomeCatalog[region.biome] || !Array.isArray(region.ecology)) throw new Error('区域边界或生态无效。')
    if (!region.ecology.every((patch) => biomeCatalog[patch.biome] && Array.isArray(patch.center) && patch.center.length === 2 && patch.center.every(Number.isFinite) && Number.isFinite(patch.radius) && patch.radius > 0)) throw new Error('子生态规划无效。')
    ids.add(region.id)
    const objectIds = new Set()
    for (const item of region.placements) {
      if (typeof item.id !== 'string' || objectIds.has(item.id) || typeof item.assetId !== 'string' || !Array.isArray(item.position) || item.position.length !== 3 || !item.position.every(Number.isFinite) || !Number.isFinite(item.rotation) || !Number.isFinite(item.scale) || item.scale <= 0) throw new Error('对象存档无效，已保留原始数据。')
      objectIds.add(item.id)
    }
  }
  const coveredArea = world.regions.reduce((area, region) => area + (region.bounds.maxX - region.bounds.minX) * (region.bounds.maxZ - region.bounds.minZ), 0)
  if (coveredArea !== WORLD_SIZE * WORLD_SIZE) throw new Error('区域没有覆盖完整世界。')
  for (let a = 0; a < world.regions.length; a += 1) for (let b = a + 1; b < world.regions.length; b += 1) {
    const first = world.regions[a].bounds, second = world.regions[b].bounds
    if (Math.min(first.maxX, second.maxX) > Math.max(first.minX, second.minX) && Math.min(first.maxZ, second.maxZ) > Math.max(first.minZ, second.minZ)) throw new Error('世界区域发生重叠。')
  }
  if (!progress || !Array.isArray(progress.discoveredRegionIds) || !progress.discoveredRegionIds.every((id) => ids.has(id)) || !progress.annotations || typeof progress.annotations !== 'object' || Array.isArray(progress.annotations) || !Object.entries(progress.annotations).every(([id, text]) => ids.has(id) && typeof text === 'string' && text.length <= 160) || (progress.lastRegionId !== null && !ids.has(progress.lastRegionId))) throw new Error('进度存档无效，已保留原始数据。')
  if (progress.playerPosition != null && (!Array.isArray(progress.playerPosition) || progress.playerPosition.length !== 2 || !progress.playerPosition.every(Number.isFinite))) throw new Error('角色位置存档无效。')
  if (progress.stamina !== undefined && !validStamina(progress.stamina)) throw new Error('体力存档无效。')
  if (progress.inventory !== undefined && !validInventory(progress.inventory)) throw new Error('背包存档无效。')
  if (progress.survival !== undefined && !validSurvival(progress.survival)) throw new Error('饥饿口渴存档无效。')
  if (progress.worldTime !== undefined && !validWorldTime(progress.worldTime)) throw new Error('世界时间存档无效。')
  if (progress.flashlight !== undefined && !validFlashlight(progress.flashlight)) throw new Error('手电状态存档无效。')
  if (progress.exploredFog !== undefined && !validFog(progress.exploredFog)) throw new Error('探索迷雾存档无效，已保留原始数据。')
  if (!Array.isArray(world.settlements)) throw new Error('缺少城镇规划。')
  {
    if (!Array.isArray(world.settlements)) throw new Error('城镇存档无效。')
    for (const town of world.settlements) {
      if (![1, 2].includes(town.revision) || town.catalogVersion !== 1 || typeof town.id !== 'string' || !Number.isFinite(town.elevation) || !town.bounds || !['minX', 'maxX', 'minZ', 'maxZ'].every((key) => Number.isFinite(town.bounds[key])) || !Array.isArray(town.placements) || !Array.isArray(town.roads)) throw new Error('城镇规划版本或范围无效。')
      if (town.revision === 2 && (town.streetPlanVersion !== 3 || !['small','medium','large'].includes(town.citySize))) throw new Error('城市尺度规划无效。')
      if (town.terrainBlend !== undefined && (!Number.isFinite(town.terrainBlend) || town.terrainBlend <= 0 || town.terrainBlend > 64)) throw new Error('聚落地形过渡无效。')
      if (!ids.has(town.regionId) || town.bounds.minX >= town.bounds.maxX || town.bounds.minZ >= town.bounds.maxZ) throw new Error('城镇范围或所属区域无效。')
      for (const placement of town.placements) {
        if (typeof placement.id !== 'string' || typeof placement.assetId !== 'string' || !Array.isArray(placement.position) || placement.position.length !== 3 || !placement.position.every(Number.isFinite) || !Number.isFinite(placement.rotation) || !Number.isFinite(placement.scale) || placement.scale <= 0 || !Number.isFinite(placement.footprint?.width) || !Number.isFinite(placement.footprint?.depth) || placement.footprint.width <= 0 || placement.footprint.depth <= 0) throw new Error('建筑地块存档无效。')
      }
      if (!Array.isArray(town.decorations) || !town.decorations.every((item) => typeof item.id === 'string' && typeof item.assetId === 'string' && Array.isArray(item.position) && item.position.length === 3 && item.position.every(Number.isFinite) && Number.isFinite(item.rotation) && Number.isFinite(item.scale) && item.scale > 0)) throw new Error('组合环境资产存档无效。')
      for (const road of town.roads) {
        if (!Array.isArray(road.from) || road.from.length !== 2 || !road.from.every(Number.isFinite) || !Array.isArray(road.to) || road.to.length !== 2 || !road.to.every(Number.isFinite) || !Number.isFinite(road.width) || road.width <= 0 || !validPath(road)) throw new Error('道路规划存档无效。')
      }
    }
  }
  if (progress.killedZombieIds !== undefined) {
    if (!Array.isArray(progress.killedZombieIds) || progress.killedZombieIds.length>4096) throw new Error('感染者死亡记录无效。')
    const known=new Set(getSpawnPlan(world).points.map(point=>point.id))
    if (!progress.killedZombieIds.every(id=>known.has(id)) || new Set(progress.killedZombieIds).size!==progress.killedZombieIds.length) throw new Error('感染者死亡编号无效。')
  }
  return document
}

// 存储可注入；当前小型区域规划使用 localStorage，后续实现 IndexedDB adapter。
export function createWorldRepository(storage) {
  const keyFor = (seed) => PREFIX + encodeURIComponent(normalizeSeed(seed))
  return {
    getActiveSeed: () => storage.getItem(ACTIVE_KEY) || storage.getItem('game001:active-seed') || 'first-light',
    open(seed) {
      seed = normalizeSeed(seed)
      const raw = storage.getItem(keyFor(seed))
      let document
      if (raw !== null) {
        try { document = validateDocument(JSON.parse(raw), seed) }
        catch (error) { throw new Error(`无法读取世界：${error.message}`) }
      } else {
        document = { schemaVersion: SCHEMA_VERSION, revision: 0, world: generateWorld(seed), progress: createProgress() }
        validateDocument(document, seed)
        storage.setItem(keyFor(seed), JSON.stringify(document))
      }
      storage.setItem(ACTIVE_KEY, seed)
      return document
    },
    extend(document, definitions) {
      const world = appendNewRegions(document.world, definitions)
      if (world === document.world) return document
      return this.save({ ...document, world }, document.progress)
    },
    save(document, progress) {
      const key = keyFor(document.world.seed)
      const raw = storage.getItem(key)
      const current = raw === null ? null : validateDocument(JSON.parse(raw), document.world.seed)
      if (!current || current.revision !== document.revision) throw new Error('存档已在其他页面更新，请返回菜单重新进入该种子。')
      const next = { ...document, revision: document.revision + 1, progress }
      validateDocument(next, document.world.seed)
      storage.setItem(key, JSON.stringify(next))
      return next
    },
  }
}
