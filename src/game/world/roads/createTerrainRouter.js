import { WORLD_SIZE, WORLD_BOUNDS, insideWorld } from '../worldConfig.js'
import { createTopographySampler } from '../generation/topography.js'
import { roundRoadPath } from './roadGeometry.js'

const STEP = 16, COUNT = WORLD_SIZE / STEP, ORIGIN = WORLD_BOUNDS.minX + STEP / 2, CLEARANCE = 9
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const pointAt = id => [ORIGIN + (id % COUNT) * STEP, ORIGIN + Math.floor(id / COUNT) * STEP]

// 小顶堆，避免在每次 A* 扩展时排序整个开放列表。
class Queue {
  items = []
  push(item) {
    const items = this.items
    let i = items.length; items.push(item)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent].priority <= item.priority) break
      items[i] = items[parent]; i = parent
    }
    items[i] = item
  }
  pop() {
    const items = this.items, first = items[0], last = items.pop()
    if (items.length) {
      let i = 0
      while (i * 2 + 1 < items.length) {
        let child = i * 2 + 1
        if (child + 1 < items.length && items[child + 1].priority < items[child].priority) child++
        if (items[child].priority >= last.priority) break
        items[i] = items[child]; i = child
      }
      items[i] = last
    }
    return first
  }
}

