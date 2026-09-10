import { InventoryError,consumeLot } from './inventory.js'
import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { availableQuantity,requireAvailableLot } from './reservations.js'
import { projectedNeeds } from './life.js'
import { activeLease,growthSafe } from './growth.js'
import { CONTINUITY_V1 as rules } from './content/continuityV1.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(w,id)=>w.interactions.actors.find(a=>a.id===id)
export function emitContinuity(world,command,context,kind,extra={}) {
  check(activeEventCount(world.continuity)<4096,'HISTORY_FULL')
  const e={id:`continuity:${nextEventNumber(world.continuity)}`,kind,actorId:command.actorId,targetId:command.targetId??null,
    at:context.at,requestId:command.id,cause:null,...extra}
  world.continuity.events.push(e);return structuredClone(e)
}
export function recoveryEligibility(world,id,at,{present=false,dangerFree=false}={}) {
  const person=actor(world,id),row=world.continuity?.recovery.find(r=>r.actorId===id)
  if(!world.continuity||!person||person.health<=0)return {available:false,reason:'ACTOR_DEAD'}
  if(person.health>=person.maxHealth)return {available:false,reason:'HEALTH_FULL'}
  if(!present||!dangerFree||!growthSafe(world,id,at))return {available:false,reason:'NO_SAFE_REST'}
  if(id==='player') {
    const rest=world.standing?.rests?.findLast(r=>r.holderId===id&&r.active),lease=activeLease(world,id,at)
    if(!rest||!lease)return {available:false,reason:'NO_ACTIVE_LEASE'}
    const food=world.interactions.inventory.lots.find(l=>l.ownerId===id&&l.holderId===person.containerId&&l.itemType==='ration'&&availableQuantity(world.interactions,l.id)>0)
    if(!food&&!(row?.fedUntil>at))return {available:false,reason:'REST_FOOD_REQUIRED'}
    return {available:true,placeId:rest.placeId,fedUntil:row?.fedUntil>at?row.fedUntil:at+rules.playerFoodMs,
      foodLotId:row?.fedUntil>at?null:food.id,leaseEndsAt:lease.endsAt}
  }
  const life=world.life.actors.find(a=>a.actorId===id)
  if(life?.interruption||life?.intent?.kind!=='rest'||life.intent.phase!=='interacting')return {available:false,reason:'NOT_RESTING'}
  const hunger=projectedNeeds(life,at).hunger
  if(hunger>=60)return {available:false,reason:'REST_FOOD_REQUIRED'}
  return {available:true,placeId:life.intent.placeId,foodLotId:null,fedUntil:Math.floor(at+(60-hunger)*60000/8),leaseEndsAt:null}
}
function accrue(world,row,command,at) {
  check(at>=row.lastAt,'INVALID_TIME')
  const person=actor(world,row.actorId),elapsed=at-row.lastAt,events=[]
  const credited=row.active&&person.health>0&&elapsed<=rules.maxSampleGapMs?Math.max(0,Math.min(at,row.fedUntil,row.leaseEndsAt??at)-row.lastAt):0
  check(Number.isSafeInteger(row.restedMs+credited),'TIME_OVERFLOW')
  row.restedMs+=credited;row.remainderMs+=credited;row.lastAt=at
  const restored=Math.min(Math.floor(row.remainderMs/rules.healPerMs),person.maxHealth-person.health)
  if(person.health>0&&restored>0) {
    person.health+=restored;row.remainderMs-=restored*rules.healPerMs
    events.push(emitContinuity(world,{...command,actorId:row.actorId,targetId:row.actorId},{at},'rest_healed',
      {cause:row.startedEventId,health:restored,restedMs:row.restedMs}))
  }
  if(person.health>=person.maxHealth)row.remainderMs=0
  return events
}
function stop(world,row,command,context,reason) {
  const events=accrue(world,row,command,context.at);row.active=false
  events.push(emitContinuity(world,{...command,actorId:row.actorId},context,'recovery_paused',
    {cause:row.startedEventId,reason,restedMs:row.restedMs,interruptedBy:context.interruptedBy??null}))
  return events
}
export function executeContinuity(world,catalog,command,context) {
  check(world.version===2&&world.standing?.growthVersion===1&&context.allowed===true&&Number.isSafeInteger(context.at)&&context.at>=0,'CONTINUITY_NOT_READY')
  if(command.kind==='initialize') {
    check(!world.continuity,'CONTINUITY_ALREADY_INITIALIZED')
    world.continuity={version:1,recovery:[],staffQualifications:[],staff:[],staffKnowledge:[],events:[]}
    const job=world.economy.employments.find(j=>j.workerId===rules.helperId&&j.employerId===rules.businessActorId)
    if(job)world.continuity.staffQualifications.push({actorId:rules.helperId,businessActorId:rules.businessActorId,placeId:rules.shopPlaceId,
      sourceEventId:job.sourceEventId,employmentId:job.id})
    return [emitContinuity(world,command,context,'continuity_initialized',{qualifiedActors:world.continuity.staffQualifications.map(q=>q.actorId)})]
  }
  check(world.continuity,'CONTINUITY_NOT_READY')
  let row=world.continuity.recovery.find(r=>r.actorId===command.actorId)
  if(command.kind==='stop_recovery') {check(row?.active,'NOT_RESTING');return stop(world,row,command,context,context.reason??'REST_ENDED')}
  check(['start_recovery','sample_recovery'].includes(command.kind),'INVALID_COMMAND')
  const eligible=recoveryEligibility(world,command.actorId,context.at,context)
  check(eligible.available,eligible.reason);check(eligible.placeId===context.placeId&&typeof context.proofId==='string','MISSING_RECOVERY_EVIDENCE')
  if(command.kind==='start_recovery') {
    check(!row?.active,'NO_CHANGE')
    if(!row){row={actorId:command.actorId,active:false,placeId:null,startedEventId:null,lastAt:context.at,restedMs:0,remainderMs:0,fedUntil:0,leaseEndsAt:null};world.continuity.recovery.push(row)}
    if(eligible.foodLotId) {
      requireAvailableLot(world.interactions,eligible.foodLotId,1)
      world.interactions.inventory=consumeLot(world.interactions.inventory,catalog,{lotId:eligible.foodLotId,quantity:1})
    }
    Object.assign(row,{active:true,placeId:eligible.placeId,lastAt:context.at,fedUntil:eligible.fedUntil,leaseEndsAt:eligible.leaseEndsAt})
    const e=emitContinuity(world,command,context,'recovery_started',{placeId:row.placeId,cause:row.startedEventId,foodLotId:eligible.foodLotId,
      fedUntil:row.fedUntil,proofId:context.proofId});row.startedEventId=e.id;return [e]
  }
  check(row?.active&&context.at-row.lastAt>=rules.sampleMs,'RECOVERY_SAMPLE_NOT_DUE')
  // A new meal must be consumed through a new start after the old span stops.
  check(!eligible.foodLotId,'REST_FOOD_REQUIRED')
  const events=accrue(world,row,command,context.at)
  row.fedUntil=eligible.fedUntil;row.leaseEndsAt=eligible.leaseEndsAt
  events.push(emitContinuity(world,command,context,'recovery_progress',{placeId:row.placeId,cause:row.startedEventId,restedMs:row.restedMs,proofId:context.proofId}))
  return events
}
/** Settle known rest before an action can reduce health, never after a death. */
export function beforeRecoveryAction(world,step,requestId) {
  if(!world.continuity||!['life','combat','interaction','robbery','village','standing','relations'].includes(step.domain))return []
  if(step.domain==='relations'&&step.command.kind!=='start_daily')return []
  if(step.domain==='standing'&&!['start_training','resume_training','end_rest'].includes(step.command.kind))return []
  const ids=new Set([step.command.actorId,step.command.targetId])
  if(step.domain==='village'&&step.command.kind==='aid')ids.add('resident-1')
  if(step.domain==='standing'&&['start_training','resume_training'].includes(step.command.kind))ids.add('resident-2')
  const events=[]
  for(const row of world.continuity.recovery.filter(r=>r.active&&ids.has(r.actorId)))events.push(...stop(world,row,{id:requestId},
    {at:step.context.at,interruptedBy:requestId},'ACTION_STARTED'))
  return events
}
