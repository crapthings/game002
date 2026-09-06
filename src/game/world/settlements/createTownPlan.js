export function townSurface(towns, x, z, terrain = false) {
  for (const town of towns) {
    const b = town.bounds
    const outside = Math.max(b.minX - x, x - b.maxX, b.minZ - z, z - b.maxZ, 0)
    const blend = terrain ? (town.terrainBlend || 16) : 16
    if (outside >= blend) continue
    const t = Math.min(1, outside / blend)
    return { town, weight: 1 - t * t * (3 - 2 * t) }
  }
  return null
}
