// M1 local contract: plain JSON, simulation milliseconds, no engine or global reputation.
// This is an implementation-specific slice, not the frozen pre-repo DTO proposal.
import { createCommunity, applyCommunityEvent, validCommunity, ITEMS, BAG_CAPACITY, bagCount, REWARD, merchantCash, playerCash } from './community.js'
export const SLICE_VERSION = 1
export const FINE = 20
export const MEDICINE = { id: 'medicine-001', name: '止血药包', ownerId: 'merchant' }
export const NPCS = [
  { id: 'merchant', name: '药商陈掌柜', home: [3, -4], heading: Math.PI, color: '#d4a154' },
  { id: 'witness', name: '街坊阿青', home: [0, -8], heading: 0, color: '#78ba9c' },
  { id: 'guard', name: '捕快周平', home: [0, -20], heading: 0, color: '#548be0' },
  { id: 'resident-1', name: '居民柳娘', home: [-3, -12], heading: Math.PI / 2, color: '#ba87c9' },
  { id: 'resident-2', name: '居民石伯', home: [3, -16], heading: Math.PI / 2, color: '#a5aaa1' },
  { id: 'resident-3', name: '居民小何', home: [-3, -24], heading: Math.PI, color: '#c58a78' },
]
const copy = value => JSON.parse(JSON.stringify(value))
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p.every(v => Math.abs(v) <= 256)
const integer = n => Number.isSafeInteger(n) && n >= 0
const holderIds = ['stall', 'player', 'guard']
const eventKinds = ['take', 'witness', 'report', 'settle', 'return', 'buy', 'sell', 'use', 'aid', 'reward']

function remember(knowledge, entry, upgrade = true) {
  const existing = knowledge.find(k => k.npcId === entry.npcId && k.eventId === entry.eventId)
  if (!existing) knowledge.push(entry)
  else if (upgrade && existing.subject === null && entry.subject === 'player') Object.assign(existing,entry)
}
function projectKnowledge(events, upgrade = true) {
  const knowledge = [], byId = new Map(events.map(e => [e.id,e]))
  for (const e of events) {
    if (e.kind === 'witness') remember(knowledge,{npcId:e.details.observerId,eventId:e.cause,subject:e.details.subject,source:'saw',evidence:e.id},upgrade)
    if (e.kind === 'report') remember(knowledge,{npcId:'guard',eventId:byId.get(e.cause).cause,subject:e.details.subject,source:'report',evidence:e.id},upgrade)
  }
  return knowledge
}

export function createFirstLoop(seed, generatorVersion, layout) {
  return {
    version: SLICE_VERSION, seed, generatorVersion, nowMs: 0, revision: 0,
    nextEvent: 1, wallet: 100, compensation: 0, masked: false,
    item: { ...MEDICINE, holderId: 'stall', position: [...layout.stall] },
    npcs: NPCS.map(n => ({ id: n.id, position: [...layout[n.id]], home: [...layout[n.id]], heading: n.heading })),
    events: [], incidents: [], knowledge: [], community: createCommunity(),
  }
}

