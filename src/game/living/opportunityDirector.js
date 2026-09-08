import { projectedNeeds } from '../gameplay/life.js'
import { meetingEligibility } from '../gameplay/dialogue.js'
import { opportunityQuote } from '../gameplay/opportunities.js'
import { prepareCommitment } from '../gameplay/commitments.js'
import { availableWallet } from '../gameplay/reservations.js'
import { distance } from './geometry.js'
import { relationFor } from '../gameplay/relations.js'
import { placeStatus } from '../gameplay/places.js'

/** People learn in physical meetings; route goals are known fixed places. */
export function createOpportunityDirector({state,clock,ids,point,notice,contact,face,move,interrupt,send,talkingTo,atPlace}) {
  let nextAcceptanceAt=0
  const scanDue=new Map(),invited=new Map()
  const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
  const life=(world,id)=>world.life?.actors.find(a=>a.actorId===id)
  const alive=(world,id)=>actor(world,id)?.health>0
  function meeting(a,b) {
    face(a,point(b));if(alive(state(),b))face(b,point(a))
    const present=contact(a,b)
    return {allowed:true,at:clock(),withinRange:present,clear:present,facing:true,
      identified:true,meetingId:`npc-meeting:${a}:${b}:${clock()}`,proofId:`npc-meeting:${a}:${b}:${clock()}`}
  }
  function idleForJob(world,id) {
    const row=life(world,id)
    if(id==='merchant'||id===talkingTo()||!row?.intent||row.interruption||row.assignment&&!row.assignment.outcomeEventId)return false
    const needs=projectedNeeds(row,clock())
    return actor(world,id).health>=70&&needs.energy>=50&&needs.hunger<60&&row.intent.priority<=10
  }
  function commit(world,kind,id,row,context,terms) {
    const result=prepareCommitment(world,{kind,actorId:id,opportunityId:row.id,terms},context)
    if(!result.ok||result.duplicate)return false
    const [first,...rest]=result.steps
    send(first.domain,first.command,first.context,false,rest);return 'committed'
  }
  function goTo(id,recipient,placeId,dt) {
    const visible=notice(id,recipient),place=state().places.definitions.find(p=>p.id===placeId)
    if(visible)move(id,{...point(recipient)},dt,1.3)
    else if(place)move(id,place.approach,dt,1.3)
    return 'busy'
  }
  return {
    updateNpc(id,dt) {
      const world=state(),at=clock(),personal=life(world,id)
      if(world.opportunities?.autonomyVersion!==1||!personal?.intent||id===talkingTo())return false
      const assignment=personal.assignment
      if(assignment&&!assignment.outcomeEventId) {
        const row=world.opportunities.entries.find(r=>r.id===assignment.opportunityId)
        if(!row)return false
        const returning=!!(row.message?.receiptEventId||row.shipment?.pickedUpEventId)
        if(!row.returnEventId&&at>=assignment.deadlineAt) {
          send('opportunities',{kind:'notice_outcome',actorId:id,opportunityId:row.id},{at,allowed:true});return 'committed'
        }
        // Once a return is recorded, a courier resumes life with the debt remembered.
        if(row.returnEventId&&!(notice(id,row.issuerId)&&contact(id,row.issuerId)))return false
        if(row.status!=='accepted') {
          // A remote cancellation/death does not become the courier's knowledge.
          const foundDead=[row.issuerId,row.targetActorId].find(other=>!alive(world,other)&&notice(id,other)&&contact(id,other))
          if(foundDead){send('opportunities',{kind:'notice_outcome',actorId:id,opportunityId:row.id},{...meeting(id,foundDead),deadActorId:foundDead});return 'committed'}
          if(row.status==='cancelled'&&notice(id,row.issuerId)&&contact(id,row.issuerId)) {
            const context=meeting(row.issuerId,id)
            if(meetingEligibility(world,row.issuerId,id,context).available){send('opportunities',{kind:'notice_outcome',actorId:id,opportunityId:row.id},context);return 'committed'}
          }
          if(interrupt(id,'contract',60,assignment.acceptedEventId))return 'committed'
          return goTo(id,returning?row.issuerId:row.targetActorId,returning?row.returnPlaceId:row.targetPlaceId,dt)
        }
        const recipient=returning?row.issuerId:row.targetActorId
        // A debt is remembered without reading the distant payer's pockets.
        if(row.returnEventId&&!(notice(id,recipient)&&contact(id,recipient)))return false
        if(notice(id,recipient)&&contact(id,recipient)) {
          const context=meeting(recipient,id)
          if(!meetingEligibility(world,recipient,id,context).available)return 'busy'
          if(row.returnEventId&&availableWallet(world.interactions,row.issuerId,row.rewardReservationId)<row.rewardAmount)return false
          if(interrupt(id,'contract',60,assignment.acceptedEventId))return 'committed'
          if(row.requirements.kind==='procurement') {
            context.placeId=returning?row.returnPlaceId:row.targetPlaceId;context.present=atPlace(recipient,context.placeId)
            if(!context.present)return 'busy'
            if(!returning&&!placeStatus(world,context.placeId,at).open)return 'busy'
            return commit(world,returning?'deliver_cargo':'pickup',id,row,context)
          }
          return commit(world,returning?'collect':'deliver',id,row,context)
        }
        if(interrupt(id,'contract',60,assignment.acceptedEventId))return 'committed'
        return goTo(id,recipient,returning?row.returnPlaceId:row.targetPlaceId,dt)
      }
      if(idleForJob(world,id)&&at>=nextAcceptanceAt) {
        const offered=world.opportunities.entries.filter(r=>r.status==='offered'&&at<r.deadlineAt&&r.knownBy.includes(id)&&!r.declinedBy.includes(id)&&r.issuerId!==id&&r.targetActorId!==id)
          .sort((a,b)=>a.deadlineAt-b.deadlineAt||a.id.localeCompare(b.id))
        for(const row of offered)if(notice(id,row.issuerId)&&contact(id,row.issuerId)) {
          const context=meeting(row.issuerId,id)
          if(!meetingEligibility(world,row.issuerId,id,context).available)continue
          const quote=opportunityQuote(world,row)
          if(row.requirements.kind==='procurement'&&availableWallet(world.interactions,row.issuerId)<row.purchaseBudget)continue
          const relation=relationFor(world,id,row.issuerId)
          if(relation.fear>=25||relation.trust<0||quote.unpaid&&relation.gratitude<10&&relation.trust<15)continue
          nextAcceptanceAt=at+1000;return commit(world,'accept',id,row,context,quote.unpaid?'unpaid':'paid')
        }
        // A shopkeeper asking for a hand is visible; the actual request is
        // disclosed only after approaching for a real conversation.
        const caller=world.opportunities.entries.find(r=>r.requirements.kind==='procurement'&&r.status==='offered'&&at<r.deadlineAt&&r.targetActorId!==id&&r.issuerId!==id&&!r.knownBy.includes(id)&&
          notice(id,r.issuerId)&&atPlace(r.issuerId,r.returnPlaceId)&&!life(world,r.issuerId)?.interruption)
        if(caller) {
          if(contact(id,caller.issuerId)) {
            const context=meeting(caller.issuerId,id)
            if(meetingEligibility(world,caller.issuerId,id,context).available){send('opportunities',{kind:'reveal',actorId:caller.issuerId,targetId:id,opportunityId:caller.id},context);return 'committed'}
          } else {move(id,{...point(caller.issuerId)},dt,1.3);return 'busy'}
        }
      }
      const own=world.opportunities.entries.find(r=>r.issuerId===id&&r.status==='offered'&&at<r.deadlineAt)
      if(!own||own.requirements.kind==='procurement'||personal.intent.priority>=40||personal.interruption&&personal.interruption.kind!=='seek_help')return false
      if(interrupt(id,'seek_help',40,own.offeredEventId))return 'committed'
      if(at>=(scanDue.get(id)??0)) {
        scanDue.set(id,at+1000)
        // Consider only people actually noticed here; occupied people can keep working.
        invited.set(id,ids().filter(other=>other!=='player'&&other!==id&&other!==own.targetActorId&&alive(world,other)&&other!==talkingTo()&&!own.declinedBy.includes(other)&&notice(id,other)&&idleForJob(world,other))
          .sort((a,b)=>distance(point(id),point(a))-distance(point(id),point(b))||a.localeCompare(b)))
      }
      const candidates=invited.get(id)??[]
      for(const other of candidates) {
        if(!alive(world,other)||!notice(id,other)||!idleForJob(world,other))continue
        if(!contact(id,other)){move(id,{...point(other)},dt,1.3);return 'busy'}
        const context=meeting(id,other)
        if(!meetingEligibility(world,id,other,context).available)continue
        if(!own.knownBy.includes(other)){send('opportunities',{kind:'reveal',actorId:id,targetId:other,opportunityId:own.id},context);return 'committed'}
        // Already told: allow this person to decide on its own turn.
        if(idleForJob(world,other))return 'busy'
      }
      const market=world.places.definitions.find(p=>p.id==='place.market-neighbor')
      if(market)move(id,market.approach,dt,1.3)
      return 'busy'
    },
  }
}
