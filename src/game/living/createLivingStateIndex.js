import { historyCapacity } from '../gameplay/historyCapacity.js'
import { wantedFor,settledCrimeFact } from '../gameplay/crime.js'
import { relationReaction } from '../gameplay/relations.js'
import { roleHolders } from '../gameplay/factionRoles.js'

const offensive = new Set(['take','threatened','robbed','damaged','parried','died','loot_item','loot_money'])
const pair = (a, b) => JSON.stringify([a, b])

// Gameplay snapshots are replaced on commit. Cache history-derived decisions
// once per snapshot, while distance, visibility and combat time remain live.
export function createLivingStateIndex(config) {
  const items = new Map(config.items.map(item => [item.id, item]))
  const legacyAuthorities = new Set(config.authorities)
  let previous = null, cached = null
  return state => {
    if (state === previous) return cached
    const organized=state.factions?.actionsVersion===1,authorities=organized?new Set(roleHolders(state,'law','constable',{alive:false})):legacyAuthorities
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
    const knowledge = new Map(), assessed = new Map(), reported = new Map(),ownDeliveries=new Map()
    for (const row of state.social.knowledge) {
      if (!knowledge.has(row.npcId)) knowledge.set(row.npcId, [])
      knowledge.get(row.npcId).push(row)
    }
    for (const event of state.crime.events) {
      if (!assessed.has(event.authorityId)) assessed.set(event.authorityId, new Set())
      assessed.get(event.authorityId).add(pair(event.factId, event.evidenceId))
    }
    for (const event of state.social.events) if (event.kind === 'report' && (organized?authorities.has(event.targetId):event.targetId === 'guard')) {
      if (!reported.has(event.actorId)) reported.set(event.actorId, new Set())
      reported.get(event.actorId).add(event.cause)
      if(!ownDeliveries.has(event.actorId))ownDeliveries.set(event.actorId,new Map())
      const recipients=ownDeliveries.get(event.actorId)
      if(!recipients.has(event.targetId))recipients.set(event.targetId,new Set())
      recipients.get(event.targetId).add(event.cause)
    }
    const reinforcementFacts = new Set((knowledge.get('guard-2') ?? []).map(row => row.factId))
    const npcs = new Map()
    for (const actor of actors.values()) {
      const known = knowledge.get(actor.id) ?? []
      const crime = known.filter(row => offensive.has(facts.get(row.factId)?.action))
      const wanted=authorities.has(actor.id)?wantedFor(state.crime,actor.id,'player'):null
      const requestable=new Set(organized&&wanted?state.crime.cases.filter(c=>wanted.caseIds.includes(c.id)).flatMap(c=>c.factIds):[])
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
          !settled.has(facts.get(row.factId).sourceEventId) && !lawful.has(facts.get(row.factId).sourceEventId)&&
          (!organized||!settledCrimeFact(state,facts.get(row.factId),{knownBy:actor.id}))),
        unreported: crime.find(row => !reported.get(actor.id)?.has(row.evidenceId)),
        reinforcement: organized?crime.find(row=>row.subjectId==='player'&&requestable.has(row.factId)&&
          ![...(ownDeliveries.get(actor.id)??[])].some(([recipient,evidenceIds])=>recipient!==actor.id&&evidenceIds.has(row.evidenceId))):crime.find(row => !reinforcementFacts.has(row.factId)),
        lastCrimePosition: lastPosition(crime), lastKnownPosition: lastPosition(known),
        wanted,
        gear: state.interactions.inventory.lots.find(lot => lot.ownerId === actor.id && lot.holderId === actor.containerId && items.get(lot.itemType)?.equipment),
      })
    }
    const merchantRefuses = (knowledge.get('merchant') ?? []).some(row => {
      const fact = facts.get(row.factId)
      return row.subjectId === 'player' && fact?.targetId === 'merchant' && offensive.has(fact.action) && !settled.has(fact.sourceEventId)&&
        (!organized||!settledCrimeFact(state,fact,{knownBy:'merchant'}))
    })
    cached = { actors, lots, loadouts, items, npcs,authorities,merchantRefuses, capacityStatus: historyCapacity(state).status }
    previous = state
    return cached
  }
}
