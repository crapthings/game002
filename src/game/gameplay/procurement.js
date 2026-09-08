import { InventoryError,transferLot } from './inventory.js'
import { availableQuantity,availableWallet,requireAvailableFunds,requireAvailableLot,reserveItems,reserveCargo,releaseReservation } from './reservations.js'
import { ECONOMY_V1 as rules } from './content/economyV1.js'
import { placeStatus } from './places.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)

export function offerProcurement(world,need,command,context,{emit}) {
  check(need.templateId==='merchant-restock-v1'&&need.issuerId===command.actorId&&command.actorId===rules.shopkeeperId,'UNKNOWN_NEED')
  const id=`op:${world.opportunities.entries.length+1}`
  const event=emit(world,'opportunity_offered',command.actorId,null,context.at,command.id,{opportunityId:id,rootCauseId:need.id,cause:need.sourceEventId})
  world.opportunities.entries.push({id,templateId:need.templateId,title:'药铺缺货，找货郎采购',issuerId:command.actorId,rootCauseId:need.id,offeredEventId:event.id,
    targetActorId:rules.supplierId,targetPlaceId:'place.supplier-loading',returnPlaceId:rules.shopPlaceId,
    requirements:{kind:'procurement',lines:structuredClone(need.lines)},proposedReward:rules.courierReward,rewardAmount:null,rewardReservationId:null,
    purchaseBudget:need.lines.reduce((n,line)=>n+line.quantity*rules.wholesale[line.itemType],0),purchaseReservationId:null,
    deadlineAt:context.at+rules.contractDurationMs,status:'offered',assigneeId:null,acceptedAt:null,identifiedAssignee:false,
    completionEventId:null,reason:null,fundsBlocked:false,knownBy:[command.actorId],declinedBy:[],
    shipment:{pickedUpEventId:null,deliveredEventId:null,cargo:[]}})
  return [event]
}

