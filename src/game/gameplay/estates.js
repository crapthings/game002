import { InventoryError,transferLot,occupiedSpace,itemDefinition } from './inventory.js'
import { emitContinuity } from './continuity.js'
import { availableQuantity,requireAvailableFunds,releaseReservation } from './reservations.js'
import { previewCombat } from './combat.js'
import { roleHolders } from './factionRoles.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(w,id)=>w.interactions.actors.find(a=>a.id===id)
export function estateKeeper(world,ownerId) {
  const row=world.continuity?.estates?.find(r=>r.ownerId===ownerId)
  return row&&actor(world,row.keeperId)?.health>0?row:null
}
export function estateRecipient(world,ownerId) {return actor(world,ownerId)?.health>0?ownerId:estateKeeper(world,ownerId)?.keeperId??null}
export function cargoRecipient(world,row) {return estateRecipient(world,row.issuerId)}
export function requireEstateMeeting(world,ownerId,context) {
  const estate=estateKeeper(world,ownerId)
  check(estate&&actor(world,ownerId)?.health===0,'NO_ESTATE_KEEPER')
  check(context.recipientId===estate.keeperId&&context.withinRange===true&&context.clear===true&&context.present===true&&context.placeId===estate.placeId&&typeof context.proofId==='string','MISSING_ESTATE_MEETING')
  check(previewCombat(world.combat,world.interactions.actors,context.at).find(f=>f.id===estate.keeperId)?.phase==='idle','ACTOR_BUSY')
  return estate
}
export function hasRoom(world,catalog,holderId,itemType,quantity) {
  const cap=world.interactions.inventory.containers.find(c=>c.id===holderId)?.capacity
  return cap===null||Number.isSafeInteger(cap)&&occupiedSpace(world.interactions.inventory,catalog,holderId)+itemDefinition(catalog,itemType).unitSpace*quantity<=cap
}
/** Claims retain the source account and contractual amount, never a second wallet. */
export function recordEstateClaims(world,sourceEvents,at,requestId) {
  if(!world.continuity?.justiceVersion)return []
  if(!sourceEvents.some(e=>['died','justice_enabled','bounty_claim_due'].includes(e.kind)))return []
  const out=[],candidates=[]
  for(const row of world.opportunities?.entries??[])if(row.returnEventId&&row.status!=='fulfilled'&&row.rewardAmount>0&&
    actor(world,row.issuerId)?.health===0&&world.opportunities.events.some(e=>e.id===row.returnEventId&&e.kind==='opportunity_payment_due'))
    candidates.push({kind:'opportunity',sourceId:row.id,sourceEventId:row.returnEventId,accountId:row.issuerId,recipientId:row.assigneeId,amount:row.rewardAmount,reservationId:row.rewardReservationId})
  for(const row of world.factions?.bounties??[])if(row.status==='claim_due'&&actor(world,row.issuerId)?.health===0)
    candidates.push({kind:'bounty',sourceId:row.id,sourceEventId:row.captureEventId,accountId:row.issuerId,recipientId:row.claimantId,amount:row.claimantId===row.issuerId?0:row.amount,reservationId:row.reservationId})
  for(const row of world.factions?.escorts??[])if(row.status==='delivered'&&actor(world,row.issuerId)?.health===0)
    candidates.push({kind:'escort',sourceId:row.id,sourceEventId:row.deliveredEventId,accountId:row.issuerId,recipientId:row.assigneeId,amount:row.amount,reservationId:row.reservationId})
  for(const claim of candidates) {
    if(world.continuity.estateClaims.some(r=>r.kind===claim.kind&&r.sourceId===claim.sourceId))continue
    check(world.continuity.estateClaims.length<4096,'HISTORY_FULL')
    const death=world.combat.events.findLast(e=>e.kind==='died'&&e.targetId===claim.accountId)
    const {kind:claimKind,...terms}=claim
    const e=emitContinuity(world,{id:requestId,actorId:claim.accountId,targetId:claim.recipientId},{at},'estate_debt_registered',
      {...terms,claimKind,cause:claim.sourceEventId,deathEventId:death?.id??null,triggerEventId:sourceEvents.at(-1)?.id??null})
    world.continuity.estateClaims.push({...claim,id:`estate-claim:${world.continuity.estateClaims.length+1}`,status:'due',registeredEventId:e.id,paidEventId:null});out.push(e)
  }
  return out
}
export function executeEstates(world,catalog,command,context) {
  check(world.continuity?.justiceVersion===1&&context.allowed===true,'JUSTICE_NOT_READY')
  const person=actor(world,command.actorId)
  check(person?.health>0&&previewCombat(world.combat,world.interactions.actors,context.at).find(f=>f.id===person.id)?.phase==='idle','ACTOR_BUSY')
  if(command.kind==='take_estate_custody') {
    const mandate=world.continuity.estateMandates.find(m=>m.ownerId===command.targetId&&m.keeperId===person.id)
    const owner=actor(world,command.targetId),death=world.combat.events.findLast(e=>e.kind==='died'&&e.targetId===owner?.id)
    check(mandate&&owner?.health===0&&death,'NO_ESTATE_MANDATE')
    check(!world.continuity.estates.some(r=>r.ownerId===owner.id),'ESTATE_ALREADY_ASSIGNED')
    check(context.observed===true&&context.withinRange===true&&context.clear===true&&typeof context.proofId==='string','MISSING_ESTATE_CONTACT')
    const e=emitContinuity(world,command,context,'estate_transfer',{cause:death.id,mandateEventId:mandate.sourceEventId,transferType:'custody_authority',
      ownerId:owner.id,keeperId:person.id,accountId:owner.id,holderId:owner.containerId,placeId:mandate.placeId,amount:0,proofId:context.proofId})
    world.continuity.estates.push({ownerId:owner.id,keeperId:person.id,placeId:mandate.placeId,sourceEventId:e.id,deathEventId:death.id})
    return [e]
  }
  if(command.kind==='collect_estate_claim') {
    const claim=world.continuity.estateClaims.find(r=>r.id===command.claimId&&r.status==='due')
    check(claim,'NO_ESTATE_DEBT')
    const entitled=person.id===claim.recipientId||estateKeeper(world,claim.recipientId)?.keeperId===person.id
    check(entitled&&context.identified===true,'CLAIMANT_UNIDENTIFIED')
    const estate=requireEstateMeeting(world,claim.accountId,context)
    requireAvailableFunds(world.interactions,claim.accountId,claim.amount,claim.reservationId)
    check(Number.isSafeInteger(actor(world,claim.recipientId).wallet+claim.amount),'AMOUNT_OVERFLOW')
    const hold=world.interactions.reservations.find(r=>r.id===claim.reservationId)
    if(hold&&['held','impaired'].includes(hold.status))releaseReservation(world.interactions,hold.id,claim.amount?'spent':'released')
    actor(world,claim.accountId).wallet-=claim.amount;actor(world,claim.recipientId).wallet+=claim.amount
    const e=emitContinuity(world,command,context,'estate_debt_paid',{cause:claim.sourceEventId,claimId:claim.id,amount:claim.amount,
      accountId:claim.accountId,recipientId:claim.recipientId,authorizationEventId:estate.sourceEventId,proofId:context.proofId})
    claim.status='paid';claim.paidEventId=e.id
    if(claim.kind==='bounty') {
      const row=world.factions.bounties.find(r=>r.id===claim.sourceId);row.status=claim.amount?'paid':'closed';row.completionEventId=e.id
    } else if(claim.kind==='escort') {
      const row=world.factions.escorts.find(r=>r.id===claim.sourceId);row.status='fulfilled';row.completionEventId=e.id
      for(const k of world.factions.escortKnowledge.filter(k=>k.escortId===row.id&&[person.id,estate.keeperId].includes(k.actorId)))Object.assign(k,{status:'fulfilled',evidenceId:e.id,at:context.at})
    } else {
      const row=world.opportunities.entries.find(r=>r.id===claim.sourceId);row.estatePaidEventId=e.id;row.fundsBlocked=false
      const assignment=world.life.actors.find(a=>a.actorId===row.assigneeId)?.assignment
      if(assignment?.opportunityId===row.id)assignment.outcomeEventId=e.id
    }
    return [e]
  }
  if(command.kind==='surrender_due_property') {
    const item=world.continuity.restitutions.find(r=>r.id===command.restitutionId&&r.status==='due'&&r.subjectId===person.id)
    check(item&&roleHolders(world,'law','constable').includes(command.targetId),'NO_RETURNABLE_PROPERTY')
    check(context.withinRange===true&&context.clear===true&&context.identified===true&&typeof context.proofId==='string','MISSING_RETURN_CONTACT')
    const receiver=actor(world,command.targetId),lot=world.interactions.inventory.lots.find(l=>l.id===item.lotId&&l.ownerId===item.ownerId&&l.holderId===person.containerId)
    check(lot&&availableQuantity(world.interactions,lot.id)>=item.quantity,'RETURN_ITEMS_REQUIRED')
    const resultLotId=lot.quantity===item.quantity?lot.id:`surrendered:${command.id}`
    world.interactions.inventory=transferLot(world.interactions.inventory,catalog,{lotId:lot.id,quantity:item.quantity,toHolderId:receiver.containerId,splitId:resultLotId})
    const e=emitContinuity(world,command,context,'property_surrendered',{cause:item.id,lotId:resultLotId,quantity:item.quantity,ownerId:item.ownerId,
      fromHolderId:person.containerId,toHolderId:receiver.containerId,proofId:context.proofId})
    item.status='carried';item.officerId=receiver.id;item.lotId=resultLotId;item.receivedEventId=e.id;return [e]
  }
  const item=world.continuity.restitutions.find(r=>r.id===command.restitutionId&&r.status==='carried'&&r.officerId===person.id)
  check(item&&command.kind==='return_seized_property','NO_RETURNABLE_PROPERTY')
  const lot=world.interactions.inventory.lots.find(l=>l.id===item.lotId&&l.ownerId===item.ownerId&&l.holderId===person.containerId)
  check(lot&&lot.quantity>=item.quantity,'RETURN_ITEMS_REQUIRED')
  const owner=actor(world,item.ownerId),recipient=estateRecipient(world,item.ownerId)
  check(context.withinRange===true&&context.clear===true&&typeof context.proofId==='string','MISSING_RETURN_CONTACT')
  let holderId
  if(item.lotId==='medicine-parcel') {
    check(context.atStall===true,'WRONG_SERVICE_PLACE');holderId='stall'
  } else {
    check(recipient&&context.recipientId===recipient,'NO_ESTATE_KEEPER')
    if(owner.health===0)requireEstateMeeting(world,item.ownerId,context)
    holderId=owner.containerId
  }
  check(availableQuantity(world.interactions,lot.id)>=item.quantity,'ITEMS_COMMITTED')
  world.interactions.inventory=transferLot(world.interactions.inventory,catalog,{lotId:lot.id,quantity:item.quantity,toHolderId:holderId,splitId:`returned:${command.id}`})
  const e=emitContinuity(world,{...command,targetId:item.ownerId},context,'seized_property_returned',{cause:item.id,sourceEventId:item.sourceEventId,lotId:item.lotId,
    quantity:item.quantity,ownerId:item.ownerId,fromHolderId:person.containerId,toHolderId:holderId,proofId:context.proofId})
  item.status='returned';item.returnedEventId=e.id;return [e]
}
