import { pursuitFor } from './pursuit.js'

// Fictional first-slice rules, not a general legal model. Evaluated once at
// contact; later reports or warrants cannot retroactively authorize force.
export function classifyForce(world,actorId,targetId,at) {
  const recent = world.combat.events.filter(e => ['damaged','parried'].includes(e.kind) &&
    e.at <= at && at-e.at <= 10000)
  const ownAggression = recent.find(e => e.actorId === actorId && e.targetId === targetId && e.justification?.unlawful)
  const ownThreat = world.robbery.events.find(e => e.kind === 'threatened' &&
    e.actorId === actorId && e.targetId === targetId && e.at <= at && at-e.at <= 30000)
  if (world.crime.authorities.includes(actorId)) {
    const pursuit = pursuitFor(world,actorId,targetId,at)
    if (pursuit.mayEngage && !ownAggression && !ownThreat) {
      return {unlawful:false,ruleId:'force.enforcement.v1',basisIds:[...pursuit.caseIds]}
    }
  }
  const assault = recent.findLast(e => e.actorId === targetId && e.targetId === actorId && e.justification?.unlawful)
  const threat = world.robbery.events.findLast(e => e.kind === 'threatened' &&
    e.actorId === targetId && e.targetId === actorId && e.at <= at && at-e.at <= 10000)
  if (!ownAggression && !ownThreat && (assault || threat)) {
    return {unlawful:false,ruleId:'force.self_defense.v1',basisIds:[(assault ?? threat).id]}
  }
  return {unlawful:true,ruleId:'force.assault.v1',basisIds:[]}
}
