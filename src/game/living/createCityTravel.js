import { distance } from './geometry.js'
import { bodyMoveClear } from '../entities/bodyCollision.js'
import { insideWorld } from '../world/worldConfig.js'

const copy = value => structuredClone(value)
const validPoint = p => [p?.x, p?.z].every(Number.isFinite)

/** Intent lifetime and actual movement are separate from asynchronous routing. */
export function createCityTravel({ world, point, bodies, clock, canAdvance }) {
  const journeys = new Map(), actors = new Map()
  let serial = 0, closed = false
  const owner = journey => `travel:${journey.actorId}`
  const current = journey => !closed && journeys.get(journey.intentId) === journey
  function view(journey) {
    if (!journey) return { status: 'cancelled' }
    return { actorId: journey.actorId, intentId: journey.intentId, routeId: journey.routeId,
      destination: copy(journey.destination), status: journey.status, reason: journey.reason, failures: journey.failures }
  }
  function cancelTravel(intentId) {
    const journey = journeys.get(intentId)
    if (!journey) return
    journey.status = 'cancelled'; journey.generation++
    world.navigationData.release(owner(journey))
    if (actors.get(journey.actorId) === intentId) actors.delete(journey.actorId)
    journeys.delete(intentId)
  }
  function reset(journey) {
    journey.generation++; journey.routeId = `route:${++serial}`
    journey.status = 'planning'; journey.reason = null; journey.pending = false
    journey.waypoints = []; journey.local = []; journey.planned = false; journey.sight = null
    journey.lastProgressAt = clock(); journey.progressPoint = { ...point(journey.actorId) }
    journey.geometryRevision = world.navigationData.revision()
    journey.routeDestination = { ...journey.destination }
  }
  function requestTravel(actorId, destination, intentId, stop = 1.2) {
    if (closed || !validPoint(destination) || !insideWorld(world.terrain.plan.bounds,destination.x,destination.z,1) || !point(actorId) ||
      typeof intentId !== 'string' || !Number.isFinite(stop) || stop<0 || stop>3) return { status: 'blocked', reason: 'INVALID_TRAVEL' }
    const old = actors.get(actorId)
    if (old && old !== intentId) cancelTravel(old)
    let journey = journeys.get(intentId)
    if (journey && journey.actorId !== actorId) return { status: 'blocked', reason: 'INTENT_OWNER_MISMATCH' }
    if (!journey) {
      journey = { actorId, intentId, destination: { ...destination }, stop, failures: 0, blockedEdges: [], generation: 0 }
      journeys.set(intentId, journey); actors.set(actorId, intentId); reset(journey)
    } else if (distance(journey.routeDestination, destination) > 2 || journey.stop !== stop) {
      journey.destination = { ...destination }; journey.stop = stop; journey.failures = 0; journey.blockedEdges = []; reset(journey)
    } else {
      // Chase targets move, but small motion must not invalidate every Worker result.
      journey.destination = { ...destination }
      if (journey.planned && journey.waypoints.length) journey.waypoints[journey.waypoints.length - 1] = { ...destination }
      if (journey.status === 'arrived' && distance(point(actorId), destination) > stop) reset(journey)
    }
    journey.touchedAt = clock()
    return view(journey)
  }
  function clearGround(a, b, radius = .36) {
    const count = Math.max(1, Math.ceil(distance(a, b) / .2))
    let before = a.y ?? world.terrain.surfaceHeight(a.x, a.z)
    for (let i = 0; i <= count; i++) {
      const t = i / count, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
      const y = world.terrain.surfaceHeight(x, z)
      if (!world.navigationData.canMove(x, z, radius) || Math.abs(y - before) > .4) return false
      before = y
    }
    return true
  }
  function fail(journey, reason, edgeId = null) {
    journey.failures++
    if (edgeId && !journey.blockedEdges.includes(edgeId)) journey.blockedEdges.push(edgeId)
    reset(journey)
    journey.reason = reason
    if (journey.failures >= 3) {
      journey.status = 'blocked'; world.navigationData.release(owner(journey))
    }
  }
  function planRoute(journey) {
    if (journey.pending) return
    const start = { ...point(journey.actorId) }, generation = journey.generation
    if (distance(start, journey.destination) <= 12) {
      journey.waypoints = [{ ...journey.destination }]; journey.planned = true; return
    }
    journey.pending = true
    world.findCityRoute(start, journey.destination, { blockedEdges: journey.blockedEdges }).then(result => {
      if (!current(journey) || journey.generation !== generation) return
      journey.pending = false
      if (result?.status === 'ready' && result.waypoints?.length) {
        journey.waypoints = result.waypoints; journey.planned = true
      } else if (result?.reason === 'NAVIGATION_BUSY') journey.reason = 'NAVIGATION_BUSY'
      else fail(journey, result?.reason ?? 'ROAD_DISCONNECTED')
    })
  }
  function advance(intentId, dt) {
    const journey = journeys.get(intentId)
    if (!journey || closed || !canAdvance() || !(dt > 0)) return view(journey)
    if (journey.status === 'blocked') {
      if (world.navigationData.revision() === journey.geometryRevision) return view(journey)
      // Only a changed environment or destination permits another attempt.
      journey.failures = 0; journey.blockedEdges = []; reset(journey)
    }
    const p = point(journey.actorId)
    if (!journey.planned) planRoute(journey)
    if (!journey.planned) return view(journey)
    while (journey.waypoints.length > 1 && distance(p, journey.waypoints[0]) < .45) {
      journey.waypoints.shift(); journey.local = []; journey.generation++; journey.pending = false
    }
    const waypoint = journey.waypoints[0] ?? journey.destination
    const geometry = world.navigationData.retain(owner(journey), [p, waypoint])
    if (geometry.status !== 'ready') {
      journey.status = geometry.status; journey.reason = geometry.reason
      journey.lastProgressAt = clock()
      return view(journey)
    }
    if (distance(p, journey.destination) <= journey.stop && clearGround(p, journey.destination)) {
      journey.status = 'arrived'; journey.reason = null; world.navigationData.release(owner(journey)); return view(journey)
    }
    journey.status = 'travelling'; journey.reason = null
    let goal = waypoint
    let sight=journey.sight
    if(!sight||clock()>=sight.until||distance(p,sight.start)>.6||distance(waypoint,sight.target)>.6||sight.revision!==world.navigationData.revision()) {
      sight={start:{...p},target:{...waypoint},until:clock()+250,revision:world.navigationData.revision(),clear:clearGround(p,waypoint)}
      journey.sight=sight
    }
    if (!sight.clear) {
      while (journey.local.length && distance(p, journey.local[0]) < .25) journey.local.shift()
      if (!journey.local.length && !journey.pending) {
        journey.pending = true
        const generation = journey.generation, start = { ...p }
        world.findLocalRoute(start, waypoint).then(result => {
          if (!current(journey) || journey.generation !== generation) return
          journey.pending = false
          if (distance(point(journey.actorId), start) > 1.6) return
          if (result.status==='ready') journey.local = result.path
          else if(result.reason!=='NAVIGATION_BUSY')fail(journey,result.reason,result.reason==='LOCAL_ROUTE_BLOCKED'?waypoint.edgeId:null)
        })
      }
      if (!journey.local.length) return view(journey)
      goal = journey.local[0]
    } else journey.local = []
    const heading = Math.atan2(goal.x - p.x, goal.z - p.z), step = Math.min(2.4 * Math.min(dt, .1), distance(p, goal))
    for (const offset of [0, .5, -.5, 1, -1, Math.PI / 2, -Math.PI / 2]) {
      const next = { x: p.x + Math.sin(heading + offset) * step, z: p.z + Math.cos(heading + offset) * step }
      next.y = world.terrain.surfaceHeight(next.x, next.z)
      if (!clearGround(p, next, .35) || !bodyMoveClear(p, next, bodies(journey.actorId))) continue
      Object.assign(p, next, { heading: heading + offset }); break
    }
    if (distance(p, journey.progressPoint) >= .5) {
      journey.progressPoint = { ...p }; journey.lastProgressAt = clock()
    } else if (clock() - journey.lastProgressAt >= 5000) fail(journey, 'NO_PROGRESS')
    return view(journey)
  }
  return {
    requestTravel, travelStatus: intentId => view(journeys.get(intentId)), cancelTravel, advance, clearGround,
    move(actorId, destination, dt, stop = 1.2, intentId = `move:${actorId}`) {
      const requested=requestTravel(actorId, destination, intentId, stop)
      if(requested.reason==='INVALID_TRAVEL'||requested.reason==='INTENT_OWNER_MISMATCH')return requested
      return advance(intentId, dt)
    },
    releaseInactive(at, alive) {
      for (const journey of journeys.values()) if (!alive(journey.actorId) || at - journey.touchedAt > 1000) cancelTravel(journey.intentId)
    },
    snapshot: () => [...journeys.values()].filter(j => j.status !== 'cancelled' && j.status !== 'arrived').map(j => ({ ...view(j), stop: j.stop })),
    restore(records = []) { for (const record of records) requestTravel(record.actorId, record.destination, record.intentId, record.stop) },
    dispose() { for (const id of journeys.keys()) cancelTravel(id); closed = true },
  }
}
