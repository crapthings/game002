import { InventoryError } from './inventory.js'
import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { STANDING_V1 as rules } from './content/standingV1.js'
import { meetingEligibility } from './meeting.js'
import { settledCrimeFact } from './crime.js'
import { executeKnowledge } from './knowledge.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
export function emitStanding(world,command,context,kind,extra={}) {
  check(activeEventCount(world.standing)<4096,'HISTORY_FULL')
  const e={id:`standing:${nextEventNumber(world.standing)}`,kind,actorId:command.actorId,targetId:command.targetId??null,at:context.at,requestId:command.id,cause:null,...extra}
  world.standing.events.push(e);return structuredClone(e)
}
/** Only fulfilled, consented templates can supply a signed completion receipt. */
export function completionRecords(world,holderId) {
  const records=[]
  for(const event of world.opportunities?.events??[])if(event.kind==='opportunity_fulfilled'&&event.actorId===holderId&&event.identified===true) {
    const row=world.opportunities.entries.find(r=>r.id===event.opportunityId)
    if(row?.status==='fulfilled'&&row.completionEventId===event.id&&['message_roundtrip','procurement'].includes(row.requirements.kind))
      records.push({eventId:event.id,factId:`fact:${event.id}`,rootCauseId:row.rootCauseId,issuerId:row.issuerId,at:event.at,proofId:event.proofId})
  }
  for(const event of world.factions?.events??[])if(event.kind==='escort_paid'&&event.actorId===holderId) {
    const row=world.factions.escorts.find(r=>r.id===event.escortId),source=world.opportunities.entries.find(r=>r.id===row?.opportunityId)
    if(row?.status==='fulfilled'&&row.completionEventId===event.id&&source)records.push({eventId:event.id,factId:`fact:${event.id}`,rootCauseId:source.rootCauseId,issuerId:row.issuerId,at:event.at,proofId:event.proofId})
  }
  return [...new Map(records.map(r=>[r.rootCauseId,r])).values()]
}
export function standingBlocker(world,issuerId,holderId) {
  for(const known of world.social.knowledge)if(known.npcId===issuerId&&known.subjectId===holderId) {
    const fact=world.social.facts.find(f=>f.id===known.factId)
    if(fact?.targetId!==issuerId||!['take','threatened','robbed','damaged','parried','died','loot_item','loot_money'].includes(fact.action))continue
    const source=world.combat.events.find(e=>e.id===fact.sourceEventId)
    if(source?.justification?.unlawful===false)continue
    if(!settledCrimeFact(world,fact,{knownBy:issuerId}))return known
  }
  return null
}
export function standingQuote(world,issuerId,holderId) {
  const definition=rules.issuers.find(i=>i.actorId===issuerId)
  if(!world.standing||!definition)return {available:false,reason:'NO_STANDING_SERVICE',sources:[]}
  const sources=completionRecords(world,holderId).flatMap(r=>{
    const known=world.social.knowledge.find(k=>k.npcId===issuerId&&k.factId===r.factId&&k.subjectId===holderId)
    return known?[{...r,evidenceId:known.evidenceId}]:[]
  }),blocker=standingBlocker(world,issuerId,holderId)
  return {available:!blocker&&sources.length>=rules.requiredCompletions,reason:blocker?'PERSONAL_HARM_PENDING':sources.length<rules.requiredCompletions?'MORE_KNOWN_COMPLETIONS':null,
    sources,blockerEvidenceId:blocker?.evidenceId??null,required:rules.requiredCompletions,kind:definition.kind,service:definition.service}
}
export function hasStanding(world,issuerId,holderId) {
  return actor(world,issuerId)?.health>0&&!!world.standing?.entries.some(r=>r.issuerId===issuerId&&r.holderId===holderId&&r.status==='active')&&!standingBlocker(world,issuerId,holderId)
}
export function standingPrice(world,holderId,issuerId,itemType,basePrice) {
  return issuerId==='merchant'&&hasStanding(world,issuerId,holderId)?Math.max(1,basePrice-(rules.discount[itemType]??0)):basePrice
}
export function executeStanding(world,command,context) {
  check(world.version===2&&world.factions?.actionsVersion===1&&context.allowed===true&&Number.isSafeInteger(context.at)&&context.at>=0,'STANDING_NOT_READY')
  if(command.kind==='initialize') {
    check(!world.standing,'STANDING_ALREADY_INITIALIZED');world.standing={version:1,entries:[],acknowledgments:[],events:[]}
    return [emitStanding(world,command,context,'standing_initialized')]
  }
  check(world.standing&&actor(world,command.actorId)?.health>0,'ACTOR_DEAD')
  const id=command.actorId,issuerId=command.targetId,definition=rules.issuers.find(r=>r.actorId===issuerId)
  check(definition,'NO_STANDING_SERVICE')
  const meeting=meetingEligibility(world,issuerId,id,context)
  check(meeting.available,meeting.reason);check(context.identified===true&&typeof context.proofId==='string','MISSING_IDENTIFIED_MEETING')
  if(command.kind==='present_record') {
    const record=completionRecords(world,id).find(r=>r.eventId===command.eventId)
    check(record,'NO_SIGNED_COMPLETION')
    check(!world.social.knowledge.some(k=>k.npcId===issuerId&&k.factId===record.factId&&k.subjectId===id),'COMPLETION_ALREADY_KNOWN')
    const events=[]
    let known=world.social.knowledge.find(k=>k.npcId===id&&k.factId===record.factId)
    if(!known) {
      // The verified receipt proves this actor participated in that past meeting.
      const memory=executeKnowledge(world.social,{id:`${command.id}:own`,kind:'witness',actorId:id,factId:record.factId,expectedRevision:world.social.revision},
        {allowed:true,at:context.at,observed:true,observedAt:record.at,identified:true,proofId:record.proofId})
      check(memory.ok,memory.code);world.social=memory.state;events.push(...memory.events)
      known=world.social.knowledge.find(k=>k.npcId===id&&k.factId===record.factId)
    }
    check(known.subjectId===id,'NO_SIGNED_COMPLETION')
    const report=executeKnowledge(world.social,{id:`${command.id}:show`,kind:'report',actorId:id,targetId:issuerId,factId:record.factId,expectedRevision:world.social.revision},
      {allowed:true,at:context.at,delivered:true,proofId:context.proofId})
    check(report.ok,report.code);world.social=report.state;events.push(...report.events)
    events.push(emitStanding(world,command,context,'completion_presented',{cause:report.events[0].id,completionEventId:record.eventId,proofId:context.proofId}));return events
  }
  check(command.kind==='review','INVALID_COMMAND')
  const quote=standingQuote(world,issuerId,id)
  let row=world.standing.entries.find(r=>r.issuerId===issuerId&&r.holderId===id)
  check(quote.available||row,'MORE_KNOWN_COMPLETIONS')
  if(!row){row={holderId:id,issuerId,kind:definition.kind,organizationId:definition.organizationId,sourceEventIds:[],grantedAt:context.at,status:'pending',reason:null,eventId:null};world.standing.entries.push(row)}
  const status=quote.available?'active':'suspended',ack=world.standing.acknowledgments.find(r=>r.holderId===id&&r.issuerId===issuerId)
  check(!ack||ack.eventId!==row.eventId||ack.status!==status,'NO_CHANGE')
  const e=emitStanding(world,command,context,status==='active'?'standing_granted':'standing_explained',{actorId:issuerId,targetId:id,kindId:row.kind,
    cause:quote.blockerEvidenceId??quote.sources.at(-1)?.evidenceId??row.eventId,status,sourceEventIds:quote.sources.slice(0,rules.requiredCompletions).map(r=>r.eventId),proofId:context.proofId})
  row.status=status;row.reason=quote.reason;row.sourceEventIds=e.sourceEventIds;row.eventId=e.id
  const value={holderId:id,issuerId,status,eventId:e.id,at:context.at,kind:row.kind,reason:row.reason,service:definition.service,sourceEventIds:[...row.sourceEventIds]}
  if(ack)Object.assign(ack,value);else world.standing.acknowledgments.push(value)
  return [e]
}
export function reconcileStanding(world,events,at,requestId) {
  if(!world.standing||!events.some(e=>['witness','report'].includes(e.kind)))return []
  const out=[]
  for(const row of world.standing.entries.filter(r=>r.status==='active')) {
    const blocker=standingBlocker(world,row.issuerId,row.holderId)
    if(!blocker)continue
    const e=emitStanding(world,{id:requestId,actorId:row.issuerId,targetId:row.holderId},{at},'standing_suspended',{cause:blocker.evidenceId,kindId:row.kind,reason:'PERSONAL_HARM_PENDING'})
    row.status='suspended';row.reason='PERSONAL_HARM_PENDING';row.eventId=e.id;out.push(e)
    // The holder learns this through the next actual conversation, not remotely.
  }
  return out
}
