import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { InventoryError } from './inventory.js'
const copy=value=>structuredClone(value)
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const clamp=n=>Math.max(0,Math.min(100,n))
const kinds=['work','rest','social','eat','patrol']
export function initialLifeActor(actorId,at) {
  return {actorId,activityId:null,activityStartedAt:at,energy:100,hunger:10,lastNeedsAt:at,intent:null,interruption:null}
}
export function projectedNeeds(row,at) {
  check(Number.isSafeInteger(at)&&at>=row.lastNeedsAt,'INVALID_TIME')
  const hours=(at-row.lastNeedsAt)/60000
  const resting=row.intent?.kind==='rest'&&row.intent.phase==='interacting'&&!row.interruption
  return {hunger:clamp(row.hunger+hours*8),energy:clamp(row.energy+hours*(resting?12:-4))}
}
function settleNeeds(row,at) {Object.assign(row,projectedNeeds(row,at),{lastNeedsAt:at})}
export function addArrivalLife(world,actorId,at) {
  if(!world.life||world.life.actors.some(a=>a.actorId===actorId))return
  check(world.places?.bindings.some(b=>b.actorId===actorId&&b.homePlaceId),'HOME_PLACE_MISSING')
  world.life.actors.push(initialLifeActor(actorId,at))
}
export function executeLife(world,command,context) {
  check(world.version===2&&context.allowed===true,'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0&&Number.isSafeInteger(context.at+100000),'INVALID_TIME')
  if(command.kind==='initialize') {
    check(!world.life&&world.places,'LIFE_ALREADY_INITIALIZED')
    const actorIds=world.registry.actors.filter(a=>a.hasBody&&a.actorId!=='player').map(a=>a.actorId)
    check(actorIds.every(id=>world.places.bindings.some(b=>b.actorId===id&&b.homePlaceId)),'HOME_PLACE_MISSING')
    const event={id:'life:1',kind:'life_initialized',actorId:command.actorId,targetId:null,at:context.at,cause:null,requestId:command.id}
    world.life={version:1,actors:actorIds.map(id=>initialLifeActor(id,context.at)),events:[event]}
    return [copy(event)]
  }
  const row=world.life?.actors.find(a=>a.actorId===command.actorId),actor=world.interactions.actors.find(a=>a.id===command.actorId)
  check(row&&actor?.health>0,'ACTOR_DEAD')
  check(activeEventCount(world.life)<4096,'HISTORY_FULL')
  const event={id:`life:${nextEventNumber(world.life)}`,kind:null,actorId:actor.id,targetId:null,at:context.at,cause:context.cause??null,requestId:command.id}
  if(command.kind==='activity') {
    check(kinds.includes(command.activity)&&world.places.definitions.some(p=>p.id===command.placeId)&&[10,40,50].includes(command.priority),'INVALID_ACTIVITY')
    const activityId=`${command.activity}:${command.placeId}`
    check(activityId!==row.activityId||row.interruption||command.priority!==row.intent?.priority,'NO_CHANGE')
    settleNeeds(row,context.at)
    row.activityId=activityId;row.activityStartedAt=context.at;row.interruption=null
    row.intent={id:`routine:${actor.id}:${event.id}`,actorId:actor.id,kind:command.activity,placeId:command.placeId,targetId:null,
      sourceEventId:context.cause??null,priority:command.priority,startedAt:context.at,phase:'travelling',resumeIntentId:null}
    event.kind='activity_changed';event.activity=command.activity;event.placeId=command.placeId;event.intentId=row.intent.id
  } else if(command.kind==='arrive') {
    check(row.intent&&row.intent.id===command.intentId&&!row.interruption&&row.intent.phase==='travelling','STALE_INTENT')
    check(context.present===true&&typeof context.proofId==='string'&&context.proofId.length>0,'MISSING_ARRIVAL_EVIDENCE')
    settleNeeds(row,context.at);row.intent.phase='interacting';row.activityStartedAt=context.at
    event.kind='activity_arrived';event.placeId=row.intent.placeId;event.intentId=row.intent.id;event.proofId=context.proofId
  } else if(command.kind==='interrupt') {
    check(row.intent&&(['combat','pursuit','report','delivery','reward','flee','seek_help','contract'].includes(command.reason)||
      world.factions?.escortsVersion===1&&command.reason==='escort'||world.standing?.growthVersion===1&&command.reason==='training'||
      world.relations?.dailyVersion===1&&command.reason==='daily')&&[40,60,70,80,90].includes(command.priority),'INVALID_INTERRUPTION')
    check(!row.interruption||row.interruption.priority<command.priority,'NO_CHANGE')
    settleNeeds(row,context.at)
    row.interruption={kind:command.reason,priority:command.priority,sourceEventId:context.cause??null,at:context.at,resumeIntentId:row.intent.id}
    row.intent.phase='suspended';event.kind='activity_interrupted';event.reason=command.reason;event.intentId=row.intent.id
  } else if(command.kind==='resume') {
    check(row.intent&&row.interruption&&context.safe===true,'NOT_READY_TO_RESUME')
    settleNeeds(row,context.at);row.interruption=null;row.intent.phase='travelling'
    event.kind='activity_resumed';event.intentId=row.intent.id
  } else throw new InventoryError('INVALID_COMMAND')
  world.life.events.push(event);return [copy(event)]
}
