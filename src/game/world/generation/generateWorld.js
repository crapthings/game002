import { createSpawnPlan } from '../../spawning/createSpawnPlan.js'
import { createHierarchy, ecologyWeights } from './createHierarchy.js'
import { createTopography } from './topography.js'
import { selectSettlementSite } from '../settlements/selectSettlementSite.js'
import { WORLD_BOUNDS, WORLD_SIZE, WORLD_UNIT } from '../worldConfig.js'
import { biomeCatalog } from '../biomes/catalog.js'
import { defineRoad } from '../roads/roadProfiles.js'
import { compileRoadNetwork } from '../roads/roadGeometry.js'
import { blocksRoad } from '../settlements/frontage.js'
import { environmentCatalog } from '../../assets/environment/catalog.js'
import { createRegionalSettlement } from '../settlements/createRegionalSettlement.js'
export { normalizeSeed, validateDefinitions } from './generateWorldV1.js'
import { normalizeSeed } from './generateWorldV1.js'

export const GENERATOR_VERSION = 4
export const PLAN_VERSION = 2
const colorHex = (color) => '#' + color.map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')

export function generateWorld(seed) {
  seed = normalizeSeed(seed)
  // 城市从世界中心展开；外围八个区域覆盖剩余土地，不再随机分配城市象限。
  const halfCityRegion = 160
  const xs = [WORLD_BOUNDS.minX, -halfCityRegion, halfCityRegion, WORLD_BOUNDS.maxX]
  const zs = [WORLD_BOUNDS.minZ, -halfCityRegion, halfCityRegion, WORLD_BOUNDS.maxZ]
  const regions = []
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const central = row === 1 && column === 1
    const bounds = { minX: xs[column], maxX: xs[column + 1], minZ: zs[row], maxZ: zs[row + 1] }
    const center = [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2]
    const kind = central ? 'city' : 'wilderness', biome = central ? 'urban' : 'woodland'
    const name = central ? '中央城镇' : `城郊 ${row + 1}-${column + 1}`
    regions.push({
      id: `district-${row}-${column}`, revision: 1, kind, name, biome, center, bounds,
      radius: Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2,
      ecology: [], color: colorHex(biomeCatalog[biome].color), description: name,
      tags: [kind, biome], connections: [], landmarks: [], scatter: [], placements: [],
      ...(central ? { citySize: 'medium', growth: 'center-out', fixedCenter: true } : {}),
    })
  }
  regions.forEach((region, index) => {
    const row = Math.floor(index / 3), column = index % 3
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (column + dx >= 0 && column + dx < 3 && row + dz >= 0 && row + dz < 3) region.connections.push(`district-${row + dz}-${column + dx}`)
    }
  })
  const hierarchy = createHierarchy(seed, regions)
  const topography = createTopography(seed, hierarchy)
  for (const region of regions) {
    if (region.kind === 'wilderness') {
      region.biome = [...ecologyWeights(hierarchy, ...region.center)].sort((a, b) => b[1] - a[1])[0][0]
      region.name = `${biomeCatalog[region.biome].name} ${region.id.split('-').slice(1).map(Number).map(n => n + 1).join('-')}`
      region.color = colorHex(biomeCatalog[region.biome].color)
      region.tags = [region.kind, region.biome]
    } else {
      region.site = selectSettlementSite(seed, region, topography)
      region.center = region.site.center
    }
    region.ecology = []
    region.description = region.kind === 'city' ? '城心固定于世界中心，商业与公共设施向外过渡为住宅和城郊。' : `${region.name}，位于中央城镇外围，生态由跨区域连续场生成。`
  }
  const settlements = regions.filter((region) => region.kind !== 'wilderness').map((region) => createRegionalSettlement(seed, region))
  for (const town of settlements) {
    const { site, bounds } = regions.find(region => region.id === town.regionId)
    town.elevation = site.elevation
    town.terrainBlend = Math.max(1, Math.min(64, town.bounds.minX - bounds.minX, bounds.maxX - town.bounds.maxX, town.bounds.minZ - bounds.minZ, bounds.maxZ - town.bounds.maxZ))
  }
  for (const cell of hierarchy.cells) {
    cell.settlementIds = settlements.filter(town => town.bounds.minX < cell.bounds.maxX && town.bounds.maxX > cell.bounds.minX && town.bounds.minZ < cell.bounds.maxZ && town.bounds.maxZ > cell.bounds.minZ).map(town => town.id)
  }
  const city = settlements.find(town => town.kind === 'city')
  // 四向出口沿城市主轴延伸至城郊，距世界边界保留 32 米。
  const roads = city.gates.map((gate, index) => {
    const length = Math.hypot(...gate)
    const end = gate.map(value => value / length * (WORLD_SIZE / 2 - 32))
    return defineRoad(`outward-${index}`, [gate, end], 'regional')
  })
  const regionalSegments = compileRoadNetwork(roads)
  for (const town of settlements) {
    // 跨区公路优先，地块和组合装饰避让走廊；不让道路穿过建筑。
    town.placements = town.placements.filter(placement => !blocksRoad(placement,regionalSegments,1))
    const owners = new Set(town.placements.map(item=>item.id))
    if(town.facilities) town.facilities=town.facilities.filter(item=>owners.has(item.id))
    for(const block of town.blocks || []) {
      if(block.parcels)block.parcels=block.parcels.filter(parcel=>owners.has(parcel.buildingId))
      if(block.coverage!==undefined)block.coverage=town.placements.filter(item=>item.blockId===block.id).reduce((sum,item)=>sum+item.footprint.width*item.footprint.depth,0)/((block.bounds.maxX-block.bounds.minX)*(block.bounds.maxZ-block.bounds.minZ))
    }
    if(town.surfaces) town.surfaces=town.surfaces.filter(surface=>!surface.ownerId || owners.has(surface.ownerId))
    const allSegments=compileRoadNetwork([...roads,...town.roads])
    town.decorations = town.decorations.filter(placement => {
      if(placement.ownerId && !owners.has(placement.ownerId)) return false
      const definition=environmentCatalog[placement.assetId]
      const footprint=definition?.footprint || {width:(definition?.radius || 1)*2,depth:(definition?.radius || 1)*2}
      return !blocksRoad({...placement,footprint},allSegments,0.5)
    })
  }
  const world = { seed, hierarchy, topography, generatorVersion: GENERATOR_VERSION, planVersion: PLAN_VERSION, unitSize: WORLD_UNIT, size: WORLD_SIZE, bounds: { ...WORLD_BOUNDS }, terrainVersion: 2, environmentVersion: 1, roadPlanVersion: 3, regions, settlements, roads, spawn: [0, 0] }
  world.spawnPlan = createSpawnPlan(world)
  return world
}

export function appendNewRegions() {
  throw new Error(`${WORLD_SIZE} 米世界已完整分区。调整规划配方后请创建新版本世界，不直接覆盖既有区域。`)
}
