import { InventoryError } from './inventory.js'
import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { availableWallet } from './reservations.js'
import { FACTIONS_V1,FACTION_ROLE_WORDS } from './content/factionsV1.js'
const copy=value=>structuredClone(value)
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
function refreshPlaces(world,row,definition) {
  row.servicePlaceIds=definition.servicePlaceIds.filter(id=>world.places.definitions.some(p=>p.id===id))
  row.attentionParcelIds=[...new Set(row.servicePlaceIds.map(id=>world.places.definitions.find(p=>p.id===id)?.parcelId).filter(Boolean))]
}
function emit(world,kind,actorId,targetId,at,requestId,extra={}) {
  check(activeEventCount(world.factions)<4096,'HISTORY_FULL')
  const event={id:`factions:${nextEventNumber(world.factions)}`,kind,actorId,targetId,at,cause:null,requestId,...extra}
  world.factions.events.push(event);return copy(event)
}
function memberRow(world,member,sourceEventId) {
  const registry=world.registry.actors.find(r=>r.actorId===member.actorId)
  check(registry&&actor(world,member.actorId),'MEMBER_NOT_REGISTERED')
  return {...copy(member),sourceEventId:registry.sourceEventId??sourceEventId}
}
export function executeFactions(world,command,context) {
  check(world.version===2&&context.allowed===true&&world.economy?.employmentVersion===1,'FACTIONS_NOT_READY')
  check(Number.isSafeInteger(context.at)&&context.at>=0,'INVALID_TIME')
  check(command.kind==='initialize'&&!world.factions,'FACTIONS_ALREADY_INITIALIZED')
  world.factions={version:1,entries:[],events:[]}
  const event=emit(world,'factions_initialized',command.actorId,null,context.at,command.id)
  for(const definition of FACTIONS_V1) {
    const members=definition.members.filter(m=>world.registry.actors.some(r=>r.actorId===m.actorId)).map(m=>memberRow(world,m,event.id))
    // This is a reference to the steward's actual purse, not another balance.
    const row={id:definition.id,name:definition.name,kind:definition.kind,memberRoles:members,
      treasuryActorId:members.some(m=>m.actorId===definition.treasuryActorId)?definition.treasuryActorId:null,
      servicePlaceIds:[],attentionParcelIds:[],sourceEventId:event.id}
    refreshPlaces(world,row,definition);world.factions.entries.push(row)
  }
  check(world.factions.entries.filter(r=>r.kind==='law').flatMap(r=>r.memberRoles.filter(m=>m.roles.includes('constable')).map(m=>m.actorId))
    .every(id=>world.crime.authorities.includes(id)),'AUTHORITY_ROLE_CONFLICT')
  return [event]
}
/** Arrival, every domain's actor row, its body and membership save together. */
export function addFactionArrival(world,actorId,sourceEventId,at,requestId) {
  if(!world.factions)return []
  const events=[]
  for(const definition of FACTIONS_V1) {
    const member=definition.members.find(m=>m.actorId===actorId),row=world.factions.entries.find(r=>r.id===definition.id)
    if(!member||!row||row.memberRoles.some(m=>m.actorId===actorId))continue
    row.memberRoles.push(memberRow(world,member,sourceEventId))
    if(definition.treasuryActorId===actorId)row.treasuryActorId=actorId
    refreshPlaces(world,row,definition)
    events.push(emit(world,'faction_member_arrived',actorId,null,at,requestId,{factionId:row.id,roles:copy(member.roles),cause:sourceEventId}))
  }
  return events
}
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
/** Called during an actual meeting. It reveals the speaker's own duties only. */
export function factionIntroduction(world,speakerId) {
  const memberships=(world.factions?.entries??[]).flatMap(f=>{const m=f.memberRoles.find(m=>m.actorId===speakerId);return m?[{f,m}]:[]})
  if(!memberships.length)return {text:'我没有在这些组织任职，平日只管自己的营生。',placeIds:[]}
  return {text:memberships.map(({f,m})=>`我在${f.name}负责${m.roles.map(r=>FACTION_ROLE_WORDS[r]).join('、')}。有事可以到下面的地方当面说。`).join(''),
    placeIds:[...new Set(memberships.flatMap(({f})=>f.servicePlaceIds))]}
}
