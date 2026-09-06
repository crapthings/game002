import { createRandom } from './random.js'
import { createSpawnPlan } from '../../spawning/createSpawnPlan.js'
import { createHierarchy, ecologyWeights } from './createHierarchy.js'
import { createTopography } from './topography.js'
import { selectSettlementSite } from '../settlements/selectSettlementSite.js'
import { WORLD_BOUNDS, WORLD_SIZE, WORLD_UNIT, insideRegion } from '../worldConfig.js'
import { biomeCatalog } from '../biomes/catalog.js'
import { createRegionalRoadPlan } from '../roads/createRegionalRoadPlan.js'
import { compileRoadNetwork } from '../roads/roadGeometry.js'
import { blocksRoad } from '../settlements/frontage.js'
import { environmentCatalog } from '../../assets/environment/catalog.js'
import { createRegionalSettlement } from '../settlements/createRegionalSettlement.js'
export { normalizeSeed, validateDefinitions } from './generateWorldV1.js'
import { normalizeSeed } from './generateWorldV1.js'

export const GENERATOR_VERSION = 2
export const PLAN_VERSION = 2
function shuffled(values, random) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1)), current = result[index]
    result[index] = result[other]; result[other] = current
  }
  return result
}
const colorHex = (color) => '#' + color.map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')

export function generateWorld(seed) {
  seed = normalizeSeed(seed)
  const random = createRandom(seed, 'world-layout-v2')
  const cuts = () => [-1024, -512, 0, 512, 1024]
  const xs = cuts(), zs = cuts()
  const roles = shuffled(['city', 'city', 'city', 'village', 'village', 'village', 'village', 'woodland', 'woodland', 'meadow', 'farmland', 'farmland', 'wetland', 'wetland', 'quarry', 'scrubland'], random)
  const spawnColumn = xs.findIndex((value, index) => index < 4 && value <= 0 && xs[index + 1] > 0)
  const spawnRow = zs.findIndex((value, index) => index < 4 && value <= 0 && zs[index + 1] > 0)
  const spawnIndex = spawnRow * 4 + spawnColumn
  const villageIndex = roles.indexOf('village')
  const spawnRole = roles[spawnIndex]
  roles[spawnIndex] = roles[villageIndex]
  roles[villageIndex] = spawnRole
  const regions = []
  let cityCount = 0, villageCount = 0
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const index = row * 4 + column, role = roles[index]
      const id = `district-${row}-${column}`
      const rng = createRandom(seed, id, 'region-v2')
      const bounds = { minX: xs[column], maxX: xs[column + 1], minZ: zs[row], maxZ: zs[row + 1] }
      const center = [Math.round((bounds.minX + bounds.maxX) / 2), Math.round((bounds.minZ + bounds.maxZ) / 2)]
      const biome = role === 'city' ? 'urban' : role === 'village' ? 'farmland' : role
      const kind = role === 'city' || role === 'village' ? role : 'wilderness'
      const name = role === 'city' ? ['灰港城区', '旧工业城', '北岸新城'][cityCount++] : role === 'village' ? ['灰桥村', '松田村', '风车村', '石井村'][villageCount++] : `${biomeCatalog[biome].name} ${row + 1}-${column + 1}`
      const patchPool = biome === 'urban' ? ['scrubland', 'woodland', 'meadow'] : biome === 'farmland' ? ['meadow', 'woodland', 'wetland'] : ['woodland', 'scrubland', 'meadow', 'wetland']
      const ecology = Array.from({ length: 3 }, (_, patch) => ({
        id: `${id}/ecology/${patch}`, biome: patchPool[Math.floor(rng() * patchPool.length)],
        center: [Math.round(bounds.minX + (0.2 + rng() * 0.6) * (bounds.maxX - bounds.minX)), Math.round(bounds.minZ + (0.2 + rng() * 0.6) * (bounds.maxZ - bounds.minZ))],
        radius: 65 + Math.round(rng() * 45),
      }))
      regions.push({ id, revision: 1, kind, name, biome, center, bounds, radius: Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2, ecology, color: colorHex(biomeCatalog[biome].color), description: `${name}，含${ecology.map((patch) => biomeCatalog[patch.biome].name).join('、')}过渡生态。`, tags: [kind, biome], connections: [], landmarks: [], scatter: [], placements: [] })
    }
  }
  // 共享边界形成区域邻接图，避免独立随机圆形区域留下空隙。
  regions.forEach((region, index) => {
    const row = Math.floor(index / 4), column = index % 4
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (column + dx >= 0 && column + dx < 4 && row + dz >= 0 && row + dz < 4) region.connections.push(`district-${row + dz}-${column + dx}`)
    }
  })
  const citySizes = shuffled(['small', 'medium', 'large'], createRandom(seed, 'city-sizes-v3'))
  regions.filter(region => region.kind === 'city').forEach((region, index) => {
    region.citySize = citySizes[index]
    region.tags.push(region.citySize)
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
    region.description = `${region.name}，生态由跨区域连续场生成。`
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
  const roads = createRegionalRoadPlan(settlements, topography)
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
  const startRegion = regions.find((region) => insideRegion(region, 0, 0))
  const spawnTown = settlements.find((town) => town.regionId === startRegion.id)
  const world = { seed, hierarchy, topography, generatorVersion: GENERATOR_VERSION, planVersion: PLAN_VERSION, unitSize: WORLD_UNIT, size: WORLD_SIZE, bounds: { ...WORLD_BOUNDS }, terrainVersion: 2, environmentVersion: 1, roadPlanVersion: 3, regions, settlements, roads, spawn: [spawnTown.gate[0] + 20, spawnTown.gate[1]] }
  world.spawnPlan = createSpawnPlan(world)
  return world
}

export function appendNewRegions() {
  throw new Error('2048 米世界已完整分区。调整规划配方后请创建新版本世界，不直接覆盖既有区域。')
}
