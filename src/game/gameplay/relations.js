import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { InventoryError } from './inventory.js'
import { RELATION_PAIRS_V1 } from './content/relationsV1.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const copy=value=>structuredClone(value)
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n))
const closeTypes=new Set(['neighbor','kin','colleague'])
export function relationFor(world,fromId,toId) {
  const row=world.social.relationships.find(r=>r.fromId===fromId&&r.toId===toId)
  return {fromId,toId,trust:row?.trust??0,type:row?.type??'acquaintance',fear:row?.fear??0,gratitude:row?.gratitude??0}
}
function edge(world,fromId,toId) {
  let row=world.social.relationships.find(r=>r.fromId===fromId&&r.toId===toId)
  if(!row){row={fromId,toId,trust:0};world.social.relationships.push(row)}
  row.type??='acquaintance';row.fear??=0;row.gratitude??=0
  return row
}
export function relationReaction(world,actorId,factId) {
  if(!world.relations||world.relations.applications.some(a=>a.actorId===actorId&&a.factId===factId))return null
  const known=world.social.knowledge.find(k=>k.npcId===actorId&&k.factId===factId),fact=world.social.facts.find(f=>f.id===factId)
  if(!known?.subjectId||known.subjectId===actorId||!fact)return null
  const personal=fact.targetId===actorId,concern=closeTypes.has(relationFor(world,actorId,fact.targetId).type)
  if(!personal&&!concern)return null
  if(fact.action==='aid')return {targetId:known.subjectId,ruleId:'aid-v1',trust:personal?25:8,gratitude:personal?25:10,fear:0,evidenceId:known.evidenceId}
  if(fact.action==='opportunity_fulfilled'&&personal)return {targetId:known.subjectId,ruleId:'fulfilled-v1',trust:10,gratitude:10,fear:0,evidenceId:known.evidenceId}
  if(world.relations.dailyVersion&&fact.action==='daily_help_returned'&&personal)return {targetId:known.subjectId,ruleId:'daily-help-v1',trust:2,gratitude:2,fear:0,evidenceId:known.evidenceId}
  if(['damaged','threatened','robbed','died','loot_item','loot_money'].includes(fact.action))return {
    targetId:known.subjectId,ruleId:'harm-v1',trust:personal?-25:-12,gratitude:0,fear:personal?25:12,evidenceId:known.evidenceId}
  return null
}
export function executeRelations(world,command,context) {
  check(world.version===2&&context.allowed===true,'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0,'INVALID_TIME')
  if(command.kind==='initialize') {
    check(!world.relations&&world.life,'RELATIONS_ALREADY_INITIALIZED')
    for(const [a,b,type] of RELATION_PAIRS_V1)for(const [from,to] of [[a,b],[b,a]]) {
      check(world.social.actorIds.includes(from)&&world.social.actorIds.includes(to),'UNKNOWN_ACTOR')
      edge(world,from,to).type=type
    }
    for(const row of world.social.relationships)edge(world,row.fromId,row.toId)
    const event={id:'relations:1',kind:'relations_initialized',actorId:command.actorId,targetId:null,at:context.at,cause:null,requestId:command.id}
    world.relations={version:1,applications:[],events:[event]};return [copy(event)]
  }
  check(world.relations&&activeEventCount(world.relations)<4096,'HISTORY_FULL')
  check(command.kind==='react','INVALID_COMMAND')
  check(world.interactions.actors.some(a=>a.id===command.actorId&&a.health>0),'ACTOR_DEAD')
  const reaction=relationReaction(world,command.actorId,command.factId)
  check(reaction,'NO_RELATION_REACTION')
  const row=edge(world,command.actorId,reaction.targetId),before=relationFor(world,command.actorId,reaction.targetId)
  // The old aid path may already have applied trust for this exact evidence.
  const trustAlready=world.social.events.some(e=>e.kind==='relationship'&&e.actorId===command.actorId&&e.factId===command.factId)
  row.trust=clamp(row.trust+(trustAlready?0:reaction.trust),-100,100)
  row.fear=clamp(row.fear+reaction.fear,0,100);row.gratitude=clamp(row.gratitude+reaction.gratitude,0,100)
  const event={id:`relations:${nextEventNumber(world.relations)}`,kind:'attitude_changed',actorId:command.actorId,targetId:reaction.targetId,
    at:context.at,cause:reaction.evidenceId,factId:command.factId,ruleId:reaction.ruleId,requestId:command.id,
    delta:{trust:row.trust-before.trust,fear:row.fear-before.fear,gratitude:row.gratitude-before.gratitude}}
  world.relations.applications.push({actorId:command.actorId,factId:command.factId,eventId:event.id})
  world.relations.events.push(event);return [copy(event)]
}
