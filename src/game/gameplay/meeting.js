import { previewCombat } from './combat.js'
import { wantedFor } from './crime.js'

export function meetingEligibility(world,speakerId,listenerId,context) {
  const actor=id=>world.interactions.actors.find(a=>a.id===id)
  if(speakerId===listenerId||![speakerId,listenerId].every(id=>actor(id)?.health>0))return {available:false,reason:'ACTOR_DEAD'}
  if(context.withinRange!==true||context.clear!==true||context.facing!==true)return {available:false,reason:'MEETING_ENDED'}
  const fighters=previewCombat(world.combat,world.interactions.actors,context.at)
  if([speakerId,listenerId].some(id=>fighters.find(f=>f.id===id)?.phase!=='idle'))return {available:false,reason:'NO_SAFE_MEETING'}
  const life=world.life?.actors.find(a=>a.actorId===speakerId)
  if((life?.interruption&&life.interruption.kind!=='seek_help')||world.robbery.cooldowns.some(c=>c.targetId===speakerId&&c.until>context.at))return {available:false,reason:'TARGET_BUSY'}
  if(world.crime.authorities.includes(speakerId)&&wantedFor(world.crime,speakerId,listenerId).level>0)return {available:false,reason:'OFFICIAL_CASE_PENDING'}
  return {available:true,reason:null}
}
