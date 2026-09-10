import { assertInventory, consumeLot, transferLot, itemDefinition, InventoryError } from './inventory.js'

const clone = value => structuredClone(value)
const natural = value => Number.isSafeInteger(value) && value >= 0
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value)
const kinds = ['buy','sell','use','gift']
const fail = code => { throw new InventoryError(code) }
const requireValue = (condition,code) => { if (!condition) fail(code) }
const fingerprint = command => JSON.stringify([command.id,command.kind,command.actorId,command.targetId,command.lotId,command.quantity,command.expectedRevision])

export function createInteractionState(catalog, inventory, actors) {
  const state = {version:1,revision:0,inventory:clone(inventory),actors:clone(actors),events:[],receipts:[]}
  assertInteractionState(state,catalog)
  return state
}

// Structural guard for live state. Full restore/replay validation is a separate
// integration concern; this must not be treated as proof of event provenance.
export function assertInteractionState(state,catalog) {
  requireValue(state?.version === 1 && natural(state.revision),'INVALID_STATE')
  assertInventory(state.inventory,catalog)
  requireValue(Array.isArray(state.actors) && Array.isArray(state.events) && Array.isArray(state.receipts),'INVALID_STATE')
  const actorIds = new Set(), containers = new Set()
  for (const actor of state.actors) {
    requireValue(actor && validId(actor.id) && !actorIds.has(actor.id),'INVALID_ACTOR')
    requireValue(state.inventory.containers.some(c => c.id === actor.containerId) && !containers.has(actor.containerId),'INVALID_ACTOR_CONTAINER')
    requireValue(natural(actor.wallet) && natural(actor.health) && natural(actor.maxHealth) && actor.maxHealth > 0 && actor.health <= actor.maxHealth,'INVALID_ACTOR_VALUES')
    actorIds.add(actor.id); containers.add(actor.containerId)
  }
  requireValue(state.events.length === state.revision && state.receipts.length === state.events.length && state.events.length <= 4096,'INVALID_HISTORY')
  const requests = new Set()
  for (const [i,event] of state.events.entries()) {
    const receipt = state.receipts[i]
    requireValue(event && event.id === `interaction:${i+1}` && kinds.includes(event.kind) && natural(event.at) && (!i || event.at >= state.events[i-1].at),'INVALID_EVENT')
    requireValue(receipt && validId(receipt.requestId) && !requests.has(receipt.requestId) && receipt.eventId === event.id && typeof receipt.fingerprint === 'string','INVALID_RECEIPT')
    requests.add(receipt.requestId)
  }
  return state
}

// context is provided by the trusted scene/policy adapter, never by the UI.
// allowed means distance, visibility, recipient consent and local refusal were
// checked for this command. unitPrice is the adapter's current accepted quote.
export function executeInteraction(state,catalog,command,context) {
  try {
    assertInteractionState(state,catalog)
    requireValue(command && validId(command.id) && kinds.includes(command.kind) && validId(command.actorId) && validId(command.targetId) && typeof command.lotId === 'string' && natural(command.quantity) && command.quantity > 0 && natural(command.expectedRevision),'INVALID_COMMAND')
    const key = fingerprint(command)
    const receipt = state.receipts.find(entry => entry.requestId === command.id)
    if (receipt) {
      requireValue(receipt.fingerprint === key,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),events:[],appliedEventId:receipt.eventId}
    }
    requireValue(command.expectedRevision === state.revision,'STALE_REVISION')
    requireValue(state.events.length < 4096,'HISTORY_FULL')
    requireValue(context?.allowed === true,'INTERACTION_DENIED')
    requireValue(natural(context.at) && (!state.events.length || context.at >= state.events.at(-1).at),'INVALID_TIME')
    const actor = state.actors.find(a => a.id === command.actorId)
    const target = state.actors.find(a => a.id === command.targetId)
    requireValue(actor && target,'UNKNOWN_ACTOR')
    requireValue(command.kind === 'use' ? actor.id === target.id : actor.id !== target.id,'INVALID_TARGET')
    const sourceActor = command.kind === 'buy' ? target : actor
    const recipient = command.kind === 'buy' ? actor : target
    const lot = state.inventory.lots.find(entry => entry.id === command.lotId)
    requireValue(lot,'UNKNOWN_LOT')
    requireValue(lot.holderId === sourceActor.containerId,'NOT_HELD')
    requireValue(lot.ownerId === sourceActor.id,'NOT_OWNED')
    requireValue(command.quantity <= lot.quantity,'INSUFFICIENT_QUANTITY')
    const item = itemDefinition(catalog,lot.itemType)
    const next = clone(state)
    let amount = 0, restoredHealth = 0
    if (command.kind === 'use') {
      requireValue(command.quantity === 1,'USE_ONE_AT_A_TIME')
      requireValue(item.consumable && item.healing > 0,'NO_USABLE_EFFECT')
      requireValue(actor.health < actor.maxHealth,'HEALTH_FULL')
      next.inventory = consumeLot(state.inventory,catalog,{lotId:lot.id,quantity:1})
      restoredHealth = Math.min(item.healing,actor.maxHealth-actor.health)
      next.actors.find(a => a.id === actor.id).health += restoredHealth
    } else {
      const trading = command.kind === 'buy' || command.kind === 'sell'
      requireValue(trading ? item.tradable : item.giftable,trading ? 'NOT_TRADABLE' : 'NOT_GIFTABLE')
      if (trading) {
        requireValue(natural(context.unitPrice) && context.unitPrice > 0,'INVALID_PRICE')
        amount = context.unitPrice * command.quantity
        requireValue(natural(amount),'AMOUNT_OVERFLOW')
        requireValue(recipient.wallet >= amount,'INSUFFICIENT_FUNDS')
        requireValue(natural(sourceActor.wallet+amount),'AMOUNT_OVERFLOW')
        next.actors.find(a => a.id === recipient.id).wallet -= amount
        next.actors.find(a => a.id === sourceActor.id).wallet += amount
      }
      next.inventory = transferLot(state.inventory,catalog,{
        lotId:lot.id,quantity:command.quantity,toHolderId:recipient.containerId,
        toOwnerId:recipient.id,splitId:`split:${command.id}`,
      })
    }
    next.revision++
    const event = {
      id:`interaction:${next.revision}`,kind:command.kind,at:context.at,cause:null,
      actorId:actor.id,targetId:target.id,itemType:item.id,sourceLotId:lot.id,
      resultLotId:command.kind === 'use' ? null : command.quantity === lot.quantity ? lot.id : `split:${command.id}`,
      quantity:command.quantity,fromOwnerId:sourceActor.id,
      toOwnerId:command.kind === 'use' ? null : recipient.id,
      amount,restoredHealth,requestId:command.id,
    }
    next.events.push(event)
    next.receipts.push({requestId:command.id,fingerprint:key,eventId:event.id})
    assertInteractionState(next,catalog)
    return {ok:true,code:'APPLIED',duplicate:false,state:next,events:[clone(event)],appliedEventId:event.id}
  } catch (error) {
    if (!(error instanceof InventoryError)) throw error
    // No candidate state is returned on failure, so callers cannot commit a
    // half-finished transfer. Failed request IDs are not consumed.
    return {ok:false,code:error.code,events:[]}
  }
}
