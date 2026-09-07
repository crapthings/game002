import { createCatalog, createInventory } from './inventory.js'
import { createInteractionState, executeInteraction } from './interactions.js'
import { createKnowledgeState, executeKnowledge } from './knowledge.js'

const clone = value => structuredClone(value)
const natural = value => Number.isSafeInteger(value) && value >= 0
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,59}$/.test(value)
class GameplayError extends Error {
  constructor(code) { super(code); this.code = code }
}
const requireValue = (condition,code) => { if (!condition) throw new GameplayError(code) }

// Stable JSON comparison without silently dropping undefined/non-finite values.
function canonical(value, depth = 0) {
  requireValue(depth < 32,'INVALID_JSON')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') { requireValue(Number.isFinite(value),'INVALID_JSON'); return JSON.stringify(value) }
  if (Array.isArray(value)) return `[${Array.from(value,v => canonical(v,depth+1)).join(',')}]`
  requireValue(value && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value)),'INVALID_JSON')
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key],depth+1)}`).join(',')}}`
}

export function createGameplay(config) {
  requireValue(config && id(config.id),'INVALID_CONFIG')
  const catalog = createCatalog(config.items)
  const inventory = createInventory(catalog,{containers:config.containers,lots:config.lots ?? []})
  const interactions = createInteractionState(catalog,inventory,config.actors)
  const social = createKnowledgeState(config.actors.map(actor => actor.id))
  return {catalog,state:{version:1,configId:config.id,configSignature:canonical(config),catalogSignature:canonical(catalog),revision:0,at:0,interactions,social,journal:[]}}
}

// request.steps is assembled by a trusted adapter, not accepted directly from UI.
// The coordinator assigns subcommand IDs/revisions and registers interaction facts.
export function executeGameplay(state,catalog,request) {
  try {
    requireValue(state?.version === 1 && natural(state.revision) && Array.isArray(state.journal),'INVALID_STATE')
    requireValue(canonical(catalog) === state.catalogSignature,'CATALOG_MISMATCH')
    requireValue(request && id(request.id) && natural(request.expectedRevision) && Array.isArray(request.steps) && request.steps.length > 0 && request.steps.length <= 32,'INVALID_REQUEST')
    const key = canonical(request)
    const prior = state.journal.find(entry => entry.id === request.id)
    if (prior) {
      requireValue(canonical(prior) === key,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),events:[]}
    }
    requireValue(request.expectedRevision === state.revision,'STALE_REVISION')
    requireValue(state.journal.length < 4096,'HISTORY_FULL')
    const next = clone(state), events = []
    for (const [i,step] of request.steps.entries()) {
      requireValue(step && ['interaction','knowledge'].includes(step.domain) && step.command && step.context,'INVALID_STEP')
      requireValue(!Object.hasOwn(step.command,'id') && !Object.hasOwn(step.command,'expectedRevision'),'RESERVED_COMMAND_FIELDS')
      requireValue(natural(step.context.at) && step.context.at >= next.at,'INVALID_TIME')
      const commandId = `${request.id}:${i}`
      if (step.domain === 'interaction') {
        const result = executeInteraction(next.interactions,catalog,{
          ...step.command,id:commandId,expectedRevision:next.interactions.revision,
        },step.context)
        requireValue(result.ok,result.code)
        requireValue(!result.duplicate,'DUPLICATE_SUBCOMMAND')
        next.interactions = result.state
        events.push(...result.events)
        for (const event of result.events) {
          const registration = executeKnowledge(next.social,{
            id:`${commandId}:fact`,kind:'fact',expectedRevision:next.social.revision,
            factId:`fact:${event.id}`,actorId:event.actorId,targetId:event.targetId,action:event.kind,
          },{allowed:true,at:event.at,sourceEventId:event.id})
          requireValue(registration.ok,registration.code)
          next.social = registration.state
          events.push(...registration.events)
        }
      } else {
        // Other world facts may be admitted by the trusted adapter. Transaction
        // facts must only originate from the automatic path above.
        requireValue(step.command.kind !== 'fact' || (typeof step.context.sourceEventId === 'string' && !step.context.sourceEventId.startsWith('interaction:')),'RESERVED_FACT_SOURCE')
        const result = executeKnowledge(next.social,{
          ...step.command,id:commandId,expectedRevision:next.social.revision,
        },step.context)
        requireValue(result.ok,result.code)
        requireValue(!result.duplicate,'DUPLICATE_SUBCOMMAND')
        next.social = result.state
        events.push(...result.events)
      }
      next.at = step.context.at
    }
    requireValue(natural(next.revision+1),'REVISION_OVERFLOW')
    next.revision++
    next.journal.push(clone(request))
    return {ok:true,code:'APPLIED',duplicate:false,state:next,events}
  } catch (error) {
    if (!(error instanceof GameplayError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}

// config is the application's trusted initial setup for this world/configId.
// Replay derives state, but never runs scene callbacks, sends notifications or
// credits an external wallet. It detects inconsistent snapshots, not forgery of
// an entire local history and its claimed spatial evidence.
export function restoreGameplay(config,saved) {
  try {
    requireValue(saved?.version === 1 && saved.configId === config.id && Array.isArray(saved.journal) && saved.journal.length <= 4096,'INVALID_SAVE')
    const initial = createGameplay(config)
    let state = initial.state
    for (const request of saved.journal) {
      const result = executeGameplay(state,initial.catalog,request)
      requireValue(result.ok && !result.duplicate,'INVALID_HISTORY')
      state = result.state
    }
    requireValue(canonical(state) === canonical(saved),'PROJECTION_MISMATCH')
    return {ok:true,code:'RESTORED',catalog:initial.catalog,state,events:[]}
  } catch (error) {
    return {ok:false,code:error instanceof GameplayError ? error.code : 'INVALID_SAVE',events:[]}
  }
}
