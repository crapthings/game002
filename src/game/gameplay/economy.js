import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { InventoryError,consumeLot } from './inventory.js'
import { availableQuantity,requireAvailableLot } from './reservations.js'
import { projectedNeeds } from './life.js'
import { previewCombat } from './combat.js'
import { ECONOMY_V1 as rules } from './content/economyV1.js'
import { executeEmployment } from './employment.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
export function shopStock(world,itemType) {
  const merchant=world.interactions.actors.find(a=>a.id===rules.shopkeeperId)
  return world.interactions.inventory.lots.filter(l=>l.itemType===itemType&&l.ownerId===merchant.id&&l.holderId===merchant.containerId)
    .reduce((n,l)=>n+availableQuantity(world.interactions,l.id),0)
}
export function shortageProposal(world,at) {
  if(!world.economy||world.opportunities.entries.some(r=>r.templateId==='merchant-restock-v1'&&['offered','accepted'].includes(r.status)))return null
  const lines=Object.entries(rules.target).flatMap(([itemType,target])=>{const quantity=Math.max(0,target-shopStock(world,itemType));return quantity?[{itemType,quantity}]:[]})
  if(!lines.length||at-(world.economy.needs.at(-1)?.at??-Infinity)<60000)return null
  const changes=[...world.interactions.events.filter(e=>['buy','sell'].includes(e.kind)&&e.targetId===rules.shopkeeperId&&rules.target[e.itemType]),
    ...world.opportunities.events.filter(e=>e.kind==='stock_delivered'&&e.targetId===rules.shopkeeperId),
    ...world.economy.events.filter(e=>e.kind==='ate_food'&&e.actorId===rules.shopkeeperId)].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
  const sourceEventId=changes.at(-1)?.id??world.economy.events[0].id
  const key=`${sourceEventId}:${lines.map(l=>`${l.itemType}-${l.quantity}`).join(':')}`
  if(world.economy.needs.some(n=>n.key===key))return null
  return {key,sourceEventId,lines}
}
export function executeEconomy(world,catalog,command,context) {
  check(world.version===2&&context.allowed===true,'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0,'INVALID_TIME')
  if(['enable_employment','labor','pay_wage','wage_due'].includes(command.kind))return executeEmployment(world,command,context)
  if(command.kind==='initialize') {
    check(!world.economy&&world.life&&world.opportunities,'ECONOMY_ALREADY_INITIALIZED')
    const event={id:'economy:1',kind:'economy_initialized',actorId:command.actorId,targetId:null,at:context.at,cause:null,requestId:command.id}
    world.economy={version:1,needs:[],foodNeeds:[],events:[event]};return [structuredClone(event)]
  }
  check(world.economy&&activeEventCount(world.economy)<4096,'HISTORY_FULL')
  const actor=world.interactions.actors.find(a=>a.id===command.actorId),life=world.life.actors.find(a=>a.actorId===command.actorId)
  check(actor?.health>0&&life,'ACTOR_DEAD')
  check(previewCombat(world.combat,world.interactions.actors,context.at).find(f=>f.id===actor.id)?.phase==='idle'&&!life.interruption,'TARGET_BUSY')
  const event={id:`economy:${nextEventNumber(world.economy)}`,kind:null,actorId:actor.id,targetId:null,at:context.at,cause:life.intent?.sourceEventId??null,requestId:command.id}
  if(command.kind==='eat') {
    const needs=projectedNeeds(life,context.at),lot=world.interactions.inventory.lots.find(l=>l.id===command.lotId)
    check(needs.hunger>=rules.foodThreshold&&life.intent?.kind==='eat'&&life.intent.phase==='interacting','NOT_HUNGRY')
    check(context.present===true&&typeof context.proofId==='string','MISSING_ARRIVAL_EVIDENCE')
    check(lot?.ownerId===actor.id&&lot.holderId===actor.containerId&&lot.itemType==='ration','OWN_FOOD_REQUIRED')
    requireAvailableLot(world.interactions,lot.id,1)
    world.interactions.inventory=consumeLot(world.interactions.inventory,catalog,{lotId:lot.id,quantity:1})
    Object.assign(life,needs,{hunger:Math.max(0,needs.hunger-rules.foodRelief),lastNeedsAt:context.at})
    Object.assign(event,{kind:'ate_food',sourceLotId:lot.id,itemType:'ration',quantity:1,hungerRelief:rules.foodRelief,placeId:life.intent.placeId,proofId:context.proofId})
    for(const need of world.economy.foodNeeds)if(need.actorId===actor.id&&!need.resolvedEventId)need.resolvedEventId=event.id
  } else if(command.kind==='notice_shortage') {
    check(actor.id===rules.shopkeeperId&&context.present===true&&context.placeId===rules.shopPlaceId&&typeof context.proofId==='string','WRONG_SERVICE_PLACE')
    const proposal=shortageProposal(world,context.at)
    check(proposal,'NO_CHANGE')
    const needId=`need:restock:${world.economy.needs.length+1}`
    Object.assign(event,{kind:'stock_shortage_noticed',cause:proposal.sourceEventId,rootCauseId:needId,lines:proposal.lines,proofId:context.proofId})
    world.economy.needs.push({id:needId,templateId:'merchant-restock-v1',issuerId:actor.id,targetActorId:rules.supplierId,
      sourceEventId:event.id,key:proposal.key,lines:proposal.lines,at:context.at})
  } else if(command.kind==='food_unavailable') {
    check(projectedNeeds(life,context.at).hunger>=rules.foodThreshold,'NOT_HUNGRY')
    check(['INSUFFICIENT_FUNDS','NO_FOOD_STOCK','SERVICE_UNAVAILABLE'].includes(command.reason),'INVALID_REASON')
    check(context.present===true&&typeof context.proofId==='string','MISSING_CONTACT')
    check(!world.economy.foodNeeds.some(n=>n.actorId===actor.id&&!n.resolvedEventId&&n.reason===command.reason),'NO_CHANGE')
    event.kind='food_needed';event.reason=command.reason;event.proofId=context.proofId
    world.economy.foodNeeds.push({actorId:actor.id,reason:command.reason,sourceEventId:event.id,resolvedEventId:null})
  } else throw new InventoryError('INVALID_COMMAND')
  world.economy.events.push(event);return [structuredClone(event)]
}
