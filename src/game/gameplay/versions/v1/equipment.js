import { InventoryError, itemDefinition } from './inventory.js'
import { previewCombat } from './combat.js'

const clone = value => structuredClone(value)
const natural = n => Number.isSafeInteger(n) && n >= 0
const check = (ok,code) => { if (!ok) throw new InventoryError(code) }
const id = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(s)

export function createEquipmentState(actors) {
  return {version:1,revision:0,loadouts:actors.map(a => ({actorId:a.id,weapon:null,armor:null})),events:[],receipts:[]}
}

export function equippedLot(equipment,lotId) {
  return equipment.loadouts.some(l => l.weapon === lotId || l.armor === lotId)
}

// Rebuild from base attributes every time; never accumulate bonuses. Dead
// actors keep their inventory for looting, but no longer have equipped slots.
export function refreshEquipment(equipment,combat,interactions,catalog) {
  for (const loadout of equipment.loadouts) {
    const actor = interactions.actors.find(a => a.id === loadout.actorId)
    const fighter = combat.fighters.find(f => f.id === actor.id)
    let attack = actor.attack, defense = actor.defense
    for (const slot of ['weapon','armor']) {
      const lot = interactions.inventory.lots.find(l => l.id === loadout[slot])
      if (actor.health === 0 || !lot || lot.holderId !== actor.containerId || lot.ownerId !== actor.id) {
        loadout[slot] = null
        continue
      }
      const gear = itemDefinition(catalog,lot.itemType).equipment
      check(gear?.slot === slot && lot.quantity === 1,'INVALID_LOADOUT')
      attack += gear.attack; defense += gear.defense
    }
    check(natural(attack) && natural(defense),'ATTRIBUTE_OVERFLOW')
    fighter.attack = attack; fighter.defense = defense
  }
}

export function executeEquipment(state,combat,interactions,catalog,command,context) {
  try {
    check(command && id(command.id) && id(command.actorId) && natural(command.expectedRevision) &&
      ['equip','unequip'].includes(command.kind) && ['weapon','armor'].includes(command.slot),'INVALID_COMMAND')
    const fingerprint = JSON.stringify([command.kind,command.expectedRevision,command.actorId,command.slot,
      command.lotId ?? null,context?.at,context?.allowed === true])
    const prior = state.receipts.find(r => r.requestId === command.id)
    if (prior) {
      check(prior.fingerprint === fingerprint,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),combat:clone(combat),events:[]}
    }
    check(command.expectedRevision === state.revision,'STALE_REVISION')
    check(state.events.length < 4096,'HISTORY_FULL')
    check(context?.allowed === true,'INTERACTION_DENIED')
    check(natural(context.at) && context.at >= combat.at && (!state.events.length || context.at >= state.events.at(-1).at),'INVALID_TIME')
    const actor = interactions.actors.find(a => a.id === command.actorId)
    check(actor,'UNKNOWN_ACTOR'); check(actor.health > 0,'ACTOR_DEAD')
    const view = previewCombat(combat,interactions.actors,context.at).find(f => f.id === actor.id)
    check(view.phase === 'idle' && !view.guardHeld,'ACTOR_BUSY')
    const next = clone(state), nextCombat = clone(combat)
    const loadout = next.loadouts.find(l => l.actorId === actor.id)
    const previousLotId = loadout[command.slot]
    if (command.kind === 'equip') {
      const lot = interactions.inventory.lots.find(l => l.id === command.lotId)
      check(lot,'UNKNOWN_LOT')
      check(lot.holderId === actor.containerId,'NOT_HELD')
      check(lot.ownerId === actor.id,'NOT_OWNED')
      check(lot.quantity === 1,'EQUIPMENT_REQUIRES_SINGLE_LOT')
      check(itemDefinition(catalog,lot.itemType).equipment?.slot === command.slot,'INVALID_EQUIPMENT_SLOT')
      check(previousLotId !== lot.id,'NO_CHANGE')
      loadout[command.slot] = lot.id
    } else {
      check(previousLotId !== null,'NO_CHANGE')
      loadout[command.slot] = null
    }
    refreshEquipment(next,nextCombat,interactions,catalog)
    const event = {id:`equipment:${state.revision+1}`,kind:command.kind,at:context.at,
      actorId:actor.id,slot:command.slot,previousLotId,lotId:loadout[command.slot],cause:null,requestId:command.id}
    next.revision++
    next.events.push(event); next.receipts.push({requestId:command.id,fingerprint})
    return {ok:true,code:'APPLIED',duplicate:false,state:next,combat:nextCombat,events:[clone(event)]}
  } catch (error) {
    if (!(error instanceof InventoryError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}
