import { wuxiaDefinitions } from '../assets/wuxia/catalog.js'
import { compileRoadNetwork } from '../world/roads/roadGeometry.js'
import { blocksFortification } from '../world/fortifications/createFortifications.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const stableId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0
const clone = value => structuredClone(value)

function project(segment, point) {
  const t = Math.max(0, Math.min(1, ((point.x - segment.ax) * segment.dx + (point.z - segment.az) * segment.dz) / segment.lengthSquared))
  return { x: segment.ax + segment.dx * t, z: segment.az + segment.dz * t }
}

function buildingBox(placement) {
  const definition = wuxiaDefinitions[placement.assetId]
  const scale = placement.scale ?? 1
  return {
    x: placement.position[0], z: placement.position[2], rotation: placement.rotation ?? 0,
    halfWidth: (definition?.width ?? placement.footprint?.width ?? 0) * scale / 2,
    halfDepth: (definition?.depth ?? placement.footprint?.depth ?? 0) * scale / 2,
  }
}

function overlaps(point, box, radius = .65) {
  const dx = point.x - box.x, dz = point.z - box.z
  const cosine = Math.cos(box.rotation), sine = Math.sin(box.rotation)
  return Math.abs(dx * cosine - dz * sine) < box.halfWidth + radius &&
    Math.abs(dx * sine + dz * cosine) < box.halfDepth + radius
}

