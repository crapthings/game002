import { InventoryError,transferLot } from './inventory.js'
import { emitContinuity } from './continuity.js'
import { requireAvailableFunds,availableQuantity } from './reservations.js'
import { roleHolders } from './factionRoles.js'
import { emitFactionAction } from './factionEvents.js'
import { previewCombat } from './combat.js'
import { hasRoom } from './estates.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(w,id)=>w.interactions.actors.find(a=>a.id===id)
export const CUSTODY_MS=30000
export const bodyCondition=(w,id)=>w.continuity?.conditions?.find(r=>r.actorId===id)??null
export const bodyLocked=(w,id)=>['incapacitated','custody'].includes(bodyCondition(w,id)?.status)
const activeCustody=(w,id)=>w.continuity?.custodies?.findLast(r=>r.subjectId===id&&r.status==='held')
function halt(world,id,status=null) {
  const f=world.combat.fighters.find(r=>r.id===id)
  Object.assign(f,{condition:status,swing:null,guarding:false,guardHeld:false,mustRelease:false,brokenUntil:0})
}
function clearCondition(world,id,eventId,at) {
  Object.assign(bodyCondition(world,id),{status:'released',endedEventId:eventId,endedAt:at})
  halt(world,id)
  world.combat.fighters.find(r=>r.id===id).regenAt=at+600
}
function namedCases(world,officer,subject) {
  return world.crime.cases.filter(c=>c.authorityId===officer&&c.subjectId===subject&&!c.resolved&&c.factIds.length&&
    c.factIds.every(id=>world.social.knowledge.some(k=>k.npcId===officer&&k.factId===id&&k.subjectId===subject)))
}
/** The officer's own disabling contact identifies this stationary body, not a new passer-by. */
export function canIdentifyDisabled(world,officer,subject,context) {
  const row=bodyCondition(world,subject),p=context.position,q=row?.position
  const sameBody=row?.officerId===officer&&p&&q&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Number.isFinite(q[k]))&&
    Math.hypot(p.x-q.x,p.z-q.z)<=0.75&&Math.abs(p.y-q.y)<1.5
  return context.identified===true||sameBody
}
function paymentsFor(world,snapshot) {
  const prior=world.factions.resolutions.filter(r=>r.incidentId===snapshot.incidentId&&r.victimId===snapshot.victimId)
  const priorFine=prior.reduce((n,r)=>n+r.fine,0),settledFacts=new Set(prior.flatMap(r=>r.sourceFactIds))
  const fine=Math.max(0,snapshot.severity*10-priorFine),payments=fine?[{recipientId:snapshot.victimId,amount:fine,kind:'compensation'}]:[]
  const sourceIds=new Set(snapshot.factIds.filter(id=>!settledFacts.has(id)).map(id=>world.social.facts.find(f=>f.id===id)?.sourceEventId))
  for(const claim of world.property.moneyClaims.filter(c=>sourceIds.has(c.sourceEventId))) {
    const amount=claim.amount-(claim.repaidAmount??0)
    if(amount>0)payments.push({recipientId:claim.claimantId,amount,kind:'restitution',claimId:claim.id})
  }
  return {fine,payments}
}
export function custodyQuote(world,subjectId) {
  const row=activeCustody(world,subjectId)
  if(!row)return null
  const cases=row.cases.map(c=>({...c,...paymentsFor(world,c)})),amount=cases.flatMap(c=>c.payments).reduce((n,p)=>n+p.amount,0)
  return {custodyId:row.id,officerId:row.officerId,releaseAt:row.releaseAt,cases,amount}
}
function pay(world,subject,payments) {
  const total=payments.reduce((n,p)=>n+p.amount,0)
  check(Number.isSafeInteger(total)&&total>=0,'INVALID_AMOUNT');requireAvailableFunds(world.interactions,subject,total)
  for(const p of payments) {
    const recipient=actor(world,p.recipientId)
    check(recipient&&recipient.id!==subject&&Number.isSafeInteger(recipient.wallet+p.amount),'INVALID_RECIPIENT')
    actor(world,subject).wallet-=p.amount;recipient.wallet+=p.amount
    if(p.claimId) {
      const claim=world.property.moneyClaims.find(c=>c.id===p.claimId)
      claim.repaidAmount=(claim.repaidAmount??0)+p.amount
    }
  }
}
function seizedItems(world,catalog,custody,command,context) {
  const events=[],facts=new Set(custody.cases.flatMap(c=>c.factIds)),sourceIds=new Set(world.social.facts.filter(f=>facts.has(f.id)).map(f=>f.sourceEventId))
  const sources=[...world.village.events,...world.property.events].filter(e=>sourceIds.has(e.id)&&['take','loot_item'].includes(e.kind))
  for(const source of sources) {
    if(world.continuity.restitutions.some(r=>r.sourceEventId===source.id))continue
    const lotId=source.kind==='take'?'medicine-parcel':source.resultLotId,quantity=source.quantity??1
    const lot=world.interactions.inventory.lots.find(l=>l.id===lotId)
    if(lot?.ownerId===custody.subjectId)continue
    const ownerId=lot?.ownerId??source.ownerId??source.targetId
    const held=lot?.holderId===actor(world,custody.subjectId).containerId&&availableQuantity(world.interactions,lotId)>=quantity&&
      hasRoom(world,catalog,actor(world,custody.officerId).containerId,lot.itemType,quantity)
    let resultLotId=lotId
    if(held) {
      resultLotId=lot.quantity===quantity?lot.id:`seized:${command.id}:${world.continuity.restitutions.length}`
      world.interactions.inventory=transferLot(world.interactions.inventory,catalog,{lotId,quantity,toHolderId:actor(world,custody.officerId).containerId,splitId:resultLotId})
    }
    check(world.continuity.restitutions.length<4096,'HISTORY_FULL')
    const e=emitContinuity(world,{...command,actorId:custody.officerId,targetId:custody.subjectId},context,held?'property_seized':'property_return_due',
      {cause:source.id,custodyId:custody.id,lotId:resultLotId,quantity,ownerId,proofId:context.proofId??custody.capturedEventId})
    world.continuity.restitutions.push({id:e.id,sourceEventId:source.id,lotId:resultLotId,quantity,ownerId,subjectId:custody.subjectId,
      officerId:custody.officerId,status:held?'carried':'due',returnedEventId:null});events.push(e)
  }
  return events
}
export function executeJustice(world,catalog,command,context) {
  check(world.continuity&&context.allowed===true&&Number.isSafeInteger(context.at)&&Number.isSafeInteger(context.at+CUSTODY_MS),'JUSTICE_NOT_READY')
  if(command.kind==='enable_justice') {
    check(!world.continuity.justiceVersion,'JUSTICE_ALREADY_ENABLED')
    Object.assign(world.continuity,{justiceVersion:1,conditions:[],custodies:[],custodyDebts:[],restitutions:[],estateMandates:[
      {ownerId:'merchant',keeperId:'resident-3',placeId:'place.medicine'},
      {ownerId:'guard',keeperId:'guard-2',placeId:world.factions.entries.find(f=>f.kind==='law').servicePlaceIds[0]},
    ],estates:[],estateClaims:[]})
    const e=emitContinuity(world,command,context,'justice_enabled')
    for(const m of world.continuity.estateMandates)m.sourceEventId=e.id
    return [e]
  }
  check(world.continuity.justiceVersion===1,'JUSTICE_NOT_READY')
  if(command.kind==='wake') {
    const condition=bodyCondition(world,command.actorId)
    check(condition?.status==='incapacitated'&&context.at>=condition.at+CUSTODY_MS&&actor(world,command.actorId)?.health>0,'NOT_DUE')
    const e=emitContinuity(world,command,context,'consciousness_returned',{cause:condition.sourceEventId})
    clearCondition(world,command.actorId,e.id,context.at);return [e]
  }
  if(command.kind==='take_custody') {
    const subject=command.targetId,condition=bodyCondition(world,subject)
    check(roleHolders(world,'law','constable').includes(command.actorId)&&!bodyLocked(world,command.actorId),'NOT_AUTHORITY')
    check(condition?.status==='incapacitated'&&actor(world,subject)?.health>0,'NOT_INCAPACITATED')
    check(context.withinRange===true&&context.clear===true&&context.visible===true&&typeof context.proofId==='string'&&canIdentifyDisabled(world,command.actorId,subject,context),'MISSING_CUSTODY_CONTACT')
    check(previewCombat(world.combat,world.interactions.actors,context.at).find(f=>f.id===command.actorId)?.phase==='idle','ACTOR_BUSY')
    const cases=namedCases(world,command.actorId,subject);check(cases.length,'NO_NAMED_CASE')
    check(world.continuity.custodies.length<4096,'HISTORY_FULL')
    const row={id:`custody:${world.continuity.custodies.length+1}`,officerId:command.actorId,subjectId:subject,caseIds:cases.map(c=>c.id),
      cases:structuredClone(cases),at:context.at,releaseAt:context.at+CUSTODY_MS,status:'held',capturedEventId:null,endedEventId:null}
    const e=emitContinuity(world,command,context,'taken_into_custody',{custodyId:row.id,caseIds:row.caseIds,cause:condition.sourceEventId,proofId:context.proofId})
    row.capturedEventId=e.id;world.continuity.custodies.push(row)
    condition.status='custody';condition.custodyId=row.id;halt(world,subject,'custody');halt(world,command.actorId)
    return [e]
  }
  if(command.kind==='release_abandoned') {
    const row=activeCustody(world,command.actorId)
    check(row&&actor(world,row.subjectId)?.health>0&&actor(world,row.officerId)?.health===0,'CUSTODY_STILL_GUARDED')
    const death=world.combat.events.findLast(e=>e.kind==='died'&&e.targetId===row.officerId)
    const e=emitContinuity(world,command,context,'custody_abandoned',{custodyId:row.id,cause:death.id,caseIds:row.caseIds})
    row.status='abandoned';row.endedEventId=e.id;clearCondition(world,row.subjectId,e.id,context.at);return [e]
  }
  if(command.kind==='process_custody') {
    const row=activeCustody(world,command.actorId),quote=custodyQuote(world,command.actorId)
    check(row&&actor(world,row.subjectId)?.health>0&&actor(world,row.officerId)?.health>0,'NO_ACTIVE_CUSTODY')
    check(['pay','wait'].includes(command.choice),'INVALID_CHOICE')
    check(command.choice==='pay'||context.at>=row.releaseAt,'CUSTODY_NOT_DUE')
    check(context.withinRange===true&&context.clear===true&&typeof context.proofId==='string','MISSING_CUSTODY_CONTACT')
    if(command.choice==='pay')pay(world,row.subjectId,quote.cases.flatMap(c=>c.payments))
    const events=seizedItems(world,catalog,row,command,context)
    for(const c of quote.cases) {
      check(world.factions.resolutions.length<4096,'HISTORY_FULL')
      const e=emitFactionAction(world,{...command,targetId:row.officerId},context,'case_settled',{caseId:c.id,incidentId:c.incidentId,victimId:c.victimId,
        severity:c.severity,fine:c.fine,amount:command.choice==='pay'?c.payments.reduce((n,p)=>n+p.amount,0):0,payments:command.choice==='pay'?c.payments:[],
        deferredPayments:command.choice==='wait'?c.payments:[],sourceFactIds:c.factIds,cause:row.capturedEventId,custodyId:row.id,factScope:true,identified:true,proofId:context.proofId})
      world.factions.resolutions.push({incidentId:c.incidentId,victimId:c.victimId,subjectId:row.subjectId,severity:c.severity,fine:c.fine,
        eventId:e.id,sourceFactIds:[...c.factIds],factScope:true,at:context.at})
      for(const record of world.crime.cases)if(record.authorityId===row.officerId&&record.incidentId===c.incidentId&&record.victimId===c.victimId&&record.factIds.every(id=>c.factIds.includes(id))) {
        record.resolved=true;record.resolutionEventId=e.id
      }
      if(command.choice==='wait'&&c.payments.length) {
        check(world.continuity.custodyDebts.length<4096,'HISTORY_FULL')
        world.continuity.custodyDebts.push({id:`debt:${e.id}`,subjectId:row.subjectId,custodyId:row.id,sourceEventId:e.id,payments:c.payments,status:'due',paidEventId:null})
      }
      events.push(e)
    }
    const e=emitContinuity(world,command,context,'custody_released',{custodyId:row.id,cause:row.capturedEventId,caseIds:row.caseIds,choice:command.choice,amount:command.choice==='pay'?quote.amount:0,debt:command.choice==='wait'?quote.amount:0})
    row.status='processed';row.endedEventId=e.id;clearCondition(world,row.subjectId,e.id,context.at);return [...events,e]
  }
  if(command.kind==='pay_custody_debt') {
    const row=world.continuity.custodyDebts.find(r=>r.id===command.debtId&&r.subjectId===command.actorId&&r.status==='due')
    check(row&&actor(world,command.actorId)?.health>0&&!bodyLocked(world,command.actorId),'NO_CUSTODY_DEBT')
    check(roleHolders(world,'law','constable').includes(command.targetId)&&context.withinRange===true&&context.clear===true&&context.identified===true&&typeof context.proofId==='string','MISSING_CASE_MEETING')
    check([command.actorId,command.targetId].every(id=>previewCombat(world.combat,world.interactions.actors,context.at).find(f=>f.id===id)?.phase==='idle'),'ACTOR_BUSY')
    const payments=row.payments.map(p=>({...p,amount:p.claimId?Math.max(0,world.property.moneyClaims.find(c=>c.id===p.claimId).amount-(world.property.moneyClaims.find(c=>c.id===p.claimId).repaidAmount??0)):p.amount}))
    pay(world,command.actorId,payments)
    const e=emitContinuity(world,command,context,'custody_debt_paid',{cause:row.sourceEventId,debtId:row.id,amount:payments.reduce((n,p)=>n+p.amount,0),payments,proofId:context.proofId})
    row.status='paid';row.paidEventId=e.id;return [e]
  }
  throw new InventoryError('INVALID_COMMAND')
}
/** A factual body consequence carries no private-case knowledge to bystanders. */
export function applyBodyConsequences(world,events,at,requestId) {
  if(!world.continuity?.justiceVersion)return []
  const out=[]
  for(const e of events)if(e.kind==='incapacitated') {
    let row=bodyCondition(world,e.targetId)
    if(!row){row={actorId:e.targetId};world.continuity.conditions.push(row)}
    Object.assign(row,{status:'incapacitated',at,sourceEventId:e.id,officerId:e.actorId,position:structuredClone(e.position),custodyId:null,endedEventId:null})
    halt(world,e.targetId,'incapacitated')
  } else if(e.kind==='died') {
    const row=bodyCondition(world,e.targetId)
    if(row){row.status='dead';row.endedEventId=e.id;halt(world,e.targetId,'dead')}
    const custody=activeCustody(world,e.targetId)
    if(custody) {
      const ended=emitContinuity(world,{id:requestId,actorId:custody.officerId,targetId:e.targetId},{at},'custody_ended_by_death',{cause:e.id,custodyId:custody.id})
      custody.status='subject_dead';custody.endedEventId=ended.id;out.push(ended)
    }
  }
  return out
}
