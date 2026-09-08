import { InventoryError } from './inventory.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const natural=n=>Number.isSafeInteger(n)&&n>=0
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(id)
const active=row=>row.status==='held'
const actor=(state,id)=>state.actors.find(a=>a.id===id)

export function availableWallet(state,actorId,usingId=null) {
  const owner=actor(state,actorId);check(owner,'UNKNOWN_ACTOR')
  const committed=(state.reservations??[]).filter(r=>active(r)&&r.actorId===actorId&&r.id!==usingId).reduce((n,r)=>n+r.amount,0)
  return Math.max(0,owner.wallet-committed)
}
export function requireAvailableFunds(state,actorId,amount,usingId=null) {
  check(natural(amount),'INVALID_AMOUNT')
  check(actor(state,actorId)?.wallet>=amount,'INSUFFICIENT_FUNDS')
  check(availableWallet(state,actorId,usingId)>=amount,'FUNDS_COMMITTED')
}
export function availableQuantity(state,lotId,usingId=null) {
  const lot=state.inventory.lots.find(l=>l.id===lotId)
  if(!lot)return 0
  const committed=(state.itemReservations??[]).filter(r=>active(r)&&r.lotId===lotId&&r.id!==usingId).reduce((n,r)=>n+r.quantity,0)
  return Math.max(0,lot.quantity-committed)
}
export function requireAvailableLot(state,lotId,quantity,usingId=null) {
  check(natural(quantity)&&quantity>0,'INVALID_QUANTITY')
  check(availableQuantity(state,lotId,usingId)>=quantity,'ITEMS_COMMITTED')
}
export function reserveMoney(state,{id,actorId,amount,sourceId,at}) {
  check(Array.isArray(state.reservations)&&!state.reservations.some(r=>r.id===id),'RESERVATION_EXISTS')
  check(state.reservations.length<4096,'HISTORY_FULL')
  check(validId(id)&&validId(sourceId)&&natural(amount)&&amount>0&&natural(at),'INVALID_RESERVATION')
  requireAvailableFunds(state,actorId,amount)
  const row={id,actorId,amount,sourceId,status:'held',at,reasonEventId:null};state.reservations.push(row);return row
}
export function reserveItems(state,{id,actorId,lotId,quantity,sourceId,at}) {
  check(Array.isArray(state.itemReservations)&&!state.itemReservations.some(r=>r.id===id),'RESERVATION_EXISTS')
  check(state.itemReservations.length<4096,'HISTORY_FULL')
  check(validId(id)&&validId(sourceId)&&natural(at),'INVALID_RESERVATION')
  const lot=state.inventory.lots.find(l=>l.id===lotId)
  check(lot&&lot.ownerId===actorId&&lot.holderId===actor(state,actorId)?.containerId,'NOT_OWNED')
  requireAvailableLot(state,lotId,quantity)
  const row={id,actorId,lotId,quantity,holderId:lot.holderId,sourceId,status:'held',at,reasonEventId:null};state.itemReservations.push(row);return row
}
/** Authorized contract cargo: the owner and the actual carrier are distinct. */
export function reserveCargo(state,{id,actorId,lotId,holderId,quantity,sourceId,at}) {
  check(Array.isArray(state.itemReservations)&&!state.itemReservations.some(r=>r.id===id),'RESERVATION_EXISTS')
  check(state.itemReservations.length<4096,'HISTORY_FULL')
  check(validId(id)&&validId(sourceId)&&natural(at),'INVALID_RESERVATION')
  const lot=state.inventory.lots.find(l=>l.id===lotId)
  check(lot&&lot.ownerId===actorId&&lot.holderId===holderId&&state.actors.some(a=>a.containerId===holderId),'CARGO_UNAVAILABLE')
  requireAvailableLot(state,lotId,quantity)
  const row={id,actorId,lotId,holderId,quantity,sourceId,status:'held',at,reasonEventId:null}
  state.itemReservations.push(row);return row
}
export function releaseReservation(state,id,status='released') {
  if(id===null)return
  check(['released','spent'].includes(status),'INVALID_RESERVATION_STATUS')
  const row=[...(state.reservations??[]),...(state.itemReservations??[])].find(r=>r.id===id)
  check(row&&['held','impaired'].includes(row.status),'RESERVATION_UNAVAILABLE');row.status=status
}

/** Loss is real: reservations cannot protect pockets/cargo against force. */
export function reconcileReservations(state,cause) {
  const impaired=[],budgets=new Map(state.actors.map(a=>[a.id,a.wallet])),quantities=new Map(state.inventory.lots.map(l=>[l.id,l.quantity]))
  for(const row of state.reservations??[])if(active(row)) {
    const remaining=budgets.get(row.actorId)??0
    if(remaining>=row.amount)budgets.set(row.actorId,remaining-row.amount)
    else {row.status='impaired';row.reasonEventId=cause;impaired.push({...row,reason:'FUNDS_UNAVAILABLE'})}
  }
  for(const row of state.itemReservations??[])if(active(row)) {
    const lot=state.inventory.lots.find(l=>l.id===row.lotId),remaining=quantities.get(row.lotId)??0
    if(lot&&lot.ownerId===row.actorId&&lot.holderId===row.holderId&&remaining>=row.quantity)quantities.set(row.lotId,remaining-row.quantity)
    else {row.status='impaired';row.reasonEventId=cause;impaired.push({...row,reason:'CARGO_UNAVAILABLE'})}
  }
  return impaired
}
