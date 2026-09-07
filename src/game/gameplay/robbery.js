import { InventoryError } from './inventory.js'
import { previewCombat } from './combat.js'

const clone = value => structuredClone(value)
const natural = n => Number.isSafeInteger(n) && n >= 0
const id = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(s)
const check = (ok,code) => { if (!ok) throw new InventoryError(code) }

export function createRobberyState(actors) {
  const personalities = actors.map(a => {
    const courage = a.courage ?? 50
    check(natural(courage) && courage <= 100,'INVALID_COURAGE')
    return {actorId:a.id,courage}
  })
  return {version:1,revision:0,personalities,events:[],receipts:[],cooldowns:[]}
}

// One close-range demand and immediate response. Movement/attacking requested
// by the reaction still needs A's actual world execution and hit evidence.
export function executeRobbery(state,interactions,combat,property,command,context) {
  try {
    check(command && command.kind === 'threaten' && id(command.id) && id(command.actorId) &&
      id(command.targetId) && natural(command.expectedRevision) && natural(command.amount) && command.amount > 0,'INVALID_COMMAND')
    const fingerprint = JSON.stringify([command.kind,command.expectedRevision,command.actorId,command.targetId,
      command.amount,context?.at,context?.allowed === true,context?.reachable === true,
      context?.guardNearby,context?.escapeRoute,context?.proofId])
    const prior = state.receipts.find(r => r.requestId === command.id)
    if (prior) {
      check(prior.fingerprint === fingerprint,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),interactions:clone(interactions),property:clone(property),events:[]}
    }
    check(command.expectedRevision === state.revision,'STALE_REVISION')
    check(state.events.length <= 4094,'HISTORY_FULL')
    check(context?.allowed === true && context.reachable === true && id(context.proofId) &&
      typeof context.guardNearby === 'boolean' && typeof context.escapeRoute === 'boolean','MISSING_THREAT_EVIDENCE')
    check(natural(context.at) && Number.isSafeInteger(context.at+30000) && context.at >= combat.at &&
      (!state.events.length || context.at >= state.events.at(-1).at),'INVALID_TIME')
    const actor = interactions.actors.find(a => a.id === command.actorId)
    const target = interactions.actors.find(a => a.id === command.targetId)
    check(actor && target && actor.id !== target.id,'INVALID_TARGET')
    check(actor.health > 0 && target.health > 0,'ACTOR_DEAD')
    const cooldown = state.cooldowns.find(c => c.targetId === target.id)
    check(!cooldown || context.at >= cooldown.until,'THREAT_COOLDOWN')
    const view = previewCombat(combat,interactions.actors,context.at)
    const attacker = view.find(f => f.id === actor.id), defender = view.find(f => f.id === target.id)
    check(attacker.phase === 'idle' && !attacker.guardHeld,'ACTOR_BUSY')
    check(defender.phase === 'idle' && !defender.guardHeld,'TARGET_BUSY')
    const courage = state.personalities.find(p => p.actorId === target.id).courage
    // Dimensionless bounded ratios avoid overflowing large safe attributes.
    const strength = attacker.attack/(attacker.attack+defender.attack)
    const pressure = strength*60 + (actor.health/actor.maxHealth-target.health/target.maxHealth)*20
    let reaction
    if (context.guardNearby) reaction = 'call_guard'
    else if (courage >= 70 && strength <= 0.6) reaction = 'fight'
    else if (context.escapeRoute && courage+20 > pressure) reaction = 'flee'
    else if (pressure >= courage) reaction = 'surrender'
    else reaction = 'fight'
    const next = clone(state), items = clone(interactions), claims = clone(property)
    const threat = {id:`robbery:${next.events.length+1}`,kind:'threatened',at:context.at,
      actorId:actor.id,targetId:target.id,demand:command.amount,reaction,
      cause:null,proofId:context.proofId,requestId:command.id}
    next.events.push(threat)
    if (reaction === 'surrender' && target.wallet > 0) {
      const amount = Math.min(command.amount,target.wallet)
      check(natural(actor.wallet+amount),'AMOUNT_OVERFLOW')
      items.actors.find(a => a.id === target.id).wallet -= amount
      items.actors.find(a => a.id === actor.id).wallet += amount
      const event = {id:`robbery:${next.events.length+1}`,kind:'robbed',at:context.at,
        actorId:actor.id,targetId:target.id,amount,cause:threat.id,
        proofId:context.proofId,requestId:command.id}
      claims.moneyClaims.push({id:`claim:${event.id}`,sourceEventId:event.id,
        claimantId:target.id,holderId:actor.id,amount})
      next.events.push(event)
    }
    const oldCooldown = next.cooldowns.find(c => c.targetId === target.id)
    if (oldCooldown) oldCooldown.until = context.at+30000
    else next.cooldowns.push({targetId:target.id,until:context.at+30000})
    next.revision++
    next.receipts.push({requestId:command.id,fingerprint})
    return {ok:true,code:'APPLIED',duplicate:false,state:next,interactions:items,property:claims,
      events:clone(next.events.slice(state.events.length))}
  } catch (error) {
    if (!(error instanceof InventoryError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}
