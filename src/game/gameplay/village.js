import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { InventoryError, transferLot, consumeLot } from './inventory.js'
import { requireAvailableFunds,requireAvailableLot } from './reservations.js'
const clone = value => structuredClone(value)
const check = (ok, code) => { if (!ok) throw new InventoryError(code) }
export function createVillageState(setup) {
  return {version:1,masked:setup.masked,aid:clone(setup.aid),events:clone(setup.events),settled:clone(setup.settled)}
}
// Story transitions use the same actors and inventory as combat and commerce.
// Called only on the coordinator's transaction candidate; failure discards it.
export function executeVillage(world,catalog,command,context) {
  const s=world.village, actors=world.interactions.actors, inventory=world.interactions.inventory
  check(s && activeEventCount(s)<4096,'HISTORY_FULL')
  check(context.allowed===true,'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0&&Number.isSafeInteger(context.at+100000),'INVALID_TIME')
  check(['take','settle','return','aid','reward','mask','relocate_pickup','relocate_deliver'].includes(command.kind),'INVALID_COMMAND')
  const actor=actors.find(a=>a.id===command.actorId)
  check(actor?.health>0,'ACTOR_DEAD')
  const event={id:`village:${nextEventNumber(s)}`,kind:command.kind,at:context.at,
    actorId:actor.id,targetId:null,cause:null,requestId:command.id}
  const player=actors.find(a=>a.id==='player'),merchant=actors.find(a=>a.id==='merchant')
  const parcel=inventory.lots.find(l=>l.id==='medicine-parcel')
  if(command.kind==='mask') {
    check(actor.id==='player','INVALID_ACTOR'); s.masked=!s.masked; event.masked=s.masked
  } else if(command.kind==='relocate_pickup'||command.kind==='relocate_deliver') {
    const operationId='city-parcel-layout-v1'
    const position=context.position
    check(actor.id==='merchant'&&parcel?.ownerId===actor.id,'INVALID_ACTOR')
    check(context.reachable===true&&typeof context.proofId==='string'&&context.proofId.length>0,'MISSING_CONTACT')
    check(position&&['x','y','z'].every(k=>Number.isFinite(position[k])&&Math.abs(position[k])<=(k==='y'?1024:256)),'INVALID_POSITION')
    check(!s.events.some(e=>e.kind==='relocate_deliver'&&e.operationId===operationId),'ALREADY_RELOCATED')
    if(command.kind==='relocate_pickup') {
      check(parcel.holderId==='stall'&&!s.events.some(e=>e.kind==='relocate_pickup'&&e.operationId===operationId),'NOT_AVAILABLE')
      world.interactions.inventory=transferLot(inventory,catalog,{lotId:parcel.id,quantity:1,toHolderId:actor.containerId})
    } else {
      const source=s.events.find(e=>e.kind==='relocate_pickup'&&e.operationId===operationId)
      check(source&&parcel.holderId===actor.containerId,'NOT_HELD')
      world.interactions.inventory=transferLot(inventory,catalog,{lotId:parcel.id,quantity:1,toHolderId:'stall'})
      event.cause=source.id
    }
    event.targetId='merchant';event.operationId=operationId;event.position=clone(position);event.proofId=context.proofId
  } else if(command.kind==='take') {
    check(actor.id==='player' && parcel?.holderId==='stall','NOT_AVAILABLE')
    world.interactions.inventory=transferLot(inventory,catalog,{lotId:parcel.id,quantity:1,toHolderId:player.containerId})
    event.targetId='merchant'
  } else if(command.kind==='settle') {
    check(actor.id==='player' && parcel?.holderId===player.containerId,'NOT_HELD')
    check(actors.find(a=>a.id==='guard')?.health>0,'RECIPIENT_DEAD')
    check(player.wallet>=20,'INSUFFICIENT_FUNDS')
    requireAvailableFunds(world.interactions,player.id,20)
    const source=s.events.findLast(e=>e.kind==='take')
    check(source && !s.settled.includes(source.id),'NOT_AVAILABLE')
    world.interactions.inventory=transferLot(inventory,catalog,{lotId:parcel.id,quantity:1,toHolderId:'guard-bag'})
    check(Number.isSafeInteger(merchant.wallet+20),'AMOUNT_OVERFLOW')
    player.wallet-=20; merchant.wallet+=20; s.settled.push(source.id)
    for(const c of world.crime.cases) if(c.incidentId===source.id) c.resolved=true
    event.targetId='guard'; event.cause=source.id; event.amount=20
  } else if(command.kind==='return') {
    check(actor.id==='guard' && parcel?.holderId==='guard-bag','NOT_HELD')
    world.interactions.inventory=transferLot(inventory,catalog,{lotId:parcel.id,quantity:1,toHolderId:'stall'})
    event.targetId='merchant'; event.cause=s.events.findLast(e=>e.kind==='settle')?.id??null
  } else if(command.kind==='aid') {
    const patient=actors.find(a=>a.id==='resident-1'),lot=inventory.lots.find(l=>l.id===command.lotId)
    check(actor.id==='player' && patient.health>0,'INVALID_TARGET')
    check(!s.aid.eventId,'ALREADY_HELPED')
    check(lot?.holderId===player.containerId && lot.ownerId===player.id && lot.itemType==='medicine','OWN_MEDICINE_REQUIRED')
    check(typeof context.identified==='boolean','MISSING_OBSERVATION')
    requireAvailableLot(world.interactions,lot.id,1)
    world.interactions.inventory=consumeLot(inventory,catalog,{lotId:lot.id,quantity:1})
    patient.health=Math.min(patient.maxHealth,patient.health+25)
    s.aid={eventId:event.id,dueAt:context.at+20000,subject:context.identified&&!s.masked?'player':null,rewardEvent:null}
    event.targetId=patient.id; event.subjectId=s.aid.subject
    if(s.aid.subject){let r=world.social.relationships.find(r=>r.fromId===patient.id&&r.toId===player.id);if(!r){r={fromId:patient.id,toId:player.id,trust:0};world.social.relationships.push(r)}r.trust=Math.min(100,r.trust+25)}
  } else {
    check(actor.id==='resident-1' && player.health>0,'INVALID_TARGET')
    check(s.aid.eventId && !s.aid.rewardEvent && s.aid.subject==='player' && context.at>=s.aid.dueAt,'REWARD_NOT_DUE')
    check(context.identified===true && !s.masked,'SUBJECT_UNIDENTIFIED')
    check(actor.wallet>=15,'INSUFFICIENT_FUNDS')
    requireAvailableFunds(world.interactions,actor.id,15)
    check(Number.isSafeInteger(player.wallet+15),'AMOUNT_OVERFLOW')
    actor.wallet-=15; player.wallet+=15; s.aid.rewardEvent=event.id
    event.targetId='player'; event.cause=s.aid.eventId; event.amount=15
  }
  s.events.push(event)
  return [clone(event)]
}
