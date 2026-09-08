import { activeEventCount,findReceipt } from './historyArchive.js'
import { InventoryError } from './inventory.js'
const clone = value => structuredClone(value)
const natural = n => Number.isSafeInteger(n) && n >= 0
const id = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(s)
const check = (ok,code) => { if (!ok) throw new InventoryError(code) }
const severity = Object.freeze({take:2,threatened:1,robbed:2,parried:2,damaged:2,died:3,loot_item:1,loot_money:1})

export function createCrimeState(actorIds,authorities = []) {
  check(Array.isArray(authorities) && authorities.every(a => actorIds.includes(a)) &&
    new Set(authorities).size === authorities.length,'INVALID_AUTHORITIES')
  return {version:1,revision:0,authorities:[...authorities],cases:[],events:[],receipts:[]}
}

// A case can link related effects using actual world causes, but the suspect
// identity always comes from the assessing authority's own knowledge.
function incidentFor(source,events) {
  let root = source
  // Loot is its own offense, not the looter's responsibility for the death.
  if (source.kind.startsWith('loot_')) return source.id
  for (let depth = 0; root.cause && depth < 8; depth++) {
    const parent = events.find(e => e.id === root.cause)
    if (!parent || parent.actorId !== source.actorId) break
    root = parent
  }
  return root.id
}

export function wantedFor(state,authorityId,subjectId) {
  check(state.authorities.includes(authorityId),'NOT_AUTHORITY')
  check(id(subjectId),'INVALID_SUBJECT')
  const cases = state.cases.filter(c => c.authorityId === authorityId && c.subjectId === subjectId && !c.resolved)
  const points = cases.reduce((sum,c) => sum+c.severity,0)
  const level = cases.some(c => c.severity === 3) ? 3 : points === 0 ? 0 : points === 1 ? 1 : points <= 3 ? 2 : 3
  return {authorityId,subjectId,level,points,caseIds:cases.map(c => c.id),
    response:level === 0 ? 'none' : level === 1 ? 'question' : level === 2 ? 'arrest' : 'reinforce'}
}

export function executeCrime(state,world,command,context) {
  try {
    check(command && command.kind === 'assess' && id(command.id) && id(command.actorId) &&
      id(command.factId) && natural(command.expectedRevision),'INVALID_COMMAND')
    const fingerprint = JSON.stringify([command.kind,command.expectedRevision,command.actorId,command.factId,
      context?.at,context?.allowed === true])
    const prior = findReceipt(state,command.id)
    if (prior) {
      check(prior.fingerprint === fingerprint,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),events:[]}
    }
    check(command.expectedRevision === state.revision,'STALE_REVISION')
    check(activeEventCount(state)<4096,'HISTORY_FULL')
    check(context?.allowed === true,'INTERACTION_DENIED')
    check(natural(context.at) && (!state.events.length || context.at >= state.events.at(-1).at),'INVALID_TIME')
    check(state.authorities.includes(command.actorId),'NOT_AUTHORITY')
    check(world.interactions.actors.some(a => a.id === command.actorId && a.health > 0),'ACTOR_DEAD')
    const fact = world.social.facts.find(f => f.id === command.factId)
    const known = world.social.knowledge.find(k => k.npcId === command.actorId && k.factId === command.factId)
    check(fact && known,'AUTHORITY_UNINFORMED')
    check(!state.events.some(e => e.authorityId === command.actorId && e.factId === fact.id && e.evidenceId === known.evidenceId),'EVIDENCE_ALREADY_ASSESSED')
    const evidence = world.social.events.find(e => e.id === known.evidenceId)
    check(evidence && evidence.at <= context.at,'INVALID_EVIDENCE_TIME')
    const sources = [...world.combat.events,...world.robbery.events,...world.property.events,...(world.village?.events??[])]
    const source = sources.find(e => e.id === fact.sourceEventId)
    check(source && Object.hasOwn(severity,source.kind),'NOT_CRIME_FACT')
    const combatFact = ['parried','damaged','died'].includes(source.kind)
    if (combatFact) {
      check(source.justification && typeof source.justification.unlawful === 'boolean','MISSING_FORCE_JUDGMENT')
      check(source.justification.unlawful,'LAWFUL_FORCE')
    }
    const ruleId = combatFact ? source.justification.ruleId : 'property.coercion.v1'
    const incidentId = incidentFor(source,sources)
    check(!world.village?.settled.includes(incidentId),'INCIDENT_RESOLVED')
    const next = clone(state)
    let record = next.cases.find(c => c.authorityId === command.actorId && c.incidentId === incidentId && c.victimId === source.targetId)
    if (!record) {
      record = {id:`case:${next.cases.length+1}`,authorityId:command.actorId,incidentId,
        victimId:source.targetId,subjectId:null,severity:0,factIds:[],evidenceIds:[]}
      next.cases.push(record)
    }
    if (known.subjectId !== null) {
      check(record.subjectId === null || record.subjectId === known.subjectId,'CONFLICTING_IDENTITY')
      record.subjectId = known.subjectId
    }
    record.severity = Math.max(record.severity,severity[source.kind])
    if (!record.factIds.includes(fact.id)) record.factIds.push(fact.id)
    record.evidenceIds.push(known.evidenceId)
    const event = {id:`crime:${state.revision+1}`,kind:'case_assessed',at:context.at,
      authorityId:command.actorId,caseId:record.id,factId:fact.id,evidenceId:known.evidenceId,
      subjectId:record.subjectId,severity:record.severity,ruleId,
      cause:known.evidenceId,requestId:command.id}
    next.revision++
    next.events.push(event); next.receipts.push({requestId:command.id,fingerprint})
    return {ok:true,code:'APPLIED',duplicate:false,state:next,events:[clone(event)]}
  } catch (error) {
    if (!(error instanceof InventoryError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}
