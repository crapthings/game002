import { InventoryError } from './inventory.js'
import { GROWTH_V1 as rules } from './content/standingV1.js'
import { hasStanding,emitStanding } from './standing.js'
import { availableWallet,requireAvailableFunds,reserveMoney,releaseReservation } from './reservations.js'
import { previewCombat } from './combat.js'
import { pursuitFor } from './pursuit.js'
import { executeLife } from './life.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(w,id)=>w.interactions.actors.find(a=>a.id===id)
const home=world=>world.places.bindings.find(b=>b.actorId===rules.mentorId)?.homePlaceId
export function activeLease(world,holderId,at) {return world.standing?.rents?.findLast(r=>r.holderId===holderId&&r.startsAt<=at&&at<r.endsAt)??null}
export function trainingFor(world,holderId) {return world.standing?.training?.findLast(r=>r.holderId===holderId&&r.status!=='cancelled')??null}
export function growthSafe(world,holderId,at) {
  if(actor(world,holderId)?.health<=0)return false
  const fighter=previewCombat(world.combat,world.interactions.actors,at).find(f=>f.id===holderId)
  if(fighter?.phase!=='idle')return false
  return !world.crime.authorities.some(id=>pursuitFor(world,id,holderId,at).destination)
}
function releaseMentor(world,row) {
  const life=world.life?.actors.find(a=>a.actorId===row.mentorId)
  if(life?.interruption?.kind==='training'&&life.interruption.sourceEventId===row.startedEventId) {
    life.interruption=null;if(life.intent)life.intent.phase='travelling'
  }
}
function accrue(row,at) {
  if(!row.active)return
  check(at>=row.lastSampleAt,'INVALID_TIME')
  const elapsed=at-row.lastSampleAt
  // Missing observations never count as training, including an unclean reopen.
  if(elapsed<=rules.maxSampleGapMs)row.trainedMs=Math.min(rules.durationMs,row.trainedMs+elapsed)
  row.lastSampleAt=at
}
function pause(world,row,command,context,reason) {
  accrue(row,context.at);row.active=false;row.status=row.trainedMs>=rules.durationMs?'payment_due':'paused'
  releaseMentor(world,row)
  return emitStanding(world,command,context,'training_paused',{trainingId:row.id,targetId:row.mentorId,cause:row.startedEventId,trainedMs:row.trainedMs,reason})
}
function finish(world,row,command,context) {
  const pupil=actor(world,row.holderId),mentor=actor(world,row.mentorId)
  check(row.trainedMs===rules.durationMs&&pupil.health>0&&mentor.health>0,'TRAINING_NOT_FINISHED')
  if(availableWallet(world.interactions,pupil.id,row.reservationId)<rules.price) {
    row.status='payment_due';row.active=false;releaseMentor(world,row)
    return emitStanding(world,command,context,'training_payment_due',{trainingId:row.id,targetId:row.mentorId,cause:row.startedEventId,amount:rules.price})
  }
  requireAvailableFunds(world.interactions,pupil.id,rules.price,row.reservationId)
  const hold=world.interactions.reservations.find(r=>r.id===row.reservationId)
  check(hold&&['held','impaired'].includes(hold.status)&&hold.actorId===pupil.id&&hold.amount===rules.price&&hold.sourceId===row.id,'RESERVATION_UNAVAILABLE')
  check(!world.standing.training.some(r=>r.holderId===pupil.id&&r.skillId===rules.skillId&&r.status==='completed'),'SKILL_ALREADY_LEARNED')
  check(Number.isSafeInteger(pupil.attack+rules.attackBonus)&&Number.isSafeInteger(mentor.wallet+rules.price),'ATTRIBUTE_OVERFLOW')
  releaseReservation(world.interactions,row.reservationId,'spent');pupil.wallet-=rules.price;mentor.wallet+=rules.price;pupil.attack+=rules.attackBonus
  row.active=false;row.status='completed';releaseMentor(world,row)
  const e=emitStanding(world,command,context,'training_completed',{trainingId:row.id,targetId:mentor.id,cause:row.startedEventId,
    skillId:row.skillId,amount:rules.price,attackBonus:rules.attackBonus,proofId:context.proofId??null})
  row.completionEventId=e.id;return e
}
function atMentor(world,id,context) {
  check(context.withinRange===true&&context.clear===true&&context.facing===true&&context.identified===true&&typeof context.proofId==='string','MISSING_IDENTIFIED_MEETING')
  check(context.placeId===home(world)&&context.present===true&&context.mentorPresent===true,'GO_TO_MENTOR_HOME')
  check(context.dangerFree===true&&growthSafe(world,id,context.at)&&growthSafe(world,rules.mentorId,context.at),'NO_SAFE_TRAINING')
  const life=world.life.actors.find(a=>a.actorId===rules.mentorId)
  check(life?.intent&&(!life.interruption||life.interruption.kind==='training')&&!world.standing.training.some(r=>r.active&&r.holderId!==id),'MENTOR_BUSY')
}
function occupyMentor(world,row,command,context) {
  const life=world.life.actors.find(a=>a.actorId===row.mentorId)
  if(life.interruption?.kind==='training')return []
  return executeLife(world,{id:`${command.id}:mentor`,kind:'interrupt',actorId:row.mentorId,reason:'training',priority:60},
    {...context,cause:row.startedEventId})
}
export function executeGrowth(world,command,context) {
  check(world.standing&&context.allowed===true&&Number.isSafeInteger(context.at)&&context.at>=0&&Number.isSafeInteger(context.at+rules.rentDurationMs),'GROWTH_NOT_READY')
  if(command.kind==='enable_growth') {
    check(!world.standing.growthVersion,'GROWTH_ALREADY_ENABLED')
    Object.assign(world.standing,{growthVersion:1,rents:[],training:[],rests:[]})
    return [emitStanding(world,command,context,'growth_enabled')]
  }
  check(world.standing.growthVersion===1,'GROWTH_NOT_READY')
  const id=command.actorId,at=context.at
  if(command.kind==='pause_training') {
    const row=trainingFor(world,id);check(row?.active,'NO_ACTIVE_TRAINING')
    return [pause(world,row,command,context,context.reason??'LEFT_PRACTICE')]
  }
  if(command.kind==='end_rest') {
    const rest=world.standing.rests.findLast(r=>r.holderId===id&&r.active);check(rest,'NOT_RESTING')
    rest.active=false;rest.endedAt=at
    const e=emitStanding(world,command,context,'rest_ended',{cause:rest.startedEventId,reason:context.reason??'LEFT_REST'})
    rest.endedEventId=e.id;return [e]
  }
  check(actor(world,id)?.health>0,'ACTOR_DEAD')
  if(command.kind==='rent') {
    atMentor(world,id,context);check(hasStanding(world,rules.mentorId,id),'RECOGNITION_REQUIRED')
    requireAvailableFunds(world.interactions,id,rules.rentAmount)
    const endsAt=Math.max(at,activeLease(world,id,at)?.endsAt??at)+rules.rentDurationMs
    check(Number.isSafeInteger(endsAt)&&Number.isSafeInteger(actor(world,rules.mentorId).wallet+rules.rentAmount),'AMOUNT_OVERFLOW')
    check(world.standing.rents.length<4096,'HISTORY_FULL')
    actor(world,id).wallet-=rules.rentAmount;actor(world,rules.mentorId).wallet+=rules.rentAmount
    const e=emitStanding(world,command,context,'home_rented',{targetId:rules.mentorId,placeId:home(world),amount:rules.rentAmount,endsAt,proofId:context.proofId})
    world.standing.rents.push({holderId:id,landlordId:rules.mentorId,placeId:home(world),startsAt:at,endsAt,eventId:e.id});return [e]
  }
  if(command.kind==='start_rest') {
    const lease=activeLease(world,id,at)
    check(lease&&context.placeId===lease.placeId&&context.present===true,'NO_ACTIVE_LEASE')
    check(context.dangerFree===true&&growthSafe(world,id,at),'NO_SAFE_REST')
    check(!world.standing.rests.some(r=>r.holderId===id&&r.active)&&!trainingFor(world,id)?.active,'ACTOR_BUSY')
    check(world.standing.rests.length<4096,'HISTORY_FULL')
    const e=emitStanding(world,command,context,'rest_started',{placeId:lease.placeId,cause:lease.eventId,proofId:context.proofId})
    world.standing.rests.push({holderId:id,placeId:lease.placeId,startedAt:at,lastSampleAt:at,active:true,startedEventId:e.id,endedAt:null,endedEventId:null})
    return [e]
  }
  if(command.kind==='cancel_training') {
    const row=trainingFor(world,id);check(row&&row.status!=='completed','NO_ACTIVE_TRAINING')
    const events=row.active?[pause(world,row,command,context,'CANCELLED')]:[]
    const hold=world.interactions.reservations.find(r=>r.id===row.reservationId)
    if(hold&&['held','impaired'].includes(hold.status))releaseReservation(world.interactions,hold.id)
    row.status='cancelled';row.active=false
    const e=emitStanding(world,command,context,'training_cancelled',{trainingId:row.id,targetId:row.mentorId,cause:row.startedEventId,trainedMs:row.trainedMs})
    row.completionEventId=e.id;return [...events,e]
  }
  check(['start_training','resume_training','sample_training'].includes(command.kind),'INVALID_COMMAND')
  atMentor(world,id,context);check(hasStanding(world,rules.mentorId,id),'RECOGNITION_REQUIRED')
  check(!world.standing.rests.some(r=>r.holderId===id&&r.active),'ACTOR_BUSY')
  let row=trainingFor(world,id)
  if(command.kind==='start_training') {
    check(!row,'SKILL_ALREADY_STARTED');check(world.standing.training.length<4096,'HISTORY_FULL')
    const trainingId=`training:${world.standing.training.length+1}`
    row={id:trainingId,holderId:id,mentorId:rules.mentorId,skillId:rules.skillId,reservationId:`hold:${trainingId}`,
      trainedMs:0,startedAt:at,lastSampleAt:at,active:true,status:'training',startedEventId:null,completionEventId:null}
    reserveMoney(world.interactions,{id:row.reservationId,actorId:id,amount:rules.price,sourceId:row.id,at})
    const e=emitStanding(world,command,context,'training_started',{trainingId:row.id,targetId:row.mentorId,amount:rules.price,requiredMs:rules.durationMs,proofId:context.proofId})
    row.startedEventId=e.id;world.standing.training.push(row)
    return [e,...occupyMentor(world,row,command,context)]
  }
  check(row&&row.status!=='completed','SKILL_ALREADY_LEARNED')
  if(command.kind==='resume_training') {
    check(!row.active,'NO_CHANGE');check(availableWallet(world.interactions,id,row.reservationId)>=rules.price,'INSUFFICIENT_FUNDS')
    if(row.trainedMs===rules.durationMs)return [finish(world,row,command,context)]
    row.active=true;row.status='training';row.lastSampleAt=at
    return [emitStanding(world,command,context,'training_resumed',{trainingId:row.id,targetId:row.mentorId,cause:row.startedEventId,trainedMs:row.trainedMs,proofId:context.proofId}),
      ...occupyMentor(world,row,command,context)]
  }
  check(row.active&&at-row.lastSampleAt>=rules.sampleMs,'TRAINING_SAMPLE_NOT_DUE')
  accrue(row,at)
  if(row.trainedMs===rules.durationMs)return [finish(world,row,command,context)]
  return [emitStanding(world,command,context,'training_progress',{trainingId:row.id,targetId:row.mentorId,cause:row.startedEventId,trainedMs:row.trainedMs,proofId:context.proofId})]
}
/** Cut a practice span at the actual disruptive command, before later polling. */
export function interruptGrowth(world,events,at,requestId) {
  if(!world.standing?.growthVersion)return []
  const disrupt=new Set(['attack_started','guard_started','damaged','died','threatened','robbed','mask','activity_interrupted','standing_suspended'])
  const out=[]
  if(world.continuity?.justiceVersion)for(const row of world.standing.training.filter(r=>!['completed','cancelled'].includes(r.status))) {
    const death=events.find(e=>e.kind==='died'&&[row.holderId,row.mentorId].includes(e.targetId))??
      (events.some(e=>e.kind==='justice_enabled')?world.combat.events.findLast(e=>e.kind==='died'&&[row.holderId,row.mentorId].includes(e.targetId)):null)
    if(!death)continue
    if(row.active)out.push(pause(world,row,{id:requestId,actorId:row.holderId},{at},death.id))
    const hold=world.interactions.reservations.find(r=>r.id===row.reservationId)
    if(hold&&['held','impaired'].includes(hold.status))releaseReservation(world.interactions,hold.id)
    row.active=false;row.status='cancelled';releaseMentor(world,row)
    const e=emitStanding(world,{id:requestId,actorId:row.holderId,targetId:row.mentorId},{at},'training_cancelled',
      {trainingId:row.id,cause:death.id,trainedMs:row.trainedMs,reason:'PARTICIPANT_DEAD'})
    row.completionEventId=e.id;out.push(e)
  }
  for(const row of world.standing.training.filter(r=>r.active)) {
    const source=events.find(e=>disrupt.has(e.kind)&&!(e.kind==='activity_interrupted'&&e.reason==='training')&&
      [e.actorId,e.targetId].some(id=>id===row.holderId||id===row.mentorId))
    if(source)out.push(pause(world,row,{id:requestId,actorId:row.holderId},{at},source.id))
  }
  for(const rest of world.standing.rests.filter(r=>r.active)) {
    const source=events.find(e=>disrupt.has(e.kind)&&[e.actorId,e.targetId].includes(rest.holderId))
    if(!source)continue
    rest.active=false;rest.endedAt=at
    const e=emitStanding(world,{id:requestId,actorId:rest.holderId},{at},'rest_ended',{cause:rest.startedEventId,reason:source.id})
    rest.endedEventId=e.id;out.push(e)
  }
  return out
}
