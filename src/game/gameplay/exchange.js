import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { InventoryError } from './inventory.js'
import { executeKnowledge } from './knowledge.js'
import { meetingEligibility } from './meeting.js'
import { relationFor } from './relations.js'
import { evidenceDepth,SHAREABLE_ACTIONS } from './knowledgeLineage.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
export const exchangeKey=(a,b)=>[a,b].sort().join('|')
export function exchangeLimit(world,speakerId,listenerId,at) {
  if(world.relations?.exchangeVersion!==1)return 'EXCHANGE_NOT_READY'
  const relays=world.relations.relays
  if(relays.some(r=>r.key===exchangeKey(speakerId,listenerId)&&r.closedAt===null))return 'MEETING_ALREADY_SHARED'
  if(relays.some(r=>r.speakerId===speakerId&&at-r.receivedAt<60000))return 'NEWS_REST'
  return null
}
export function executeExchange(world,command,context) {
  check(world.version===2&&world.relations&&context.allowed===true,'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0,'INVALID_TIME')
  check(activeEventCount(world.relations)<4096,'HISTORY_FULL')
  const event={id:`relations:${nextEventNumber(world.relations)}`,kind:null,actorId:command.actorId,targetId:command.targetId??null,
    at:context.at,cause:null,requestId:command.id}
  if(command.kind==='enable') {
    check(!world.relations.exchangeVersion,'EXCHANGE_ALREADY_ENABLED')
    world.relations.exchangeVersion=1;world.relations.relays=[];event.kind='exchange_enabled'
  } else if(command.kind==='leave') {
    const relay=world.relations.relays?.find(r=>r.id===command.relayId&&r.closedAt===null)
    check(relay&&[relay.speakerId,relay.listenerId].includes(command.actorId),'MEETING_ENDED')
    check(context.separated===true&&typeof context.proofId==='string','MISSING_MEETING_EVIDENCE')
    relay.closedAt=context.at;event.kind='exchange_meeting_ended';event.cause=relay.id;event.proofId=context.proofId
  } else if(command.kind==='share') {
    const eligible=meetingEligibility(world,command.actorId,command.targetId,context)
    check(eligible.available,eligible.reason)
    check(typeof context.meetingId==='string'&&typeof context.proofId==='string','MISSING_MEETING_EVIDENCE')
    const limit=exchangeLimit(world,command.actorId,command.targetId,context.at)
    check(!limit,limit)
    const relation=relationFor(world,command.actorId,command.targetId)
    check(context.solicited===true||relation.type!=='acquaintance'||relation.trust>0,'NO_REASON_TO_SHARE')
    const known=world.social.knowledge.find(k=>k.npcId===command.actorId&&k.factId===command.factId)
    const fact=world.social.facts.find(f=>f.id===command.factId),depth=evidenceDepth(world.social,known?.evidenceId)
    check(known&&SHAREABLE_ACTIONS.has(fact?.action),'SPEAKER_UNINFORMED')
    check(depth<2,'MESSAGE_TOO_DISTANT')
    const already=world.social.knowledge.some(k=>k.npcId===command.targetId&&k.factId===command.factId&&(k.subjectId!==null||known.subjectId===null))
    let events=[],deliveredEvidenceId=null
    if(!already) {
      const result=executeKnowledge(world.social,{id:`${command.id}:report`,kind:'report',expectedRevision:world.social.revision,
        actorId:command.actorId,targetId:command.targetId,factId:command.factId},{allowed:true,at:context.at,delivered:true,proofId:context.proofId})
      check(result.ok,result.code);world.social=result.state;events=result.events;deliveredEvidenceId=events[0].id
    }
    Object.assign(event,{kind:'news_exchanged',cause:known.evidenceId,factId:command.factId,subjectId:known.subjectId,
      deliveredEvidenceId,depth:depth+1,meetingId:context.meetingId,proofId:context.proofId,alreadyKnown:already})
    world.relations.relays.push({id:event.id,key:exchangeKey(command.actorId,command.targetId),speakerId:command.actorId,listenerId:command.targetId,
      factId:command.factId,sourceEvidenceId:known.evidenceId,deliveredEvidenceId,subjectId:known.subjectId,depth:depth+1,receivedAt:context.at,closedAt:null})
    world.relations.events.push(event);return [structuredClone(event),...events]
  } else throw new InventoryError('INVALID_COMMAND')
  world.relations.events.push(event);return [structuredClone(event)]
}
