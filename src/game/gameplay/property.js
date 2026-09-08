import { activeEventCount,findReceipt } from './historyArchive.js'
import { transferLot, assertInventory, InventoryError } from './inventory.js'

const clone = value => structuredClone(value)
const natural = n => Number.isSafeInteger(n) && n >= 0
const id = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(s)
const check = (ok,code) => { if (!ok) throw new InventoryError(code) }

export function createPropertyState() {
  return {version:1,revision:0,events:[],receipts:[],moneyClaims:[]}
}

// Operates on the existing inventory/wallets. Death never spawns extra loot.
// The coordinator refreshes equipment references after this transaction.
export function executeProperty(state,interactions,combat,catalog,command,context) {
  try {
    check(state?.version === 1 && natural(state.revision),'INVALID_PROPERTY_STATE')
    check(command && id(command.id) && id(command.actorId) && id(command.targetId) &&
      natural(command.expectedRevision) && ['loot_item','loot_money'].includes(command.kind),'INVALID_COMMAND')
    const fingerprint = JSON.stringify([command.kind,command.expectedRevision,command.actorId,
      command.targetId,command.lotId ?? null,command.quantity ?? null,command.amount ?? null,
      context?.at,context?.allowed === true,context?.reachable === true,context?.proofId])
    const prior = findReceipt(state,command.id)
    if (prior) {
      check(prior.fingerprint === fingerprint,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),interactions:clone(interactions),events:[]}
    }
    check(command.expectedRevision === state.revision,'STALE_REVISION')
    check(activeEventCount(state)<4096,'HISTORY_FULL')
    check(context?.allowed === true && context.reachable === true && id(context.proofId),'MISSING_LOOT_EVIDENCE')
    check(natural(context.at) && (!state.events.length || context.at >= state.events.at(-1).at),'INVALID_TIME')
    const actor = interactions.actors.find(a => a.id === command.actorId)
    const target = interactions.actors.find(a => a.id === command.targetId)
    check(actor && target && actor.id !== target.id,'INVALID_TARGET')
    check(actor.health > 0,'ACTOR_DEAD')
    check(target.health === 0,'TARGET_NOT_DEAD')
    const death = combat?.events.find(e => e.kind === 'died' && e.targetId === target.id)
    check(death && death.at <= context.at,'MISSING_DEATH_EVENT')
    const next = clone(state), items = clone(interactions)
    const event = {id:`property:${state.revision+1}`,kind:command.kind,at:context.at,
      actorId:actor.id,targetId:target.id,cause:death.id,proofId:context.proofId,requestId:command.id}
    if (command.kind === 'loot_item') {
      check(typeof command.lotId === 'string' && natural(command.quantity) && command.quantity > 0,'INVALID_COMMAND')
      const lot = items.inventory.lots.find(l => l.id === command.lotId)
      check(lot,'UNKNOWN_LOT')
      check(lot.holderId === target.containerId,'NOT_HELD')
      // Omit toOwnerId: looting changes custody, never legal ownership.
      items.inventory = transferLot(items.inventory,catalog,{
        lotId:lot.id,quantity:command.quantity,toHolderId:actor.containerId,splitId:`loot:${command.id}`,
      })
      Object.assign(event,{sourceLotId:lot.id,
        resultLotId:command.quantity === lot.quantity ? lot.id : `loot:${command.id}`,
        itemType:lot.itemType,quantity:command.quantity,ownerId:lot.ownerId,
        fromHolderId:target.containerId,toHolderId:actor.containerId})
    } else {
      check(natural(command.amount) && command.amount > 0,'INVALID_AMOUNT')
      check(target.wallet >= command.amount,'INSUFFICIENT_FUNDS')
      check(natural(actor.wallet+command.amount),'AMOUNT_OVERFLOW')
      items.actors.find(a => a.id === target.id).wallet -= command.amount
      items.actors.find(a => a.id === actor.id).wallet += command.amount
      // Wallet currency is fungible. Keep a restitution claim even if spent.
      const claim = {id:`claim:${event.id}`,sourceEventId:event.id,
        claimantId:target.id,holderId:actor.id,amount:command.amount}
      next.moneyClaims.push(claim)
      Object.assign(event,{amount:command.amount,claimId:claim.id})
    }
    assertInventory(items.inventory,catalog)
    next.revision++
    next.events.push(event)
    next.receipts.push({requestId:command.id,fingerprint})
    return {ok:true,code:'APPLIED',duplicate:false,state:next,interactions:items,events:[clone(event)]}
  } catch (error) {
    if (!(error instanceof InventoryError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}
