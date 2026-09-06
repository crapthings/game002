import { createCityPlan } from '../city/createCityPlan.js'
import { createFortifications } from '../fortifications/createFortifications.js'
import { createHierarchy, ecologyWeights } from './createHierarchy.js'
import { createTopography } from './topography.js'
import { WORLD_BOUNDS, WORLD_SIZE, WORLD_UNIT } from '../worldConfig.js'
import { biomeCatalog } from '../biomes/catalog.js'

export const GENERATOR_VERSION = 7
export const PLAN_VERSION = 2
const colorHex = (color) => '#' + color.map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')

export function normalizeSeed(value) {
  const seed = String(value).normalize('NFC').trim()
  if (!seed || seed.length > 80) throw new Error('世界种子需为 1–80 个字符。')
  return seed
}

export function generateWorld(seed) {
  seed = normalizeSeed(seed)
  // 保留中心规划区和外围八区；自然素材阶段不生成建筑或现代道路。
  const halfCityRegion = 160
  const xs = [WORLD_BOUNDS.minX, -halfCityRegion, halfCityRegion, WORLD_BOUNDS.maxX]
  const zs = [WORLD_BOUNDS.minZ, -halfCityRegion, halfCityRegion, WORLD_BOUNDS.maxZ]
  const regions = []
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const central = row === 1 && column === 1
    const bounds = { minX: xs[column], maxX: xs[column + 1], minZ: zs[row], maxZ: zs[row + 1] }
    const center = [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2]
    const kind = 'wilderness', biome = central ? 'meadow' : 'woodland'
    const name = central ? '江湖城内' : `城郊 ${row + 1}-${column + 1}`
    regions.push({
      id: `district-${row}-${column}`, revision: 1, kind, name, biome, center, bounds,
      radius: Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2,
      ecology: [], color: colorHex(biomeCatalog[biome].color), description: name,
      tags: [kind, biome], connections: [], landmarks: [], scatter: [], placements: [],
      ...(central ? { reserved: true } : {}),
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
    if (!region.reserved) {
      region.biome = [...ecologyWeights(hierarchy, ...region.center)].sort((a, b) => b[1] - a[1])[0][0]
      region.name = `${biomeCatalog[region.biome].name} ${region.id.split('-').slice(1).map(Number).map(n => n + 1).join('-')}`
      region.color = colorHex(biomeCatalog[region.biome].color)
      region.tags = [region.kind, region.biome]
    }
    region.ecology = []
    region.description = region.reserved ? '四层规划城内街坊、民宅与碧溪水系。' : `${region.name}，保留原比例自然生态。`
  }
  const fortifications=createFortifications(topography)
  const city=createCityPlan(seed,hierarchy,fortifications)
  const settlements = [], roads = city.roads
  for (const cell of hierarchy.cells) cell.settlementIds = []
  const world = { seed, hierarchy, topography, fortifications, city, generatorVersion: GENERATOR_VERSION, planVersion: PLAN_VERSION, unitSize: WORLD_UNIT, size: WORLD_SIZE, bounds: { ...WORLD_BOUNDS }, terrainVersion: 2, environmentVersion: 1, roadPlanVersion: 3, regions, settlements, roads, spawn: [0, 0] }
  return world
}

export function appendNewRegions() {
  throw new Error(`${WORLD_SIZE} 米世界已完整分区。调整规划配方后请创建新版本世界，不直接覆盖既有区域。`)
}
