import { roadPoints } from '../world/roads/roadGeometry.js'
import { blocksFortification } from '../world/fortifications/createFortifications.js'
import { inCanal, onBridge } from '../world/city/createCityPlan.js'

const EPS = 1e-6
const length = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const cross = (a, b) => a.x * b.z - a.z * b.x
const subtract = (a, b) => ({ x: a.x - b.x, z: a.z - b.z })
const interpolate = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })

function projection(a, b, p) {
  const d = subtract(b, a), denominator = d.x * d.x + d.z * d.z
  const t = denominator ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.z - a.z) * d.z) / denominator)) : 0
  return { t, point: interpolate(a, b, t) }
}

function addIntersections(a, b) {
  const r = subtract(a.b, a.a), s = subtract(b.b, b.a), delta = subtract(b.a, a.a), denominator = cross(r, s)
  if (Math.abs(denominator) > EPS) {
    const t = cross(delta, s) / denominator, u = cross(delta, r) / denominator
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
      a.cuts.push(Math.max(0, Math.min(1, t))); b.cuts.push(Math.max(0, Math.min(1, u)))
    }
    return
  }
  if (Math.abs(cross(delta, r)) > EPS) return
  // Collinear roads share endpoints, including a lane joining partway along one.
  for (const endpoint of [b.a, b.b]) {
    const p = projection(a.a, a.b, endpoint)
    if (length(p.point, endpoint) < EPS) a.cuts.push(p.t)
  }
  for (const endpoint of [a.a, a.b]) {
    const p = projection(b.a, b.b, endpoint)
    if (length(p.point, endpoint) < EPS) b.cuts.push(p.t)
  }
}

