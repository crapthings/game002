export const BAG_CAPACITY = 6
export const REWARD = 15
export const HELP_DELAY = 20000
export const ITEMS = {
  medicine: { name: '止血药', price: 15, sellPrice: 7, healing: 25 },
  ration: { name: '干粮', price: 5, sellPrice: 2, healing: 10 },
}
export const bagCount = community => Object.values(community.inventory).reduce((a,b) => a+b,0)
export function createCommunity() {
  return {
    version: 1, inventory: { medicine: 0, ration: 1 }, stock: { medicine: 4, ration: 6 },
    tradeSpent: 0, tradeReceived: 0, rewardTreasury: 40, health: 60,
    aid: { eventId: null, dueAt: null, subject: null, lastKnown: null, rewardEvent: null },
    relationship: { from: 'resident-1', to: 'player', trust: 0, cause: null },
  }
}
const copy = value => JSON.parse(JSON.stringify(value))
const point = p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 256)

// One transition implementation is also used to validate the saved projections.
// Validation derives data only; it never executes movement or pays a reward twice.
export function applyCommunityEvent(previous, event) {
  if (!['buy','sell','use','aid','reward'].includes(event.kind)) return previous
  const next = copy(previous), d = event.details, definition = Object.hasOwn(ITEMS,d.itemType) ? ITEMS[d.itemType] : null
  if (event.kind === 'buy') {
    if (!definition || d.actorId !== 'player' || d.sellerId !== 'merchant' || d.price !== definition.price || next.stock[d.itemType] < 1 || bagCount(next) >= BAG_CAPACITY) throw new Error('交易记录无效。')
    next.stock[d.itemType]--
    next.inventory[d.itemType]++
    next.tradeSpent += definition.price
  }
  if (event.kind === 'use') {
    if (!definition || d.actorId !== 'player' || d.targetId !== 'player' || next.inventory[d.itemType] < 1 || next.health >= 100) throw new Error('道具使用记录无效。')
    next.inventory[d.itemType]--
    next.health = Math.min(100,next.health+definition.healing)
  }
  if (event.kind === 'sell') {
    if (!definition || d.actorId !== 'player' || d.buyerId !== 'merchant' || d.price !== definition.sellPrice || next.inventory[d.itemType] < 1 || merchantCash(next) < d.price) throw new Error('出售记录无效。')
    next.inventory[d.itemType]--
    next.stock[d.itemType]++
    next.tradeReceived = (next.tradeReceived ?? 0) + d.price
  }
  if (event.kind === 'aid') {
    if (d.actorId !== 'player' || d.targetId !== 'resident-1' || d.itemType !== 'medicine' || next.inventory.medicine < 1 || next.aid.eventId || !['player',null].includes(d.subject) || !point(d.position)) throw new Error('救助记录无效。')
    next.inventory.medicine--
    next.aid = { eventId:event.id, dueAt:event.at+HELP_DELAY, subject:d.subject, lastKnown:[...d.position], rewardEvent:null }
    if (d.subject === 'player') next.relationship = { from:'resident-1', to:'player', trust:25, cause:event.id }
  }
  if (event.kind === 'reward') {
    if (d.actorId !== 'resident-1' || d.recipientId !== 'player' || d.amount !== REWARD || !next.aid.eventId || event.cause !== next.aid.eventId || next.aid.subject !== 'player' || next.aid.rewardEvent || event.at < next.aid.dueAt || next.rewardTreasury < REWARD) throw new Error('回礼记录无效。')
    next.rewardTreasury -= REWARD
    next.aid.rewardEvent = event.id
  }
  return next
}

export function validCommunity(state) {
  if (state.community === undefined) return !state.events.some(e => ['buy','sell','use','aid','reward'].includes(e.kind)) && state.wallet + state.compensation === 100
  try {
    let expected = createCommunity(), compensation = 0, stolen = false
    for (const event of state.events) {
      if (event.kind === 'take') {
        if (bagCount(expected) >= BAG_CAPACITY) return false
        stolen = true
      }
      if (event.kind === 'settle') { compensation += event.details.compensation; stolen = false }
      expected = applyCommunityEvent(expected,event)
      if (bagCount(expected) + Number(stolen) > BAG_CAPACITY || playerCash(compensation,expected) < 0) return false
    }
    const actual = state.community
    if (actual?.version !== 1 || !actual.inventory || !actual.stock || !actual.aid || !actual.relationship) return false
    for (const field of ['tradeSpent','rewardTreasury','health']) if (actual[field] !== expected[field]) return false
    if ((actual.tradeReceived ?? 0) !== expected.tradeReceived || (actual.tradeReceived === null)) return false
    for (const field of ['inventory','stock']) {
      if (Object.keys(actual[field]).length !== 2 || !Object.keys(ITEMS).every(id => actual[field][id] === expected[field][id])) return false
    }
    for (const field of ['eventId','dueAt','subject','rewardEvent']) if (actual.aid[field] !== expected.aid[field]) return false
    for (const field of ['from','to','trust','cause']) if (actual.relationship[field] !== expected.relationship[field]) return false
    if (actual.aid.eventId ? !point(actual.aid.lastKnown) : actual.aid.lastKnown !== null) return false
    if (actual.aid.subject === null && JSON.stringify(actual.aid.lastKnown) !== JSON.stringify(expected.aid.lastKnown)) return false
    return state.wallet === playerCash(state.compensation,actual)
  } catch { return false }
}

// Merchant starts with 60 coins; purchases and resales transfer existing money.
export const merchantCash = community => 60 + community.tradeSpent - (community.tradeReceived ?? 0)
export const playerCash = (compensation,community) => 100 - compensation - community.tradeSpent + (community.tradeReceived ?? 0) + 40 - community.rewardTreasury
