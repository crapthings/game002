import { blocksFortification } from '../fortifications/createFortifications.js'
import { inCanal, onBridge } from '../city/createCityPlan.js'
import { insideWorld } from '../worldConfig.js'
import { chunkAt, chunkKey } from './terrain.js'

// The scene and navigation Worker use exactly the same static collision rules.
// Loaded entries contain plain bounds/colliders; Babylon meshes are not needed.
export function canMoveInWorld(plan, loaded, x, z, radius, collisionIndex = null) {
  if (!insideWorld(plan.bounds, x, z, 1) || !collisionIndex && blocksFortification(plan.fortifications, x, z, radius)) return false
  if (plan.city?.bridges.some(b => Math.abs(z - b.z) < b.length / 2 && Math.abs(Math.abs(x - b.x) - b.width / 2 - .12) < radius + .12)) return false
  if (inCanal(plan.city, x, z, radius) && !onBridge(plan.city, x, z, radius)) return false
  const at = chunkAt(x, z)
  if (!loaded.has(chunkKey(at.x, at.z))) return false
  for (const obstacle of collisionIndex ? collisionIndex.nearby(x, z, radius) : chunkBodies(loaded, x, z, radius)) {
    const dx = x - obstacle.x, dz = z - obstacle.z
    if (obstacle.radius !== undefined) {
      if (dx * dx + dz * dz < (obstacle.radius + radius) ** 2) return false
    } else {
      if (obstacle.isFortification && dx * dx + dz * dz > (obstacle.groundReach + radius) ** 2) continue
      const cosine = obstacle.cosine ?? Math.cos(obstacle.rotation), sine = obstacle.sine ?? Math.sin(obstacle.rotation)
      if (Math.abs(dx * cosine - dz * sine) < obstacle.halfWidth + radius && Math.abs(dx * sine + dz * cosine) < obstacle.halfDepth + radius) return false
    }
  }
  return true
}

function* chunkBodies(loaded, x, z, radius) {
  for (const entry of loaded.values()) {
    const b = entry.bounds
    if (x + radius < b.minX || x - radius > b.maxX || z + radius < b.minZ || z - radius > b.maxZ) continue
    yield* entry.colliders
  }
}