/** Resolve deterministic candidates only. Live navigation must confirm geometry. */
export function resolveCityPlaces(plan,additionalHomes=[],additionalPlaces=[]) {
  const city = plan?.city
  if (!city || !Number.isFinite(city.elevation) || !Array.isArray(city.placements) || !Array.isArray(city.roads)) {
    return { version: 1, places: [], unresolved: [{ placeId: null, code: 'CITY_PLAN_MISSING' }] }
  }
  const buildings = city.placements.filter(p => p.building).slice().sort(stableId)
  const boxes = buildings.map(buildingBox)
  const roads = city.roads.filter(road => !road.id.startsWith('lane/'))
  const segments = compileRoadNetwork(roads)
  const places = [], unresolved = [], occupied = []
  const bounds = plan.bounds ?? { minX: -176, maxX: 176, minZ: -176, maxZ: 176 }
  const point = p => ({ x: p.x, y: city.elevation, z: p.z })
  const landmark = (name, fallback) => {
    const found = city.landmarks?.find(p => p.name === name)
    return found ? { x: found.x, z: found.z } : fallback
  }
  const market = landmark('百业集市街', { x: 0, z: -64 })
  const central = landmark('中心商区', { x: 48, z: 0 })
  const yamen = landmark('清平府衙', { x: 16, z: 112 })
  const water = city.water

  function allowed(p, separation = true) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z) ||
      p.x <= bounds.minX + 2 || p.x >= bounds.maxX - 2 || p.z <= bounds.minZ + 2 || p.z >= bounds.maxZ - 2) return false
    if (water && p.x > water.minX - 1 && p.x < water.maxX + 1 && p.z > water.minZ - 1 && p.z < water.maxZ + 1) return false
    if (blocksFortification(plan.fortifications, p.x, p.z, .65) || boxes.some(box => overlaps(p, box))) return false
    if (segments.some(segment => segment.width >= 4 && distance(project(segment, p), p) < segment.width / 2 + .4)) return false
    return !separation || occupied.every(other => distance(other, p) >= 2)
  }

  function frontage(building) {
    const box = buildingBox(building)
    const options = segments.map(segment => ({ segment, street: project(segment, box) }))
      .sort((a, b) => distance(a.street, box) - distance(b.street, box) || a.segment.roadIndex - b.segment.roadIndex)
    for (const { segment, street } of options.slice(0, 8)) {
      const length = distance(street, box)
      if (length < 1 || length > 36) continue
      const nx = (box.x - street.x) / length, nz = (box.z - street.z) / length
      const cosine = Math.cos(box.rotation), sine = Math.sin(box.rotation)
      const localX = Math.abs(nx * cosine - nz * sine), localZ = Math.abs(nx * sine + nz * cosine)
      const extent = Math.min(localX > 1e-6 ? box.halfWidth / localX : Infinity, localZ > 1e-6 ? box.halfDepth / localZ : Infinity)
      const entrance = point({ x: box.x - nx * (extent + .8), z: box.z - nz * (extent + .8) })
      const curb = segment.width / 2 + 1
      const approach = point({ x: street.x + nx * curb, z: street.z + nz * curb })
      if (length - extent < curb || !allowed(entrance, false) || !allowed(approach)) continue
      return { entrance, approach, roadId: roads[segment.roadIndex].id, heading: Math.atan2(-nx, -nz) }
    }
    return null
  }

  function publicCandidate(anchor, maxDistance) {
    const candidates = []
    for (const segment of segments) {
      const base = project(segment, anchor), tx = segment.dx / segment.length, tz = segment.dz / segment.length
      for (const offset of [0, 4, -4, 8, -8]) for (const side of [1, -1]) {
        const p = { x: base.x + tx * offset - tz * (segment.width / 2 + 1) * side,
          z: base.z + tz * offset + tx * (segment.width / 2 + 1) * side }
        if (distance(p, anchor) > maxDistance || !allowed(p)) continue
        candidates.push({ entrance: point(p), approach: point(p), roadId: roads[segment.roadIndex].id,
          heading: Math.atan2(tz * side, -tx * side) })
      }
    }
    candidates.sort((a, b) => distance(a.approach, anchor) - distance(b.approach, anchor) ||
      a.approach.x - b.approach.x || a.approach.z - b.approach.z)
    return candidates[0] ?? null
  }

  function add(spec) {
    let selected = null
    const choices = buildings.filter(p => !spec.exclude?.has(p.id) && spec.accept?.(p, wuxiaDefinitions[p.assetId]))
      .filter(p => distance({ x: p.position[0], z: p.position[2] }, spec.anchor) <= spec.radius)
      .map(p => ({ placement: p, rank: spec.rank?.(p, wuxiaDefinitions[p.assetId]) ?? 0 }))
      .sort((a, b) => a.rank - b.rank || distance(buildingBox(a.placement), spec.anchor) - distance(buildingBox(b.placement), spec.anchor) || stableId(a.placement, b.placement))
    for (const { placement } of choices) {
      const entry = frontage(placement)
      if (entry) { selected = { ...entry, buildingId: placement.id, parcelId: placement.parcelId ?? null, fallback: false }; break }
    }
    if (!selected) {
      const entry = publicCandidate(spec.anchor, spec.fallbackRadius ?? 20)
      if (entry) selected = { ...entry, buildingId: null, parcelId: city.parcels?.find(p => {
        const b = p.bounds, q = entry.approach
        return q.x >= b.minX && q.x < b.maxX && q.z >= b.minZ && q.z < b.maxZ
      })?.id ?? null, fallback: true }
    }
    if (!selected) { unresolved.push({ placeId: spec.id, code: 'NO_PLACE_CANDIDATE' }); return null }
    const parcel = city.parcels?.find(p => p.id === selected.parcelId)
    const detail = plan.hierarchy?.details?.find(p => p.id === selected.parcelId)
    const result = { id: spec.id, label: selected.fallback&&spec.kind==='home'?spec.label.replace('住处','临时歇脚处'):spec.label, kind: spec.kind,
      ...selected, districtId: detail?.districtId ?? parcel?.districtId ?? null,
      hours: clone(spec.hours ?? [{ startMinute: 0, endMinute: 1440 }]), public: selected.fallback||spec.public !== false,
      status: 'candidate', geometryConfirmed: false,
      source: selected.fallback ? 'planned-road-shoulder' : 'planned-building-frontage' }
    places.push(result); occupied.push(result.approach)
    return result
  }

  const medicine = add({ id: 'place.medicine', label: '陈记药铺', kind: 'shop', anchor: market, radius: 76,
    accept: (p, d) => d?.kind === 'medicine' || d?.kind.startsWith('market-'),
    rank: (p, d) => d.kind === 'medicine' ? 0 : 1, hours: [{ startMinute: 480, endMinute: 1080 }] })
  add({ id: 'place.market-neighbor', label: '集市街口', kind: 'public', anchor: medicine?.approach ?? market, radius: 0, fallbackRadius: 12 })
  const desk = add({ id: 'place.yamen-desk', label: '府衙接案处', kind: 'civic', anchor: yamen, radius: 48,
    accept: (p, d) => d?.kind === 'government', fallbackRadius: 36 })
  add({ id: 'place.yamen-patrol', label: '衙前巡逻点', kind: 'civic', anchor: desk?.approach ?? yamen, radius: 0, fallbackRadius: 16 })
  const isHome = (p, d) => Boolean(d && (d.tags.includes('home') || p.assetId.includes('house-') || d.wealth))
  const liu = add({ id: 'place.home-liu', label: '柳娘住处', kind: 'home', anchor: { x: -88, z: -32 }, radius: 72,
    accept: isHome, public: false, fallbackRadius: 28 })
  add({ id: 'place.home-shi', label: '石伯住处', kind: 'home', anchor: { x: -112, z: -32 }, radius: 72,
    accept: isHome, exclude: new Set(liu?.buildingId ? [liu.buildingId] : []), public: false, fallbackRadius: 28 })
  add({ id: 'place.central-contact', label: '中心商区街口', kind: 'public', anchor: central, radius: 48,
    accept: (p, d) => d?.kind === 'tea' || d?.kind === 'inn', rank: (p, d) => d.kind === 'tea' ? 0 : 1 })
  const usedHomes=new Set(places.filter(p=>p.kind==='home'&&p.buildingId).map(p=>p.buildingId))
  for(const home of additionalHomes) {
    const place=add({id:`place.home-${home.actorId}`,label:home.label,kind:'home',anchor:home.anchor,radius:72,
      accept:isHome,exclude:usedHomes,public:false,fallbackRadius:28})
    if(place?.buildingId)usedHomes.add(place.buildingId)
  }
  for(const spec of additionalPlaces)add(spec)
  return { version: 1, places, unresolved }
}

