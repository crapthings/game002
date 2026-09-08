import { historyCapacity } from '../gameplay/historyCapacity.js'
import { wantedFor } from '../gameplay/crime.js'
import { relationReaction } from '../gameplay/relations.js'

const offensive = new Set(['take','threatened','robbed','damaged','parried','died','loot_item','loot_money'])
const pair = (a, b) => JSON.stringify([a, b])

// Gameplay snapshots are replaced on commit. Cache history-derived decisions
// once per snapshot, while distance, visibility and combat time remain live.
export function createLivingStateIndex(config) {
  const items = new Map(config.items.map(item => [item.id, item]))
  const authorities = new Set(config.authorities)
  let previous = null, cached = null
  return state => {
    if (state === previous) return cached
    const actors = new Map(state.interactions.actors.map(actor => [actor.id, actor]))
    const lots = new Map(state.interactions.inventory.lots.map(lot => [lot.id, lot]))
    const loadouts = new Map(state.equipment.loadouts.map(loadout => [loadout.actorId, loadout]))
    const facts = new Map(state.social.facts.map(fact => [fact.id, fact]))
    const evidence = new Map(state.social.events.map(event => [event.id, event]))
    const settled = new Set(state.village.settled)
    const lawful = new Set(), guards = new Map(), attacks = new Map(), threats = new Map()
    for (const event of state.combat.events) {
      if (event.justification?.unlawful === false) lawful.add(event.id)
      if (event.kind === 'guard_started') guards.set(event.actorId, event)
      if (event.kind === 'damaged' || event.kind === 'parried') attacks.set(event.targetId, event)
    }
    for (const event of state.robbery.events) if (event.kind === 'threatened') threats.set(event.targetId, event)
    const knowledge = new Map(), assessed = new Map(), reported = new Map()
    for (const row of state.social.knowledge) {
      if (!knowledge.has(row.npcId)) knowledge.set(row.npcId, [])
      knowledge.get(row.npcId).push(row)
    }
    for (const event of state.crime.events) {
      if (!assessed.has(event.authorityId)) assessed.set(event.authorityId, new Set())
      assessed.get(event.authorityId).add(pair(event.factId, event.evidenceId))
    }
    for (const event of state.social.events) if (event.kind === 'report' && event.targetId === 'guard') {
      if (!reported.has(event.actorId)) reported.set(event.actorId, new Set())
      reported.get(event.actorId).add(event.cause)
    }
    const reinforcementFacts = new Set((knowledge.get('guard-2') ?? []).map(row => row.factId))
    const npcs = new Map()
    for (const actor of actors.values()) {
      const known = knowledge.get(actor.id) ?? []
      const crime = known.filter(row => offensive.has(facts.get(row.factId)?.action))
      const lastPosition = rows => {
        for (let i = rows.length - 1; i >= 0; i--) {
          const event = evidence.get(rows[i].evidenceId)
          if (event?.position) return event
        }
      }
      npcs.set(actor.id, {
        relationReactionFactId:known.find(row=>relationReaction(state,actor.id,row.factId))?.factId??null,
        guardRaised: guards.get(actor.id), lastAttack: attacks.get(actor.id), lastThreat: threats.get(actor.id),
        identifiedEvents: new Set(known.filter(row => row.subjectId === 'player').map(row => facts.get(row.factId)?.sourceEventId)),
        unassessed: crime.find(row => !assessed.get(actor.id)?.has(pair(row.factId, row.evidenceId)) &&
          !settled.has(facts.get(row.factId).sourceEventId) && !lawful.has(facts.get(row.factId).sourceEventId)),
        unreported: crime.find(row => !reported.get(actor.id)?.has(row.evidenceId)),
        reinforcement: crime.find(row => !reinforcementFacts.has(row.factId)),
        lastCrimePosition: lastPosition(crime), lastKnownPosition: lastPosition(known),
        wanted: authorities.has(actor.id) ? wantedFor(state.crime, actor.id, 'player') : null,
        gear: state.interactions.inventory.lots.find(lot => lot.ownerId === actor.id && lot.holderId === actor.containerId && items.get(lot.itemType)?.equipment),
      })
    }
    const merchantRefuses = (knowledge.get('merchant') ?? []).some(row => {
      const fact = facts.get(row.factId)
      return row.subjectId === 'player' && fact?.targetId === 'merchant' && offensive.has(fact.action) && !settled.has(fact.sourceEventId)
    })
    cached = { actors, lots, loadouts, items, npcs, merchantRefuses, capacityStatus: historyCapacity(state).status }
    previous = state
    return cached
  }
}
