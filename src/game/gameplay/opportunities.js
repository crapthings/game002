import { InventoryError } from './inventory.js'
import { meetingEligibility } from './dialogue.js'
import { availableWallet,reserveMoney,releaseReservation,reconcileReservations,requireAvailableFunds } from './reservations.js'
import { SHI_MESSAGE_V1 } from './content/opportunityTemplatesV1.js'
import { personalOpportunity,sameKnownProgress } from './opportunityKnowledge.js'
import { offerProcurement,executeProcurement } from './procurement.js'

const copy=value=>structuredClone(value)
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const active=row=>['offered','accepted'].includes(row.status)
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
const alive=(world,id)=>actor(world,id)?.health>0
const lookup=(world,id)=>world.opportunities.entries.find(row=>row.id===id)
function emit(world,kind,actorId,targetId,at,requestId,extra={}) {
  check(world.opportunities.events.length<4096,'HISTORY_FULL')
  const event={id:`opportunity:${world.opportunities.events.length+1}`,kind,actorId,targetId,at,cause:null,requestId,...extra}
  world.opportunities.events.push(event);return copy(event)
}
function meeting(world,speakerId,listenerId,context) {
  const eligible=meetingEligibility(world,speakerId,listenerId,context)
  check(eligible.available,eligible.reason)
  check(typeof context.meetingId==='string'&&context.meetingId.length>0&&typeof context.proofId==='string'&&context.proofId.length>0,'MISSING_MEETING_EVIDENCE')
}
function releaseReward(world,row) {
  if(row.rewardReservationId)releaseReservation(world.interactions,row.rewardReservationId)
  const purchase=world.interactions.reservations.find(r=>r.id===row.purchaseReservationId)
  if(purchase&&['held','impaired'].includes(purchase.status))releaseReservation(world.interactions,purchase.id)
  for(const reservation of world.interactions.itemReservations??[])if(reservation.sourceId===row.id&&['held','impaired'].includes(reservation.status))releaseReservation(world.interactions,reservation.id)
}
function assignmentFor(world,row) {return world.life?.actors.find(a=>a.actorId===row.assigneeId)?.assignment}
function rememberAssignment(world,row,eventId) {
  if(world.opportunities.autonomyVersion!==1||row.assigneeId==='player')return
  const life=world.life.actors.find(a=>a.actorId===row.assigneeId)
  check(life&&(!life.assignment||life.assignment.outcomeEventId),'NPC_ALREADY_ASSIGNED')
  life.assignment={opportunityId:row.id,acceptedEventId:eventId,deadlineAt:row.deadlineAt,outcomeEventId:null}
}
function closeKnownAssignment(world,row,eventId) {
  const assignment=assignmentFor(world,row)
  if(assignment?.opportunityId===row.id)assignment.outcomeEventId=eventId
}
function finish(world,row,status,reason,at,requestId,cause=null,initiatorId=row.issuerId) {
  releaseReward(world,row)
  row.status=status;row.reason=reason;row.fundsBlocked=false
  const event=emit(world,`opportunity_${status}`,initiatorId,initiatorId===row.issuerId?row.assigneeId:row.issuerId,at,requestId,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause: cause??row.offeredEventId,reason})
  if(row.shipment?.pickedUpEventId&&!row.shipment.deliveredEventId)row.restitution={ownerId:row.issuerId,carrierId:row.assigneeId,sourceEventId:event.id,returnedEventId:null}
  row.completionEventId=event.id;return event
}
export function opportunityQuote(world,row) {
  const budget=availableWallet(world.interactions,row.issuerId)-(row.requirements.kind==='procurement'?row.purchaseBudget:0)
  return {amount:budget>=row.proposedReward?row.proposedReward:0,unpaid:budget<row.proposedReward}
}
export function knownOpportunities(world,actorId,at,meetingSpeakerId=null) {
  return (world.opportunities?.entries??[]).filter(row=>row.knownBy.includes(actorId)).map(row=>{
    const known=personalOpportunity(world,row,actorId,at),status=known.status==='declined'?'offered':known.status
    const delivered=known.assigneeId===actorId&&['return','payment','ended'].includes(known.stage)
    const local=meetingSpeakerId===row.issuerId
    return {...copy(row),status,assigneeId:known.assigneeId,rewardAmount:known.amount,
      reason:known.reason,fundsBlocked:known.stage==='payment',completionEventId:known.stage==='ended'?known.evidenceId:null,
      returnEventId:known.stage==='payment'||known.status==='fulfilled'?known.evidenceId:null,
      message:row.message?{...copy(row.message),deliveredEventId:delivered?row.message.deliveredEventId:null,receiptEventId:delivered?row.message.receiptEventId:null}:null,
      shipment:row.shipment?{...copy(row.shipment),pickedUpEventId:delivered?row.shipment.pickedUpEventId:null,deliveredEventId:known.stage==='payment'||known.status==='fulfilled'?row.shipment.deliveredEventId:null}:null,
      expired:status==='expired',paymentAvailable:local&&status==='accepted'&&availableWallet(world.interactions,row.issuerId,row.rewardReservationId)>=known.amount,
      purchaseFunded:row.requirements.kind!=='procurement'||local&&availableWallet(world.interactions,row.issuerId)>=row.purchaseBudget,
      quote:status==='offered'&&local?opportunityQuote(world,row):{amount:known.amount,unpaid:known.amount===0}}
  })
}
export function executeOpportunities(world,command,context,catalog) {
  check(world.version===2&&context.allowed===true,'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0&&Number.isSafeInteger(context.at+360000),'INVALID_TIME')
  if(command.kind==='initialize') {
    check(!world.opportunities&&world.dialogue,'OPPORTUNITIES_ALREADY_INITIALIZED')
    world.interactions.reservations??=[];world.interactions.itemReservations??=[]
    const needs=alive(world,SHI_MESSAGE_V1.issuerId)&&alive(world,SHI_MESSAGE_V1.targetActorId)?[{id:SHI_MESSAGE_V1.needId,templateId:SHI_MESSAGE_V1.id,issuerId:SHI_MESSAGE_V1.issuerId,targetActorId:SHI_MESSAGE_V1.targetActorId,source:SHI_MESSAGE_V1.source}]:[]
    world.opportunities={version:1,needs,entries:[],events:[]}
    return [emit(world,'opportunities_initialized',command.actorId,null,context.at,command.id,{declaredNeedIds:needs.map(n=>n.id)})]
  }
  check(world.opportunities,'OPPORTUNITIES_NOT_READY')
  if(command.kind==='enable_autonomy') {
    check(!world.opportunities.autonomyVersion,'AUTONOMY_ALREADY_ENABLED')
    world.opportunities.autonomyVersion=1
    for(const row of world.opportunities.entries)if(row.status==='accepted'&&row.assigneeId!=='player') {
      const accepted=world.opportunities.events.find(e=>e.kind==='opportunity_accepted'&&e.opportunityId===row.id)
      check(accepted,'MISSING_ACCEPTANCE');rememberAssignment(world,row,accepted.id)
    }
    return [emit(world,'opportunity_autonomy_enabled',command.actorId,null,context.at,command.id)]
  }
  if(command.kind==='offer') {
    const need=[...world.opportunities.needs,...(world.economy?.needs??[])].find(n=>n.id===command.needId)
    check(need&&[SHI_MESSAGE_V1.id,'merchant-restock-v1'].includes(need.templateId)&&need.issuerId===command.actorId,'UNKNOWN_NEED')
    check(!world.opportunities.entries.some(row=>row.rootCauseId===need.id&&row.templateId===need.templateId),'NEED_ALREADY_OFFERED')
    check(alive(world,command.actorId)&&alive(world,need.targetActorId),'ACTOR_DEAD')
    check(world.opportunities.entries.length<4096&&world.opportunities.entries.filter(active).length<8&&world.opportunities.entries.filter(r=>active(r)&&r.issuerId===command.actorId).length<2,'OPPORTUNITY_LIMIT')
    if(need.templateId==='merchant-restock-v1')return offerProcurement(world,need,command,context,{emit})
    const template=SHI_MESSAGE_V1,id=`op:${world.opportunities.entries.length+1}`
    const event=emit(world,'opportunity_offered',command.actorId,null,context.at,command.id,{opportunityId:id,rootCauseId:need.id,cause:world.opportunities.events[0].id})
    const targetPlaceId=world.places.bindings.find(b=>b.actorId===template.targetActorId)?.workPlaceId
    const returnPlaceId=world.places.bindings.find(b=>b.actorId===command.actorId)?.homePlaceId
    check(targetPlaceId&&returnPlaceId,'PLACE_BINDING_MISSING')
    world.opportunities.entries.push({id,templateId:template.id,title:template.title,issuerId:command.actorId,rootCauseId:need.id,
      offeredEventId:event.id,targetActorId:template.targetActorId,targetPlaceId,returnPlaceId,
      requirements:{kind:'message_roundtrip',messageId:`message:${id}`},proposedReward:template.reward,rewardAmount:null,rewardReservationId:null,
      deadlineAt:context.at+template.durationMs,status:'offered',assigneeId:null,acceptedAt:null,identifiedAssignee:false,
      completionEventId:null,reason:null,fundsBlocked:false,knownBy:[command.actorId],declinedBy:[],
      message:{id:`message:${id}`,senderId:command.actorId,recipientId:template.targetActorId,contentType:template.contentType,deliveredEventId:null,receiptEventId:null}})
    return [event]
  }
  const row=lookup(world,command.opportunityId)
  check(row,'UNKNOWN_OPPORTUNITY')
  if(['pickup_cargo','deliver_cargo','return_cargo'].includes(command.kind)) {
    check(row.requirements.kind==='procurement','INVALID_COMMAND')
    return executeProcurement(world,catalog,row,command,context,{emit,finish,meeting,closeKnownAssignment})
  }
  if(command.kind==='tell_status') {
    check(command.actorId===row.issuerId&&row.knownBy.includes(command.targetId),'OFFER_NOT_KNOWN')
    meeting(world,command.actorId,command.targetId,context)
    const knownState=personalOpportunity(world,row,command.actorId,context.at)
    check(!sameKnownProgress(knownState,personalOpportunity(world,row,command.targetId,context.at)),'ALREADY_KNOWN')
    return [emit(world,'opportunity_status_told',command.actorId,command.targetId,context.at,command.id,
      {opportunityId:row.id,rootCauseId:row.rootCauseId,cause:knownState.evidenceId,knownState,proofId:context.proofId})]
  }
  if(command.kind==='notice_outcome') {
    const assignment=assignmentFor(world,row)
    check(world.opportunities.autonomyVersion===1&&row.assigneeId===command.actorId&&assignment?.opportunityId===row.id&&!assignment.outcomeEventId,'NO_CHANGE')
    check(alive(world,command.actorId),'ACTOR_DEAD')
    const deadlineKnown=!row.returnEventId&&context.at>=assignment.deadlineAt
    if(!deadlineKnown) {
      check(!active(row),'OPPORTUNITY_NOT_FINISHED')
      if(context.deadActorId) {
        check([row.issuerId,row.targetActorId].includes(context.deadActorId)&&actor(world,context.deadActorId)?.health===0&&context.withinRange===true&&context.clear===true&&context.facing===true&&typeof context.proofId==='string','MISSING_OUTCOME_EVIDENCE')
      } else {
        check(row.status==='cancelled','MISSING_OUTCOME_EVIDENCE')
        meeting(world,row.issuerId,command.actorId,context)
      }
    }
    const event=emit(world,'opportunity_outcome_learned',command.actorId,row.issuerId,context.at,command.id,
      {opportunityId:row.id,rootCauseId:row.rootCauseId,cause:deadlineKnown?assignment.acceptedEventId:row.completionEventId,reason:deadlineKnown?'DEADLINE_PASSED':row.reason,proofId:context.proofId??null})
    closeKnownAssignment(world,row,event.id);return [event]
  }
  check(active(row),'OPPORTUNITY_FINISHED')
  if(command.kind==='expire') {
    check(command.actorId===row.issuerId&&context.at>=row.deadlineAt&&!row.returnEventId,'NOT_DUE')
    return [finish(world,row,'expired','DEADLINE_PASSED',context.at,command.id)]
  }
  check(context.at<row.deadlineAt||row.returnEventId&&['collect_reward','cancel'].includes(command.kind),'OPPORTUNITY_EXPIRED')
  check(alive(world,row.issuerId)&&(row.message?.deliveredEventId||row.shipment?.pickedUpEventId||alive(world,row.targetActorId)),'ACTOR_DEAD')
  if(command.kind==='reveal') {
    check(command.actorId===row.issuerId&&!row.knownBy.includes(command.targetId),'ALREADY_KNOWN')
    meeting(world,command.actorId,command.targetId,context)
    row.knownBy.push(command.targetId)
    const event=emit(world,'opportunity_disclosed',command.actorId,command.targetId,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.offeredEventId,proofId:context.proofId})
    for(const placeId of [row.targetPlaceId,row.returnPlaceId])if(!world.dialogue.addresses.some(a=>a.listenerId===command.targetId&&a.placeId===placeId))
      world.dialogue.addresses.push({listenerId:command.targetId,speakerId:command.actorId,placeId,at:context.at,eventId:event.id})
    return [event]
  }
  if(command.kind==='accept') {
    check(row.status==='offered'&&command.actorId!==row.issuerId&&command.actorId!==row.targetActorId,'OPPORTUNITY_TAKEN')
    check(row.knownBy.includes(command.actorId)&&!row.declinedBy.includes(command.actorId),'OFFER_NOT_KNOWN')
    meeting(world,row.issuerId,command.actorId,context)
    check(['paid','unpaid'].includes(command.terms)&&typeof context.identified==='boolean','INVALID_TERMS')
    const amount=command.terms==='paid'?row.proposedReward:0
    if(amount) {
      check(opportunityQuote(world,row).amount===amount,'UNPAID_CONFIRMATION_REQUIRED')
      row.rewardReservationId=`reserve:${row.id}:reward`
      reserveMoney(world.interactions,{id:row.rewardReservationId,actorId:row.issuerId,amount,sourceId:row.id,at:context.at})
    }
    if(row.requirements.kind==='procurement') {
      row.purchaseReservationId=`reserve:${row.id}:purchase`
      reserveMoney(world.interactions,{id:row.purchaseReservationId,actorId:row.issuerId,amount:row.purchaseBudget,sourceId:row.id,at:context.at})
    }
    row.status='accepted';row.assigneeId=command.actorId;row.acceptedAt=context.at;row.rewardAmount=amount;row.identifiedAssignee=context.identified
    const event=emit(world,'opportunity_accepted',command.actorId,row.issuerId,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.offeredEventId,amount,reservationId:row.rewardReservationId,proofId:context.proofId,identified:context.identified})
    rememberAssignment(world,row,event.id);return [event]
  }
  if(command.kind==='decline') {
    check(row.status==='offered'&&row.knownBy.includes(command.actorId)&&!row.declinedBy.includes(command.actorId),'NO_CHANGE')
    meeting(world,row.issuerId,command.actorId,context)
    row.declinedBy.push(command.actorId)
    return [emit(world,'opportunity_declined',command.actorId,row.issuerId,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.offeredEventId,proofId:context.proofId})]
  }
  if(command.kind==='cancel') {
    check(command.actorId===row.issuerId||command.actorId===row.assigneeId,'NOT_CONTRACT_PARTY')
    const event=finish(world,row,'cancelled','CANCELLED_BY_PARTY',context.at,command.id,null,command.actorId)
    if(command.actorId===row.assigneeId)closeKnownAssignment(world,row,event.id)
    return [event]
  }
  if(command.kind==='deliver_message') {
    check(row.status==='accepted'&&row.assigneeId===command.actorId,'NOT_ASSIGNEE')
    check(row.requirements.kind==='message_roundtrip'&&!row.message.deliveredEventId,'MESSAGE_ALREADY_DELIVERED')
    meeting(world,row.targetActorId,command.actorId,context)
    check(typeof context.identified==='boolean','MISSING_OBSERVATION')
    const delivered=emit(world,'message_delivered',command.actorId,row.targetActorId,context.at,command.id,
      {opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.offeredEventId,messageId:row.message.id,contentType:row.message.contentType,proofId:context.proofId,identified:context.identified})
    const reply=emit(world,'message_acknowledged',row.targetActorId,command.actorId,context.at,command.id,
      {opportunityId:row.id,rootCauseId:row.rootCauseId,cause:delivered.id,messageId:row.message.id,contentType:'received_visit_request',proofId:context.proofId,identified:true})
    row.message.deliveredEventId=delivered.id;row.message.receiptEventId=reply.id
    if(!row.knownBy.includes(row.targetActorId))row.knownBy.push(row.targetActorId)
    return [delivered,reply]
  }
  if(command.kind==='collect_reward') {
    check(row.status==='accepted'&&row.assigneeId===command.actorId&&row.message?.receiptEventId,'DELIVERY_NOT_COMPLETE')
    meeting(world,row.issuerId,command.actorId,context)
    check(typeof context.identified==='boolean','MISSING_OBSERVATION')
    if(availableWallet(world.interactions,row.issuerId,row.rewardReservationId)<row.rewardAmount) {
      check(!row.returnEventId,'PAYMENT_PENDING')
      const event=emit(world,'opportunity_payment_due',row.issuerId,command.actorId,context.at,command.id,
        {opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.message.receiptEventId,amount:row.rewardAmount,proofId:context.proofId})
      row.returnEventId=event.id;row.fundsBlocked=true;row.reason='AWAITING_PAYMENT'
      return [event]
    }
    requireAvailableFunds(world.interactions,row.issuerId,row.rewardAmount,row.rewardReservationId)
    if(row.rewardAmount>0) {
      const reservation=world.interactions.reservations.find(r=>r.id===row.rewardReservationId)
      check(reservation&&reservation.actorId===row.issuerId&&reservation.sourceId===row.id&&reservation.amount===row.rewardAmount,'RESERVATION_UNAVAILABLE')
      check(Number.isSafeInteger(actor(world,command.actorId).wallet+row.rewardAmount),'AMOUNT_OVERFLOW')
      releaseReservation(world.interactions,row.rewardReservationId,'spent')
      actor(world,row.issuerId).wallet-=row.rewardAmount;actor(world,command.actorId).wallet+=row.rewardAmount
    }
    const event=emit(world,'opportunity_fulfilled',command.actorId,row.issuerId,context.at,command.id,
      {opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.returnEventId??row.message.receiptEventId,amount:row.rewardAmount,
        reservationId:row.rewardReservationId,proofId:context.proofId,identified:row.identifiedAssignee&&context.identified})
    row.status='fulfilled';row.completionEventId=event.id;row.returnEventId=event.id;row.fundsBlocked=false;row.reason=null
    closeKnownAssignment(world,row,event.id)
    return [event]
  }
  throw new InventoryError('INVALID_COMMAND')
}

