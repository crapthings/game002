import { activeEventCount,findReceipt } from './historyArchive.js'
// Social facts are not shared knowledge. This module has no NPC names, engine,
// timers or pathfinding; the adapter supplies observed/delivered evidence.
const clone = value => structuredClone(value)
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(value)
const natural = value => Number.isSafeInteger(value) && value >= 0
const kinds = ['fact','witness','report','relationship']
class KnowledgeError extends Error {
  constructor(code) { super(code); this.code = code }
}
const requireValue = (condition,code) => { if (!condition) throw new KnowledgeError(code) }
const fingerprint = command => JSON.stringify([
  command.id,command.kind,command.expectedRevision,command.factId ?? null,
  command.actorId ?? null,command.targetId ?? null,command.action ?? null,
])

export function createKnowledgeState(actorIds) {
  requireValue(Array.isArray(actorIds) && actorIds.every(id) && new Set(actorIds).size === actorIds.length,'INVALID_ACTORS')
  return {version:1,revision:0,actorIds:[...actorIds],facts:[],events:[],knowledge:[],relationships:[],receipts:[]}
}

function remember(state, npcId, factId, subjectId, evidenceId) {
  const current = state.knowledge.find(k => k.npcId === npcId && k.factId === factId)
  if (!current) state.knowledge.push({npcId,factId,subjectId,evidenceId})
  else if (current.subjectId === null && subjectId !== null) Object.assign(current,{subjectId,evidenceId})
}

export function knowledgeFor(state,npcId) {
  requireValue(state.actorIds.includes(npcId),'UNKNOWN_ACTOR')
  return clone(state.knowledge.filter(k => k.npcId === npcId))
}

// This API consumes a trusted live state. Restore must replay commands/evidence,
// not accept arbitrary projections from a file (see framework documentation).
export function executeKnowledge(state,command,context) {
  try {
    requireValue(state?.version === 1 && natural(state.revision) && Array.isArray(state.actorIds) && Array.isArray(state.events) && Array.isArray(state.receipts),'INVALID_STATE')
    requireValue(command && id(command.id) && kinds.includes(command.kind) && natural(command.expectedRevision),'INVALID_COMMAND')
    const key = fingerprint(command), previous = findReceipt(state,command.id)
    if (previous) {
      requireValue(previous.fingerprint === key,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),events:[],appliedEventId:previous.eventId}
    }
    requireValue(state.revision === command.expectedRevision,'STALE_REVISION')
    requireValue(activeEventCount(state)<4096,'HISTORY_FULL')
    requireValue(context?.allowed === true,'INTERACTION_DENIED')
    requireValue(natural(context.at) && (!state.events.length || context.at >= state.events.at(-1).at),'INVALID_TIME')
    requireValue(state.actorIds.includes(command.actorId),'UNKNOWN_ACTOR')
    const next = clone(state)
    const event = {id:`social:${state.revision+1}`,kind:command.kind,at:context.at,requestId:command.id,cause:null}
    if (command.kind === 'fact') {
      requireValue(id(command.factId) && !state.facts.some(f => f.id === command.factId),'INVALID_FACT_ID')
      requireValue(id(command.action) && (command.targetId === null || state.actorIds.includes(command.targetId)),'INVALID_FACT')
      requireValue(id(context.sourceEventId),'MISSING_SOURCE_EVENT')
      const fact = {id:command.factId,actorId:command.actorId,targetId:command.targetId,action:command.action,at:context.at,sourceEventId:context.sourceEventId,eventId:event.id}
      requireValue(!state.facts.some(f => f.sourceEventId === fact.sourceEventId),'FACT_ALREADY_RECORDED')
      next.facts.push(fact)
      event.fact = clone(fact)
      // Even the target receives no automatic social knowledge here.
    } else {
      const fact = state.facts.find(f => f.id === command.factId)
      requireValue(fact,'UNKNOWN_FACT')
      event.factId = fact.id
      event.actorId = command.actorId
      if (command.kind === 'witness') {
        requireValue(context.observed === true && context.observedAt === fact.at && typeof context.identified === 'boolean' && id(context.proofId),'MISSING_OBSERVATION')
        requireValue(!state.events.some(e => e.kind === 'witness' && e.actorId === command.actorId && e.factId === fact.id),'ALREADY_WITNESSED')
        event.cause = fact.eventId
        event.subjectId = context.identified ? fact.actorId : null
        event.proofId = context.proofId
        event.observedAt = context.observedAt
        if(context.position!==undefined) {
          requireValue(context.position && ['x','y','z'].every(k=>Number.isFinite(context.position[k])&&Math.abs(context.position[k])<=1024),'INVALID_POSITION')
          event.position=clone(context.position)
        }
        remember(next,command.actorId,fact.id,event.subjectId,event.id)
      } else if (command.kind === 'report') {
        requireValue(state.actorIds.includes(command.targetId) && command.targetId !== command.actorId,'INVALID_RECIPIENT')
        const known = state.knowledge.find(k => k.npcId === command.actorId && k.factId === fact.id)
        requireValue(known,'REPORTER_UNINFORMED')
        requireValue(context.delivered === true && id(context.proofId),'REPORT_NOT_DELIVERED')
        requireValue(!state.events.some(e => e.kind === 'report' && e.actorId === command.actorId && e.targetId === command.targetId && e.cause === known.evidenceId),'REPORT_ALREADY_DELIVERED')
        event.cause = known.evidenceId
        event.targetId = command.targetId
        event.subjectId = known.subjectId // Never resolve an anonymous source via the fact's actorId.
        event.proofId = context.proofId
        const source=state.events.find(e=>e.id===known.evidenceId)
        if(source?.position) event.position=clone(source.position)
        remember(next,command.targetId,fact.id,known.subjectId,event.id)
      } else {
        const known = state.knowledge.find(k => k.npcId === command.actorId && k.factId === fact.id)
        requireValue(known && known.subjectId !== null && known.subjectId === command.targetId,'SUBJECT_UNIDENTIFIED')
        requireValue(command.targetId !== command.actorId,'INVALID_RECIPIENT')
        requireValue(Number.isInteger(context.trustDelta) && context.trustDelta !== 0 && Math.abs(context.trustDelta) <= 100 && id(context.ruleId),'INVALID_RELATIONSHIP_RULE')
        requireValue(!state.events.some(e => e.kind === 'relationship' && e.actorId === command.actorId && e.factId === fact.id),'RELATIONSHIP_ALREADY_APPLIED')
        let relationship = next.relationships.find(r => r.fromId === command.actorId && r.toId === command.targetId)
        if (!relationship) {
          relationship = {fromId:command.actorId,toId:command.targetId,trust:0}
          next.relationships.push(relationship)
        }
        const updated = Math.max(-100,Math.min(100,relationship.trust+context.trustDelta))
        event.cause = known.evidenceId
        event.targetId = command.targetId
        event.ruleId = context.ruleId
        event.requestedDelta = context.trustDelta
        event.appliedDelta = updated-relationship.trust
        relationship.trust = updated
      }
    }
    next.revision++
    next.events.push(event)
    next.receipts.push({requestId:command.id,fingerprint:key,eventId:event.id})
    return {ok:true,code:'APPLIED',duplicate:false,state:next,events:[clone(event)],appliedEventId:event.id}
  } catch (error) {
    if (!(error instanceof KnowledgeError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}
