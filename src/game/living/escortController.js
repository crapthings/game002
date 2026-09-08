import { ESCORT_RULES,escortMemory,hasEscortAssignment,escortMeetingEligibility } from '../gameplay/escorts.js'
import { projectedNeeds } from '../gameplay/life.js'
import { availableWallet } from '../gameplay/reservations.js'
import { relationFor } from '../gameplay/relations.js'
export function createEscortController({state,clock,point,notice,contact,face,move,nearPlace,interrupt,send,talkingTo}) {
  let nextAcceptanceAt=0
  const person=(world,id)=>world.interactions.actors.find(a=>a.id===id)
  function meeting(a,b) {
    if(a!=='player')face(a,point(b))
    if(b!=='player'&&person(state(),b)?.health>0)face(b,point(a))
    return {allowed:true,at:clock(),withinRange:contact(a,b),clear:contact(a,b),facing:true,identified:true,
      meetingId:`escort-meeting:${a}:${b}:${clock()}`,proofId:`escort-meeting:${a}:${b}:${clock()}`}
  }
  function go(id,recipient,placeId,dt) {
    const place=state().places.definitions.find(p=>p.id===placeId)
    if(notice(id,recipient))move(id,{...point(recipient)},dt,1.3)
    else if(place)move(id,place.approach,dt,1.3)
    return 'busy'
  }
  return {
    observe() {
      const world=state(),at=clock()
      for(const k of world.factions?.escortKnowledge??[]) {
        if(k.assigneeId!==k.actorId||!['accepted','accompanying'].includes(k.status)||person(world,k.actorId)?.health<=0)continue
        const row=world.factions.escorts.find(r=>r.id===k.escortId),source=world.opportunities.entries.find(r=>r.id===row.opportunityId)
        const together=contact(k.actorId,k.courierId,ESCORT_RULES.radius),seen=notice(k.actorId,k.courierId)
        const proofId=`escort-observation:${k.actorId}:${at}`
        if(k.status==='accompanying'&&source.shipment.deliveredEventId&&together&&seen&&nearPlace(k.courierId,k.returnPlaceId)) {
          send('factions',{kind:'finish_escort',actorId:k.actorId,escortId:row.id},
            {together:true,deliveryVisible:true,present:true,placeId:k.returnPlaceId,proofId});return true
        }
        const courierDead=seen&&together&&person(world,k.courierId)?.health<=0
        if(k.status==='accepted'&&at<k.deadlineAt&&!courierDead)continue
        if(row.lastSampleAt!==null&&at-row.lastSampleAt<ESCORT_RULES.sampleMs)continue
        send('factions',{kind:'observe_escort',actorId:k.actorId,escortId:row.id},
          {together:together&&!courierDead,courierDead,position:together?{...point(k.courierId)}:row.lastPosition,proofId})
        return true
      }
      return false
    },
    updateNpc(id,dt) {
      const world=state(),at=clock(),life=world.life?.actors.find(a=>a.actorId===id)
      if(!world.factions?.escortsVersion||id===talkingTo()||!life?.intent||life.interruption?.priority>60)return false
      const k=world.factions.escortKnowledge.find(k=>k.actorId===id&&k.assigneeId===id&&['accepted','accompanying','delivered'].includes(k.status))
      if(k) {
        const row=world.factions.escorts.find(r=>r.id===k.escortId)
        if(k.status==='delivered') {
          // The debt is remembered; only a meeting reveals the current purse.
          if(!(notice(id,k.issuerId)&&contact(id,k.issuerId)))return false
          if(availableWallet(world.interactions,k.issuerId,row.reservationId)<row.amount)return false
          const context=meeting(id,k.issuerId)
          if(!escortMeetingEligibility(world,k.issuerId,id,context).available)return false
          send('factions',{kind:'collect_escort',actorId:id,escortId:row.id},context);return 'committed'
        }
        if(interrupt(id,'escort',60,k.evidenceId))return 'committed'
        if(k.status==='accompanying') {
          if(notice(id,k.courierId)){if(!contact(id,k.courierId,2.5))move(id,{...point(k.courierId)},dt,1.8);return 'busy'}
          // Lost sight: only the last position actually observed is usable.
          if(row.lastPosition)move(id,row.lastPosition,dt,1.3)
          return 'busy'
        }
        if(notice(id,k.courierId)&&contact(id,k.courierId)&&nearPlace(k.courierId,k.pickupPlaceId)) {
          const context=meeting(id,k.courierId)
          if(!escortMeetingEligibility(world,k.courierId,id,context).available)return 'busy'
          if(row.status!=='accepted') {send('factions',{kind:'cancel_escort',actorId:id,escortId:row.id});return 'committed'}
          send('factions',{kind:'join_escort',actorId:id,escortId:row.id},
            {...context,present:true,placeId:k.pickupPlaceId,position:{...point(k.courierId)}});return 'committed'
        }
        return go(id,k.courierId,k.pickupPlaceId,dt)
      }
      if(at<nextAcceptanceAt||life.interruption||life.intent.priority>10||life.assignment&&!life.assignment.outcomeEventId||hasEscortAssignment(world,id))return false
      const needs=projectedNeeds(life,at)
      if(person(world,id).health<70||needs.energy<50||needs.hunger>=60)return false
      const offered=world.factions.escortKnowledge.find(k=>k.actorId===k.issuerId&&k.status==='offered'&&at<k.deadlineAt&&
        ![k.issuerId,k.courierId].includes(id)&&notice(id,k.issuerId)&&contact(id,k.issuerId))
      if(!offered)return false
      const relation=relationFor(world,id,offered.issuerId),context=meeting(id,offered.issuerId)
      if(relation.trust<0||relation.fear>=25||!escortMeetingEligibility(world,offered.issuerId,id,context).available)return false
      const row=world.factions.escorts.find(r=>r.id===offered.escortId)
      // A stale request is clarified at this meeting, not used to redirect life.
      if(row.status!=='offered')return false
      nextAcceptanceAt=at+1000
      send('factions',{kind:escortMemory(world,row.id,id)?'accept_escort':'hear_escort',actorId:id,escortId:row.id},context)
      return 'committed'
    },
  }
}
