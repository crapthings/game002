// 8m 一个探索格，4×4 格打包成一个 16 位整数；负坐标同样稳定。
import { isVisible } from './visibility.js'

export const FOG_CELL_SIZE = 8
export const FOG_GROUP_SIZE = 4
export const REVEAL_RADIUS = 24

export function fogAddress(cellX, cellZ) {
  const groupX = Math.floor(cellX / FOG_GROUP_SIZE), groupZ = Math.floor(cellZ / FOG_GROUP_SIZE)
  const localX = cellX - groupX * FOG_GROUP_SIZE, localZ = cellZ - groupZ * FOG_GROUP_SIZE
  return { key: `${groupX},${groupZ}`, bit: 1 << (localZ * FOG_GROUP_SIZE + localX) }
}
export function isExplored(fog, x, z) {
  const { key, bit } = fogAddress(Math.floor(x / FOG_CELL_SIZE), Math.floor(z / FOG_CELL_SIZE))
  return Boolean((fog[key] || 0) & bit)
}
export function revealFog(fog, x, z, bounds, vision = { radius: REVEAL_RADIUS, beamRange: 0 }, heading = 0) {
  let next = fog
  const radius = Math.max(vision.radius, vision.beamRange)
  for (let cz = Math.floor((z - radius) / FOG_CELL_SIZE); cz <= Math.floor((z + radius) / FOG_CELL_SIZE); cz += 1) {
    for (let cx = Math.floor((x - radius) / FOG_CELL_SIZE); cx <= Math.floor((x + radius) / FOG_CELL_SIZE); cx += 1) {
      if (bounds && ((cx + 0.5) * FOG_CELL_SIZE < bounds.minX || (cx + 0.5) * FOG_CELL_SIZE >= bounds.maxX || (cz + 0.5) * FOG_CELL_SIZE < bounds.minZ || (cz + 0.5) * FOG_CELL_SIZE >= bounds.maxZ)) continue
      if (!isVisible((cx + 0.5) * FOG_CELL_SIZE - x, (cz + 0.5) * FOG_CELL_SIZE - z, heading, vision)) continue
      const { key, bit } = fogAddress(cx, cz)
      if (((next[key] || 0) & bit) !== 0) continue
      if (next === fog) next = { ...fog }
      next[key] = (next[key] || 0) | bit
    }
  }
  return next
}
export function validFog(fog) {
  return fog !== null && typeof fog === 'object' && !Array.isArray(fog) && Object.entries(fog).every(([key, mask]) => /^-?\d+,-?\d+$/.test(key) && key.split(',').every((part) => Number.isSafeInteger(Number(part))) && Number.isInteger(mask) && mask > 0 && mask <= 65535)
}
