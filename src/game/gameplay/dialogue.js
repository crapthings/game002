import { InventoryError } from './inventory.js'
import { executeKnowledge } from './knowledge.js'
import { previewCombat } from './combat.js'
import { wantedFor } from './crime.js'
import { placeStatus } from './places.js'

const copy=value=>structuredClone(value)
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const shareable=new Set(['aid','reward','take','threatened','robbed','damaged','parried','died','loot_item','loot_money'])
const topics=[['routine','你平时会去哪里？'],['hours','药铺什么时候营业？'],['news','最近有什么事情？'],['work','这里有活计可做吗？'],['requests','你有什么需要帮忙的？']]
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)

export function meetingEligibility(world,speakerId,listenerId,context) {
  if(speakerId===listenerId||![speakerId,listenerId].every(id=>actor(world,id)?.health>0))return {available:false,reason:'ACTOR_DEAD'}
  if(context.withinRange!==true||context.clear!==true||context.facing!==true)return {available:false,reason:'MEETING_ENDED'}
  const fighters=previewCombat(world.combat,world.interactions.actors,context.at)
  if([speakerId,listenerId].some(id=>fighters.find(f=>f.id===id)?.phase!=='idle'))return {available:false,reason:'NO_SAFE_MEETING'}
  const life=world.life?.actors.find(a=>a.actorId===speakerId)
  if(life?.interruption||world.robbery.cooldowns.some(c=>c.targetId===speakerId&&c.until>context.at))return {available:false,reason:'TARGET_BUSY'}
  if(world.crime.authorities.includes(speakerId)&&wantedFor(world.crime,speakerId,listenerId).level>0)return {available:false,reason:'OFFICIAL_CASE_PENDING'}
  return {available:true,reason:null}
}
export function dialogueTopics() {return topics.map(([id,label])=>({id,label}))}
function maySharePlace(world,speakerId,placeId) {
  const place=world.places?.definitions.find(p=>p.id===placeId),binding=world.places?.bindings.find(b=>b.actorId===speakerId)
  return !!place&&(place.public||[binding?.homePlaceId,binding?.workPlaceId,binding?.idlePlaceId,...(binding?.patrolPlaceIds??[])].includes(placeId))
}
function newsFor(world,speakerId,listenerId) {
  const facts=new Map(world.social.facts.map(f=>[f.id,f]))
  const known=world.social.knowledge.filter(k=>k.npcId===speakerId&&shareable.has(facts.get(k.factId)?.action)).sort((a,b)=>facts.get(b.factId).at-facts.get(a.factId).at||a.factId.localeCompare(b.factId))
  // The speaker can remember its own conversations, not read the listener's mind.
  return known.find(k=>!world.dialogue?.events.some(e=>e.kind==='news_told'&&e.actorId===speakerId&&e.targetId===listenerId&&e.factId===k.factId&&e.subjectId===k.subjectId))??known[0]??null
}
export function dialogueAnswer(world,speakerId,listenerId,topicId,context) {
  const eligibility=meetingEligibility(world,speakerId,listenerId,context)
  if(!eligibility.available)return {ok:false,code:eligibility.reason}
  const binding=world.places?.bindings.find(b=>b.actorId===speakerId)
  if(topicId==='routine') {
    const placeIds=[...new Set([binding?.workPlaceId,binding?.homePlaceId].filter(Boolean))]
    return {ok:true,kind:'places',placeIds,text:placeIds.length?'这是我常去的地方；人不一定一直待在那儿。':'我暂时没有固定去处。'}
  }
  if(topicId==='hours') {
    const placeId='place.medicine',place=world.places?.definitions.find(p=>p.id===placeId)
    const status=speakerId==='merchant'&&place?placeStatus(world,placeId,context.at):null
    return {ok:true,kind:'places',placeIds:place?[placeId]:[],text:`陈记药铺平常08:00—18:00营业。${speakerId==='merchant'?(status?.open?'我现在可以做买卖。':'我现在还不能接待买卖，请等我回铺面准备好。'):'掌柜此刻在不在，你得到铺前看看。'}`}
  }
  if(topicId==='news') {
    const known=newsFor(world,speakerId,listenerId)
    return known?{ok:true,kind:'news',factId:known.factId,subjectId:known.subjectId,evidenceId:known.evidenceId}:
      {ok:true,kind:'text',text:'我没有亲眼见到或听人讲过什么可告诉你的新事。'}
  }
  if(topicId==='work'||topicId==='requests')return {ok:true,kind:'requests',opportunityIds:(world.opportunities?.entries??[]).filter(r=>r.issuerId===speakerId&&r.status==='offered'&&r.deadlineAt>context.at&&!r.declinedBy.includes(listenerId)).map(r=>r.id)}
  return {ok:false,code:'UNKNOWN_TOPIC'}
}
export function executeDialogue(world,command,context) {
  check(world.version===2&&context.allowed===true,'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0,'INVALID_TIME')
  if(command.kind==='initialize') {
    check(!world.dialogue&&world.places&&world.life,'DIALOGUE_ALREADY_INITIALIZED')
    const event={id:'dialogue:1',kind:'dialogue_initialized',actorId:command.actorId,targetId:null,at:context.at,cause:null,requestId:command.id}
    world.dialogue={version:1,addresses:[],events:[event]};return [copy(event)]
  }
  check(world.dialogue&&world.dialogue.events.length<4096,'HISTORY_FULL')
  const eligibility=meetingEligibility(world,command.actorId,command.targetId,context)
  check(eligibility.available,eligibility.reason)
  check(typeof context.meetingId==='string'&&context.meetingId.length>0&&typeof context.proofId==='string'&&context.proofId.length>0,'MISSING_MEETING_EVIDENCE')
  const event={id:`dialogue:${world.dialogue.events.length+1}`,kind:null,actorId:command.actorId,targetId:command.targetId,
    at:context.at,cause:null,requestId:command.id,meetingId:context.meetingId,proofId:context.proofId}
  let socialEvents=[]
  if(command.kind==='tell_place') {
    check(maySharePlace(world,command.actorId,command.placeId),'UNKNOWN_DESTINATION')
    check(!world.dialogue.addresses.some(a=>a.listenerId===command.targetId&&a.placeId===command.placeId),'ALREADY_KNOWN')
    event.kind='address_told';event.placeId=command.placeId
    world.dialogue.addresses.push({listenerId:command.targetId,speakerId:command.actorId,placeId:command.placeId,at:context.at,eventId:event.id})
  } else if(command.kind==='share_news') {
    const known=world.social.knowledge.find(k=>k.npcId===command.actorId&&k.factId===command.factId)
    const fact=world.social.facts.find(f=>f.id===command.factId)
    check(known&&shareable.has(fact?.action),'SPEAKER_UNINFORMED')
    check(!world.social.knowledge.some(k=>k.npcId===command.targetId&&k.factId===known.factId&&(k.subjectId!==null||known.subjectId===null)),'ALREADY_KNOWN')
    const result=executeKnowledge(world.social,{id:`${command.id}:report`,kind:'report',expectedRevision:world.social.revision,
      actorId:command.actorId,targetId:command.targetId,factId:known.factId},{allowed:true,at:context.at,delivered:true,proofId:context.proofId})
    check(result.ok,result.code);world.social=result.state;socialEvents=result.events
    event.kind='news_told';event.factId=known.factId;event.subjectId=known.subjectId;event.cause=known.evidenceId;event.deliveredEvidenceId=result.events[0].id
  } else throw new InventoryError('INVALID_COMMAND')
  world.dialogue.events.push(event);return [copy(event),...socialEvents]
}
