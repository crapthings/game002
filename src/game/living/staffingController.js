import { staffWilling } from '../gameplay/staffing.js'
import { CONTINUITY_V1 as rules } from '../gameplay/content/continuityV1.js'
export function createStaffingController({state,clock,notice,contact,atPlace,send,talkingTo}) {
  let due=0
  return {update() {
    const world=state(),at=clock()
    if(!world.continuity||at<due)return false
    due=at+1000
    const rows=world.continuity.staff,actor=id=>world.interactions.actors.find(a=>a.id===id)
    for(const row of rows) {
      if(row.status!=='ended'&&actor(row.businessActorId)?.health>=rules.returnToWorkAt&&atPlace(row.businessActorId,row.placeId)&&
        !world.life.actors.find(a=>a.actorId===row.businessActorId)?.interruption) {
        send('continuity',{kind:'return_operator',actorId:row.businessActorId,staffId:row.id},{present:true,placeId:row.placeId,
          workerPresent:actor(row.workerId)?.health>0&&notice(row.workerId,row.businessActorId)&&contact(row.workerId,row.businessActorId),proofId:`staff-return:${at}`});return true
      }
      if(actor(row.workerId)?.health<=0)continue
      if(row.status==='travelling'&&atPlace(row.workerId,row.placeId)) {
        send('continuity',{kind:'arrive_staff',actorId:row.workerId,staffId:row.id},{present:true,placeId:row.placeId,proofId:`staff-arrival:${at}`});return true
      }
      if(row.status==='ended'&&world.continuity.staffKnowledge.some(k=>k.staffId===row.id&&k.status!=='ended')&&atPlace(row.workerId,row.placeId)) {
        send('continuity',{kind:'read_staff_notice',actorId:row.workerId,staffId:row.id},{present:true,placeId:row.placeId,proofId:`staff-notice:${at}`});return true
      }
    }
    for(const q of world.continuity.staffQualifications)if(q.actorId!==talkingTo()&&staffWilling(world,q.actorId,at)&&
      actor(q.businessActorId)?.health<rules.injuredBelow&&notice(q.actorId,q.businessActorId)&&contact(q.actorId,q.businessActorId,12)&&
      !rows.some(r=>r.businessActorId===q.businessActorId&&r.status!=='ended')) {
      send('continuity',{kind:'accept_staff',actorId:q.actorId},{observed:true,observedActorId:q.businessActorId,withinRange:true,clear:true,proofId:`staff-observation:${at}`});return true
    }
    return false
  }}
}
