import { previewCombat } from './combat.js'
import { placeStatus } from './places.js'
import { InventoryError } from './inventory.js'

const offensive=new Set(['take','threatened','robbed','damaged','parried','died','loot_item','loot_money'])
const refusalCache=new WeakMap()
function knownRefusals(world) {
  const prior=refusalCache.get(world)
  if(prior?.social===world.social&&prior.settledCount===world.village.settled.length)return prior.value
  const facts=new Map(world.social.facts.map(f=>[f.id,f])),settled=new Set(world.village.settled),refusals=new Set()
  for(const known of world.social.knowledge) {
    const fact=facts.get(known.factId)
    if(known.subjectId&&fact?.targetId===known.npcId&&offensive.has(fact.action)&&!settled.has(fact.sourceEventId))refusals.add(`${known.npcId}:${known.subjectId}`)
  }
  refusalCache.set(world,{social:world.social,settledCount:world.village.settled.length,value:refusals});return refusals
}

/** UI queries and the coordinator share the same policy; the latter requires a proof. */
export function tradeEligibility(world,actorId,targetId,context) {
  const entry=world.places?.entries.find(e=>(e.businessActorId??e.operatorId)===targetId&&world.places.definitions.some(p=>p.id===e.placeId&&p.kind==='shop'))
  const base={placeId:entry?.placeId??null,operatorId:entry?.operatorId??null}
  const denied=reason=>({...base,available:false,reason})
  if(!entry)return denied('NO_TRADE_SERVICE')
  if(context.withinRange!==true||context.clear!==true||context.facing!==true||context.operatorId!==entry.operatorId)return denied('APPROACH_TARGET')
  const participants=[actorId,entry.operatorId,targetId]
  if(participants.some(id=>!world.interactions.actors.some(a=>a.id===id&&a.health>0)))return denied('ACTOR_DEAD')
  const fighters=previewCombat(world.combat,world.interactions.actors,context.at)
  if(participants.some(id=>fighters.find(f=>f.id===id)?.phase!=='idle'))return denied('TARGET_BUSY')
  const status=placeStatus(world,entry.placeId,context.at)
  if(!status.open)return denied(status.reason)
  if(context.operatorPresent!==true)return denied('OPERATOR_AWAY')
  if(!(actorId==='player'&&world.village.masked)&&knownRefusals(world).has(`${entry.operatorId}:${actorId}`))return denied('TRADE_REFUSED')
  return {...base,available:true,reason:null}
}

export function assertTradeService(world,command,context) {
  // Enabling is an explicit recorded step: earlier v2 trades keep their rules.
  if(world.places?.serviceVersion!==1||!['buy','sell'].includes(command.kind))return
  const service=context.service
  if(!service||typeof service.proofId!=='string'||!service.proofId.length)throw new InventoryError('MISSING_SERVICE_EVIDENCE')
  const eligible=tradeEligibility(world,command.actorId,command.targetId,{...service,at:context.at})
  if(!eligible.available)throw new InventoryError(eligible.reason)
  if(service.placeId!==eligible.placeId)throw new InventoryError('WRONG_SERVICE_PLACE')
}
