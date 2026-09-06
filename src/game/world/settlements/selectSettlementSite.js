import { createRandom } from '../generation/random.js'
import { createTopographySampler } from '../generation/topography.js'
import { cityProfiles } from './cityProfiles.js'

function evaluateSite(sample, x, z, width, depth, policy) {
  const points = []
  // 9×9 面积采样，同时估计最大连通可建设面积，避免仅看中心点。
  for (let row = 0; row < 9; row++) for (let column = 0; column < 9; column++) {
    points.push(sample(x + ((column + 0.5) / 9 - 0.5) * width, z + ((row + 0.5) / 9 - 0.5) * depth))
  }
  const valid = points.map(point => point.slope <= policy.slope && point.moisture < 0.72)
  const visited = new Set()
  let largest = 0
  for (let start = 0; start < 81; start++) {
    if (!valid[start] || visited.has(start)) continue
    const queue = [start]; visited.add(start)
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], row = Math.floor(index / 9), column = index % 9
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = column + dx, nz = row + dz, next = nz * 9 + nx
        if (nx < 0 || nx >= 9 || nz < 0 || nz >= 9 || visited.has(next) || !valid[next]) continue
        visited.add(next); queue.push(next)
      }
    }
    largest = Math.max(largest, queue.length)
  }
  const heights = points.map(point => point.height).sort((a, b) => a - b)
  const relief = heights.at(-1) - heights[0]
  const coverage = largest / 81
  const meanSlope = points.reduce((sum, point) => sum + point.slope, 0) / 81
  const moisture = points.reduce((sum, point) => sum + point.moisture, 0) / 81
  const qualified = coverage >= policy.coverage && relief <= policy.relief
  return { coverage, buildableArea: largest / 81 * width * depth, relief, meanSlope, moisture,
    elevation: heights[40], qualified,
    score: coverage * 100 - meanSlope * 3 - relief * 2 - moisture * 15,
  }
}

export function selectSettlementSite(seed, region, topography) {
  const village = region.kind === 'village'
  const width = village ? 144 : cityProfiles[region.citySize].span + 24
  const depth = village ? 104 : width
  const policy = village ? { slope: 10, coverage: 0.7, relief: 12 } : { slope: 6, coverage: 0.85, relief: 14 }
  const random = createRandom(seed, region.id, 'settlement-site-v2')
  const { sample } = createTopographySampler(topography)
  const b = region.bounds, marginX = width / 2 + 16, marginZ = depth / 2 + 16
  if (b.maxX - b.minX < marginX * 2 || b.maxZ - b.minZ < marginZ * 2) throw new Error(`${region.name} 的区域不足以容纳原比例聚落。`)
  if (region.fixedCenter) {
    const [x, z] = region.center
    if (x - marginX < b.minX || x + marginX > b.maxX || z - marginZ < b.minZ || z + marginZ > b.maxZ) throw new Error('固定城心无法容纳原比例城市。')
    return { version: 1, center: [x, z], ...evaluateSite(sample, x, z, width, depth, policy), candidateCount: 1, footprint: { width, depth }, policy }
  }
  let best = null
  // 分层取样覆盖整个可选范围，大城按完整占地评分。
  for (let row = 0; row < 7; row++) for (let column = 0; column < 7; column++) {
    const x = Math.round(b.minX + marginX + (column + 0.2 + random() * 0.6) / 7 * (b.maxX - b.minX - 2 * marginX))
    const z = Math.round(b.minZ + marginZ + (row + 0.2 + random() * 0.6) / 7 * (b.maxZ - b.minZ - 2 * marginZ))
    const candidate = { center: [x, z], ...evaluateSite(sample, x, z, width, depth, policy) }
    if (!best || (candidate.qualified && !best.qualified) || (candidate.qualified === best.qualified && candidate.score > best.score)) best = candidate
  }
  return { version: 1, ...best, candidateCount: 49, footprint: { width, depth }, policy }
}
