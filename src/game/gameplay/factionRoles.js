import { availableWallet } from './reservations.js'
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
export function roleHolders(world,kind,role,{alive=true}={}) {
  const ids=world.factions?world.factions.entries.filter(f=>f.kind===kind).flatMap(f=>f.memberRoles.filter(m=>m.roles.includes(role)).map(m=>m.actorId)):
    kind==='law'&&['constable','case_officer','reinforcement'].includes(role)?world.crime.authorities:[]
  return [...new Set(ids)].filter(id=>actor(world,id)&&(!alive||actor(world,id).health>0))
}
export function factionFunds(world,factionId) {
  const faction=world.factions?.entries.find(f=>f.id===factionId),steward=actor(world,faction?.treasuryActorId)
  return !steward||steward.health<=0?{available:0,reason:'TREASURER_UNAVAILABLE'}:
    {available:availableWallet(world.interactions,steward.id),reason:null,actorId:steward.id}
}