export function validFirstLoop(s, world) {
  if (!s || s.version !== SLICE_VERSION || s.seed !== world.seed || s.generatorVersion !== world.generatorVersion || !integer(s.nowMs) || !integer(s.revision) || !integer(s.nextEvent) || typeof s.masked !== 'boolean') return false
  if (!integer(s.wallet) || !integer(s.compensation) || s.compensation % FINE !== 0) return false
  if (s.item?.id !== MEDICINE.id || s.item.ownerId !== MEDICINE.ownerId || !holderIds.includes(s.item.holderId) || !point(s.item.position)) return false
  if (!Array.isArray(s.npcs) || s.npcs.length !== NPCS.length || !NPCS.every(n => s.npcs.filter(p => p?.id === n.id).length === 1) || !s.npcs.every(n => point(n.position) && point(n.home) && Number.isFinite(n.heading))) return false
  if (!Array.isArray(s.events) || s.events.length > 512 || !Array.isArray(s.incidents) || s.incidents.length > 32 || !Array.isArray(s.knowledge) || s.knowledge.length > 192) return false
  const events = new Map()
  let derivedHolder = 'stall', openId = null, lastSettlement = null
  const reported = new Set(), witnessed = new Set()
  for (const [i, e] of s.events.entries()) {
    if (!e || e.id !== `event-${i + 1}` || !eventKinds.includes(e.kind) || !integer(e.at) || e.at > s.nowMs || (i && e.at < s.events[i - 1].at) || typeof e.text !== 'string' || e.text.length > 300 || !e.details || typeof e.details !== 'object' || (e.cause !== null && !events.has(e.cause))) return false
    const d = e.details
    if (e.kind === 'take') {
      if (derivedHolder !== 'stall' || e.cause !== null || d.actorId !== 'player' || d.itemId !== MEDICINE.id || !point(d.position)) return false
      derivedHolder = 'player'; openId = e.id
    } else if (e.kind === 'witness') {
      if (e.cause !== openId || derivedHolder !== 'player' || !NPCS.some(n => n.id === d.observerId) || !['player',null].includes(d.subject) || !point(d.observerPosition) || !point(d.observedPosition) || !Number.isFinite(d.heading)) return false
      const witnessKey = `${openId}/${d.observerId}`
      if (witnessed.has(witnessKey) || e.at !== events.get(openId).at) return false
      witnessed.add(witnessKey)
    } else if (e.kind === 'report') {
      const witness = events.get(e.cause)
      if (witness?.kind !== 'witness' || witness.cause !== openId || reported.has(openId) || d.reporterId !== witness.details.observerId || d.recipientId !== 'guard' || d.subject !== witness.details.subject || !point(d.lastKnown)) return false
      reported.add(openId)
    } else if (e.kind === 'settle') {
      if (derivedHolder !== 'player' || e.cause !== openId || d.actorId !== 'player' || d.recipientId !== 'guard' || d.itemId !== MEDICINE.id || d.compensation !== FINE || d.beneficiaryId !== 'merchant') return false
      derivedHolder = 'guard'; openId = null; lastSettlement = e.id
    } else if (e.kind === 'return') {
      if (derivedHolder !== 'guard' || e.cause !== lastSettlement || d.actorId !== 'guard' || d.itemId !== MEDICINE.id || d.recipientId !== 'merchant') return false
      derivedHolder = 'stall'
    }
    events.set(e.id, e)
  }
  if (derivedHolder !== s.item.holderId) return false
  if (s.nextEvent !== s.events.length + 1) return false
  const takes = s.events.filter(e => e.kind === 'take')
  if (takes.length !== s.incidents.length) return false
  for (const [i, incident] of s.incidents.entries()) {
    if (!incident || incident.id !== takes[i].id || !['unreported','wanted','anonymous','settled'].includes(incident.status) || !['player', null].includes(incident.subject) || !integer(incident.createdAt) || incident.createdAt !== takes[i].at || !point(incident.lastKnown) || !integer(incident.lastSeenAt) || incident.lastSeenAt > s.nowMs) return false
    if (incident.reporterId !== null && !NPCS.some(n => n.id === incident.reporterId)) return false
    if (incident.witnessEvent !== null && (events.get(incident.witnessEvent)?.kind !== 'witness' || events.get(incident.witnessEvent)?.cause !== incident.id)) return false
    if ((incident.reporterId === null) !== (incident.witnessEvent === null)) return false
    if (incident.witnessEvent !== null && (events.get(incident.witnessEvent).details.observerId !== incident.reporterId || events.get(incident.witnessEvent).details.subject !== incident.subject)) return false
    if (incident.reporterId === null && incident.subject !== null) return false
    if (incident.reportEvent !== null && (events.get(incident.reportEvent)?.kind !== 'report' || events.get(incident.reportEvent)?.cause !== incident.witnessEvent)) return false
    if (incident.status === 'wanted' && (incident.subject !== 'player' || !incident.reportEvent)) return false
    if (incident.status === 'anonymous' && (incident.subject !== null || !incident.reportEvent)) return false
    if (incident.status === 'unreported' && incident.reportEvent !== null) return false
    if (incident.status === 'settled' && !s.events.some(e => e.kind === 'settle' && e.cause === incident.id)) return false
    // The index must agree with facts in both directions; a missing report pointer
    // must not make a delivered report execute for a second time after loading.
    const firstWitness = s.events.find(e => e.kind === 'witness' && e.cause === incident.id)
    const delivered = s.events.find(e => e.kind === 'report' && events.get(e.cause).cause === incident.id)
    const settled = s.events.some(e => e.kind === 'settle' && e.cause === incident.id)
    if (incident.witnessEvent !== (firstWitness?.id ?? null) || incident.reporterId !== (firstWitness?.details.observerId ?? null) || incident.subject !== (firstWitness?.details.subject ?? null)) return false
    if (incident.reportEvent !== (delivered?.id ?? null)) return false
    const expectedStatus = settled ? 'settled' : delivered ? (delivered.details.subject === 'player' ? 'wanted' : 'anonymous') : 'unreported'
    if (incident.status !== expectedStatus || incident.lastSeenAt < incident.createdAt) return false
  }
  const known = new Set()
  const expectedKnowledge = projectKnowledge(s.events)
  const legacyKnowledge = projectKnowledge(s.events,false)
  if (s.knowledge.length !== expectedKnowledge.length) return false
  for (const k of s.knowledge) {
    if (!k) return false
    const key = `${k.npcId}/${k.eventId}`
    if (known.has(key) || !NPCS.some(n => n.id === k.npcId) || !takes.some(e => e.id === k.eventId) || !['player', null].includes(k.subject) || !['saw','report'].includes(k.source) || !events.has(k.evidence)) return false
    const evidence = events.get(k.evidence)
    if (evidence.details.subject !== k.subject) return false
    if (k.source === 'saw' && (evidence.kind !== 'witness' || evidence.cause !== k.eventId || evidence.details.observerId !== k.npcId)) return false
    if (k.source === 'report' && (evidence.kind !== 'report' || k.npcId !== 'guard' || events.get(evidence.cause)?.cause !== k.eventId)) return false
    const matches = projection => projection.some(expected => ['npcId','eventId','subject','source','evidence'].every(field => k[field] === expected[field]))
    if (!matches(expectedKnowledge) && !matches(legacyKnowledge)) return false
    known.add(key)
  }
  const open = s.incidents.filter(i => i.status !== 'settled')
  if (open.length > 1 || (s.item.holderId === 'player') !== (open.length === 1)) return false
  const settlements = s.events.filter(e => e.kind === 'settle')
  if (settlements.length !== s.incidents.filter(i => i.status === 'settled').length || settlements.length * FINE !== s.compensation) return false
  return validCommunity(s)
}

