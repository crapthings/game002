import { InventoryError } from './inventory.js'
import { wantedFor } from './crime.js'
const clone = value => structuredClone(value)
const natural = n => Number.isSafeInteger(n) && n >= 0
const id = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(s)
const check = (ok,code) => { if (!ok) throw new InventoryError(code) }
const position = p => p && ['x','y','z'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) <= 1000000)
export const PURSUIT_RULES = Object.freeze({sightLeaseMs:1000,searchMs:30000})

export function createPursuitState() { return {version:1,revision:0,tracks:[],events:[],receipts:[]} }

export function pursuitFor(world,authorityId,subjectId,at) {
  check(natural(at) && at >= world.at,'INVALID_TIME')
  const wanted = wantedFor(world.crime,authorityId,subjectId)
  const alive = [authorityId,subjectId].every(id => world.interactions.actors.some(a => a.id === id && a.health > 0))
  const track = world.pursuit.tracks.find(t => t.authorityId === authorityId && t.subjectId === subjectId)
  const none = {...wanted,mode:'idle',destination:null,mayEngage:false}
  if (!alive || wanted.level === 0 || !track) return none
  const visible = track.lostAt === null && at < track.seenAt+PURSUIT_RULES.sightLeaseMs
  const searchStart = track.lostAt ?? track.seenAt+PURSUIT_RULES.sightLeaseMs
  if (!visible && at >= searchStart+PURSUIT_RULES.searchMs) return none
  return {...wanted,mode:visible ? 'follow' : 'search',destination:clone(track.position),
    mayEngage:visible && wanted.level >= 2}
}

// Position is an observed point, never an entity reference or live transform.
export function executePursuit(state,world,command,context) {
  try {
    check(command && id(command.id) && id(command.actorId) && id(command.targetId) &&
      natural(command.expectedRevision) && ['sight','lost'].includes(command.kind),'INVALID_COMMAND')
    const p = context?.position
    const fingerprint = JSON.stringify([command.kind,command.expectedRevision,command.actorId,command.targetId,
      context?.at,context?.allowed === true,context?.visible,context?.identified,context?.proofId,
      p?.x ?? null,p?.y ?? null,p?.z ?? null])
    const prior = state.receipts.find(r => r.requestId === command.id)
    if (prior) {
      check(prior.fingerprint === fingerprint,'REQUEST_ID_CONFLICT')
      return {ok:true,code:'ALREADY_APPLIED',duplicate:true,state:clone(state),events:[]}
    }
    check(command.expectedRevision === state.revision,'STALE_REVISION')
    check(state.events.length < 4096,'HISTORY_FULL')
    check(context?.allowed === true && id(context.proofId),'MISSING_SIGHT_EVIDENCE')
    check(natural(context.at) && Number.isSafeInteger(context.at+31000) &&
      (!state.events.length || context.at >= state.events.at(-1).at),'INVALID_TIME')
    check(command.actorId !== command.targetId,'INVALID_TARGET')
    check([command.actorId,command.targetId].every(id => world.interactions.actors.some(a => a.id === id && a.health > 0)),'ACTOR_DEAD')
    check(wantedFor(world.crime,command.actorId,command.targetId).level > 0,'NO_NAMED_CASE')
    const next = clone(state)
    let track = next.tracks.find(t => t.authorityId === command.actorId && t.subjectId === command.targetId)
    if (command.kind === 'sight') {
      check(context.visible === true && context.identified === true && position(p),'MISSING_SIGHT_EVIDENCE')
      if (!track) {
        track = {authorityId:command.actorId,subjectId:command.targetId}
        next.tracks.push(track)
      }
      Object.assign(track,{position:{x:p.x,y:p.y,z:p.z},seenAt:context.at,lostAt:null,proofId:context.proofId})
    } else {
      check(context.visible === false && track && track.lostAt === null,'NOT_TRACKING')
      // A late loss notification cannot restart an already-expired search.
      track.lostAt = Math.min(context.at,track.seenAt+PURSUIT_RULES.sightLeaseMs)
    }
    const event = {id:`pursuit:${state.revision+1}`,kind:command.kind,at:context.at,
      authorityId:command.actorId,subjectId:command.targetId,position:clone(track.position),
      seenAt:track.seenAt,lostAt:track.lostAt,proofId:context.proofId,requestId:command.id}
    next.revision++
    next.events.push(event); next.receipts.push({requestId:command.id,fingerprint})
    return {ok:true,code:'APPLIED',duplicate:false,state:next,events:[clone(event)]}
  } catch (error) {
    if (!(error instanceof InventoryError)) throw error
    return {ok:false,code:error.code,events:[]}
  }
}
