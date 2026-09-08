import { restoreGameplay as restoreV1 } from '../versions/v1/runtime.js'
import { InventoryError } from '../inventory.js'
import { validClockOrigin } from '../../living/clock.js'

const clone=value=>structuredClone(value)
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const natural=n=>Number.isSafeInteger(n)&&n>=0

/** Derive a baseline only from the frozen reader's fully restored source. */
export function createV2Baseline(config,source,migration) {
  check(source?.version===1&&natural(source.sequence)&&natural(source.simulationAt)&&Number.isSafeInteger(source.simulationAt+100000)&&
    source.gameplay?.version===1&&source.simulationAt>=source.gameplay.at,'INVALID_MIGRATION_SOURCE')
  const restored=restoreV1(config,source.gameplay)
  check(restored.ok,restored.code)
  const origin=migration?.clockOrigin,bodies=migration?.bodyActorIds
  check(validClockOrigin(origin)&&origin.simulationAt===source.simulationAt&&origin.absoluteMinute<1440,'INVALID_CLOCK_ORIGIN')
  check(Array.isArray(bodies)&&new Set(bodies).size===bodies.length&&bodies.every(id=>restored.state.interactions.actors.some(a=>a.id===id)),'INVALID_BODY_REGISTRY')
  const state={...clone(restored.state),version:2,journal:[],
    migration:clone(migration),archive:{version:1,legacyCheckpoint:clone(source)},
    calendar:{version:1,clockOrigin:clone(origin)},
    registry:{version:1,actors:restored.state.interactions.actors.map(a=>({actorId:a.id,hasBody:bodies.includes(a.id),sourceEventId:null})),events:[]}}
  return {catalog:restored.catalog,state}
}

export function migrateWorldToV2(config,source,migration) {
  try {
    const result=createV2Baseline(config,source,migration)
    return {ok:true,code:'MIGRATED',catalog:result.catalog,
      checkpoint:{version:1,sequence:source.sequence,simulationAt:source.simulationAt,gameplay:result.state},events:[]}
  } catch(error) {return {ok:false,code:error.code??'INVALID_MIGRATION',events:[]}}
}