export function restoreFirstLoop(saved, world) {
  if (!validFirstLoop(saved, world)) throw new Error('江湖账本存档无效，已保留原数据。')
  return copy(saved)
}

export function createFirstLoopRules(initial) {
  const state = copy(initial)
  if (state.community === undefined) { state.community = createCommunity(); state.revision++ }
  // Upgrade only from recorded delivered evidence, never from player truth.
  const knowledge = projectKnowledge(state.events)
  if (JSON.stringify(state.knowledge) !== JSON.stringify(knowledge)) { state.knowledge = knowledge; state.revision++ }
  const npc = id => state.npcs.find(n => n.id === id)
  const event = (kind, cause, text, details = {}) => {
    const e = { id: `event-${state.nextEvent}`, kind, at: state.nowMs, cause, text, details }
    state.community = applyCommunityEvent(state.community,e)
    state.nextEvent++
    state.wallet = playerCash(state.compensation,state.community)
    state.events.push(e)
    state.revision++
    return e.id
  }
  const learn = (npcId, incident, subject, source, evidence) => {
    remember(state.knowledge,{ npcId, eventId: incident.id, subject, source, evidence })
  }
  const active = () => state.incidents.find(i => i.status !== 'settled')
  const refused = () => !state.masked && state.knowledge.some(k => k.npcId === 'merchant' && k.subject === 'player' && state.incidents.some(i => i.id === k.eventId && i.status !== 'settled'))
  // Reserve space for pending witness/report/settlement/return/reward events.
  const full = () => state.events.length >= 480
  return {
    // Adapter-only read access; UI and persistence get detached snapshots.
    state,
    snapshot: () => copy(state),
    mask() { state.masked = !state.masked; state.revision++; return state.masked ? '已蒙面：熟知你的捕快暂时无法确认身份。' : '已摘下面巾。' },
    buy(itemType, playerPosition) {
      if (full()) return '本轮账本已满，请换一个种子继续体验。'
      const item = Object.hasOwn(ITEMS,itemType) ? ITEMS[itemType] : null
      if (!item || distance(playerPosition,npc('merchant').position) > 3) return '请靠近陈掌柜购买。'
      if (refused()) return '陈掌柜认出了拿取者：请先去捕快处了结纠纷。'
      if (state.wallet < item.price) return '铜钱不足。'
      if (state.item.holderId === 'player' && state.wallet-item.price < FINE) return '请先保留20文用于交还赔偿，再购买其他物品。'
      if (!state.community.stock[itemType]) return '这种货物已经售罄。'
      if (bagCount(state.community)+Number(state.item.holderId === 'player') >= BAG_CAPACITY) return '背包已满。'
      event('buy',null,`你向陈掌柜购买${item.name}，支付${item.price}文。`,{actorId:'player',sellerId:'merchant',itemType,price:item.price})
      return `${item.name}已放入背包，所有权属于你。`
    },
    use(itemType) {
      if (full()) return '本轮账本已满，请换一个种子继续体验。'
      const item = Object.hasOwn(ITEMS,itemType) ? ITEMS[itemType] : null
      if (!item || !state.community.inventory[itemType]) return '背包中没有可使用的自有道具。'
      if (state.community.health >= 100) return '气血已满，无需消耗道具。'
      event('use',null,`你使用了${item.name}，恢复气血。`,{actorId:'player',targetId:'player',itemType})
      return '已消耗一份道具并恢复气血。'
    },
    aid(playerPosition) {
      if (full()) return '本轮账本已满，请换一个种子继续体验。'
      if (distance(playerPosition,npc('resident-1').position) > 3) return '请靠近受伤的柳娘。'
      if (state.community.aid.eventId) return '柳娘已经得到救治。'
      if (!state.community.inventory.medicine) return '需要一份自有止血药；陈掌柜的药包不能当作你的药消耗。'
      const patient = npc('resident-1')
      patient.heading = Math.atan2(playerPosition[0]-patient.position[0],playerPosition[1]-patient.position[1])
      event('aid',null,`你用自有止血药救助柳娘，${state.masked ? '她没能认出蒙面的恩人' : '她记住了你的模样'}。`,{actorId:'player',targetId:'resident-1',itemType:'medicine',subject:state.masked ? null : 'player',position:[...playerPosition]})
      return state.masked ? '柳娘伤势好转，但不知道你是谁。' : '柳娘记住了你的帮助，稍后会当面答谢。'
    },
    take(playerPosition, observations) {
      if (full()) return '本轮账本已满，请换一个种子继续体验。'
      if (state.item.holderId !== 'stall') return '药包已经不在摊位上。'
      if (distance(playerPosition, state.item.position) > 2.5) return '请先靠近药包。'
      if (state.incidents.length >= 32 || state.wallet < FINE) return '这一轮体验已结束，请换一个种子继续。'
      if (bagCount(state.community) >= BAG_CAPACITY) return '背包已满，无法放入药包。'
      state.item.holderId = 'player' // Possession changes; ownership does not.
      const id = event('take', null, '你拿走了陈掌柜的止血药包，所有权仍属于陈掌柜。', { actorId:'player', itemId:MEDICINE.id, position:[...playerPosition] })
      const seen = observations.filter(o => o.saw && NPCS.some(n => n.id === o.npcId)).sort((a,b) => Number(b.identified) - Number(a.identified) || a.npcId.localeCompare(b.npcId))
      const reporter = seen[0]
      const incident = { id, createdAt: state.nowMs, status: 'unreported', subject: reporter?.identified ? 'player' : null, reporterId: reporter?.npcId ?? null, witnessEvent: null, reportEvent: null, lastKnown: [...playerPosition], lastSeenAt: state.nowMs }
      state.incidents.push(incident)
      for (const observation of seen) {
        const name = NPCS.find(n => n.id === observation.npcId).name
        const evidence = event('witness', id, `${name}目击拿取，${observation.identified ? '认出了你' : '没有认出拿取者'}。`, { observerId:observation.npcId, subject:observation.identified ? 'player' : null, observerPosition:[...npc(observation.npcId).position], observedPosition:[...playerPosition], heading:npc(observation.npcId).heading })
        learn(observation.npcId, incident, observation.identified ? 'player' : null, 'saw', evidence)
        if (observation.npcId === incident.reporterId) incident.witnessEvent = evidence
      }
      return '药包已放入背包。它仍是陈掌柜的财物。'
    },
    sell(itemType, playerPosition) {
      if (full()) return '本轮账本已满，请换一个种子继续体验。'
      const item = Object.hasOwn(ITEMS,itemType) ? ITEMS[itemType] : null
      if (!item || distance(playerPosition,npc('merchant').position) > 3) return '请靠近陈掌柜出售。'
      if (refused()) return '陈掌柜认出了拿取者：请先去捕快处了结纠纷。'
      if (!state.community.inventory[itemType]) return '背包中没有这种自有道具。'
      if (merchantCash(state.community) < item.sellPrice) return '陈掌柜的现钱不足，暂时无法收购。'
      event('sell',null,`你向陈掌柜出售一份${item.name}，获得${item.sellPrice}文。`,{actorId:'player',buyerId:'merchant',itemType,price:item.sellPrice})
      return `已出售${item.name}，腾出一个背包位置。`
    },
    settle(playerPosition) {
      if (distance(playerPosition, npc('guard').position) > 3) return '请靠近捕快再交还药包。'
      const incident = active()
      if (!incident || state.item.holderId !== 'player') return '你没有需要交还的药包。'
      if (state.wallet < FINE) return '铜钱不足，无法赔偿。'
      state.wallet -= FINE
      state.compensation += FINE
      state.item.holderId = 'guard'
      incident.status = 'settled'
      event('settle', incident.id, `你向捕快交还药包并赔偿${FINE}文，本案了结；捕快代送回摊位。`, { actorId:'player', recipientId:'guard', itemId:MEDICINE.id, compensation:FINE, beneficiaryId:'merchant' })
      return '已交还并赔偿。捕快不再追捕你。'
    },
    step(dtMs, adapter) {
      if (!Number.isInteger(dtMs) || dtMs <= 0 || dtMs > 250) throw new Error('模拟时间步长无效。')
      state.nowMs += dtMs
      state.revision++
      const guard = npc('guard'), incident = active()
      const aid = state.community.aid, patient = npc('resident-1')
      const deliveringThanks = aid.eventId && !aid.rewardEvent && aid.subject === 'player' && state.nowMs >= aid.dueAt && !(incident?.reporterId === patient.id && !incident.reportEvent)
      if (deliveringThanks && adapter.loaded(patient.position)) {
        if (adapter.seesPlayer(patient)) aid.lastKnown = [...adapter.playerPosition()]
        adapter.move(patient,aid.lastKnown,dtMs/1000*2)
        if (distance(patient.position,aid.lastKnown) < .2) patient.heading += dtMs/1000*.8
        if (distance(patient.position,adapter.playerPosition()) <= 2 && adapter.seesPlayer(patient)) {
          event('reward',aid.eventId,'柳娘认出并走到你面前，送上15文作为答谢。',{actorId:patient.id,recipientId:'player',amount:REWARD})
        }
      }
      // Only a physically delivered report gives the institution knowledge.
      if (incident?.reporterId && !incident.reportEvent && state.nowMs - incident.createdAt >= 1000) {
        const reporter = npc(incident.reporterId)
        if (adapter.loaded(reporter.position) && adapter.loaded(guard.position)) {
          adapter.move(reporter, guard.position, dtMs / 1000 * 2.6)
          if (distance(reporter.position, guard.position) <= 2 && adapter.clear(reporter.position, guard.position)) {
            incident.reportEvent = event('report', incident.witnessEvent, incident.subject ? '目击者已当面举报；捕快获知你的身份与最后出现的位置。' : '目击者已当面举报，但无法确认身份，没有具名追捕。', { reporterId:reporter.id, recipientId:'guard', subject:incident.subject, lastKnown:[...incident.lastKnown] })
            learn('guard', incident, incident.subject, 'report', incident.reportEvent)
            incident.status = incident.subject ? 'wanted' : 'anonymous'
          }
        }
      }
      if (state.item.holderId === 'guard') {
        if (adapter.loaded(guard.position)) {
          adapter.move(guard, state.item.position, dtMs / 1000 * 2.8)
          if (distance(guard.position, state.item.position) < 1 && adapter.clear(guard.position, state.item.position)) {
            state.item.holderId = 'stall'
            const settlement = [...state.events].reverse().find(e => e.kind === 'settle')
            event('return', settlement.id, '捕快将药包送回摊位，物品重新可见。', { actorId:'guard', itemId:MEDICINE.id, recipientId:'merchant' })
          }
        }
      } else if (incident?.status === 'wanted') {
        if (adapter.seesPlayer(guard)) {
          incident.lastKnown = [...adapter.playerPosition()]
          incident.lastSeenAt = state.nowMs
        }
        if (adapter.loaded(guard.position) && state.nowMs - incident.lastSeenAt < 15000 && distance(guard.position,incident.lastKnown) > 1.6) adapter.move(guard, incident.lastKnown, dtMs / 1000 * 3.2)
      } else if (adapter.loaded(guard.position)) adapter.move(guard, guard.home, dtMs / 1000 * 2)
      for (const person of state.npcs) {
        if (person.id === 'guard' || (person.id === 'resident-1' && deliveringThanks) || (person.id === incident?.reporterId && !incident.reportEvent)) continue
        if (!adapter.loaded(person.position)) continue
        adapter.move(person, person.home, dtMs / 1000 * 2)
        if (distance(person.position, person.home) < .2) {
          const base = NPCS.find(n => n.id === person.id).heading
          // A short, visible look-away cycle gives players an unwitnessed option.
          person.heading = base + (Math.floor(state.nowMs / 7000) % 2 ? Math.PI : 0)
        }
      }
    },
  }
}
