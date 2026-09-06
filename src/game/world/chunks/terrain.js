import { cityGround, cityContains, cityGarden, inCanal } from '../city/createCityPlan.js'
import { fortificationGround, fortificationClearance } from '../fortifications/createFortifications.js'
import { createRandom } from '../generation/random.js'
import { townSurface } from '../settlements/createTownPlan.js'
import { compileRoadNetwork, sampleRoad } from '../roads/roadGeometry.js'
import { sampleEcology } from '../biomes/sampleEcology.js'
import { biomeCatalog, chooseBiomeAsset } from '../biomes/catalog.js'
import { surfaceAt } from '../settlements/frontage.js'
import { createTopographySampler } from '../generation/topography.js'

export const CHUNK_SIZE = 32
export const CHUNK_SEGMENTS = 32
export const LOAD_RADIUS = 2
export const KEEP_RADIUS = 3
export const TERRAIN_VERSION = 1

const smooth = (value) => value * value * (3 - 2 * value)
export function createTerrain(seed, settlements = [], plan = null) {
  const topography = plan?.topography ? createTopographySampler(plan.topography) : null
  const roads = compileRoadNetwork([...(plan?.roads || []), ...settlements.flatMap((town) => town.roads.map(road=>({ ...road,sidewalk:town.kind==='city' && Boolean(town.frontageVersion) })))])
  const samples = new Map()
  const roadIndex = new Map()
  // 道路按 64m 桶索引，高度采样只查看附近路段。
  for (const road of roads) {
    const margin = road.width / 2 + 12
    for (let z = Math.floor((Math.min(road.az, road.bz) - margin) / 64); z <= Math.floor((Math.max(road.az, road.bz) + margin) / 64); z += 1) {
      for (let x = Math.floor((Math.min(road.ax, road.bx) - margin) / 64); x <= Math.floor((Math.max(road.ax, road.bx) + margin) / 64); x += 1) {
        const key = `${x},${z}`
        if (!roadIndex.has(key)) roadIndex.set(key, [])
        roadIndex.get(key).push(road)
      }
    }
  }
  const nearbyRoad = (x, z) => sampleRoad(roadIndex.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`) || [], x, z)
  const hasRoads = (x, z, size) => roads.some((road) => {
    const margin = road.width / 2 + 3
    return Math.max(road.ax, road.bx) + margin >= x && Math.min(road.ax, road.bx) - margin <= x + size && Math.max(road.az, road.bz) + margin >= z && Math.min(road.az, road.bz) - margin <= z + size
  })
  const ecology = (x, z) => plan ? sampleEcology(plan, x, z) : { color: [0.19, 0.25, 0.19], elevation: 0, roughness: 2.6, density: 0.5, biome: 'woodland' }
  // 以全局坐标采样，不以区块局部坐标造山，边界顶点严格一致。
  function noise(x, z, wavelength, channel) {
    const sx = x / wavelength, sz = z / wavelength
    const ix = Math.floor(sx), iz = Math.floor(sz)
    const tx = smooth(sx - ix), tz = smooth(sz - iz)
    const sample = (dx, dz) => {
      const key = `${channel}/${ix + dx}/${iz + dz}`
      if (!samples.has(key)) {
        if (samples.size >= 4096) samples.delete(samples.keys().next().value)
        samples.set(key, createRandom(seed, plan?.terrainVersion || TERRAIN_VERSION, channel, ix + dx, iz + dz)() * 2 - 1)
      }
      return samples.get(key)
    }
    const a = sample(0, 0) * (1 - tx) + sample(1, 0) * tx
    const b = sample(0, 1) * (1 - tx) + sample(1, 1) * tx
    return a * (1 - tz) + b * tz
  }
  const pathDistance = (x, z) => Math.abs(z - Math.sin(x / 42) * 8)
  function height(x, z) {
    const profile = topography ? null : ecology(x, z)
    const base = topography ? topography.base(x, z).height : profile.elevation + noise(x, z, 80, 'hills') * profile.roughness + noise(x, z, 24, 'detail') * 0.35
    const surface = townSurface(settlements, x, z, true)
    const townHeight = surface ? base * (1 - surface.weight) + surface.town.elevation * surface.weight : base
    // 新地形道路随地面起伏；旧世界仍保留原来的零海拔路基。
    if (topography) return cityGround(plan?.city,x,z,fortificationGround(plan?.fortifications, x, z, townHeight))
    const road = nearbyRoad(x, z)
    const t = Math.max(0, Math.min(1, (road.distance - road.width / 2 - 1) / 8))
    return townHeight * (1 - (1 - smooth(t)) * road.fade)
  }
  function surfaceHeight(x, z) {
    const step = CHUNK_SIZE / CHUNK_SEGMENTS
    const x0 = Math.floor(x / step) * step, z0 = Math.floor(z / step) * step
    const tx = (x - x0) / step, tz = (z - z0) / step
    const a = height(x0, z0), b = height(x0 + step, z0), c = height(x0, z0 + step)
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz
    const d = height(x0 + step, z0 + step)
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz)
  }
  return { seed, settlements, plan, height, surfaceHeight, noise, pathDistance, ecology, nearbyRoad, hasRoads }
}

export function chunkAt(x, z) {
  return { x: Math.floor(x / CHUNK_SIZE), z: Math.floor(z / CHUNK_SIZE) }
}
export const chunkKey = (x, z) => `${x},${z}`
export function requiredChunks(center, radius = LOAD_RADIUS) {
  const result = []
  for (let z = center.z - radius; z <= center.z + radius; z += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      result.push({ x, z, key: chunkKey(x, z), priority: (x - center.x) ** 2 + (z - center.z) ** 2 })
    }
  }
  return result.sort((a, b) => a.priority - b.priority || a.x - b.x || a.z - b.z)
}

export function generateChunk(terrain, cx, cz) {
  const positions = [], indices = [], colors = [], placements = []
  const step = CHUNK_SIZE / CHUNK_SEGMENTS
  for (let z = 0; z <= CHUNK_SEGMENTS; z += 1) {
    for (let x = 0; x <= CHUNK_SEGMENTS; x += 1) {
      const wx = cx * CHUNK_SIZE + x * step, wz = cz * CHUNK_SIZE + z * step
      const y = terrain.height(wx, wz)
      positions.push(wx, y, wz)
      const variation = terrain.noise(wx, wz, 12, 'color') * 0.025
      const town = townSurface(terrain.settlements, wx, wz)
      const weight = town?.weight || 0
      const natural = terrain.ecology(wx, wz).color.map((value) => value + variation)
      const park = town?.town.blocks?.some((block) => block.kind === 'park' && wx > block.bounds.minX + 7 && wx < block.bounds.maxX - 7 && wz > block.bounds.minZ + 7 && wz < block.bounds.maxZ - 7)
      const urban = (park ? [0.26, 0.32, 0.20] : [0.31, 0.30, 0.26]).map((value) => value + variation)
      const road = terrain.nearbyRoad(wx, wz)
      const surface = surfaceAt(town?.town.surfaces,wx,wz)
      const frontageColors={yard:[0.30,0.31,0.22],path:[0.46,0.44,0.36],apron:[0.38,0.38,0.34],verge:[0.40,0.37,0.29]}
      // 小径与院落直接融入地面顶点颜色，不增加零散贴片和碰撞。
      const edgeDistance=road.distance-road.width/2
      const sidewalk=town?.town.kind==='city' && town.town.frontageVersion && edgeDistance>0 && edgeDistance<2
      const paving=frontageColors[surface] || (sidewalk ? [0.44,0.43,0.38] : null)
      const roadWeight = Math.max(0, Math.min(1, road.width / 2 + 0.6 - road.distance)) * road.fade
      const city=terrain.plan?.city
      if(cityContains(city,wx,wz)) {
        const palette=cityGarden(city,wx,wz)?[.42,.54,.33]:[.55,.57,.43]
        for(let i=0;i<3;i++)natural[i]=palette[i]+variation
      }
      const groundColor = natural.map((color, index) => color * (1 - weight) + (paving ? paving[index]+variation : urban[index]) * weight)
      colors.push(...groundColor.map((color) => color * (1 - roadWeight) + ((terrain.plan?.city ? 0.59 : 0.20) + variation) * roadWeight), 1)
    }
  }
  const stride = CHUNK_SEGMENTS + 1
  for (let z = 0; z < CHUNK_SEGMENTS; z += 1) {
    for (let x = 0; x < CHUNK_SEGMENTS; x += 1) {
      const a = z * stride + x
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
  }
  for (let index = 0; index < 36; index += 1) {
    const random = createRandom(terrain.seed, terrain.plan?.terrainVersion || TERRAIN_VERSION, 'chunk-props', cx, cz, index)
    const x = Math.round(cx * CHUNK_SIZE + (index % 6 + 0.3 + random() * 0.4) * CHUNK_SIZE / 6)
    const z = Math.round(cz * CHUNK_SIZE + (Math.floor(index / 6) + 0.3 + random() * 0.4) * CHUNK_SIZE / 6)
    if (fortificationClearance(terrain.plan?.fortifications, x, z)) continue
    if (inCanal(terrain.plan?.city,x,z,5) || !cityGarden(terrain.plan?.city,x,z)) continue
    const profile = terrain.ecology(x, z)
    if (random() > profile.density) continue
    const road = terrain.nearbyRoad(x, z)
    if (road.distance < road.width / 2 + 3 || townSurface(terrain.settlements, x, z)?.weight > 0.5) continue
    const assetId = chooseBiomeAsset(biomeCatalog[profile.biome], random)
    placements.push({ id: `terrain/${cx}/${cz}/${index}`, assetId, position: [x, terrain.height(x, z), z], rotation: random() * Math.PI * 2, scale: 0.85 + random() * 0.4 })
  }
  return { x: cx, z: cz, key: chunkKey(cx, cz), positions, indices, colors, placements }
}