/** Runs after actual force/death results, in the same world transaction. */
export function applyOpportunityConsequences(world,sourceEvents,at,requestId) {
  if(!world.opportunities)return []
  const cause=sourceEvents.findLast(e=>['died','robbed','loot_money','loot_item'].includes(e.kind))?.id
  if(!cause)return []
  const events=[],losses=reconcileReservations(world.interactions,cause)
  for(const row of world.opportunities.entries.filter(active)) {
    const reason=!alive(world,row.issuerId)?'ISSUER_DEAD':!row.message?.deliveredEventId&&!row.shipment?.pickedUpEventId&&!alive(world,row.targetActorId)?'RECIPIENT_DEAD':row.assigneeId&&!alive(world,row.assigneeId)?'ASSIGNEE_DEAD':null
    if(reason){events.push(finish(world,row,'failed',reason,at,requestId,cause));continue}
    const loss=losses.find(loss=>loss.sourceId===row.id)
    if(loss?.reason==='CARGO_UNAVAILABLE'){events.push(finish(world,row,'failed','CARGO_UNAVAILABLE',at,requestId,cause));continue}
    if(loss) {
      row.fundsBlocked=true;row.reason='FUNDS_UNAVAILABLE'
      events.push(emit(world,'opportunity_funds_lost',row.issuerId,row.assigneeId,at,requestId,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause,reason:row.reason}))
    }
  }
  return events
}
