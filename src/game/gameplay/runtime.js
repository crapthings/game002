import * as v1 from './versions/v1/runtime.js'
import { createV2Baseline } from './migrations/v2.js'
import { executeRegistry } from './registry.js'
import { executePlaces,addArrivalPlace } from './places.js'
import { executeLife,addArrivalLife } from './life.js'
import { assertTradeService } from './commerce.js'
import { executeDialogue } from './dialogue.js'
import { executeOpportunities,applyOpportunityConsequences } from './opportunities.js'
import { executeRelations } from './relations.js'
import { executeExchange } from './exchange.js'
import { executeEconomy } from './economy.js'
import { applyLaborInterruptions } from './employment.js'
import { executeVillage } from './village.js'
import { InventoryError } from './inventory.js'
import { executeInteraction } from './interactions.js'
import { executeKnowledge } from './knowledge.js'
import { executeCombat, previewCombat } from './combat.js'
import { executeProperty } from './property.js'
import { executeEquipment, equippedLot, refreshEquipment } from './equipment.js'
import { executeRobbery } from './robbery.js'
import { executeCrime } from './crime.js'
import { executePursuit } from './pursuit.js'
import { classifyForce } from './forcePolicy.js'
import { archivedRequest,compactGameplay,historyPage,historyCanonical } from './historyArchive.js'

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
  return v1.createGameplay(config)
}


function registerFact(state,event,requestId) {
  const result=executeKnowledge(state.social,{id:`${requestId}:fact`,kind:'fact',expectedRevision:state.social.revision,
    factId:`fact:${event.id}`,actorId:event.actorId,targetId:event.targetId,action:event.kind},
    {allowed:true,at:event.at,sourceEventId:event.id})
  requireValue(result.ok,result.code); state.social=result.state
  return result.events
}

export function previewGameplayCombat(state,at) {
  if(state?.version===1)return v1.previewGameplayCombat(state,at)
  requireValue(state.combat,'COMBAT_DISABLED')
  requireValue(natural(at) && at >= state.at,'INVALID_TIME')
  return previewCombat(state.combat,state.interactions.actors,at)
}

