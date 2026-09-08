export function fortificationBodies(fort) {
  return (fort?.colliders ?? []).map(body => ({
    ...body, isFortification: true, groundReach: Math.hypot(body.halfWidth, body.halfDepth),
    base: fort.elevation, parapet: body.halfDepth === 4,
    top: body.halfDepth === 4 ? fort.elevation + 12.35 : Infinity,
  }))
}

// Static, world-space broad phase shared by the scene and navigation Worker.
// Bodies are registered in EVERY intersected cell, including rotated footprints
// and overhanging roofs; a building need not be in the queried terrain chunk.
export function createCollisionIndex(cellSize = 8) {
  const buckets = new Map(), owners = new Map()
  let bodyCount = 0, queries = 0, candidates = 0
  function remove(owner) {
    const entries = owners.get(owner)
    if (!entries) return
    for (const entry of entries) for (const key of entry.keys) {
      const bucket = buckets.get(key)
      bucket.delete(entry)
      if (!bucket.size) buckets.delete(key)
    }
    bodyCount -= entries.length
    owners.delete(owner)
  }
  return {
    replace(owner, bodies) {
      remove(owner)
      const entries = []
      for (const source of bodies) {
        const cosine = Math.cos(source.rotation ?? 0), sine = Math.sin(source.rotation ?? 0)
        const width = Math.max(source.halfWidth ?? 0, source.roofWidth ?? 0)
        const depth = Math.max(source.halfDepth ?? 0, source.roofDepth ?? 0)
        const extentX = source.radius ?? Math.abs(cosine) * width + Math.abs(sine) * depth
        const extentZ = source.radius ?? Math.abs(sine) * width + Math.abs(cosine) * depth
        const entry = { body: { ...source, cosine, sine }, keys: [],
          minX: source.x - extentX, maxX: source.x + extentX,
          minZ: source.z - extentZ, maxZ: source.z + extentZ }
        for (let x = Math.floor(entry.minX / cellSize); x <= Math.floor(entry.maxX / cellSize); x++) {
          for (let z = Math.floor(entry.minZ / cellSize); z <= Math.floor(entry.maxZ / cellSize); z++) {
            const key = `${x},${z}`
            if (!buckets.has(key)) buckets.set(key, new Set())
            buckets.get(key).add(entry); entry.keys.push(key)
          }
        }
        entries.push(entry)
      }
      owners.set(owner, entries)
      bodyCount += entries.length
    },
    remove,
    *nearby(x, z, radius = 0) {
      queries++
      // Existing rectangle collision expands both LOCAL axes by radius. Its
      // rotated corners can extend sqrt(2) * radius in world X/Z.
      const reach = radius * Math.SQRT2
      const minX = x - reach, maxX = x + reach, minZ = z - reach, maxZ = z + reach
      const seen = new Set()
      for (let cx = Math.floor(minX / cellSize); cx <= Math.floor(maxX / cellSize); cx++) {
        for (let cz = Math.floor(minZ / cellSize); cz <= Math.floor(maxZ / cellSize); cz++) {
          const bucket = buckets.get(`${cx},${cz}`)
          if (!bucket) continue
          for (const entry of bucket) {
            if (seen.has(entry)) continue
            seen.add(entry)
            if (entry.maxX < minX || entry.minX > maxX || entry.maxZ < minZ || entry.minZ > maxZ) continue
            candidates++
            yield entry.body
          }
        }
      }
    },
    stats: () => ({ collisionBodies: bodyCount, collisionCells: buckets.size, collisionQueries: queries, collisionCandidates: candidates }),
    clear() { buckets.clear(); owners.clear(); bodyCount = 0 },
  }
}