export function createTerrainRouter(settlements, topography) {
  const { sample } = createTopographySampler(topography)
  const samples = new Map(), edges = new Map()
  const terrain = point => {
    const key = `${point[0]},${point[1]}`
    if (!samples.has(key)) {
      if (samples.size >= 65536) samples.delete(samples.keys().next().value)
      samples.set(key, sample(...point))
    }
    return samples.get(key)
  }
  const blocked = (p, except = -1) => !insideWorld(WORLD_BOUNDS, p[0], p[1], CLEARANCE) || settlements.some((town, index) => {
    if (index === except) return false
    const b = town.bounds
    return p[0] > b.minX - CLEARANCE && p[0] < b.maxX + CLEARANCE && p[1] > b.minZ - CLEARANCE && p[1] < b.maxZ + CLEARANCE
  })
  function segmentCost(a, b, except = -1) {
    // 精确裁剪线段与扩展占地，不能只靠离散采样判断拐角碰撞。
    for (let index = 0; index < settlements.length; index++) {
      if (index === except) continue
      const bounds = settlements[index].bounds
      let enter = 0, leave = 1
      for (const [axis, min, max] of [[0, bounds.minX - CLEARANCE, bounds.maxX + CLEARANCE], [1, bounds.minZ - CLEARANCE, bounds.maxZ + CLEARANCE]]) {
        const delta = b[axis] - a[axis]
        if (Math.abs(delta) < 1e-9) {
          if (a[axis] <= min || a[axis] >= max) { enter = 2; break }
        } else {
          const first = (min - a[axis]) / delta, second = (max - a[axis]) / delta
          enter = Math.max(enter, Math.min(first, second)); leave = Math.min(leave, Math.max(first, second))
        }
      }
      if (enter <= leave) return Infinity
    }
    const length = distance(a, b), steps = Math.max(1, Math.ceil(length / 8))
    let total = 0, previous = terrain(a)
    if (blocked(a, except)) return Infinity
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      if (blocked(p, except)) return Infinity
      const current = terrain(p)
      const grade = Math.abs(current.height - previous.height) / Math.max(0.01, length / steps)
      const moisture = (current.moisture + previous.moisture) / 2
      const slope = (current.slope + previous.slope) / 2
      // 潮湿与陡坡为软代价：必要的出入口仍可连通，不虚构桥梁。
      total += length / steps * (1 + (slope / 7) ** 2 + (grade / 0.08) ** 2 + 16 * Math.max(0, (moisture - 0.55) / 0.45) ** 2)
      previous = current
    }
    return total
  }
  function portal(gate, townIndex) {
    const b = settlements[townIndex].bounds
    const choices = [
      [b.minX - 12, gate[1]], [b.maxX + 12, gate[1]],
      [gate[0], b.minZ - 12], [gate[0], b.maxZ + 12],
    ].sort((a, c) => distance(gate, a) - distance(gate, c))
    const exit = choices[0]
    if (!Number.isFinite(segmentCost(gate, exit, townIndex))) return null
    const column = Math.round((exit[0] - ORIGIN) / STEP), row = Math.round((exit[1] - ORIGIN) / STEP)
    const choicesGrid = []
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = column + dx, z = row + dz
      if (x < 0 || x >= COUNT || z < 0 || z >= COUNT) continue
      const id = z * COUNT + x, cost = segmentCost(exit, pointAt(id))
      if (Number.isFinite(cost)) choicesGrid.push({ id, cost })
    }
    choicesGrid.sort((a, c) => a.cost - c.cost || a.id - c.id)
    return choicesGrid.length ? { exit, id: choicesGrid[0].id } : null
  }
  function search(start, goal) {
    const costs = new Float64Array(COUNT * COUNT).fill(Infinity)
    const parents = new Int32Array(COUNT * COUNT).fill(-1)
    const queue = new Queue(), target = pointAt(goal)
    costs[start] = 0; queue.push({ id: start, cost: 0, priority: distance(pointAt(start), target) })
    while (queue.items.length) {
      const current = queue.pop()
      if (current.cost !== costs[current.id]) continue
      if (current.id === goal) {
        const path = []
        for (let id = goal; id !== -1; id = parents[id]) path.push(pointAt(id))
        return path.reverse()
      }
      const x = current.id % COUNT, z = Math.floor(current.id / COUNT)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || x + dx < 0 || x + dx >= COUNT || z + dz < 0 || z + dz >= COUNT) continue
        const id = (z + dz) * COUNT + x + dx
        const key = Math.min(current.id, id) * (COUNT * COUNT) + Math.max(current.id, id)
        if (!edges.has(key)) edges.set(key, segmentCost(pointAt(current.id), pointAt(id)))
        const cost = current.cost + edges.get(key)
        if (cost >= costs[id]) continue
        costs[id] = cost; parents[id] = current.id
        queue.push({ id, cost, priority: cost + distance(pointAt(id), target) })
      }
    }
    return null
  }
  function simplify(path) {
    const output = [path[0]]
    let start = 0
    while (start < path.length - 1) {
      let end = start + 1, accumulated = 0
      for (let next = start + 1; next < Math.min(path.length, start + 17); next++) {
        accumulated += segmentCost(path[next - 1], path[next])
        if (segmentCost(path[start], path[next]) <= accumulated * 1.06) end = next
      }
      output.push(path[end]); start = end
    }
    const rounded = roundRoadPath(output, 20)
    const pathCost = points => points.slice(1).reduce((sum, p, i) => sum + segmentCost(points[i], p), 0)
    return pathCost(rounded) <= pathCost(output) * 1.06 ? rounded : output
  }
  return {
    route(from, to, a, b) {
      const start = portal(a, from), end = portal(b, to)
      if (!start || !end) return null
      const path = search(start.id, end.id)
      if (!path) return null
      const middle = simplify([start.exit, ...path, end.exit])
      const points = [a, ...middle, b].filter((p, i, all) => !i || distance(p, all[i - 1]) > 0.01)
      let length = 0, wetLength = 0, maxSlope = 0
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], span = distance(a, b), count = Math.max(1, Math.ceil(span / 8))
        length += span
        for (let j = 0; j <= count; j++) {
          const p = terrain([a[0] + (b[0] - a[0]) * j / count, a[1] + (b[1] - a[1]) * j / count])
          maxSlope = Math.max(maxSlope, p.slope)
          if (j && p.moisture > 0.72) wetLength += span / count
        }
      }
      return { points, routing: { version: 1, gridSize: STEP, length, wetLength, maxSlope } }
    },
  }
}
