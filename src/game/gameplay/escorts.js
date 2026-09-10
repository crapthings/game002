import { InventoryError } from './inventory.js'
import { previewCombat } from './combat.js'
import { wantedFor } from './crime.js'
import { availableWallet,reserveMoney,releaseReservation,requireAvailableFunds } from './reservations.js'
import { emitFactionAction } from './factionEvents.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(w,id)=>w.interactions.actors.find(a=>a.id===id)
const active=r=>['offered','accepted','accompanying'].includes(r.status)
export const ESCORT_RULES={reward:3,waitMs:60000,sampleMs:1000,maxGapMs:2500,minTravelMs:3000,minDistance:8,radius:6}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
const validPoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]))
export function escortMemory(world,id,actorId) {return world.factions?.escortKnowledge?.find(k=>k.escortId===id&&k.actorId===actorId)??null}
export const hasEscortAssignment=(world,id)=>(world.factions?.escortKnowledge??[]).some(k=>k.actorId===id&&k.assigneeId===id&&['accepted','accompanying'].includes(k.status))
function remember(world,row,actorId,eventId,at,change={}) {
  let k=escortMemory(world,row.id,actorId)
  if(!k){k={escortId:row.id,actorId,issuerId:row.issuerId,courierId:row.courierId,assigneeId:null,pickupPlaceId:row.pickupPlaceId,
    returnPlaceId:row.returnPlaceId,deadlineAt:row.deadlineAt,amount:row.amount,status:'offered',reason:null};world.factions.escortKnowledge.push(k)}
  Object.assign(k,change,{evidenceId:eventId,at})
}
export function escortMeetingEligibility(world,speakerId,listenerId,context) {
  if(speakerId===listenerId||[speakerId,listenerId].some(id=>actor(world,id)?.health<=0||!actor(world,id)))return {available:false,reason:'ACTOR_DEAD'}
  if(context.withinRange!==true||context.clear!==true||context.facing!==true)return {available:false,reason:'MEETING_ENDED'}
  const fighters=previewCombat(world.combat,world.interactions.actors,context.at)
  if([speakerId,listenerId].some(id=>fighters.find(f=>f.id===id)?.phase!=='idle'))return {available:false,reason:'NO_SAFE_MEETING'}
  const life=world.life?.actors.find(a=>a.actorId===speakerId),pause=life?.interruption
  if(pause&&(!['contract','escort','seek_help'].includes(pause.kind)||pause.priority>60)||world.robbery.cooldowns.some(c=>c.targetId===speakerId&&c.until>context.at))return {available:false,reason:'TARGET_BUSY'}
  if(world.crime.authorities.includes(speakerId)&&wantedFor(world.crime,speakerId,listenerId).level>0)return {available:false,reason:'OFFICIAL_CASE_PENDING'}
  return {available:true,reason:null}
}
function meeting(world,a,b,context) {
  const eligible=escortMeetingEligibility(world,b,a,context)
  check(eligible.available,eligible.reason)
  check(context.identified===true&&typeof context.proofId==='string','MISSING_IDENTIFIED_MEETING')
}
function close(world,row,command,context,reason) {
  const hold=world.interactions.reservations.find(h=>h.id===row.reservationId)
  if(hold&&['held','impaired'].includes(hold.status))releaseReservation(world.interactions,hold.id)
  row.status='failed';row.reason=reason
  const e=emitFactionAction(world,command,context,'escort_ended',{escortId:row.id,cause:row.sourceEventId,reason})
  row.completionEventId=e.id;return e
}
/** Invoked in the original acceptance meeting, after its cargo and tip holds. */
export function applyEscortConsequences(world,events,at,requestId) {
  if(!world.factions?.escortsVersion)return []
  const out=[]
  for(const accepted of events.filter(e=>e.kind==='opportunity_accepted')) {
    const source=world.opportunities.entries.find(r=>r.id===accepted.opportunityId)
    if(source?.requirements.kind!=='procurement'||!source.identifiedAssignee||availableWallet(world.interactions,source.issuerId)<ESCORT_RULES.reward||
      world.factions.escorts.some(r=>r.opportunityId===source.id)||world.factions.escorts.filter(active).length>=2)continue
    check(world.factions.escorts.length<4096,'HISTORY_FULL')
    const id=`escort:${world.factions.escorts.length+1}`,row={id,opportunityId:source.id,issuerId:source.issuerId,courierId:source.assigneeId,
      assigneeId:null,pickupPlaceId:source.targetPlaceId,returnPlaceId:source.returnPlaceId,deadlineAt:source.deadlineAt,
      amount:ESCORT_RULES.reward,reservationId:`hold:${id}`,status:'offered',reason:null,sourceEventId:null,completionEventId:null,
      waitUntil:null,joinedEventId:null,lastSampleAt:null,lastGoodAt:null,lastPosition:null,travelMs:0,travelDistance:0,deliveredEventId:null}
    reserveMoney(world.interactions,{id:row.reservationId,actorId:row.issuerId,amount:row.amount,sourceId:id,at})
    const e=emitFactionAction(world,{id:requestId,actorId:row.issuerId,targetId:row.courierId},{at},'escort_offered',
      {escortId:id,opportunityId:source.id,cause:accepted.id,amount:row.amount,proofId:accepted.proofId})
    row.sourceEventId=e.id;world.factions.escorts.push(row)
    for(const id of [row.issuerId,row.courierId])remember(world,row,id,e.id,at)
    out.push(e)
  }
  const force=events.findLast(e=>['died','robbed','loot_money','loot_item','opportunity_failed','opportunity_expired','opportunity_cancelled'].includes(e.kind))
  if(!force)return out
  for(const row of world.factions.escorts.filter(active)) {
    const source=world.opportunities.entries.find(r=>r.id===row.opportunityId),hold=world.interactions.reservations.find(h=>h.id===row.reservationId)
    const reason=[row.issuerId,row.courierId,row.assigneeId].filter(Boolean).some(id=>actor(world,id)?.health<=0)?'PARTICIPANT_DEAD':
      ['failed','expired','cancelled'].includes(source.status)?'CARGO_CONTRACT_ENDED':hold?.status==='impaired'?'FUNDS_UNAVAILABLE':null
    if(!reason)continue
    const e=close(world,row,{id:requestId,actorId:row.issuerId},{at},reason);e.cause=force.id
    Object.assign(world.factions.events.find(r=>r.id===e.id),{cause:force.id});out.push(e)
    // Remote participants keep their last agreement until their own observation.
    if(force.targetId===row.issuerId)remember(world,row,row.issuerId,e.id,at,{status:'failed',reason})
  }
  return out
}
export function executeEscorts(world,command,context) {
  if(command.kind==='enable_escorts') {
    check(!world.factions.escortsVersion,'ESCORTS_ALREADY_ENABLED')
    world.factions.escortsVersion=1;world.factions.escortKnowledge=[]
    return [emitFactionAction(world,command,context,'escorts_enabled')]
  }
  check(world.factions.escortsVersion===1,'ESCORTS_DISABLED')
  const row=world.factions.escorts.find(r=>r.id===command.escortId)
  check(row,'UNKNOWN_ESCORT')
  const source=world.opportunities.entries.find(r=>r.id===row.opportunityId),at=context.at,id=command.actorId
  if(command.kind==='hear_escort') {
    meeting(world,id,row.issuerId,context)
    const known=escortMemory(world,row.id,row.issuerId)
    check(known&&!['failed','fulfilled'].includes(known.status)&&at<row.deadlineAt,'NO_ESCORT_OFFER')
    check(!escortMemory(world,row.id,id),'ESCORT_ALREADY_KNOWN')
    const e=emitFactionAction(world,command,context,'escort_terms_told',{escortId:row.id,targetId:row.issuerId,cause:known.evidenceId,proofId:context.proofId})
    remember(world,row,id,e.id,at,{status:known.status,assigneeId:known.assigneeId});return [e]
  }
  if(command.kind==='accept_escort') {
    meeting(world,id,row.issuerId,context)
    check(escortMemory(world,row.id,id)&&row.status==='offered'&&at<row.deadlineAt,'NO_ESCORT_OFFER')
    check(![row.issuerId,row.courierId].includes(id),'INVALID_ESCORT')
    check(!world.factions.escorts.some(r=>r.assigneeId===id&&['accepted','accompanying','delivered'].includes(r.status)),'NPC_ALREADY_ASSIGNED')
    check(!world.life?.actors.find(a=>a.actorId===id)?.assignment||world.life.actors.find(a=>a.actorId===id).assignment.outcomeEventId,'NPC_ALREADY_ASSIGNED')
    check(world.interactions.reservations.some(r=>r.id===row.reservationId&&r.status==='held'),'RESERVATION_UNAVAILABLE')
    row.status='accepted';row.assigneeId=id
    const e=emitFactionAction(world,command,context,'escort_accepted',{escortId:row.id,targetId:row.issuerId,cause:row.sourceEventId,proofId:context.proofId})
    for(const a of [id,row.issuerId])remember(world,row,a,e.id,at,{status:'accepted',assigneeId:id})
    return [e]
  }
  if(command.kind==='wait_escort') {
    check(id===row.courierId&&!row.waitUntil&&escortMemory(world,row.id,id)&&at<row.deadlineAt,'NO_ESCORT_WAIT')
    check(context.present===true&&context.placeId===row.pickupPlaceId,'MISSING_PLACE_EVIDENCE')
    row.waitUntil=Math.min(at+ESCORT_RULES.waitMs,row.deadlineAt)
    const e=emitFactionAction(world,command,context,'escort_rendezvous_opened',{escortId:row.id,cause:row.sourceEventId,waitUntil:row.waitUntil,placeId:context.placeId})
    remember(world,row,id,e.id,at);return [e]
  }
  check(row.assigneeId===id,'NOT_ESCORT')
  if(command.kind==='cancel_escort') {
    check(!['delivered','fulfilled'].includes(row.status),'ESCORT_ALREADY_DELIVERED')
    const e=active(row)?close(world,row,command,context,'ESCORT_WITHDRAWN'):
      emitFactionAction(world,command,context,'escort_outcome_seen',{escortId:row.id,cause:row.completionEventId,reason:'ESCORT_WITHDRAWN'})
    remember(world,row,id,e.id,at,{status:'failed',reason:'ESCORT_WITHDRAWN'});return [e]
  }
  if(command.kind==='join_escort') {
    meeting(world,id,row.courierId,context)
    check(row.status==='accepted'&&source.status==='accepted'&&at<row.deadlineAt&&!source.shipment.deliveredEventId,'NO_ESCORT_JOURNEY')
    check(context.present===true&&context.placeId===row.pickupPlaceId,'MISSED_ESCORT_RENDEZVOUS')
    check(validPoint(context.position),'MISSING_ROUTE_EVIDENCE')
    row.status='accompanying';row.lastSampleAt=at;row.lastGoodAt=at;row.lastPosition={...context.position}
    const e=emitFactionAction(world,command,context,'escort_joined',{escortId:row.id,targetId:row.courierId,cause:row.sourceEventId,proofId:context.proofId})
    row.joinedEventId=e.id
    for(const a of [id,row.courierId])remember(world,row,a,e.id,at,{status:'accompanying',assigneeId:id})
    return [e]
  }
  if(command.kind==='observe_escort') {
    const known=escortMemory(world,row.id,id)
    check(known&&['accepted','accompanying'].includes(known.status),'NO_ESCORT_JOURNEY')
    check(typeof context.proofId==='string'&&typeof context.together==='boolean','MISSING_ROUTE_EVIDENCE')
    check(row.lastSampleAt===null||at-row.lastSampleAt>=ESCORT_RULES.sampleMs,'ESCORT_SAMPLE_NOT_DUE')
    const prior=row.lastSampleAt,gap=row.lastGoodAt===null?0:at-row.lastGoodAt
    const missing=at>=row.deadlineAt?'DEADLINE_PASSED':known.status==='accompanying'&&gap>ESCORT_RULES.maxGapMs?'SEPARATED':
      context.courierDead===true?'COURIER_DOWN':null
    if(missing) {
      const e=active(row)?close(world,row,command,context,missing):emitFactionAction(world,command,context,'escort_outcome_seen',{escortId:row.id,cause:known.evidenceId,reason:missing,proofId:context.proofId})
      remember(world,row,id,e.id,at,{status:'failed',reason:missing});row.lastSampleAt=at;return [e]
    }
    check(known.status==='accompanying','ESCORT_NOT_JOINED')
    check(validPoint(context.position)&&(!context.together||context.courierDead!==true),'MISSING_ROUTE_EVIDENCE')
    let travelled=0
    if(context.together&&source.shipment.pickedUpEventId&&prior!==null) {
      travelled=distance(context.position,row.lastPosition)
      // A sample cannot attest a teleport or an unobserved long segment.
      check(travelled<=Math.max(1,(at-prior)/1000*4),'IMPLAUSIBLE_ESCORT_ROUTE')
      if(travelled>.05){row.travelMs+=at-prior;row.travelDistance+=travelled}
    }
    row.lastSampleAt=at;row.lastPosition={...context.position}
    if(context.together)row.lastGoodAt=at
    const e=emitFactionAction(world,command,context,'escort_route_seen',{escortId:row.id,cause:row.joinedEventId,together:context.together,travelled,position:{...context.position},proofId:context.proofId})
    return [e]
  }
  if(command.kind==='finish_escort') {
    const delivery=world.opportunities.events.find(e=>e.id===source.shipment.deliveredEventId&&e.kind==='stock_delivered')
    check(escortMemory(world,row.id,id)?.status==='accompanying'&&delivery&&context.together===true&&context.deliveryVisible===true&&
      typeof context.proofId==='string'&&context.present===true&&context.placeId===row.returnPlaceId,'ESCORT_DELIVERY_NOT_SEEN')
    if(row.status!=='accompanying'||delivery.at<row.lastGoodAt||delivery.at-row.lastGoodAt>ESCORT_RULES.maxGapMs||at-delivery.at>ESCORT_RULES.maxGapMs||
      row.travelMs<ESCORT_RULES.minTravelMs||row.travelDistance<ESCORT_RULES.minDistance) {
      const e=active(row)?close(world,row,command,context,'ESCORT_ROUTE_INCOMPLETE'):
        emitFactionAction(world,command,context,'escort_outcome_seen',{escortId:row.id,cause:delivery.id,reason:'ESCORT_ROUTE_INCOMPLETE',proofId:context.proofId})
      remember(world,row,id,e.id,at,{status:'failed',reason:'ESCORT_ROUTE_INCOMPLETE'});return [e]
    }
    row.status='delivered';row.deliveredEventId=delivery.id
    const e=emitFactionAction(world,command,context,'escort_arrived',{escortId:row.id,targetId:row.issuerId,cause:delivery.id,proofId:context.proofId})
    remember(world,row,id,e.id,at,{status:'delivered'})
    return [e]
  }
  check(command.kind==='collect_escort'&&row.status==='delivered','ESCORT_NOT_PAYABLE')
  meeting(world,id,row.issuerId,context)
  requireAvailableFunds(world.interactions,row.issuerId,row.amount,row.reservationId)
  const hold=world.interactions.reservations.find(h=>h.id===row.reservationId)
  check(hold&&['held','impaired'].includes(hold.status)&&hold.amount===row.amount&&hold.actorId===row.issuerId&&hold.sourceId===row.id,'RESERVATION_UNAVAILABLE')
  check(Number.isSafeInteger(actor(world,id).wallet+row.amount),'AMOUNT_OVERFLOW')
  releaseReservation(world.interactions,row.reservationId,'spent');actor(world,row.issuerId).wallet-=row.amount;actor(world,id).wallet+=row.amount
  const e=emitFactionAction(world,command,context,'escort_paid',{escortId:row.id,targetId:row.issuerId,cause:row.deliveredEventId,amount:row.amount,proofId:context.proofId})
  row.status='fulfilled';row.completionEventId=e.id
  for(const a of [id,row.issuerId])remember(world,row,a,e.id,at,{status:'fulfilled'})
  return [e]
}