/** Purchase, custody, delivery and payment change the same transaction candidate. */
export function executeProcurement(world,catalog,row,command,context,{emit,finish,meeting,closeKnownAssignment}) {
  if(command.kind==='return_cargo') {
    check(row.restitution&&row.assigneeId===command.actorId&&!row.restitution.returnedEventId,'NO_CARGO_TO_RETURN')
    meeting(world,row.issuerId,command.actorId,context)
    check(context.present===true&&context.placeId===row.returnPlaceId,'WRONG_SERVICE_PLACE')
    const carrier=actor(world,command.actorId),owner=actor(world,row.issuerId),returned=[]
    for(const cargo of row.shipment.cargo) {
      const lot=world.interactions.inventory.lots.find(l=>l.id===cargo.lotId&&l.ownerId===owner.id&&l.holderId===carrier.containerId)
      if(!lot)continue
      const quantity=Math.min(lot.quantity,cargo.quantity)
      world.interactions.inventory=transferLot(world.interactions.inventory,catalog,{lotId:lot.id,quantity,toHolderId:owner.containerId,splitId:`reclaim:${row.id}:${lot.id}`})
      returned.push({lotId:lot.id,quantity})
    }
    check(returned.length,'NO_CARGO_TO_RETURN')
    const event=emit(world,'cargo_returned',carrier.id,owner.id,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.restitution.sourceEventId,cargo:returned,proofId:context.proofId})
    row.restitution.returnedEventId=event.id;closeKnownAssignment(world,row,event.id);return [event]
  }
  check(row.status==='accepted'&&row.assigneeId===command.actorId,'NOT_ASSIGNEE')
  check(actor(world,command.actorId)?.health>0&&actor(world,row.issuerId)?.health>0,'ACTOR_DEAD')
  check(context.at<row.deadlineAt||row.returnEventId,'OPPORTUNITY_EXPIRED')
  const courier=actor(world,command.actorId),supplier=actor(world,row.targetActorId),buyer=actor(world,row.issuerId)
  const learnedFailure=reason=>{
    const failed=finish(world,row,'failed',reason,context.at,command.id,row.offeredEventId)
    const learned=emit(world,'opportunity_outcome_learned',courier.id,buyer.id,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:failed.id,reason,proofId:context.proofId})
    closeKnownAssignment(world,row,learned.id);return [failed,learned]
  }
  if(command.kind==='pickup_cargo') {
    check(!row.shipment.pickedUpEventId,'CARGO_ALREADY_PICKED_UP')
    meeting(world,row.targetActorId,command.actorId,context)
    check(context.present===true&&context.placeId===row.targetPlaceId,'WRONG_SERVICE_PLACE')
    check(placeStatus(world,row.targetPlaceId,context.at).open,'SUPPLIER_CLOSED')
    const selections=[]
    for(const line of row.requirements.lines) {
      let remaining=line.quantity
      for(const lot of world.interactions.inventory.lots)if(remaining&&lot.ownerId===supplier.id&&lot.holderId===supplier.containerId&&lot.itemType===line.itemType) {
        const quantity=Math.min(remaining,availableQuantity(world.interactions,lot.id))
        if(quantity){selections.push({lotId:lot.id,itemType:lot.itemType,quantity,whole:quantity===lot.quantity});remaining-=quantity}
      }
      if(remaining)return learnedFailure('SUPPLIER_EXHAUSTED')
    }
    if(availableWallet(world.interactions,buyer.id,row.purchaseReservationId)<row.purchaseBudget)return learnedFailure('PROCUREMENT_FUNDS_UNAVAILABLE')
    requireAvailableFunds(world.interactions,buyer.id,row.purchaseBudget,row.purchaseReservationId)
    check(Number.isSafeInteger(supplier.wallet+row.purchaseBudget),'AMOUNT_OVERFLOW')
    const funds=world.interactions.reservations.find(r=>r.id===row.purchaseReservationId)
    check(funds&&funds.actorId===buyer.id&&funds.sourceId===row.id&&funds.amount===row.purchaseBudget,'RESERVATION_UNAVAILABLE')
    const event=emit(world,'cargo_picked_up',courier.id,supplier.id,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.offeredEventId,amount:row.purchaseBudget,proofId:context.proofId,placeId:row.targetPlaceId})
    for(const [i,line] of selections.entries()) {
      const sourceId=`reserve:${row.id}:source:${i}`,cargoId=`reserve:${row.id}:cargo:${i}`,splitId=`cargo:${row.id}:${i}`
      reserveItems(world.interactions,{id:sourceId,actorId:supplier.id,lotId:line.lotId,quantity:line.quantity,sourceId:row.id,at:context.at})
      world.interactions.inventory=transferLot(world.interactions.inventory,catalog,{lotId:line.lotId,quantity:line.quantity,toHolderId:courier.containerId,toOwnerId:buyer.id,splitId})
      releaseReservation(world.interactions,sourceId,'spent')
      const lotId=line.whole?line.lotId:splitId
      reserveCargo(world.interactions,{id:cargoId,actorId:buyer.id,holderId:courier.containerId,lotId,quantity:line.quantity,sourceId:row.id,at:context.at})
      row.shipment.cargo.push({lotId,sourceLotId:line.lotId,itemType:line.itemType,quantity:line.quantity,reservationId:cargoId})
    }
    releaseReservation(world.interactions,row.purchaseReservationId,'spent');buyer.wallet-=row.purchaseBudget;supplier.wallet+=row.purchaseBudget
    row.shipment.pickedUpEventId=event.id;event.cargo=structuredClone(row.shipment.cargo)
    Object.assign(world.opportunities.events.find(e=>e.id===event.id),{cargo:structuredClone(event.cargo)})
    return [event]
  }
  check(command.kind==='deliver_cargo'&&row.shipment.pickedUpEventId,'DELIVERY_NOT_COMPLETE')
  meeting(world,row.issuerId,command.actorId,context)
  check(context.present===true&&context.placeId===row.returnPlaceId&&typeof context.identified==='boolean','WRONG_SERVICE_PLACE')
  const events=[]
  if(!row.shipment.deliveredEventId) {
    for(const cargo of row.shipment.cargo) {
      const lot=world.interactions.inventory.lots.find(l=>l.id===cargo.lotId)
      check(lot&&lot.ownerId===buyer.id&&lot.holderId===courier.containerId&&lot.quantity>=cargo.quantity,'CARGO_UNAVAILABLE')
      requireAvailableLot(world.interactions,lot.id,cargo.quantity,cargo.reservationId)
      world.interactions.inventory=transferLot(world.interactions.inventory,catalog,{lotId:lot.id,quantity:cargo.quantity,toHolderId:buyer.containerId,splitId:`delivered:${row.id}:${lot.id}`})
      releaseReservation(world.interactions,cargo.reservationId,'spent')
    }
    const event=emit(world,'stock_delivered',courier.id,buyer.id,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.shipment.pickedUpEventId,proofId:context.proofId,placeId:row.returnPlaceId,cargo:structuredClone(row.shipment.cargo)})
    row.shipment.deliveredEventId=event.id;events.push(event)
  }
  if(availableWallet(world.interactions,buyer.id,row.rewardReservationId)<row.rewardAmount) {
    check(!row.returnEventId,'PAYMENT_PENDING')
    const event=emit(world,'opportunity_payment_due',buyer.id,courier.id,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.shipment.deliveredEventId,amount:row.rewardAmount,proofId:context.proofId})
    row.returnEventId=event.id;row.reason='AWAITING_PAYMENT';row.fundsBlocked=true;events.push(event);return events
  }
  if(row.rewardAmount) {
    requireAvailableFunds(world.interactions,buyer.id,row.rewardAmount,row.rewardReservationId)
    check(Number.isSafeInteger(courier.wallet+row.rewardAmount),'AMOUNT_OVERFLOW')
    releaseReservation(world.interactions,row.rewardReservationId,'spent');buyer.wallet-=row.rewardAmount;courier.wallet+=row.rewardAmount
  }
  const event=emit(world,'opportunity_fulfilled',courier.id,buyer.id,context.at,command.id,{opportunityId:row.id,rootCauseId:row.rootCauseId,cause:row.returnEventId??row.shipment.deliveredEventId,amount:row.rewardAmount,proofId:context.proofId,identified:row.identifiedAssignee&&context.identified})
  row.status='fulfilled';row.completionEventId=event.id;row.returnEventId=event.id;row.fundsBlocked=false;row.reason=null
  closeKnownAssignment(world,row,event.id);events.push(event);return events
}