/** Road topology is a route proposal, never permission to bypass live collision. */
export function createCityRouteGraph(plan) {
  const nodes = new Map(), adjacency = new Map(), edges = []
  const nodeKey = p => `${p.x.toFixed(3)},${p.z.toFixed(3)}`
  const segments = []
  const sourceRoads = (plan.city?.roads ?? []).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  for (const road of sourceRoads) {
    const points = roadPoints(road)
    for (let i = 1; i < points.length; i++) {
      const a = { x: points[i - 1][0], z: points[i - 1][1] }, b = { x: points[i][0], z: points[i][1] }
      if (length(a, b) > EPS) segments.push({ a, b, roadId: road.id, cuts: [0, 1] })
    }
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) addIntersections(segments[i], segments[j])

  function staticPassable(a, b) {
    const count = Math.max(1, Math.ceil(length(a, b)))
    for (let i = 0; i <= count; i++) {
      const p = interpolate(a, b, i / count), bounds = plan.bounds
      if (bounds && (p.x < bounds.minX + 1 || p.x >= bounds.maxX - 1 || p.z < bounds.minZ + 1 || p.z >= bounds.maxZ - 1)) return false
      if (inCanal(plan.city, p.x, p.z, .36) && !onBridge(plan.city, p.x, p.z, .36)) return false
      if (blocksFortification(plan.fortifications, p.x, p.z, .36)) return false
    }
    return true
  }
  function installNode(p) {
    const id = nodeKey(p)
    if (!nodes.has(id)) { nodes.set(id, { x: p.x, z: p.z }); adjacency.set(id, []) }
    return id
  }
  const edgeKeys = new Set()
  for (const segment of segments) {
    const cuts = segment.cuts.sort((a, b) => a - b).filter((t, i, all) => !i || t - all[i - 1] > EPS)
    for (let i = 1; i < cuts.length; i++) {
      const a = interpolate(segment.a, segment.b, cuts[i - 1]), b = interpolate(segment.a, segment.b, cuts[i])
      if (length(a, b) < EPS || !staticPassable(a, b)) continue
      const from = installNode(a), to = installNode(b)
      const key = [from, to].sort().join('|')
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      const edge = { id: `road-edge:${edges.length}`, from, to, length: length(a, b), roadId: segment.roadId }
      edges.push(edge)
      adjacency.get(from).push({ to, cost: edge.length, edgeId: edge.id })
      adjacency.get(to).push({ to: from, cost: edge.length, edgeId: edge.id })
    }
  }

  function route(start, target, { blockedEdges = [], maxConnector = 40, spacing = 12 } = {}) {
    if (![start?.x, start?.z, target?.x, target?.z].every(Number.isFinite) || !(spacing > 0)) return { status: 'blocked', reason: 'INVALID_ROUTE_POINT', waypoints: [] }
    if (length(start, target) < .3) return { status: 'ready', length: 0, edgeIds: [], waypoints: [{ x: target.x, z: target.z }] }
    const blocked = new Set(blockedEdges), extraNodes = new Map(), extraAdjacency = new Map()
    const addExtra = (id, point) => { extraNodes.set(id, point); extraAdjacency.set(id, []) }
    const pointFor = id => extraNodes.get(id) ?? nodes.get(id)
    const link = (a, b, cost, edgeId = null) => {
      if (!extraAdjacency.has(a)) extraAdjacency.set(a, [])
      if (!extraAdjacency.has(b)) extraAdjacency.set(b, [])
      extraAdjacency.get(a).push({ to: b, cost, edgeId }); extraAdjacency.get(b).push({ to: a, cost, edgeId })
    }
    addExtra('start', { x: start.x, z: start.z }); addExtra('target', { x: target.x, z: target.z })
    const connections = new Map()
    function connect(id, point) {
      const candidates = edges.filter(edge => !blocked.has(edge.id)).map(edge => ({ edge, ...projection(nodes.get(edge.from), nodes.get(edge.to), point) }))
        .filter(entry => length(point, entry.point) <= maxConnector && staticPassable(point, entry.point))
        .sort((a, b) => length(point, a.point) - length(point, b.point) || (a.edge.id < b.edge.id ? -1 : 1))
      const connected = []
      for (const entry of candidates.slice(0, 8)) {
        const joinId = `${id}:${entry.edge.id}`
        addExtra(joinId, entry.point)
        link(id, joinId, length(point, entry.point))
        link(joinId, entry.edge.from, entry.t * entry.edge.length, entry.edge.id)
        link(joinId, entry.edge.to, (1 - entry.t) * entry.edge.length, entry.edge.id)
        connected.push({ ...entry, joinId })
      }
      connections.set(id, connected)
      return connected.length > 0
    }
    if (!connect('start', start) || !connect('target', target)) return { status: 'blocked', reason: 'NO_ROAD_CONNECTION', waypoints: [] }
    // Two points on the same edge can meet without walking to an endpoint first.
    for (const a of connections.get('start')) for (const b of connections.get('target')) {
      if (a.edge.id === b.edge.id) link(a.joinId, b.joinId, length(a.point, b.point), a.edge.id)
    }
    const cost = new Map([['start', 0]]), previous = new Map(), open = new Set(['start']), closed = new Set()
    while (open.size) {
      let current = null, score = Infinity
      for (const id of open) {
        const candidate = cost.get(id) + length(pointFor(id), target)
        if (candidate < score) { current = id; score = candidate }
      }
      if (current === 'target') break
      open.delete(current); closed.add(current)
      for (const edge of [...(adjacency.get(current) ?? []), ...(extraAdjacency.get(current) ?? [])]) {
        if (blocked.has(edge.edgeId) || closed.has(edge.to)) continue
        const candidate = cost.get(current) + edge.cost
        if (candidate >= (cost.get(edge.to) ?? Infinity)) continue
        cost.set(edge.to, candidate); previous.set(edge.to, { id: current, edgeId: edge.edgeId }); open.add(edge.to)
      }
    }
    if (!cost.has('target')) return { status: 'blocked', reason: 'ROAD_DISCONNECTED', waypoints: [] }
    const chain = ['target'], edgeIds = []
    for (let cursor = 'target'; cursor !== 'start';) {
      const before = previous.get(cursor)
      if (!before) return { status: 'blocked', reason: 'ROAD_DISCONNECTED', waypoints: [] }
      if (before.edgeId) edgeIds.push(before.edgeId)
      chain.push(before.id); cursor = before.id
    }
    chain.reverse(); edgeIds.reverse()
    const waypoints = []
    for (let i = 1; i < chain.length; i++) {
      const a = pointFor(chain[i - 1]), b = pointFor(chain[i]), count = Math.ceil(length(a, b) / spacing)
      for (let step = 1; step <= count; step++) {
        const p = { ...interpolate(a, b, step / count), edgeId: previous.get(chain[i])?.edgeId ?? null }
        if (!waypoints.length || length(waypoints.at(-1), p) > .01) waypoints.push(p)
      }
    }
    return { status: 'ready', length: cost.get('target'), edgeIds: [...new Set(edgeIds)], waypoints }
  }
  return { route, stats: () => ({ roadNodes: nodes.size, roadEdges: edges.length }) }
}
