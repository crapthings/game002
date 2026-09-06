// 固定上限的近到远搜索，由场景以时间预算分帧执行。
export function* teleportLandingCandidates(x, z) {
  yield { x, z }
  for (let radius = 2; radius <= 24; radius += 2) {
    const count = Math.ceil(Math.PI * radius)
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2
      yield { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius }
    }
  }
}
export const TELEPORT_DROP_HEIGHT = 10
