import { resolveCityPlaces } from './cityPlaces.js'
import { createCityRoleBindings } from './cityRoles.js'
import { compileRoadNetwork } from '../world/roads/roadGeometry.js'
import { distance } from './geometry.js'

/** Incremental bootstrap. Only one place's data is pinned at a time. */
export function prepareCityLayout(plan, world, options={}) {
  const candidates = options.candidates??resolveCityPlaces(plan), places = [], owner = options.extra?'city-housing':'city-layout'
  const knownPlaces=options.knownPlaces??[]
  let index = 0, pending = false, closed = false, failure = candidates.unresolved[0]?.code ?? null, result = null, parcelSpot = null
  const ground = p => ({ x: p.x, y: world.terrain.surfaceHeight(p.x, p.z), z: p.z })
  function clear(a, b) {
    const count = Math.max(1, Math.ceil(distance(a, b) / .2))
    let y = a.y
    for (let i = 0; i <= count; i++) {
      const p = ground({ x: a.x + (b.x - a.x) * i / count, z: a.z + (b.z - a.z) * i / count })
      if (!world.navigationData.canMove(p.x, p.z, .5) || Math.abs(p.y - y) > .4) return false
      y = p.y
    }
    return true
  }
  function safe(p) {
    const road = world.terrain.nearbyRoad(p.x, p.z)
    return world.navigationData.canMove(p.x, p.z, .5) && !(road.width >= 4 && road.distance < road.width / 2 + .4) &&
      [...knownPlaces,...places].every(other => distance(other.approach, p) >= 2) &&
      [[.5, 0], [-.5, 0], [0, .5], [0, -.5]].every(([x, z]) => Math.abs(world.terrain.surfaceHeight(p.x + x, p.z + z) - p.y) <= .3)
  }
  function nearby(anchor) {
    for (const radius of [0, .8, 1.6, 2.4]) for (let n = 0; n < (radius ? 8 : 1); n++) {
      const p = ground({ x: anchor.x + Math.cos(n * Math.PI / 4) * radius, z: anchor.z + Math.sin(n * Math.PI / 4) * radius })
      if (safe(p)) return p
    }
    return null
  }
  function update() {
    if (closed || failure || result || pending) return
    if (index === candidates.places.length) {
      if(options.extra){result={version:1,places};world.navigationData.release(owner);return}
      const spawn=plan.spawn??[0,0],anchor=ground({x:spawn[0],z:spawn[1]})
      const geometry=world.navigationData.retain(owner,[anchor])
      if(geometry.status==='blocked'){failure=geometry.reason;return}
      if(geometry.status!=='ready')return
      const notices=[4,6,8].flatMap(radius=>Array.from({length:8},(_,n)=>ground({x:anchor.x+Math.cos(n*Math.PI/4)*radius,z:anchor.z+Math.sin(n*Math.PI/4)*radius})))
      const notice=notices.find(p=>safe(p)&&clear(anchor,p))
      if(!notice){failure='NOTICE_CLEARANCE_BLOCKED';return}
      const roles = createCityRoleBindings({ places })
      if (roles.unresolved.length) failure = 'PLACE_BINDING_MISSING'
      else result = { version: 1, places, bindings: roles.bindings, parcelSpot, notice }
      world.navigationData.release(owner); return
    }
    const place = candidates.places[index]
    const segments = compileRoadNetwork((plan.city?.roads ?? []).filter(r => r.id === place.roadId))
    const accesses = segments.map(s => {
      const p = place.approach, t = Math.max(0, Math.min(1, ((p.x - s.ax) * s.dx + (p.z - s.az) * s.dz) / s.lengthSquared))
      return ground({ x: s.ax + s.dx * t, z: s.az + s.dz * t })
    }).sort((a, b) => distance(a, place.approach) - distance(b, place.approach))
    const access = accesses[0]
    if (!access) { failure = `PLACE_ROAD_MISSING:${place.id}`; return }
    const geometry = world.navigationData.retain(owner, [place.entrance, place.approach, access])
    if (geometry.status === 'blocked') { failure = geometry.reason; return }
    if (geometry.status !== 'ready') return
    const approach = nearby(place.approach), entrance = nearby(place.entrance)
    if (!approach || !entrance || !clear(approach, entrance)) { failure = `PLACE_CLEARANCE_BLOCKED:${place.id}`; return }
    if (place.id === 'place.medicine') {
      parcelSpot = [0, 1, 2, 3, 4, 5, 6, 7].map(n => ground({ x: approach.x + Math.cos(n * Math.PI / 4) * 1.1,
        z: approach.z + Math.sin(n * Math.PI / 4) * 1.1 })).find(p => safe(p) && clear(approach, p)) ?? null
      if (!parcelSpot) { failure = 'PARCEL_CLEARANCE_BLOCKED'; return }
    }
    pending = true
    const check = clear(approach, access) ? Promise.resolve([access]) : world.findRoute(approach, access)
    check.then(async path => {
      if (closed) return
      const chain = [approach, ...path.map(ground), access]
      if (!path.length || !chain.slice(1).every((p, i) => clear(chain[i], p))) { failure = `PLACE_ACCESS_BLOCKED:${place.id}`; pending = false; return }
      const networkAnchor=knownPlaces[0]??places[0]
      if (networkAnchor) {
        const route = await world.findCityRoute(networkAnchor.approach, approach)
        if (closed) return
        if (route.status !== 'ready') { failure = `PLACE_NETWORK_BLOCKED:${place.id}`; pending = false; return }
      }
      places.push({ ...place, approach, entrance, access, status: 'confirmed', geometryConfirmed: true })
      index++; pending = false; world.navigationData.release(owner)
    })
  }
  return {
    update, result: () => result,
    status: () => ({ status: failure ? 'blocked' : result ? 'ready' : 'waiting_for_geometry', reason: failure, completed: index, total: candidates.places.length }),
    dispose() { closed = true; world.navigationData.release(owner) },
  }
}