export function resolveSupplierPlace(plan) {
  const gate=plan.fortifications?.gates?.slice().sort((a,b)=>a.z-b.z||a.id.localeCompare(b.id))[0]
  if(!gate)return {version:1,places:[],unresolved:[{placeId:'place.supplier-loading',code:'GATE_PLACE_MISSING'}]}
  const length=Math.hypot(gate.x,gate.z),anchor={x:gate.x-gate.x/length*32,z:gate.z-gate.z/length*32}
  const resolved=resolveCityPlaces(plan,[],[{id:'place.supplier-loading',label:'城门卸货场',kind:'loading',anchor,radius:0,fallbackRadius:28,public:true,hours:[{startMinute:480,endMinute:1080}]}])
  return {version:1,places:resolved.places.filter(p=>p.id==='place.supplier-loading'),unresolved:resolved.unresolved.filter(p=>p.placeId===null||p.placeId==='place.supplier-loading')}
}

export function resolveRoleHomes(plan) {
  const homes=[['merchant','陈掌柜住处',32,-96],['witness','阿青住处',-32,-96],['guard','周平住处',-48,96],
    ['guard-2','林岳住处',64,96],['resident-3','小何住处',96,-32]].map(([actorId,label,x,z])=>({actorId,label,anchor:{x,z}}))
  const ids=new Set(homes.map(h=>`place.home-${h.actorId}`)),resolved=resolveCityPlaces(plan,homes)
  return {version:1,places:resolved.places.filter(p=>ids.has(p.id)),unresolved:resolved.unresolved.filter(p=>p.placeId===null||ids.has(p.placeId))}
}

export function resolveGangPlace(plan) {
  const water=plan.city?.water
  if(!water)return {version:1,places:[],unresolved:[{placeId:'place.river-meeting',code:'WATERFRONT_PLACE_MISSING'}]}
  const resolved=resolveCityPlaces(plan,[],[{id:'place.river-meeting',label:'渡口会面处',kind:'public',
    anchor:{x:water.maxX+12,z:water.maxZ-12},radius:0,fallbackRadius:40,public:true,hours:[{startMinute:0,endMinute:1440}]}])
  return {version:1,places:resolved.places.filter(p=>p.id==='place.river-meeting'),unresolved:resolved.unresolved.filter(p=>p.placeId===null||p.placeId==='place.river-meeting')}
}
