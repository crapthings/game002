import { InventoryError } from './inventory.js'
import { executeKnowledge } from './knowledge.js'
import { previewCombat } from './combat.js'
import { roleHolders } from './factionRoles.js'
import { wantedFor } from './crime.js'
import { emitFactionAction } from './factionEvents.js'
import { executeCaseSettlement } from './caseSettlement.js'
import { executeBounties,shareBountyTerms } from './bounties.js'
import { executeGangRequest } from './gangRequests.js'
import { executeEscorts } from './escorts.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
const offensive=new Set(['take','threatened','robbed','damaged','parried','died','loot_item','loot_money'])
export function officerAvailable(world,id,at) {
  const life=world.life?.actors.find(a=>a.actorId===id)
  return roleHolders(world,'law','constable').includes(id)&&
    (!life?.interruption||life.interruption.priority<=70)&&
    (!life?.assignment||life.assignment.outcomeEventId)&&
    previewCombat(world.combat,world.interactions.actors,at).find(f=>f.id===id)?.phase==='idle'
}
export function executeFactionActions(world,catalog,command,context) {
  check(world.factions&&context.allowed===true&&Number.isSafeInteger(context.at)&&context.at>=0,'FACTION_ACTION_DENIED')
  if(command.kind==='enable_actions') {
    check(!world.factions.actionsVersion,'FACTION_ACTIONS_ALREADY_ENABLED')
    Object.assign(world.factions,{actionsVersion:1,reportIntents:[],resolutions:[],bounties:[],escorts:[],threatRequests:[]})
    return [emitFactionAction(world,command,context,'faction_actions_enabled')]
  }
  check(world.factions.actionsVersion===1&&actor(world,command.actorId)?.health>0,'ACTOR_DEAD')
  if(command.kind==='settle_case')return executeCaseSettlement(world,catalog,command,context)
  if(command.kind==='request_warning')return executeGangRequest(world,command,context)
  if(['enable_escorts','hear_escort','accept_escort','wait_escort','join_escort','observe_escort','finish_escort','collect_escort','cancel_escort'].includes(command.kind))return executeEscorts(world,command,context)
  if(['enable_bounties','read_bounties','post_bounty','fund_bounty','claim_bounty'].includes(command.kind))return executeBounties(world,command,context)
  if(command.kind==='seek_officer') {
    const known=world.social.knowledge.find(k=>k.npcId===command.actorId&&k.factId===command.factId)
    const fact=world.social.facts.find(f=>f.id===command.factId)
    check(known&&known.evidenceId===command.evidenceId&&offensive.has(fact?.action),'REPORTER_UNINFORMED')
    check(['report','reinforce'].includes(command.purpose),'INVALID_REPORT_PURPOSE')
    if(command.purpose==='reinforce')check(roleHolders(world,'law','constable').includes(command.actorId)&&known.subjectId!==null&&
      wantedFor(world.crime,command.actorId,known.subjectId).level>=3,'NO_REINFORCEMENT_CASE')
    check(!world.factions.reportIntents.some(r=>r.reporterId===command.actorId&&r.evidenceId===known.evidenceId&&r.purpose===command.purpose),'REPORT_INTENT_EXISTS')
    check(world.factions.reportIntents.length<4096,'HISTORY_FULL')
    const placeId=world.factions.entries.find(f=>f.kind==='law')?.servicePlaceIds[0]
    check(placeId,'NO_REPORTING_PLACE')
    const event=emitFactionAction(world,command,context,'officer_sought',{cause:known.evidenceId,factId:known.factId,purpose:command.purpose,placeId})
    world.factions.reportIntents.push({id:event.id,reporterId:command.actorId,factId:known.factId,evidenceId:known.evidenceId,subjectId:known.subjectId,
      purpose:command.purpose,placeId,status:'seeking',nextAttemptAt:null,receiptId:null,recipientId:null,sourceEventId:event.id})
    return [event]
  }
  const intent=world.factions.reportIntents.find(r=>r.id===command.reportId)
  check(intent&&intent.reporterId===command.actorId&&intent.status!=='delivered','REPORT_INTENT_UNAVAILABLE')
  if(command.kind==='wait_officer') {
    check(intent.status==='seeking'&&context.present===true&&context.placeId===intent.placeId,'MISSING_PLACE_EVIDENCE')
    check(Number.isSafeInteger(context.at+60000),'TIME_OVERFLOW')
    intent.status='waiting';intent.nextAttemptAt=context.at+60000
    return [emitFactionAction(world,command,context,'officer_waiting',{cause:intent.sourceEventId,reportId:intent.id,placeId:intent.placeId,nextAttemptAt:intent.nextAttemptAt})]
  }
  if(command.kind==='retry_officer') {
    check(intent.status==='waiting'&&context.at>=intent.nextAttemptAt,'REPORT_RETRY_NOT_DUE')
    intent.status='seeking';intent.nextAttemptAt=null
    return [emitFactionAction(world,command,context,'officer_sought_again',{cause:intent.sourceEventId,reportId:intent.id,placeId:intent.placeId})]
  }
  check(command.kind==='deliver_report'&&command.actorId!==command.targetId&&officerAvailable(world,command.targetId,context.at),'NO_AVAILABLE_OFFICER')
  check(context.withinRange===true&&context.clear===true&&context.facing===true&&typeof context.proofId==='string','REPORT_NOT_DELIVERED')
  check(previewCombat(world.combat,world.interactions.actors,context.at).find(f=>f.id===command.actorId)?.phase==='idle','ACTOR_BUSY')
  const known=world.social.knowledge.find(k=>k.npcId===command.actorId&&k.factId===intent.factId)
  check(known?.evidenceId===intent.evidenceId,'REPORT_EVIDENCE_CHANGED')
  const result=executeKnowledge(world.social,{id:`${command.id}:report`,kind:'report',actorId:command.actorId,targetId:command.targetId,
    factId:intent.factId,expectedRevision:world.social.revision},{allowed:true,at:context.at,delivered:true,proofId:context.proofId})
  check(result.ok&&!result.duplicate,result.code);world.social=result.state
  intent.status='delivered';intent.receiptId=result.events[0].id;intent.recipientId=command.targetId;intent.nextAttemptAt=null
  const event=emitFactionAction(world,command,context,'report_presented',{cause:intent.receiptId,reportId:intent.id,factId:intent.factId,subjectId:known.subjectId})
  shareBountyTerms(world,command.actorId,command.targetId,intent.factId,event.id,context.at)
  return [...result.events,event]
}
