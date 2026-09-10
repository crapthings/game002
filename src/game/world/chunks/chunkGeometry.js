import { buildingBodies } from './createTraversal.js'
import { chunkAt, chunkKey, generateChunkPlacements } from './terrain.js'
import { townSurface } from '../settlements/createTownPlan.js'
import { environmentCatalog } from '../../assets/environment/catalog.js'
import { wuxiaDefinitions } from '../../assets/wuxia/catalog.js'

/** One placement overlay for the rendering and navigation workers. */
export function plannedPlacementIndex(plan) {
  const result = new Map()
  const add = placement => {
    const chunk = chunkAt(placement.position[0], placement.position[2]), key = chunkKey(chunk.x, chunk.z)
    if (!result.has(key)) result.set(key, [])
    result.get(key).push(placement)
  }
  for (const region of plan.regions ?? []) for (const placement of region.placements ?? []) add({ ...placement, regionId: region.id, planned: true })
  for (const town of plan.settlements ?? []) {
    for (const placement of town.placements) add({ ...placement, regionId: town.id, building: true })
    for (const placement of town.decorations ?? []) add({ ...placement, regionId: town.regionId, decoration: true })
  }
  for (const placement of [...(plan.fortifications?.placements ?? []), ...(plan.city?.placements ?? [])]) add(placement)
  return result
}

export function includeWorldPlacement(plan, placement) {
  const [x, , z] = placement.position, spawn = plan.spawn ?? [0, 0]
  if (Math.hypot(x - spawn[0], z - spawn[1]) < 3 || placement.assetId.startsWith('landmark.')) return false
  if (!placement.planned && !placement.building && !placement.decoration && (plan.regions ?? []).some(region =>
    region.placements.length > 0 && Math.hypot(x - region.center[0], z - region.center[1]) < region.radius)) return false
  return Boolean(placement.building || placement.decoration || !(townSurface(plan.settlements ?? [], x, z)?.weight > .5))
}

// Ground navigation uses the same horizontal bodies. Rendering supplies the
// measured visual top for height-aware traversal/landing, without altering XZ.
export function placementCollisionBodies(placement, visualTop = Infinity) {
  if (placement.fortification || placement.infrastructure) return []
  const x = placement.position[0], z = placement.position[2], scale = placement.scale ?? 1, rotation = placement.rotation ?? 0
  const definition = environmentCatalog[placement.assetId] || wuxiaDefinitions[placement.assetId]
  const footprint = placement.footprint || definition?.footprint
  if (wuxiaDefinitions[placement.assetId]) {
    if (definition.kind.startsWith('market-')) return [{ x, z, rotation, halfWidth: definition.width * scale / 2,
      halfDepth: definition.depth * scale / 2, base: placement.position[1], top: visualTop }]
    return buildingBodies(definition, placement)
  }
  if (definition?.kind === 'court' || definition?.layout === 'court' || definition?.layout === 'wing') {
    const cosine = Math.cos(rotation), sine = Math.sin(rotation)
    return [[0, definition.depth / 2 - 2, definition.width, 4], [-definition.width / 2 + 1.75, -2, 3.5, definition.depth - 4],
      ...(definition.layout === 'wing' ? [] : [[definition.width / 2 - 1.75, -2, 3.5, definition.depth - 4]])]
      .map(([ox, oz, width, depth]) => ({ x: x + cosine * ox + sine * oz, z: z - sine * ox + cosine * oz,
        rotation, halfWidth: width / 2, halfDepth: depth / 2 }))
  }
  if (footprint) return [{ x, z, rotation, halfWidth: footprint.width * scale / 2, halfDepth: footprint.depth * scale / 2 }]
  const radius = definition?.radius ?? (placement.assetId === 'nature.tree' ? .45 : .9)
  return radius > 0 ? [{ x, z, radius: radius * scale, top: visualTop }] : []
}

export function collisionBounds(colliders) {
  return colliders.reduce((bounds, obstacle) => {
    const reach = obstacle.radius ?? Math.hypot(obstacle.halfWidth, obstacle.halfDepth)
    bounds.minX = Math.min(bounds.minX, obstacle.x - reach); bounds.maxX = Math.max(bounds.maxX, obstacle.x + reach)
    bounds.minZ = Math.min(bounds.minZ, obstacle.z - reach); bounds.maxZ = Math.max(bounds.maxZ, obstacle.z + reach)
    return bounds
  }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
}

export function generateNavigationGeometry(terrain, cx, cz, overlays) {
  const key = chunkKey(cx, cz), colliders = []
  for (const source of [...generateChunkPlacements(terrain, cx, cz), ...(overlays.get(key) ?? [])]) {
    if (!includeWorldPlacement(terrain.plan, source)) continue
    const placement = { ...source, position: [...source.position] }
    if (!placement.fortification && !placement.infrastructure) placement.position[1] = terrain.surfaceHeight(placement.position[0], placement.position[2])
    colliders.push(...placementCollisionBodies(placement))
  }
  return { key, bounds: collisionBounds(colliders), colliders }
}
