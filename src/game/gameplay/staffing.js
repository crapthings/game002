import { InventoryError } from './inventory.js'
import { previewCombat } from './combat.js'
import { projectedNeeds } from './life.js'
import { relationFor } from './relations.js'
import { hasEscortAssignment } from './escorts.js'
import { emitContinuity } from './continuity.js'
import { CONTINUITY_V1 as rules } from './content/continuityV1.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(w,id)=>w.interactions.actors.find(a=>a.id===id)
export function activeStaff(world,businessActorId) {return world.continuity?.staff.findLast(r=>r.businessActorId===businessActorId&&r.status==='active')??null}
export function authorizedOperator(world,entry) {
  const staff=entry&&activeStaff(world,entry.businessActorId)
  return !!staff&&staff.workerId===entry.operatorId&&staff.placeId===entry.placeId&&actor(world,staff.workerId)?.health>0
}
export function laborPlace(world,job) {return activeStaff(world,job.employerId)?.workerId===job.workerId?activeStaff(world,job.employerId).placeId:job.placeId}
export function rememberedStaffPlace(world,workerId) {
  const k=world.continuity?.staffKnowledge.findLast(r=>r.workerId===workerId&&['accepted','active'].includes(r.status))
  return k?world.continuity.staff.find(r=>r.id===k.staffId)?.placeId:null
}
function remember(world,row,status,eventId,at) {
  let k=world.continuity.staffKnowledge.find(k=>k.staffId===row.id&&k.workerId===row.workerId)
  if(!k){k={staffId:row.id,workerId:row.workerId};world.continuity.staffKnowledge.push(k)}
  Object.assign(k,{status,eventId,at})
}
export function staffWilling(world,id,at) {
  const p=actor(world,id),life=world.life.actors.find(a=>a.actorId===id),q=world.continuity?.staffQualifications.find(q=>q.actorId===id)
  if(!q||!life?.intent||p?.health<rules.returnToWorkAt||life.interruption||life.assignment&&!life.assignment.outcomeEventId||hasEscortAssignment(world,id))return false
  const needs=projectedNeeds(life,at),tie=relationFor(world,id,q.businessActorId)
  return needs.hunger<60&&needs.energy>=50&&tie.trust>=0&&tie.fear<25&&previewCombat(world.combat,world.interactions.actors,at).find(f=>f.id===id)?.phase==='idle'
}
export function executeStaffing(world,command,context) {
  check(world.continuity&&context.allowed===true&&actor(world,command.actorId)?.health>0&&Number.isSafeInteger(context.at)&&context.at>=0,'STAFF_NOT_READY')
  const id=command.actorId,at=context.at,entry=world.places.entries.find(e=>e.placeId===rules.shopPlaceId)
  if(command.kind==='accept_staff') {
    const q=world.continuity.staffQualifications.find(q=>q.actorId===id)
    check(q&&staffWilling(world,id,at),'NO_WILLING_QUALIFIED_STAFF')
    check(context.observed===true&&context.observedActorId===q.businessActorId&&context.withinRange===true&&context.clear===true&&typeof context.proofId==='string','MISSING_STAFF_OBSERVATION')
    check(actor(world,q.businessActorId).health<rules.injuredBelow,'OWNER_CAN_WORK')
    check(!world.continuity.staff.some(r=>r.businessActorId===q.businessActorId&&r.status!=='ended'),'STAFF_ALREADY_ASSIGNED')
    check(world.continuity.staff.length<4096,'HISTORY_FULL')
    const row={id:`staff:${world.continuity.staff.length+1}`,workerId:id,businessActorId:q.businessActorId,placeId:q.placeId,
      status:'travelling',sourceEventId:q.sourceEventId,acceptedEventId:null,arrivedEventId:null,endedEventId:null}
    const e=emitContinuity(world,command,context,'staff_accepted',{staffId:row.id,targetId:row.businessActorId,placeId:row.placeId,cause:q.sourceEventId,
      observedCondition:actor(world,q.businessActorId).health===0?'dead':'injured',proofId:context.proofId})
    row.acceptedEventId=e.id;world.continuity.staff.push(row);remember(world,row,'accepted',e.id,at)
    entry.businessActorId=row.businessActorId;entry.operatorId=id;entry.status='away';entry.reasonEventId=e.id;entry.presenceAt=null
    return [e]
  }
  const row=world.continuity.staff.find(r=>r.id===command.staffId)
  check(row,'UNKNOWN_STAFF_ASSIGNMENT')
  if(command.kind==='read_staff_notice') {
    check(id===row.workerId&&row.status==='ended'&&world.continuity.staffKnowledge.some(k=>k.staffId===row.id&&k.status!=='ended'),'NO_NEW_STAFF_NOTICE')
    check(context.present===true&&context.placeId===row.placeId&&typeof context.proofId==='string','MISSING_STAFF_OBSERVATION')
    const e=emitContinuity(world,command,context,'staff_handover_read',{staffId:row.id,cause:row.endedEventId,placeId:row.placeId,proofId:context.proofId})
    remember(world,row,'ended',e.id,at);return [e]
  }
  if(command.kind==='arrive_staff') {
    check(id===row.workerId&&row.status==='travelling'&&entry.operatorId===id,'NOT_ASSIGNED_STAFF')
    check(context.present===true&&context.placeId===row.placeId&&typeof context.proofId==='string','MISSING_STAFF_OBSERVATION')
    const e=emitContinuity(world,command,context,'staff_arrived',{staffId:row.id,targetId:row.businessActorId,cause:row.acceptedEventId,placeId:row.placeId,proofId:context.proofId})
    row.status='active';row.arrivedEventId=e.id;remember(world,row,'active',e.id,at);return [e]
  }
  check(command.kind==='return_operator'&&id===row.businessActorId&&row.status!=='ended','NOT_BUSINESS_OWNER')
  check(actor(world,id).health>=rules.returnToWorkAt&&context.present===true&&context.placeId===row.placeId&&typeof context.proofId==='string','OWNER_NOT_READY')
  const life=world.life.actors.find(r=>r.actorId===id)
  check(!life.interruption&&previewCombat(world.combat,world.interactions.actors,at).find(f=>f.id===id)?.phase==='idle','OWNER_NOT_READY')
  const e=emitContinuity(world,command,context,'operator_returned',{staffId:row.id,targetId:row.workerId,cause:row.acceptedEventId,placeId:row.placeId,proofId:context.proofId})
  row.status='ended';row.endedEventId=e.id
  entry.operatorId=id;entry.status='unassessed';entry.reasonEventId=e.id;entry.presenceAt=null
  if(context.workerPresent===true)remember(world,row,'ended',e.id,at)
  return [e]
}
