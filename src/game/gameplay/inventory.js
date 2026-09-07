// Engine-independent inventory kernel. Command authorization belongs to interactions.
// Containers describe physical custody; ownerId describes legal ownership.
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(value)
const natural = value => Number.isSafeInteger(value) && value >= 0
const positive = value => natural(value) && value > 0
const clone = value => structuredClone(value)
function requireValue(condition, code) {
  if (!condition) throw new InventoryError(code)
}
export class InventoryError extends Error {
  constructor(code) { super(code); this.name = 'InventoryError'; this.code = code }
}

export function createCatalog(definitions) {
  requireValue(Array.isArray(definitions) && definitions.length > 0,'INVALID_CATALOG')
  const seen = new Set()
  const catalog = definitions.map(definition => {
    requireValue(definition && id(definition.id) && !seen.has(definition.id),'INVALID_ITEM_ID')
    seen.add(definition.id)
    const item = {
      id:definition.id, name:definition.name, unitSpace:definition.unitSpace ?? 1,
      consumable:definition.consumable ?? false, healing:definition.healing ?? 0,
      tradable:definition.tradable ?? true, giftable:definition.giftable ?? true,
    }
    requireValue(typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 100,'INVALID_ITEM_NAME')
    requireValue(positive(item.unitSpace) && natural(item.healing),'INVALID_ITEM_VALUES')
    requireValue(['consumable','tradable','giftable'].every(key => typeof item[key] === 'boolean'),'INVALID_ITEM_FLAGS')
    requireValue(item.consumable || item.healing === 0,'INVALID_ITEM_EFFECT')
    // Omit absent equipment fields so earlier non-equipment catalogs retain
    // their exact serialized shape and configuration signature.
    if (definition.equipment !== undefined) {
      const gear = definition.equipment
      requireValue(gear && ['weapon','armor'].includes(gear.slot) && !item.consumable,'INVALID_EQUIPMENT')
      const attack = gear.attack ?? 0, defense = gear.defense ?? 0
      requireValue(natural(attack) && natural(defense),'INVALID_EQUIPMENT_VALUES')
      item.equipment = Object.freeze({slot:gear.slot,attack,defense})
    }
    return Object.freeze(item)
  })
  return Object.freeze(catalog)
}

export function itemDefinition(catalog, itemType) {
  const definition = catalog.find(item => item.id === itemType)
  requireValue(definition,'UNKNOWN_ITEM')
  return definition
}

export function occupiedSpace(state, catalog, holderId) {
  requireValue(state.containers.some(container => container.id === holderId),'UNKNOWN_CONTAINER')
  const used = state.lots.filter(lot => lot.holderId === holderId)
    .reduce((sum,lot) => sum + lot.quantity * itemDefinition(catalog,lot.itemType).unitSpace,0)
  requireValue(natural(used),'CAPACITY_OVERFLOW')
  return used
}

export function assertInventory(state, catalog) {
  requireValue(state && state.version === 1 && natural(state.revision),'INVALID_INVENTORY')
  requireValue(Array.isArray(state.containers) && Array.isArray(state.lots),'INVALID_COLLECTIONS')
  const containers = new Set(), lots = new Set()
  for (const container of state.containers) {
    requireValue(container && id(container.id) && !containers.has(container.id),'INVALID_CONTAINER')
    requireValue(container.capacity === null || natural(container.capacity),'INVALID_CAPACITY')
    containers.add(container.id)
  }
  for (const lot of state.lots) {
    requireValue(lot && id(lot.id) && !lots.has(lot.id),'INVALID_LOT')
    requireValue(id(lot.ownerId) && containers.has(lot.holderId) && positive(lot.quantity),'INVALID_CUSTODY')
    itemDefinition(catalog,lot.itemType)
    lots.add(lot.id)
  }
  for (const container of state.containers) {
    const used = occupiedSpace(state,catalog,container.id)
    requireValue(container.capacity === null || used <= container.capacity,'BAG_FULL')
  }
  return state
}

export function createInventory(catalog, { containers, lots = [] }) {
  const state = { version:1, revision:0, containers:clone(containers), lots:clone(lots) }
  assertInventory(state,catalog)
  return state
}

export function inventoryContents(state, holderId, ownerId = undefined) {
  requireValue(state.containers.some(container => container.id === holderId),'UNKNOWN_CONTAINER')
  return state.lots.filter(lot => lot.holderId === holderId && (ownerId === undefined || lot.ownerId === ownerId)).map(clone)
}

// Trusted primitive, not a player command. Ownership changes must be authorized
// by the caller (purchase/gift); a theft moves custody while preserving ownerId.
export function transferLot(state, catalog, { lotId, quantity, toHolderId, toOwnerId, splitId }) {
  assertInventory(state,catalog)
  const source = state.lots.find(lot => lot.id === lotId)
  requireValue(source,'UNKNOWN_LOT')
  requireValue(positive(quantity) && quantity <= source.quantity,'INSUFFICIENT_QUANTITY')
  requireValue(state.containers.some(container => container.id === toHolderId),'UNKNOWN_CONTAINER')
  const ownerId = toOwnerId === undefined ? source.ownerId : toOwnerId
  requireValue(id(ownerId),'INVALID_OWNER')
  requireValue(source.holderId !== toHolderId || source.ownerId !== ownerId,'NO_CHANGE')
  const next = clone(state), lot = next.lots.find(entry => entry.id === lotId)
  if (quantity === lot.quantity) {
    lot.holderId = toHolderId
    lot.ownerId = ownerId
  } else {
    requireValue(id(splitId) && !next.lots.some(entry => entry.id === splitId),'INVALID_SPLIT_ID')
    lot.quantity -= quantity
    next.lots.push({id:splitId,itemType:lot.itemType,quantity,ownerId,holderId:toHolderId})
  }
  requireValue(natural(next.revision + 1),'REVISION_OVERFLOW')
  next.revision++
  assertInventory(next,catalog)
  return next
}

// The interaction layer must check permission and apply the item's effect in
// the same transaction. No zero-quantity lots or silent disposal of property.
export function consumeLot(state, catalog, { lotId, quantity }) {
  assertInventory(state,catalog)
  const source = state.lots.find(lot => lot.id === lotId)
  requireValue(source,'UNKNOWN_LOT')
  requireValue(itemDefinition(catalog,source.itemType).consumable,'NOT_CONSUMABLE')
  requireValue(positive(quantity) && quantity <= source.quantity,'INSUFFICIENT_QUANTITY')
  const next = clone(state), lot = next.lots.find(entry => entry.id === lotId)
  lot.quantity -= quantity
  next.lots = next.lots.filter(entry => entry.quantity > 0)
  requireValue(natural(next.revision + 1),'REVISION_OVERFLOW')
  next.revision++
  assertInventory(next,catalog)
  return next
}
