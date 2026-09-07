// Upright actor bodies. Scene meshes/animations are deliberately not used as
// collision truth; locomotion checks these volumes at each movement substep.
export const ACTOR_BODY = Object.freeze({ radius: 0.35, height: 1.75 })
export function bodyMoveClear(from, to, obstacles, body = ACTOR_BODY) {
  return obstacles.every(other => {
    const radius = body.radius + (other.radius ?? ACTOR_BODY.radius)
    const height = other.height ?? ACTOR_BODY.height
    if (to.y >= other.y + height || to.y + body.height <= other.y) return true
    const next = Math.hypot(to.x - other.x, to.z - other.z)
    if (next >= radius) return true
    // Older saves can contain overlaps. Permit escape, never deeper penetration.
    const previous = Math.hypot(from.x - other.x, from.z - other.z)
    return previous < radius && next > previous + 1e-8
  })
}

export function bodySupportHeight(x, z, ceiling, obstacles, radius = ACTOR_BODY.radius) {
  let top = -Infinity
  for (const other of obstacles) {
    const height = other.y + (other.height ?? ACTOR_BODY.height)
    if (height <= ceiling && Math.hypot(x-other.x,z-other.z) < radius+(other.radius ?? ACTOR_BODY.radius)) top = Math.max(top,height)
  }
  return top
}