// request.steps is assembled by a trusted adapter, not accepted directly from UI.
// The coordinator assigns subcommand IDs/revisions and registers interaction facts.
export function executeGameplay(state,catalog,request) {
  if(state?.version===1)return v1.executeGameplay(state,catalog,request)
  try {
    requireValue(state?.version === 2 && natural(state.revision) && Array.isArray(state.journal),'INVALID_STATE')
    requireValue(canonical(catalog) === state.catalogSignature,'CATALOG_MISMATCH')
    requireValue(request && id(request.id) && natural(request.expectedRevision) && Array.isArray(request.steps) && request.steps.length > 0 && request.steps.length <= 32,'INVALID_REQUEST')
    const key = canonical(request)
    const prior = state.journal.find(entry => entry.id === request.id) ?? state.archive?.legacyCheckpoint.gameplay.journal.find(entry=>entry.id===request.id) ?? archivedRequest(state,request.id)
    if (prior) {
      requireValue(canonical(prior) === key,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),events:[]}
    }
    requireValue(request.expectedRevision === state.revision,'STALE_REVISION')
    requireValue(state.journal.length < 4096,'HISTORY_FULL')
    const next = clone(state), events = []
    for (const [i,step] of request.steps.entries()) {
      requireValue(step && ['interaction','knowledge','combat','property','equipment','robbery','crime','pursuit','village','registry','places','life','dialogue','opportunities','relations','exchange','economy'].includes(step.domain) && step.command && step.context,'INVALID_STEP')
      requireValue(!Object.hasOwn(step.command,'id') && !Object.hasOwn(step.command,'expectedRevision'),'RESERVED_COMMAND_FIELDS')
      requireValue(natural(step.context.at) && step.context.at >= next.at,'INVALID_TIME')
      const firstFact = next.social.facts.length
      const firstEvent=events.length
      const commandId = `${request.id}:${i}`
      if(step.domain==='registry') {
        const emitted=executeRegistry(next,catalog,{...step.command,id:commandId},step.context)
        addArrivalPlace(next,next.registry.actors.find(a=>a.actorId===step.command.actorId),emitted[0].id)
        addArrivalLife(next,step.command.actorId,step.context.at)
        events.push(...emitted)
        for(const event of emitted)events.push(...registerFact(next,event,commandId))
      } else if(step.domain==='places') {
        const emitted=executePlaces(next,{...step.command,id:commandId},step.context)
        events.push(...emitted)
        for(const event of emitted)events.push(...registerFact(next,event,commandId))
      } else if(step.domain==='life') {
        const emitted=executeLife(next,{...step.command,id:commandId},step.context)
        events.push(...emitted)
        for(const event of emitted)events.push(...registerFact(next,event,commandId))
      } else if(step.domain==='dialogue') {
        const emitted=executeDialogue(next,{...step.command,id:commandId},step.context)
        events.push(...emitted)
        for(const event of emitted) {
          if(event.id.startsWith('dialogue:'))events.push(...registerFact(next,event,commandId))
          else if(event.id.startsWith('relations:'))events.push(...registerFact(next,event,`${commandId}:${event.id}`))
        }
      } else if(step.domain==='exchange') {
        const emitted=executeExchange(next,{...step.command,id:commandId},step.context)
        events.push(...emitted)
        for(const event of emitted)if(event.id.startsWith('relations:'))events.push(...registerFact(next,event,`${commandId}:${event.id}`))
      } else if(step.domain==='relations') {
        const emitted=executeRelations(next,{...step.command,id:commandId},step.context)
        events.push(...emitted)
        for(const event of emitted)events.push(...registerFact(next,event,`${commandId}:${event.id}`))
      } else if(step.domain==='economy') {
        const emitted=executeEconomy(next,catalog,{...step.command,id:commandId},step.context)
        events.push(...emitted)
        for(const event of emitted)events.push(...registerFact(next,event,`${commandId}:${event.id}`))
      } else if(step.domain==='opportunities') {
        const emitted=executeOpportunities(next,{...step.command,id:commandId},step.context,catalog)
        events.push(...emitted)
        for(const event of emitted) {
          events.push(...registerFact(next,event,`${commandId}:${event.id}`))
          if(['message_delivered','message_acknowledged'].includes(event.kind)||next.relations&&event.kind==='opportunity_fulfilled') {
            const observed=executeKnowledge(next.social,{id:`${commandId}:message:${event.id}`,kind:'witness',expectedRevision:next.social.revision,
              actorId:event.targetId,factId:`fact:${event.id}`},{allowed:true,at:event.at,observed:true,observedAt:event.at,identified:event.identified,proofId:event.proofId})
            requireValue(observed.ok,observed.code);next.social=observed.state;events.push(...observed.events)
          }
        }
      } else if (step.domain === 'interaction') {
        assertTradeService(next,step.command,step.context)
        if (next.combat) {
          const participants = [step.command.actorId,step.command.targetId]
          requireValue(participants.every(id => next.interactions.actors.some(a => a.id === id && a.health > 0)),'ACTOR_DEAD')
          requireValue(!equippedLot(next.equipment,step.command.lotId),'ITEM_EQUIPPED')
        }
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
      } else if (step.domain === 'combat') {
        requireValue(next.combat,'COMBAT_DISABLED')
        const justification = step.command.kind === 'hit'
          ? classifyForce(next,step.command.actorId,step.command.targetId,step.context.at) : null
        const result = executeCombat(next.combat,next.interactions.actors,{
          ...step.command,id:commandId,expectedRevision:next.combat.revision,
        },step.context)
        requireValue(result.ok,result.code)
        for (const event of result.events) {
          if (['parried','damaged','died'].includes(event.kind)) {
            event.justification = clone(justification)
            result.state.events.find(e => e.id === event.id).justification = clone(justification)
          }
        }
        next.combat = result.state
        // This is the only authoritative health array, shared with item use.
        next.interactions.actors = result.actors
        events.push(...result.events)
        for (const event of result.events.filter(e => ['parried','damaged','died'].includes(e.kind))) {
          const registration = executeKnowledge(next.social,{
            id:`${commandId}:fact:${event.id}`,kind:'fact',expectedRevision:next.social.revision,
            factId:`fact:${event.id}`,actorId:event.actorId,targetId:event.targetId,action:event.kind,
          },{allowed:true,at:event.at,sourceEventId:event.id})
          requireValue(registration.ok,registration.code)
          next.social = registration.state
          events.push(...registration.events)
        }
      } else if (step.domain === 'village') {
        const emitted=executeVillage(next,catalog,{...step.command,id:commandId},step.context)
        events.push(...emitted)
        for(const event of emitted) events.push(...registerFact(next,event,commandId))
      } else if (step.domain === 'pursuit') {
        requireValue(next.pursuit,'COMBAT_DISABLED')
        const result = executePursuit(next.pursuit,next,{
          ...step.command,id:commandId,expectedRevision:next.pursuit.revision,
        },step.context)
        requireValue(result.ok,result.code)
        next.pursuit = result.state; events.push(...result.events)
      } else if (step.domain === 'crime') {
        requireValue(next.crime,'COMBAT_DISABLED')
        const result = executeCrime(next.crime,next,{
          ...step.command,id:commandId,expectedRevision:next.crime.revision,
        },step.context)
        requireValue(result.ok,result.code)
        next.crime = result.state; events.push(...result.events)
      } else if (step.domain === 'robbery') {
        requireValue(next.combat && next.robbery,'COMBAT_DISABLED')
        const result = executeRobbery(next.robbery,next.interactions,next.combat,next.property,{
          ...step.command,id:commandId,expectedRevision:next.robbery.revision,
        },step.context)
        requireValue(result.ok,result.code)
        next.robbery = result.state; next.interactions = result.interactions; next.property = result.property
        events.push(...result.events)
        for (const event of result.events) {
          const registration = executeKnowledge(next.social,{
            id:`${commandId}:fact:${event.id}`,kind:'fact',expectedRevision:next.social.revision,
            factId:`fact:${event.id}`,actorId:event.actorId,targetId:event.targetId,action:event.kind,
          },{allowed:true,at:event.at,sourceEventId:event.id})
          requireValue(registration.ok,registration.code)
          next.social = registration.state; events.push(...registration.events)
        }
      } else if (step.domain === 'equipment') {
        requireValue(next.combat && next.equipment,'COMBAT_DISABLED')
        const result = executeEquipment(next.equipment,next.combat,next.interactions,catalog,{
          ...step.command,id:commandId,expectedRevision:next.equipment.revision,
        },step.context)
        requireValue(result.ok,result.code)
        next.equipment = result.state; next.combat = result.combat
        events.push(...result.events)
      } else if (step.domain === 'property') {
        requireValue(next.combat && next.property,'COMBAT_DISABLED')
        const result = executeProperty(next.property,next.interactions,next.combat,catalog,{
          ...step.command,id:commandId,expectedRevision:next.property.revision,
        },step.context)
        requireValue(result.ok,result.code)
        next.property = result.state
        next.interactions = result.interactions
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
        if (next.combat && step.command.kind !== 'fact') {
          requireValue(next.interactions.actors.some(a => a.id === step.command.actorId && a.health > 0),'ACTOR_DEAD')
          if (step.command.kind === 'report') {
            requireValue(next.interactions.actors.some(a => a.id === step.command.targetId && a.health > 0),'RECIPIENT_DEAD')
          }
        }
        // Other world facts may be admitted by the trusted adapter. Transaction
        // facts must only originate from the automatic path above.
        requireValue(step.command.kind !== 'fact' || (typeof step.context.sourceEventId === 'string' && !/^(interaction|combat|property|equipment|robbery|village):/.test(step.context.sourceEventId)),'RESERVED_FACT_SOURCE')
        const result = executeKnowledge(next.social,{
          ...step.command,id:commandId,expectedRevision:next.social.revision,
        },step.context)
        requireValue(result.ok,result.code)
        requireValue(!result.duplicate,'DUPLICATE_SUBCOMMAND')
        next.social = result.state
        events.push(...result.events)
      }
      if(step.observations!==undefined) {
        requireValue(Array.isArray(step.observations) && step.observations.length<=16,'INVALID_OBSERVERS')
        for(const fact of next.social.facts.slice(firstFact)) for(const [j,observation] of step.observations.entries()) {
          // A killed observer cannot deliver a final, posthumous memory.
          if(!next.interactions.actors.some(a=>a.id===observation.npcId && a.health>0)) continue
          const result=executeKnowledge(next.social,{id:`${commandId}:see:${j}:${fact.id}`,kind:'witness',
            actorId:observation.npcId,factId:fact.id,expectedRevision:next.social.revision},
            {allowed:true,at:step.context.at,observed:true,observedAt:fact.at,
              identified:observation.identified,proofId:observation.proofId,position:observation.position})
          requireValue(result.ok,result.code); next.social=result.state; events.push(...result.events)
        }
      }
      // Consequences are world facts; witnesses of the hit do not automatically
      // learn the victim's private contracts or reserved budget.
      const consequences=applyOpportunityConsequences(next,events.slice(firstEvent),step.context.at,commandId)
      events.push(...consequences)
      for(const event of consequences)events.push(...registerFact(next,event,`${commandId}:${event.id}`))
      const laborEvents=applyLaborInterruptions(next,events.slice(firstEvent),step.context.at,commandId)
      events.push(...laborEvents)
      for(const event of laborEvents)events.push(...registerFact(next,event,`${commandId}:${event.id}`))
      if (next.equipment) refreshEquipment(next.equipment,next.combat,next.interactions,catalog)
      next.at = step.context.at
    }
    requireValue(natural(next.revision+1),'REVISION_OVERFLOW')
    next.revision++
    next.journal.push(clone(request))
    return {ok:true,code:'APPLIED',duplicate:false,state:next,events}
  } catch (error) {
    if (!(error instanceof GameplayError) && !(error instanceof InventoryError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}

// config is the application's trusted initial setup for this world/configId.
// Replay derives state, but never runs scene callbacks, sends notifications or
// credits an external wallet. It detects inconsistent snapshots, not forgery of
// an entire local history and its claimed spatial evidence.
export function restoreGameplay(config,saved,{pages=[]}={}) {
  if(saved?.version===1)return v1.restoreGameplay(config,saved)
  try {
    requireValue(saved?.version === 2 && saved.configId === config.id && Array.isArray(saved.journal) && saved.journal.length <= 4096,'INVALID_SAVE')
    const initial = createV2Baseline(config,saved.archive?.legacyCheckpoint,saved.migration)
    let state = initial.state
    const history=saved.archive?.history
    if(history) {
      requireValue(saved.archive.version===2&&history.version===1&&Array.isArray(history.pages),'INVALID_ARCHIVE')
      for(const [index,descriptor] of history.pages.entries()) {
        requireValue(descriptor.index===index,'INVALID_ARCHIVE_ORDER')
        const page=historyPage(history.id,index,pages)
        requireValue(Array.isArray(page.journal)&&page.journal.length>0&&page.journal.length<=4096,'INVALID_ARCHIVE_PAGE')
        for(const request of page.journal) {
          const result=executeGameplay(state,initial.catalog,request)
          requireValue(result.ok&&!result.duplicate,'INVALID_HISTORY');state=result.state
        }
        const compacted=compactGameplay(state,history.id)
        requireValue(historyCanonical(compacted.page)===historyCanonical(page),'ARCHIVE_PROJECTION_MISMATCH')
        requireValue(historyCanonical(compacted.state.archive.history.pages[index])===historyCanonical(descriptor),'INVALID_ARCHIVE_DESCRIPTOR')
        state=compacted.state
      }
    }
    for (const request of saved.journal) {
      const result = executeGameplay(state,initial.catalog,request)
      requireValue(result.ok && !result.duplicate,'INVALID_HISTORY')
      state = result.state
    }
    requireValue(canonical(state) === canonical(saved),'PROJECTION_MISMATCH')
    return {ok:true,code:'RESTORED',catalog:initial.catalog,state,events:[]}
  } catch (error) {
    return {ok:false,code:error instanceof GameplayError || error instanceof InventoryError ? error.code : 'INVALID_SAVE',events:[]}
  }
}

// `previous` is a private copy derived by repository load/replay or its last
// verified commit. Never call this on an arbitrary imported snapshot baseline.
export function verifyGameplayAdvance(previous,catalog,saved,{pages=[]}={}) {
  try {
    requireValue(previous.version===2&&saved?.version===2,'INVALID_SAVE')
    let state=clone(previous)
    const oldPages=previous.archive.history?.pages??[],newPages=saved.archive.history?.pages??[]
    requireValue(newPages.length>=oldPages.length&&newPages.length<=oldPages.length+1&&
      historyCanonical(newPages.slice(0,oldPages.length))===historyCanonical(oldPages),'INVALID_ARCHIVE_ORDER')
    const replay=requests=>{
      requireValue(Array.isArray(requests)&&requests.length>=state.journal.length&&requests.length<=4096&&
        historyCanonical(requests.slice(0,state.journal.length))===historyCanonical(state.journal),'INVALID_HISTORY')
      for(const request of requests.slice(state.journal.length)) {
        const result=executeGameplay(state,catalog,request)
        requireValue(result.ok&&!result.duplicate,'INVALID_HISTORY');state=result.state
      }
    }
    if(newPages.length>oldPages.length) {
      const history=saved.archive.history,page=historyPage(history.id,oldPages.length,pages)
      replay(page.journal)
      const compacted=compactGameplay(state,history.id)
      requireValue(historyCanonical(compacted.page)===historyCanonical(page),'ARCHIVE_PROJECTION_MISMATCH')
      state=compacted.state
    }
    replay(saved.journal)
    requireValue(historyCanonical(state)===historyCanonical(saved),'PROJECTION_MISMATCH')
    return {ok:true,state,catalog}
  } catch(error){return {ok:false,code:error.code??'INVALID_SAVE'}}
}
