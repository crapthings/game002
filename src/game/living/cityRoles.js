const definitions = [
  ['merchant', null, 'place.medicine', 'place.medicine', []],
  ['witness', null, 'place.market-neighbor', 'place.market-neighbor', ['place.market-neighbor', 'place.medicine']],
  ['guard', null, 'place.yamen-desk', 'place.yamen-desk', []],
  ['guard-2', null, 'place.yamen-patrol', 'place.yamen-patrol', ['place.yamen-patrol', 'place.central-contact']],
  ['resident-1', 'place.home-liu', null, 'place.home-liu', []],
  ['resident-2', 'place.home-shi', null, 'place.home-shi', []],
  ['resident-3', null, 'place.central-contact', 'place.central-contact', []],
]

/** Stable identity bindings, independent of legacy spawn coordinates and poses. */
export function createCityRoleBindings(layout) {
  const known = new Set((layout?.places ?? []).map(p => p.id))
  const bindings = [], unresolved = []
  for (const [actorId, homePlaceId, workPlaceId, idlePlaceId, patrolPlaceIds] of definitions) {
    const missing = [...new Set([homePlaceId, workPlaceId, idlePlaceId, ...patrolPlaceIds].filter(Boolean))].filter(id => !known.has(id))
    if (missing.length) { unresolved.push({ actorId, code: 'PLACE_BINDING_MISSING', placeIds: missing }); continue }
    bindings.push({ actorId, homePlaceId, workPlaceId, idlePlaceId, patrolPlaceIds: [...patrolPlaceIds] })
  }
  return { version: 1, bindings, unresolved }
}
