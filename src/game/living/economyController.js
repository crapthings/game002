import { projectedNeeds } from '../gameplay/life.js'
import { availableQuantity,availableWallet } from '../gameplay/reservations.js'
import { shortageProposal } from '../gameplay/economy.js'
import { tradeEligibility } from '../gameplay/commerce.js'

export function createEconomyController({state,clock,atPlace,contact,point,face,tradeContext,send,talkingTo}) {
  const due=new Map()
  return {updateNpc(id) {
    const world=state(),at=clock()
    if(!world.economy||id===talkingTo()||at<(due.get(id)??0))return false
    due.set(id,at+1000)
    const actor=world.interactions.actors.find(a=>a.id===id),life=world.life.actors.find(a=>a.actorId===id)
    if(!life?.intent||life.interruption)return false
    if(id==='merchant'&&atPlace(id,'place.medicine')&&shortageProposal(world,at)) {
      send('economy',{kind:'notice_shortage',actorId:id},{present:true,placeId:'place.medicine',proofId:`stock-check:${at}`});return true
    }
    const needs=projectedNeeds(life,at)
    if(needs.hunger>=60&&life.intent.kind==='eat'&&life.intent.phase==='interacting'&&atPlace(id,life.intent.placeId)) {
      const own=world.interactions.inventory.lots.find(l=>l.ownerId===id&&l.holderId===actor.containerId&&l.itemType==='ration'&&availableQuantity(world.interactions,l.id)>0)
      if(own){send('economy',{kind:'eat',actorId:id,lotId:own.id},{present:true,proofId:`meal:${id}:${at}`});return true}
      const merchant=world.interactions.actors.find(a=>a.id==='merchant')
      if(id==='merchant'||!contact(id,'merchant')||merchant.health<=0)return false
      face(id,point('merchant'))
      const service=tradeContext(id,'merchant'),eligible=tradeEligibility(world,id,'merchant',service)
      const stock=world.interactions.inventory.lots.find(l=>l.ownerId==='merchant'&&l.holderId===merchant.containerId&&l.itemType==='ration'&&availableQuantity(world.interactions,l.id)>0)
      const reason=availableWallet(world.interactions,id)<5?'INSUFFICIENT_FUNDS':!eligible.available?'SERVICE_UNAVAILABLE':!stock?'NO_FOOD_STOCK':null
      if(reason) {
        if(!world.economy.foodNeeds.some(n=>n.actorId===id&&!n.resolvedEventId&&n.reason===reason)) {send('economy',{kind:'food_unavailable',actorId:id,reason},{present:true,proofId:`meal-need:${id}:${at}`});return true}
      } else {send('interaction',{kind:'buy',actorId:id,targetId:'merchant',lotId:stock.id,quantity:1},{unitPrice:5,service});return true}
    }
    return false
  }}
}
