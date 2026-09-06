import { createFortifications } from '../world/fortifications/createFortifications.js'
import { generateWorld, normalizeSeed, appendNewRegions, GENERATOR_VERSION } from '../world/generation/generateWorld.js'
import { createProgress } from '../world/progress.js'
import { WORLD_BOUNDS, WORLD_SIZE, insideWorld } from '../world/worldConfig.js'
import { biomeCatalog } from '../world/biomes/catalog.js'
import { validFog } from '../map/fog.js'
import { validStamina } from '../entities/createStamina.js'
import { validWorldTime } from '../world/createDayNightCycle.js'

const SCHEMA_VERSION = 2
const PREFIX = 'game002:world:512:v6:'
const ACTIVE_KEY = 'game002:active-seed:512:v6'
const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
const bounds = b => b && ['minX','maxX','minZ','maxZ'].every(key => Number.isFinite(b[key])) && b.minX < b.maxX && b.minZ < b.maxZ && b.minX >= WORLD_BOUNDS.minX && b.maxX <= WORLD_BOUNDS.maxX && b.minZ >= WORLD_BOUNDS.minZ && b.maxZ <= WORLD_BOUNDS.maxZ

export function validateDocument(document, seed) {
  if (document?.schemaVersion !== SCHEMA_VERSION || !Number.isInteger(document.revision) || document.revision < 0) throw new Error('存档版本无效，已保留原始数据。')
  const world = document.world, progress = document.progress
  if (world?.seed !== seed || world.generatorVersion !== GENERATOR_VERSION || world.planVersion !== 2 || world.unitSize !== 1 || world.size !== WORLD_SIZE || !bounds(world.bounds) || !Object.entries(WORLD_BOUNDS).every(([key,value]) => world.bounds[key] === value) || !point(world.spawn) || !insideWorld(world.bounds,...world.spawn,1)) throw new Error('512 米世界规格无效。')
  if (!Array.isArray(world.settlements) || world.settlements.length || !Array.isArray(world.roads) || world.roads.length || world.spawnPlan) throw new Error('当前世界仅支持自然资产规划。')
  if (!Array.isArray(world.regions) || world.regions.length !== 9) throw new Error('世界区域无效。')
  const ids = new Set()
  for (const region of world.regions) {
    if (typeof region.id !== 'string' || ids.has(region.id) || !bounds(region.bounds) || !point(region.center) || !insideWorld(region.bounds,...region.center) || !biomeCatalog[region.biome] || region.kind !== 'wilderness' || typeof region.name !== 'string' || typeof region.color !== 'string' || !Array.isArray(region.tags) || !Array.isArray(region.connections) || !Array.isArray(region.ecology) || !Array.isArray(region.placements) || region.placements.length) throw new Error('自然区域数据无效。')
    ids.add(region.id)
  }
  if (world.regions.reduce((sum,r) => sum+(r.bounds.maxX-r.bounds.minX)*(r.bounds.maxZ-r.bounds.minZ),0) !== WORLD_SIZE*WORLD_SIZE) throw new Error('区域未覆盖世界。')
  for (let a=0;a<world.regions.length;a++) for (let b=a+1;b<world.regions.length;b++) {
    const x=world.regions[a].bounds,y=world.regions[b].bounds
    if (Math.min(x.maxX,y.maxX)>Math.max(x.minX,y.minX) && Math.min(x.maxZ,y.maxZ)>Math.max(x.minZ,y.minZ)) throw new Error('区域重叠。')
  }
  if (!world.regions.every(region => region.connections.every(id => ids.has(id)))) throw new Error('区域连接无效。')
  const h=world.hierarchy, t=world.topography
  if (h?.version !== 1 || h.macros?.length !== 4 || h.cells?.length !== 64 || !point(h.warpPhase) || !h.macros.every(m=>bounds(m.bounds)) || !h.cells.every((cell,index)=>cell.id===`cell-${Math.floor(index/8)}-${index%8}` && bounds(cell.bounds) && point(cell.center) && ids.has(cell.parentId) && biomeCatalog[cell.biome])) throw new Error('生态层级无效。')
  if (t?.version !== 1 || t.anchors?.length !== 4 || t.waves?.length !== 3 || !t.anchors.every(a=>['x','z','height','moisture'].every(k=>Number.isFinite(a[k]))) || !t.waves.every(w=>['wavelength','amplitude','angle','phase'].every(k=>Number.isFinite(w[k])) && w.wavelength>0)) throw new Error('地形数据无效。')
  if (JSON.stringify(world.fortifications) !== JSON.stringify(createFortifications(t))) throw new Error('城防规划数据无效。')
  if (!progress || !Array.isArray(progress.discoveredRegionIds) || !progress.discoveredRegionIds.every(id=>ids.has(id)) || !progress.annotations || typeof progress.annotations !== 'object' || Array.isArray(progress.annotations) || !Object.entries(progress.annotations).every(([id,text])=>ids.has(id) && typeof text==='string' && text.length<=160) || (progress.lastRegionId!==null && !ids.has(progress.lastRegionId))) throw new Error('探索进度无效。')
  if (progress.playerPosition!=null && (!point(progress.playerPosition) || !insideWorld(world.bounds,...progress.playerPosition,1))) throw new Error('角色位置无效。')
  if (progress.exploredFog!==undefined && !validFog(progress.exploredFog)) throw new Error('探索迷雾无效。')
  if (progress.stamina!==undefined && !validStamina(progress.stamina)) throw new Error('体力无效。')
  if (progress.worldTime!==undefined && !validWorldTime(progress.worldTime)) throw new Error('时间无效。')
  return document
}

export function createWorldRepository(storage) {
  const keyFor = (seed) => PREFIX + encodeURIComponent(normalizeSeed(seed))
  return {
    getActiveSeed: () => storage.getItem(ACTIVE_KEY) || 'first-light',
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
