import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { InventoryError } from './inventory.js'
import { clockAt } from '../living/clock.js'
import { authorizedOperator } from './staffing.js'
import { CONTINUITY_V1 } from './content/continuityV1.js'

const copy=value=>structuredClone(value)
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const knownActor=(world,id)=>world.interactions.actors.some(a=>a.id===id)
const point=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=(k==='y'?1024:255))
const actorState=(world,id)=>world.interactions.actors.find(a=>a.id===id)
function validateDefinitions(world,definitions,bindings) {
  check(Array.isArray(definitions)&&definitions.length>0&&definitions.length<=64&&new Set(definitions.map(p=>p.id)).size===definitions.length,'INVALID_PLACES')
  check(definitions.every(p=>typeof p.id==='string'&&p.id.startsWith('place.')&&typeof p.label==='string'&&p.label.length<=80&&
    ['shop','home','civic','public','loading'].includes(p.kind)&&p.geometryConfirmed===true&&p.status==='confirmed'&&
    point(p.approach)&&point(p.entrance)&&point(p.access)&&typeof p.public==='boolean'&&
    Array.isArray(p.hours)&&p.hours.length>0&&p.hours.every(h=>Number.isSafeInteger(h.startMinute)&&Number.isSafeInteger(h.endMinute)&&h.startMinute>=0&&h.endMinute<=1440&&h.startMinute<h.endMinute)),'INVALID_PLACE_DEFINITION')
  const ids=new Set(definitions.map(p=>p.id))
  check(Array.isArray(bindings)&&new Set(bindings.map(b=>b.actorId)).size===bindings.length&&bindings.every(b=>knownActor(world,b.actorId)&&
    [b.homePlaceId,b.workPlaceId].every(id=>id===null||ids.has(id))&&ids.has(b.idlePlaceId)&&Array.isArray(b.patrolPlaceIds)&&b.patrolPlaceIds.every(id=>ids.has(id))),'INVALID_PLACE_BINDINGS')
}
function entryFor(place,bindings,eventId) {
  return {placeId:place.id,operatorId:bindings.find(b=>b.workPlaceId===place.id)?.actorId??null,
    residentIds:bindings.filter(b=>b.homePlaceId===place.id).map(b=>b.actorId),status:'unassessed',reasonEventId:eventId,presenceAt:null}
}
export function addArrivalPlace(world,record,eventId) {
  if(!world.places||!record.body)return
  const {place,binding}=record.body
  if(world.places.definitions.some(p=>p.id===place.id))throw new InventoryError('PLACE_ALREADY_EXISTS')
  validateDefinitions(world,[place],[binding])
  world.places.definitions.push(copy(place));world.places.bindings.push(copy(binding))
  world.places.entries.push(entryFor(place,[binding],eventId))
}
export function executePlaces(world,command,context) {
  check(world.version===2&&context.allowed===true&&knownActor(world,command.actorId),'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0&&Number.isSafeInteger(context.at+100000),'INVALID_TIME')
  if(command.kind==='register') {
    check(!world.places,'PLACES_ALREADY_REGISTERED')
    check(context.geometryConfirmed===true,'MISSING_PLACE_EVIDENCE')
    validateDefinitions(world,command.definitions,command.bindings)
    const event={id:'places:1',kind:'places_registered',actorId:command.actorId,targetId:null,at:context.at,cause:null,requestId:command.id}
    world.places={version:1,definitions:copy(command.definitions),bindings:copy(command.bindings),
      entries:command.definitions.map(p=>entryFor(p,command.bindings,event.id)),events:[event]}
    return [copy(event)]
  }
  if(command.kind==='extend') {
    check(world.places?.version===1&&context.geometryConfirmed===true,'MISSING_PLACE_EVIDENCE')
    check(Array.isArray(command.definitions)&&command.definitions.every(p=>!world.places.definitions.some(old=>old.id===p.id)),'PLACE_ALREADY_EXISTS')
    validateDefinitions(world,[...world.places.definitions,...command.definitions],command.bindings)
    check(activeEventCount(world.places)<4096,'HISTORY_FULL')
    const event={id:`places:${nextEventNumber(world.places)}`,kind:'places_extended',actorId:command.actorId,targetId:null,at:context.at,cause:null,requestId:command.id}
    world.places.definitions.push(...copy(command.definitions));world.places.bindings=copy(command.bindings)
    for(const definition of command.definitions)world.places.entries.push(entryFor(definition,command.bindings,event.id))
    // Residents/roles can acquire a new home without resetting an existing shop.
    for(const entry of world.places.entries)entry.residentIds=command.bindings.filter(b=>b.homePlaceId===entry.placeId).map(b=>b.actorId)
    world.places.events.push(event);return [copy(event)]
  }
  if(command.kind==='enable_services') {
    check(world.places&&world.life&&!world.places.serviceVersion,'SERVICE_RULES_ALREADY_ENABLED')
    check(activeEventCount(world.places)<4096,'HISTORY_FULL')
    const event={id:`places:${nextEventNumber(world.places)}`,kind:'place_services_enabled',actorId:command.actorId,targetId:null,at:context.at,cause:null,requestId:command.id}
    world.places.serviceVersion=1;world.places.events.push(event);return [copy(event)]
  }
  check(world.places?.version===1&&command.kind==='presence','INVALID_COMMAND')
  const entry=world.places.entries.find(p=>p.placeId===command.placeId)
  check(entry&&(entry.operatorId===command.actorId||entry.residentIds.includes(command.actorId)),'NOT_PLACE_OPERATOR')
  check(actorState(world,command.actorId)?.health>0,'ACTOR_DEAD')
  check(['available','away','resting','danger'].includes(command.status)&&typeof context.present==='boolean'&&
    (command.status!=='available'||context.present===true)&&typeof context.proofId==='string'&&context.proofId.length>0,'MISSING_PLACE_EVIDENCE')
  check(entry.status!==command.status,'NO_CHANGE')
  check(activeEventCount(world.places)<4096,'HISTORY_FULL')
  const event={id:`places:${nextEventNumber(world.places)}`,kind:'place_status_changed',actorId:command.actorId,targetId:null,
    placeId:entry.placeId,status:command.status,at:context.at,cause:context.cause??null,proofId:context.proofId,requestId:command.id}
  entry.status=command.status;entry.presenceAt=context.at;entry.reasonEventId=event.id;world.places.events.push(event)
  return [copy(event)]
}
export function placeStatus(world,placeId,at) {
  const definition=world.places?.definitions.find(p=>p.id===placeId),entry=world.places?.entries.find(p=>p.placeId===placeId)
  if(!definition||!entry)return {placeId,status:'unregistered',reason:'PLACE_NOT_REGISTERED',open:false}
  const minute=clockAt(world.calendar.clockOrigin,at).minuteOfDay
  const inHours=definition.hours.some(h=>minute>=h.startMinute&&minute<h.endMinute)
  const operator=actorState(world,entry.operatorId)
  const life=world.places.serviceVersion===1?world.life?.actors.find(a=>a.actorId===entry.operatorId):null
  let reason=null
  if(entry.operatorId&&(!operator||operator.health<=0))reason='NO_OPERATOR'
  else if(!inHours)reason='OUTSIDE_HOURS'
  else if(life?.interruption)reason=['combat','pursuit','flee'].includes(life.interruption.kind)?'PLACE_DANGER':'OPERATOR_BUSY'
  else if(life?.intent?.kind==='rest'&&life.intent.phase==='interacting')reason='OPERATOR_RESTING'
  else if(definition.kind==='shop'&&life&&!(life.intent?.kind==='work'&&life.intent.placeId===placeId&&life.intent.phase==='interacting'))reason='OPERATOR_AWAY'
  else if(entry.status==='away')reason='OPERATOR_AWAY'
  else if(entry.status==='resting')reason='OPERATOR_RESTING'
  else if(entry.status==='danger')reason='PLACE_DANGER'
  else if(entry.status==='unassessed'&&entry.operatorId)reason='PRESENCE_UNCONFIRMED'
  return {placeId,status:reason?'unavailable':'open',reason,open:!reason,operatorId:entry.operatorId,
    residentIds:[...entry.residentIds],reasonEventId:entry.reasonEventId,inHours,label:definition.label}
}

/** Physical presence is supplied by the live scene; transitions alone are journaled. */
export function servicePresence(world,entry,{present,phase}) {
  const life=world.life?.actors.find(a=>a.actorId===entry.operatorId)
  if(phase!=='idle'||['combat','pursuit','flee'].includes(life?.interruption?.kind))return 'danger'
  if(life?.interruption)return 'away'
  if(world.continuity&&actorState(world,entry.operatorId)?.health<CONTINUITY_V1.injuredBelow)return 'resting'
  if(life?.intent?.kind==='rest'&&life.intent.phase==='interacting')return 'resting'
  if(life&&!(life.intent?.kind==='work'&&life.intent.placeId===entry.placeId&&life.intent.phase==='interacting'))return 'away'
  return present?'available':'away'
}
/** Action availability is advisory; reducers still re-check each live request. */
export function availablePlaceActions(world,actorId,placeId,context) {
  const status=placeStatus(world,placeId,context.at),definition=world.places?.definitions.find(p=>p.id===placeId)
  if(!definition)return []
  const actor=actorState(world,actorId),contact=context.withinRange===true&&context.clear===true&&context.facing===true
  const common=!actor||actor.health<=0?'ACTOR_DEAD':!contact?'APPROACH_TARGET':null
  const actions=definition.kind==='shop'?['buy','sell']:definition.kind==='civic'?['settle']:definition.kind==='home'?['ask_medicine','aid']:[]
  return actions.map(kind=>{
    const entry=world.places.entries.find(e=>e.placeId===placeId)
    const supported=['buy','sell'].includes(kind)?status.operatorId==='merchant'||authorizedOperator(world,entry):kind==='settle'?status.operatorId==='guard':status.residentIds.includes('resident-1')
    const targetId=['ask_medicine','aid'].includes(kind)?'resident-1':status.operatorId
    const reason=common??(!supported?'SERVICE_NOT_IMPLEMENTED':context.targetId!==targetId?'APPROACH_TARGET':
      actorState(world,targetId)?.health<=0?'ACTOR_DEAD':['buy','sell'].includes(kind)?status.reason:null)
    return {kind,available:!reason,reason,targetId}
  })
}
