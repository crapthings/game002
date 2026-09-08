import { nextEventNumber,findReceipt } from './historyArchive.js'
// Pure combat rules. Milliseconds and milli-stamina avoid frame-rate rounding.
// A supplies swept hit/occlusion evidence and incoming angle, never damage.
const clone = value => structuredClone(value)
const natural = n => Number.isSafeInteger(n) && n >= 0
const id = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(s)
class CombatError extends Error { constructor(code) { super(code); this.code = code } }
const check = (ok,code) => { if (!ok) throw new CombatError(code) }
export const COMBAT_RULES = Object.freeze({
  maxStamina:100000, guardDrainPerMs:8, guardHitCost:25000,
  regenPerMs:30, regenDelayMs:600, rearmStamina:25000,
  windupMs:250, activeMs:180, recoveryMs:400, breakMs:700,
  guardHalfAngleDegrees:60,
})

export function createCombatState(actors) {
  check(Array.isArray(actors) && actors.length > 0,'INVALID_ACTORS')
  const seen = new Set()
  const fighters = actors.map(a => {
    check(a && id(a.id) && !seen.has(a.id),'INVALID_ACTOR')
    check(natural(a.health) && natural(a.maxHealth) && a.maxHealth > 0 && a.health <= a.maxHealth,'INVALID_HEALTH')
    check(natural(a.attack) && a.attack > 0 && natural(a.defense),'INVALID_ATTRIBUTES')
    seen.add(a.id)
    return {id:a.id,attack:a.attack,defense:a.defense,
      stamina:COMBAT_RULES.maxStamina,guardHeld:false,guarding:false,mustRelease:false,
      regenAt:0,brokenUntil:0,swing:null}
  })
  return {version:1,revision:0,at:0,fighters,events:[],receipts:[]}
}

function emit(state,kind,at,data) {
  const event = {id:`combat:${nextEventNumber(state)}`,kind,at,...data}
  state.events.push(event)
  return event.id
}

function advance(state,actors,at) {
  const r = COMBAT_RULES, dt = at-state.at
  const exhausted = []
  for (const f of state.fighters) {
    if (actors.find(a => a.id === f.id).health === 0 || f.condition) continue
    if (f.guarding) {
      const untilEmpty = Math.ceil(f.stamina/r.guardDrainPerMs)
      if (dt >= untilEmpty) {
        f.stamina = 0; f.guarding = false; f.mustRelease = true
        exhausted.push({at:state.at+untilEmpty,actorId:f.id})
      } else f.stamina -= dt*r.guardDrainPerMs
    } else if (!f.guardHeld) {
      // Cap elapsed before multiplying, keeping all arithmetic safe.
      const elapsed = Math.min(100000,Math.max(0,at-Math.max(state.at,f.regenAt)))
      f.stamina = Math.min(r.maxStamina,f.stamina+elapsed*r.regenPerMs)
    }
    if (f.swing && at >= f.swing.endsAt) f.swing = null
  }
  exhausted.sort((a,b) => a.at-b.at || (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0))
    .forEach(e => emit(state,'guard_exhausted',e.at,{actorId:e.actorId,cause:null}))
  state.at = at
}

export function combatPhase(fighter,at,health) {
  if (health === 0) return 'dead'
  if (fighter.condition) return fighter.condition
  if (at < fighter.brokenUntil) return 'broken'
  if (fighter.guarding) return 'guard'
  const s = fighter.swing
  if (!s || at >= s.endsAt) return 'idle'
  return at < s.activeAt ? 'windup' : at < s.recoveryAt ? 'active' : 'recovery'
}

// Render-only time projection. Never commit this copy or publish its derived
// events. The next actual action settles elapsed time once, without tick logs.
export function previewCombat(state,actors,at) {
  check(natural(at) && at >= state.at && Number.isSafeInteger(at+100000),'INVALID_TIME')
  const view = {at:state.at,fighters:clone(state.fighters),events:[]}
  advance(view,actors,at)
  return view.fighters.map(f => ({...f,health:actors.find(a => a.id === f.id).health,
    phase:combatPhase(f,at,actors.find(a => a.id === f.id).health)}))
}

