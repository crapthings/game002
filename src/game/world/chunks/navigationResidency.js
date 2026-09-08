import { chunkAt, requiredChunks, CHUNK_SIZE } from './terrain.js'
import { insideWorld } from '../worldConfig.js'
import { canMoveInWorld } from './movementQuery.js'
import { createCollisionIndex, fortificationBodies } from './collisionIndex.js'

/** Bounded, reference-counted ground data. This cache never creates a mesh. */
export function createNavigationResidency(plan, worker, { capacity = 128, concurrency = 2 } = {}) {
  const entries = new Map(), interests = new Map(), inflight = new Map(), failures = new Map(), touched = new Map(), neighbourhoods = new Map()
  const index = createCollisionIndex()
  index.replace('fortifications', fortificationBodies(plan.fortifications))
  let closed = false, revision = 0, tick = 0
  const keysAt = point => {
    const at=chunkAt(point.x,point.z),key=`${at.x},${at.z}`
    if(!neighbourhoods.has(key))neighbourhoods.set(key,requiredChunks(at,1)
      .filter(c=>insideWorld(plan.bounds,(c.x+.5)*CHUNK_SIZE,(c.z+.5)*CHUNK_SIZE)).map(c=>c.key))
    return neighbourhoods.get(key)
  }
  const referenced = () => new Set([...interests.values()].filter(i => i.accepted).flatMap(i => i.keys))
  function evict(key) {
    entries.delete(key); touched.delete(key); index.remove(key); worker.release(key)
  }
  function pump() {
    if (closed) return
    let pinned = referenced()
    // Reserve the entire group atomically. Partial groups must not fill the
    // cache and leave every actor waiting forever for its last neighbour.
    for (const interest of interests.values()) {
      if (interest.accepted) continue
      const combined = new Set([...pinned, ...interest.keys])
      if (combined.size > capacity) continue
      interest.accepted = true; pinned = combined
    }
    for (const key of pinned) {
      if (inflight.size >= concurrency) break
      if (entries.has(key) || inflight.has(key)) continue
      const failed = failures.get(key)
      if (failed && (failed.attempts >= 3 || performance.now() < failed.retryAt)) continue
      while (new Set([...entries.keys(), ...inflight.keys(), key]).size > capacity) {
        const victim = [...entries.keys()].filter(k => !pinned.has(k))
          .sort((a, b) => (touched.get(a) ?? 0) - (touched.get(b) ?? 0))[0]
        if (!victim) break
        evict(victim)
      }
      if (new Set([...entries.keys(), ...inflight.keys(), key]).size > capacity) continue
      const job = {}; inflight.set(key, job)
      worker.requestGeometry(key).then(result => {
        if (closed || inflight.get(key) !== job) return
        inflight.delete(key)
        if (result?.status === 'ready' && result.entry?.key === key) {
          failures.delete(key)
          if (referenced().has(key)) {
            entries.set(key, result.entry); touched.set(key, ++tick)
            index.replace(key, result.entry.colliders); worker.retain(key, result.entry); revision++
          }
        } else if (referenced().has(key)) {
          const attempts = (failures.get(key)?.attempts ?? 0) + (result?.reason === 'NAVIGATION_BUSY' ? 0 : 1)
          failures.set(key, { attempts, retryAt: performance.now() + 500, reason: result?.reason ?? 'GEOMETRY_FAILED' })
        }
        pump()
      })
    }
  }
  function status(owner) {
    const interest = interests.get(owner)
    if (!interest) return { status: 'cancelled' }
    if (!interest.accepted) return { status: 'waiting_for_geometry', reason: 'GEOMETRY_BUDGET' }
    const failed = interest.keys.map(k => failures.get(k)).find(f => f?.attempts >= 3)
    if (failed) return { status: 'blocked', reason: failed.reason }
    return interest.keys.every(k => entries.has(k)) ? { status: 'ready' } : { status: 'waiting_for_geometry', reason: 'GEOMETRY_LOADING' }
  }
  return {
    retain(owner, points) {
      if (closed) return { status: 'cancelled' }
      if (!points.length || points.some(p => ![p?.x, p?.z].every(Number.isFinite) || !insideWorld(plan.bounds, p.x, p.z, 1))) return { status: 'blocked', reason: 'INVALID_GEOMETRY_POINT' }
      const keys = [...new Set(points.flatMap(keysAt))].sort(), signature = keys.join(';')
      if (keys.length > capacity) return { status: 'blocked', reason: 'GEOMETRY_REQUEST_TOO_LARGE' }
      if (interests.get(owner)?.signature !== signature) interests.set(owner, { keys, signature, accepted: false })
      for (const key of keys) if (entries.has(key)) touched.set(key, ++tick)
      pump(); return status(owner)
    },
    status,
    release(owner) { interests.delete(owner); pump() },
    retry(owner) { for (const key of interests.get(owner)?.keys ?? []) failures.delete(key); pump() },
    ready: (x, z) => keysAt({ x, z }).every(key => entries.has(key)),
    canMove(x, z, radius = .36) {
      return keysAt({ x, z }).every(key => entries.has(key)) && canMoveInWorld(plan, entries, x, z, radius, index)
    },
    revision: () => revision,
    stats: () => ({ navigationChunks: entries.size, navigationCapacity: capacity, navigationGeometryPending: inflight.size,
      navigationWaiting: [...interests.keys()].filter(key => status(key).status === 'waiting_for_geometry').length }),
    dispose() {
      closed = true
      for (const key of entries.keys()) worker.release(key)
      entries.clear(); interests.clear(); inflight.clear(); failures.clear(); touched.clear(); neighbourhoods.clear(); index.clear()
    },
  }
}
