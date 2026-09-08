import { InventoryError } from './inventory.js'
import { availableWallet,reserveMoney,releaseReservation,requireAvailableFunds } from './reservations.js'
import { emitFactionAction } from './factionEvents.js'
import { roleHolders } from './factionRoles.js'
import { previewCombat } from './combat.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
const active=b=>['posted','waiting_funds','claim_due'].includes(b.status)
const treasury=world=>world.factions.entries.find(f=>f.kind==='law')
export const BOUNTY_AMOUNT_V1=5
function remember(world,actorId,bounty,sourceEventId,at) {
  if(world.factions.bountyKnowledge.some(k=>k.actorId===actorId&&k.bountyId===bounty.id))return
  world.factions.bountyKnowledge.push({actorId,bountyId:bounty.id,sourceEventId,at,postedEventId:bounty.postedEventId,issuerId:bounty.issuerId,
    subjectId:bounty.subjectId,amount:bounty.amount,postedAt:bounty.postedAt,placeId:bounty.placeId})
}
/** A later notice cannot qualify an earlier arrest for this offer. */
export function captureForBounty(world,row,claimantId=null) {
  return (world.continuity?.custodies??[]).find(c=>c.subjectId===row.subjectId&&(!claimantId||c.officerId===claimantId)&&
    world.continuity.events.some(e=>e.id===c.capturedEventId&&e.kind==='taken_into_custody'&&e.actorId===c.officerId&&e.targetId===row.subjectId&&
      e.at>=row.postedAt&&world.factions.bountyKnowledge.some(k=>k.actorId===c.officerId&&k.bountyId===row.id&&k.at<=e.at))&&
    c.caseIds.some(id=>world.crime.cases.some(crime=>crime.id===id&&crime.incidentId===row.incidentId&&crime.victimId===row.victimId)))
}
function fund(world,bounty,at) {
  const hold=world.interactions.reservations.find(r=>r.id===bounty.reservationId)
  requireAvailableFunds(world.interactions,bounty.issuerId,bounty.amount,bounty.reservationId)
  if(hold) {
    check(hold.sourceId===bounty.id&&hold.actorId===bounty.issuerId&&hold.amount===bounty.amount&&hold.status==='impaired','RESERVATION_UNAVAILABLE')
    hold.status='held';hold.reasonEventId=null
  } else reserveMoney(world.interactions,{id:bounty.reservationId,actorId:bounty.issuerId,amount:bounty.amount,sourceId:bounty.id,at})
  bounty.status='posted';bounty.reason=null
}
function atDesk(world,command,context) {
  check(context.present===true&&treasury(world).servicePlaceIds.includes(context.placeId)&&typeof context.proofId==='string','MISSING_NOTICE_EVIDENCE')
  check(roleHolders(world,'law','constable').includes(command.actorId),'NOT_AUTHORITY')
}
export function executeBounties(world,command,context) {
  if(command.kind==='enable_bounties') {
    check(!world.factions.bountyVersion,'BOUNTIES_ALREADY_ENABLED')
    world.factions.bountyVersion=1;world.factions.bountyKnowledge=[]
    return [emitFactionAction(world,command,context,'bounties_enabled')]
  }
  check(world.factions.bountyVersion===1,'BOUNTIES_DISABLED')
  if(command.kind==='read_bounties') {
    check(context.present===true&&treasury(world).servicePlaceIds.includes(context.placeId)&&typeof context.proofId==='string','MISSING_NOTICE_EVIDENCE')
    const rows=world.factions.bounties.filter(b=>b.postedEventId&&b.placeId===context.placeId&&!world.factions.bountyKnowledge.some(k=>k.actorId===command.actorId&&k.bountyId===b.id))
    check(rows.length>0,'NO_NEW_NOTICES')
    const event=emitFactionAction(world,command,context,'bounty_notices_read',{placeId:context.placeId,bountyIds:rows.map(b=>b.id),proofId:context.proofId})
    for(const bounty of rows)remember(world,command.actorId,bounty,event.id,context.at)
    return [event]
  }
  if(command.kind==='post_bounty') {
    atDesk(world,command,context)
    check(command.actorId===treasury(world).treasuryActorId,'NOT_TREASURER')
    const crime=world.crime.cases.find(c=>c.id===command.caseId&&c.authorityId===command.actorId&&!c.resolved&&c.subjectId!==null&&c.severity>=3)
    check(crime&&actor(world,crime.subjectId)?.health>0,'NO_BOUNTY_CASE')
    check(crime.factIds.some(id=>world.social.knowledge.some(k=>k.npcId===command.actorId&&k.factId===id&&k.subjectId===crime.subjectId)),'AUTHORITY_UNINFORMED')
    check(!world.factions.bounties.some(b=>b.incidentId===crime.incidentId&&b.victimId===crime.victimId),'BOUNTY_EXISTS')
    check(world.factions.bounties.length<4096,'HISTORY_FULL')
    const id=`bounty:${world.factions.bounties.length+1}`
    const row={id,issuerId:command.actorId,subjectId:crime.subjectId,caseId:crime.id,incidentId:crime.incidentId,victimId:crime.victimId,
      evidenceIds:[...crime.evidenceIds],amount:BOUNTY_AMOUNT_V1,reservationId:`hold:${id}`,placeId:context.placeId,status:'waiting_funds',reason:'FUNDS_UNAVAILABLE',
      sourceEventId:null,postedEventId:null,postedAt:null,completionEventId:null,claimantId:null,captureEventId:null}
    if(availableWallet(world.interactions,command.actorId)>=row.amount)fund(world,row,context.at)
    const event=emitFactionAction(world,command,context,row.status==='posted'?'bounty_posted':'bounty_waiting_funds',
      {targetId:row.subjectId,bountyId:row.id,caseId:crime.id,cause:crime.evidenceIds.at(-1),amount:row.amount,placeId:row.placeId,proofId:context.proofId})
    row.sourceEventId=event.id
    if(row.status==='posted'){row.postedEventId=event.id;row.postedAt=context.at;remember(world,command.actorId,row,event.id,context.at)}
    world.factions.bounties.push(row);return [event]
  }
  const row=world.factions.bounties.find(b=>b.id===command.bountyId)
  check(row&&active(row),'BOUNTY_NOT_OPEN')
  if(command.kind==='fund_bounty') {
    atDesk(world,command,context)
    check(row.issuerId===command.actorId&&row.status==='waiting_funds'&&context.placeId===row.placeId,'NOT_TREASURER')
    check(actor(world,row.subjectId)?.health>0&&!world.crime.cases.find(c=>c.id===row.caseId)?.resolved,'NO_BOUNTY_CASE')
    fund(world,row,context.at)
    const event=emitFactionAction(world,command,context,'bounty_posted',{bountyId:row.id,targetId:row.subjectId,cause:row.sourceEventId,amount:row.amount,placeId:row.placeId,proofId:context.proofId})
    if(!row.postedEventId){row.postedEventId=event.id;row.postedAt=context.at}
    remember(world,command.actorId,row,event.id,context.at);return [event]
  }
  check(command.kind==='claim_bounty'&&['posted','claim_due'].includes(row.status)&&command.actorId!==row.subjectId,'BOUNTY_NOT_PAYABLE')
  check(context.withinRange===true&&context.clear===true&&context.facing===true&&context.recipientId===row.issuerId&&typeof context.proofId==='string','MISSING_BOUNTY_MEETING')
  check(actor(world,row.issuerId)?.health>0&&world.factions.bountyKnowledge.some(k=>k.actorId===command.actorId&&k.bountyId===row.id),'BOUNTY_NOT_KNOWN')
  const custody=captureForBounty(world,row,command.actorId)
  const capture=world.continuity?.events.find(e=>e.id===command.captureEventId&&e.kind==='taken_into_custody'&&e.actorId===command.actorId&&e.targetId===row.subjectId)
  check(custody?.capturedEventId===command.captureEventId&&capture,'MISSING_CAPTURE_EVIDENCE')
  check([command.actorId,row.issuerId].every(id=>previewCombat(world.combat,world.interactions.actors,context.at).find(f=>f.id===id)?.phase==='idle'),'ACTOR_BUSY')
  const hold=world.interactions.reservations.find(r=>r.id===row.reservationId)
  check(hold&&['held','impaired'].includes(hold.status)&&hold.actorId===row.issuerId&&hold.sourceId===row.id&&hold.amount===row.amount,'RESERVATION_UNAVAILABLE')
  const amount=command.actorId===row.issuerId?0:row.amount
  requireAvailableFunds(world.interactions,row.issuerId,amount,row.reservationId)
  check(Number.isSafeInteger(actor(world,command.actorId).wallet+amount),'AMOUNT_OVERFLOW')
  releaseReservation(world.interactions,row.reservationId,amount?'spent':'released')
  actor(world,row.issuerId).wallet-=amount;actor(world,command.actorId).wallet+=amount
  const event=emitFactionAction(world,command,context,amount?'bounty_paid':'bounty_closed_by_issuer',
    {bountyId:row.id,targetId:row.issuerId,cause:capture.id,amount,proofId:context.proofId})
  row.status=amount?'paid':'closed';row.completionEventId=event.id;row.claimantId=command.actorId;row.captureEventId=capture.id
  return [event]
}
/** A support request carries the issuer's own funded offer, in that meeting. */
export function shareBountyTerms(world,issuerId,recipientId,factId,sourceEventId,at) {
  if(!world.factions?.bountyVersion)return
  for(const row of world.factions.bounties)if(row.issuerId===issuerId&&row.status==='posted'&&
    world.crime.cases.some(c=>c.id===row.caseId&&c.factIds.includes(factId)))remember(world,recipientId,row,sourceEventId,at)
}
export function reconcileBounties(world,sourceEvents,at,requestId) {
  if(!world.factions?.bountyVersion)return []
  const source=sourceEvents.findLast(e=>['died','robbed','loot_money','case_settled','case_resolution_learned','settle','taken_into_custody'].includes(e.kind))
  if(!source)return []
  const events=[]
  for(const row of world.factions.bounties.filter(active)) {
    const crime=world.crime.cases.find(c=>c.id===row.caseId),hold=world.interactions.reservations.find(r=>r.id===row.reservationId)
    const capture=row.postedEventId&&captureForBounty(world,row)
    // A completed arrest is a debt, even if processing later closes the case.
    if(capture) {
      if(row.status!=='claim_due')events.push(emitFactionAction(world,{id:requestId,actorId:row.issuerId,targetId:capture.officerId},{at},'bounty_claim_due',
        {bountyId:row.id,cause:capture.capturedEventId,amount:row.amount}))
      row.status='claim_due';row.claimantId=capture.officerId;row.captureEventId=capture.capturedEventId
      row.reason=actor(world,row.issuerId)?.health<=0?'ISSUER_DEAD':hold?.status==='impaired'?'FUNDS_UNAVAILABLE':null
      continue
    }
    const reason=actor(world,row.issuerId)?.health<=0?'ISSUER_DEAD':actor(world,row.subjectId)?.health<=0?'SUBJECT_DEAD':crime?.resolved?'CASE_RESOLVED':null
    if(reason) {
      if(hold&&['held','impaired'].includes(hold.status))releaseReservation(world.interactions,row.reservationId)
      row.status='cancelled';row.reason=reason
      const event=emitFactionAction(world,{id:requestId,actorId:row.issuerId,targetId:row.subjectId},{at},'bounty_cancelled',{bountyId:row.id,cause:source.id,reason})
      row.completionEventId=event.id;events.push(event)
    } else if(row.status==='posted'&&hold?.status==='impaired') {
      row.status='waiting_funds';row.reason='FUNDS_UNAVAILABLE'
      events.push(emitFactionAction(world,{id:requestId,actorId:row.issuerId,targetId:row.subjectId},{at},'bounty_waiting_funds',{bountyId:row.id,cause:source.id,amount:row.amount}))
    }
  }
  return events
}