// Trusted live state only. Persisted state needs the coordinator's replay path.
export function executeCombat(state,actors,command,context) {
  try {
    check(state?.version === 1 && natural(state.at) && Array.isArray(state.receipts),'INVALID_STATE')
    check(command && id(command.id) && natural(command.expectedRevision) && ['attack','guard','hit'].includes(command.kind),'INVALID_COMMAND')
    check(context && natural(context.at),'INVALID_TIME')
    const fingerprintParts = [command.kind,command.expectedRevision,command.actorId ?? null,
      command.targetId ?? null,command.held ?? null,command.swingId ?? null,
      context.at,context.allowed === true,context.contact === true,context.clear === true,
      context.angleDegrees ?? null,context.proofId ?? null]
    if(command.nonlethal!==undefined||context.nonlethal!==undefined)fingerprintParts.push(command.nonlethal??null,context.nonlethal??null,context.position??null)
    const fingerprint=JSON.stringify(fingerprintParts)
    const prior = findReceipt(state,command.id)
    if (prior) {
      check(prior.fingerprint === fingerprint,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),actors:clone(actors),events:[]}
    }
    check(command.expectedRevision === state.revision,'STALE_REVISION')
    check(context.at >= state.at,'INVALID_TIME')
    check(context.allowed === true,'INTERACTION_DENIED')
    check(state.receipts.length < 4096,'HISTORY_FULL')
    const next = clone(state), nextActors = clone(actors), firstEvent = next.events.length, r = COMBAT_RULES
    advance(next,nextActors,context.at)
    {
      const actor = next.fighters.find(f => f.id === command.actorId)
      const actorVitals = nextActors.find(a => a.id === command.actorId)
      check(actor && actorVitals,'UNKNOWN_ACTOR'); check(actorVitals.health > 0,'ACTOR_DEAD')
      check(!actor.condition,'ACTOR_INCAPACITATED')
      if (command.kind === 'guard') {
        check(typeof command.held === 'boolean','INVALID_COMMAND')
        if (command.held) {
          check(!actor.guardHeld && !actor.mustRelease,'RELEASE_REQUIRED')
          check(combatPhase(actor,next.at,actorVitals.health) === 'idle','ACTOR_BUSY')
          check(actor.stamina >= r.rearmStamina,'INSUFFICIENT_STAMINA')
          actor.guardHeld = true; actor.guarding = true
        } else {
          check(actor.guardHeld || actor.mustRelease,'NO_CHANGE')
          actor.guardHeld = false; actor.guarding = false; actor.mustRelease = false
          actor.regenAt = next.at+r.regenDelayMs
        }
        emit(next,command.held ? 'guard_started' : 'guard_released',next.at,{actorId:actor.id,cause:null})
      } else if (command.kind === 'attack') {
        check(combatPhase(actor,next.at,actorVitals.health) === 'idle' && !actor.guardHeld,'ACTOR_BUSY')
        check(command.nonlethal===undefined||typeof command.nonlethal==='boolean','INVALID_COMMAND')
        const intent=command.nonlethal===true?{nonlethal:true}:{}
        const cause = emit(next,'attack_started',next.at,{actorId:actor.id,swingId:command.id,cause:null,...intent})
        actor.swing = {id:command.id,cause,activeAt:next.at+r.windupMs,
          recoveryAt:next.at+r.windupMs+r.activeMs,endsAt:next.at+r.windupMs+r.activeMs+r.recoveryMs,hitIds:[],...intent}
      } else {
        const swing = actor.swing, target = next.fighters.find(f => f.id === command.targetId)
        const targetVitals = nextActors.find(a => a.id === command.targetId)
        check(swing && swing.id === command.swingId && combatPhase(actor,next.at,actorVitals.health) === 'active','NO_ACTIVE_SWING')
        check(target && targetVitals && target.id !== actor.id && targetVitals.health > 0,'INVALID_TARGET')
        check(!swing.hitIds.includes(target.id),'ALREADY_HIT')
        check(context.contact === true && context.clear === true && id(context.proofId),'MISSING_HIT_EVIDENCE')
        check(Number.isFinite(context.angleDegrees) && Math.abs(context.angleDegrees) <= 180,'INVALID_ANGLE')
        swing.hitIds.push(target.id)
        const frontalGuard = target.guarding && Math.abs(context.angleDegrees) <= r.guardHalfAngleDegrees
        if (frontalGuard && target.stamina >= r.guardHitCost) {
          target.stamina -= r.guardHitCost
          emit(next,'parried',next.at,{actorId:actor.id,targetId:target.id,cause:swing.cause,proofId:context.proofId})
          if (target.stamina === 0) { target.guarding = false; target.mustRelease = true }
        } else {
          if (frontalGuard) {
            target.stamina = 0; target.guarding = false; target.mustRelease = true
            target.brokenUntil = next.at+r.breakMs; target.swing = null
            emit(next,'guard_broken',next.at,{actorId:actor.id,targetId:target.id,cause:swing.cause})
          }
          const nonlethal=swing.nonlethal===true&&context.nonlethal===true
          check(!nonlethal||!target.condition,'TARGET_ALREADY_DISABLED')
          const rawDamage=Math.max(1,actor.attack-target.defense)
          const damage = Math.min(targetVitals.health-(nonlethal?1:0),rawDamage)
          targetVitals.health -= damage
          const cause = emit(next,'damaged',next.at,{actorId:actor.id,targetId:target.id,damage,cause:swing.cause,proofId:context.proofId})
          if(nonlethal&&targetVitals.health===1) {
            check(context.position&&['x','y','z'].every(k=>Number.isFinite(context.position[k])),'MISSING_BODY_POSITION')
            target.guarding=false;target.guardHeld=false;target.mustRelease=false;target.swing=null;target.condition='incapacitated'
            emit(next,'incapacitated',next.at,{actorId:actor.id,targetId:target.id,cause,position:clone(context.position),proofId:context.proofId})
          } else if (targetVitals.health === 0) {
            target.guarding = false; target.guardHeld = false; target.swing = null
            emit(next,'died',next.at,{actorId:actor.id,targetId:target.id,cause})
          }
        }
      }
    }
    check(Number.isSafeInteger(next.at+100000) && natural(next.revision+1),'TIME_OVERFLOW')
    next.revision++
    next.receipts.push({requestId:command.id,fingerprint})
    return {ok:true,code:'APPLIED',duplicate:false,state:next,actors:nextActors,events:clone(next.events.slice(firstEvent))}
  } catch (error) {
    if (!(error instanceof CombatError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}
