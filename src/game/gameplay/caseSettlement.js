import { InventoryError,transferLot } from './inventory.js'
import { requireAvailableFunds,requireAvailableLot } from './reservations.js'
import { roleHolders } from './factionRoles.js'
import { emitFactionAction } from './factionEvents.js'
import { previewCombat,COMBAT_RULES } from './combat.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
const natural=n=>Number.isSafeInteger(n)&&n>=0
export function resolvedSeverity(world,incidentId,victimId) {
  return (world.factions?.resolutions??[]).filter(r=>r.incidentId===incidentId&&r.victimId===victimId).reduce((n,r)=>Math.max(n,r.severity),0)
}
export function caseSettlementQuote(world,authorityId,subjectId,caseId) {
  const denied=reason=>({available:false,reason,caseId})
  if(!world.factions?.actionsVersion||!roleHolders(world,'law','constable').includes(authorityId))return denied('NO_AVAILABLE_OFFICER')
  const row=world.crime.cases.find(c=>c.id===caseId&&c.authorityId===authorityId&&c.subjectId===subjectId&&!c.resolved)
  if(!row)return denied('NO_NAMED_CASE')
  if(row.severity>=3)return denied('CUSTODY_REQUIRED')
  const facts=row.factIds.map(id=>world.social.facts.find(f=>f.id===id))
  if(facts.some(f=>!f||!world.social.knowledge.some(k=>k.npcId===authorityId&&k.factId===f.id&&k.subjectId===subjectId)))return denied('AUTHORITY_UNINFORMED')
  const sources=[...world.village.events,...world.combat.events,...world.robbery.events,...world.property.events]
  const events=facts.map(f=>sources.find(e=>e.id===f.sourceEventId))
  if(events.some(e=>!e))return denied('MISSING_CASE_SOURCE')
  if(events.some(e=>e.kind==='take'))return denied('PARCEL_RETURN_REQUIRED')
  const settledFacts=new Set((world.factions.resolutions??[]).filter(r=>r.incidentId===row.incidentId&&r.victimId===row.victimId).flatMap(r=>r.sourceFactIds))
  const pending=events.filter((e,i)=>!settledFacts.has(facts[i].id))
  const sourceIds=new Set(pending.map(e=>e.id)),claims=world.property.moneyClaims.filter(c=>sourceIds.has(c.sourceEventId))
  if(claims.some(c=>c.holderId!==subjectId||!actor(world,c.claimantId)))return denied('CLAIM_REQUIRES_REVIEW')
  const priorFine=(world.factions.resolutions??[]).filter(r=>r.incidentId===row.incidentId&&r.victimId===row.victimId).reduce((n,r)=>n+r.fine,0)
  const fine=Math.max(0,row.severity*10-priorFine),payments=[]
  if(fine)payments.push({recipientId:row.victimId,amount:fine,kind:'compensation'})
  for(const claim of claims) {
    const amount=claim.amount-(claim.repaidAmount??0)
    if(!natural(amount))return denied('INVALID_CLAIM')
    if(amount)payments.push({recipientId:claim.claimantId,amount,kind:'restitution',claimId:claim.id})
  }
  const items=[]
  for(const event of pending.filter(e=>e.kind==='loot_item')) {
    const lot=world.interactions.inventory.lots.find(l=>l.id===event.resultLotId)
    if(!lot||lot.holderId!==actor(world,subjectId)?.containerId||lot.quantity<event.quantity||!actor(world,lot.ownerId))return denied('RETURN_ITEMS_REQUIRED')
    if(lot.ownerId!==subjectId)items.push({lotId:lot.id,quantity:event.quantity,ownerId:lot.ownerId,toHolderId:actor(world,lot.ownerId).containerId})
  }
  if(payments.some(p=>!actor(world,p.recipientId)||p.recipientId===subjectId))return denied('CLAIM_REQUIRES_REVIEW')
  const amount=payments.reduce((n,p)=>n+p.amount,0)
  if(!natural(amount))return denied('AMOUNT_OVERFLOW')
  return {available:true,reason:null,caseId,incidentId:row.incidentId,victimId:row.victimId,subjectId,severity:row.severity,fine,amount,payments,items,
    sourceFactIds:[...row.factIds],evidenceId:row.evidenceIds.at(-1)}
}
export function executeCaseSettlement(world,catalog,command,context) {
  const quote=caseSettlementQuote(world,command.targetId,command.actorId,command.caseId)
  check(quote.available,quote.reason)
  check(context.withinRange===true&&context.clear===true&&context.facing===true&&context.identified===true&&typeof context.proofId==='string','MISSING_CASE_MEETING')
  check(!(command.actorId==='player'&&world.village.masked)&&actor(world,command.actorId)?.health>0,'SUBJECT_UNIDENTIFIED')
  check(previewCombat(world.combat,world.interactions.actors,context.at).find(f=>f.id===command.actorId)?.phase==='idle','ACTOR_BUSY')
  requireAvailableFunds(world.interactions,command.actorId,quote.amount)
  for(const item of quote.items)requireAvailableLot(world.interactions,item.lotId,item.quantity)
  for(const [index,item] of quote.items.entries())world.interactions.inventory=transferLot(world.interactions.inventory,catalog,
    {lotId:item.lotId,quantity:item.quantity,toHolderId:item.toHolderId,splitId:`restitution:${command.id}:${index}`})
  for(const payment of quote.payments) {
    const recipient=actor(world,payment.recipientId)
    check(natural(recipient.wallet+payment.amount),'AMOUNT_OVERFLOW')
    actor(world,command.actorId).wallet-=payment.amount;recipient.wallet+=payment.amount
    if(payment.claimId)world.property.moneyClaims.find(c=>c.id===payment.claimId).repaidAmount=
      (world.property.moneyClaims.find(c=>c.id===payment.claimId).repaidAmount??0)+payment.amount
  }
  const event=emitFactionAction(world,command,context,'case_settled',{caseId:quote.caseId,incidentId:quote.incidentId,victimId:quote.victimId,
    severity:quote.severity,amount:quote.amount,fine:quote.fine,payments:structuredClone(quote.payments),returnedItems:structuredClone(quote.items),
    cause:quote.evidenceId,sourceFactIds:quote.sourceFactIds,proofId:context.proofId,identified:true})
  world.factions.resolutions.push({incidentId:quote.incidentId,victimId:quote.victimId,subjectId:command.actorId,severity:quote.severity,
    fine:quote.fine,eventId:event.id,sourceFactIds:quote.sourceFactIds,at:context.at})
  for(const row of world.crime.cases)if(row.authorityId===command.targetId&&row.incidentId===quote.incidentId&&row.victimId===quote.victimId&&row.severity<=quote.severity) {
    row.resolved=true;row.resolutionEventId=event.id
  }
  // The receiving constable can put away this enforcement swing immediately.
  // Other unresolved incidents retain their own authority to pursue.
  const officer=world.combat.fighters.find(f=>f.id===command.targetId)
  if(officer&&!world.crime.cases.some(c=>c.authorityId===command.targetId&&c.subjectId===command.actorId&&!c.resolved)) {
    officer.swing=null;officer.guardHeld=false;officer.guarding=false;officer.mustRelease=false
    officer.regenAt=Math.max(officer.regenAt,context.at+COMBAT_RULES.regenDelayMs)
  }
  return [event]
}
/** Officers stop their own recorded case only after learning its receipt. */
export function reconcileCaseKnowledge(world,sourceEvents,at,requestId) {
  if(!world.factions?.actionsVersion||!sourceEvents.some(e=>['witness','report'].includes(e.kind)))return []
  const events=[]
  for(const row of world.crime.cases.filter(c=>!c.resolved)) {
    const resolution=world.factions.resolutions.find(r=>r.incidentId===row.incidentId&&r.victimId===row.victimId&&r.severity>=row.severity&&
      world.social.knowledge.some(k=>k.npcId===row.authorityId&&k.factId===`fact:${r.eventId}`))
    if(!resolution)continue
    const known=world.social.knowledge.find(k=>k.npcId===row.authorityId&&k.factId===`fact:${resolution.eventId}`)
    row.resolved=true;row.resolutionEventId=resolution.eventId
    const officer=world.combat.fighters.find(f=>f.id===row.authorityId)
    if(officer&&!world.crime.cases.some(c=>c.authorityId===row.authorityId&&!c.resolved)) {
      officer.swing=null;officer.guardHeld=false;officer.guarding=false;officer.mustRelease=false
      officer.regenAt=Math.max(officer.regenAt,at+COMBAT_RULES.regenDelayMs)
    }
    events.push(emitFactionAction(world,{id:requestId,actorId:row.authorityId,targetId:row.subjectId},{at},'case_resolution_learned',
      {caseId:row.id,cause:known.evidenceId,resolutionEventId:resolution.eventId}))
  }
  return events
}
