import { InventoryError,transferLot } from './inventory.js'
import { availableQuantity } from './reservations.js'
import { hasRoom,estateRecipient,estateKeeper,requireEstateMeeting } from './estates.js'
import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { previewCombat } from './combat.js'
import { executeLife,projectedNeeds } from './life.js'
import { relationFor } from './relations.js'
import { clockAt } from '../living/clock.js'
import { DAILY_ACTIVITIES_V1 as rules,dailyChoice } from '../living/content/dailyActivities.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(w,id)=>w.interactions.actors.find(a=>a.id===id)
const life=(w,id)=>w.life.actors.find(a=>a.actorId===id)
const pair=(a,b)=>[a,b].sort().join(':')
const emit=(world,command,context,kind,extra={})=>{
  check(activeEventCount(world.relations)<4096,'HISTORY_FULL')
  const e={id:`relations:${nextEventNumber(world.relations)}`,kind,at:context.at,actorId:command.actorId,targetId:command.targetId??null,
    cause:null,requestId:command.id,...extra};world.relations.events.push(e);return structuredClone(e)
}
export function ownDaily(world,id) {return world.relations?.dailyActivities?.find(r=>['active','returning'].includes(r.engagements[id]))??null}
export function dailyAvailable(world,id,at) {
  const person=actor(world,id),daily=life(world,id)
  if(!person||person.id==='player'||person.health<80||!daily?.intent||daily.interruption||daily.intent.priority>40||ownDaily(world,id))return false
  if(daily.assignment&&!daily.assignment.outcomeEventId||(world.factions?.escortKnowledge??[]).some(k=>k.actorId===id&&['accepted','accompanying'].includes(k.status)))return false
  if(previewCombat(world.combat,world.interactions.actors,at).find(f=>f.id===id)?.phase!=='idle')return false
  if(world.crime.cases.some(c=>c.authorityId===id&&!c.resolved))return false
  const needs=projectedNeeds(daily,at)
  return needs.hunger<50&&needs.energy>=60
}
export function dailyOffer(world,catalog,a,b,at,{placeId,present=false,withinRange=false,clear=false}={}) {
  if(a===b)return null
  if(!world.relations?.dailyVersion||!dailyAvailable(world,a,at)||!dailyAvailable(world,b,at)||!present||!withinRange||!clear)return null
  const day=clockAt(world.calendar.clockOrigin,at),place=world.places.definitions.find(p=>p.id===placeId)
  if(!place||day.minuteOfDay<rules.startMinute||day.minuteOfDay>=rules.endMinute||at<world.relations.nextDailyAt)return null
  if(world.relations.dailyActivities.some(r=>r.participantIds.some(id=>actor(world,id)?.health>0&&['active','returning'].includes(r.engagements[id]))))return null
  const tie=relationFor(world,a,b),back=relationFor(world,b,a)
  if([tie,back].some(t=>t.fear>=25||t.trust<0)||tie.type==='acquaintance'&&tie.trust<=0)return null
  const used=type=>world.relations.dailyActivities.some(r=>r.dayIndex===day.dayIndex&&r.pairId===pair(a,b)&&r.type===type)
  const choices=[]
  if(!used('greeting'))choices.push({type:'greeting'})
  if(!used('tea')&&placeId===rules.teaPlaceId&&day.minuteOfDay>=rules.teaStartMinute&&day.minuteOfDay<rules.teaEndMinute&&
    [a,b].every(id=>life(world,id).intent.priority<=10))choices.push({type:'tea'})
  const home=world.places.bindings.find(r=>r.actorId===a)?.homePlaceId
  const lot=world.interactions.inventory.lots.find(l=>l.ownerId===a&&l.holderId===actor(world,a).containerId&&l.itemType==='ration'&&availableQuantity(world.interactions,l.id)>=2)
  if(!used('carry')&&!world.relations.dailyActivities.some(r=>r.helperId===b&&r.cargoLotId&&!r.returnedEventId)&&home&&home!==placeId&&lot&&[a,b].every(id=>!world.crime.authorities.includes(id))&&
    hasRoom(world,catalog,actor(world,b).containerId,lot.itemType,1))choices.push({type:'carry',lotId:lot.id,destinationPlaceId:home})
  return choices.length?choices[dailyChoice(world.relations.dailySeed,day.dayIndex,`${pair(a,b)}:${world.relations.dailyActivities.length}`,choices.length)]:null
}
function release(world,row,id,command,at) {
  const current=life(world,id)
  if(actor(world,id)?.health>0&&current?.interruption?.kind==='daily'&&current.interruption.sourceEventId===row.startedEventId)
    return executeLife(world,{kind:'resume',actorId:id,id:`${command.id}:resume:${id}`},{at,allowed:true,safe:true,cause:row.startedEventId})
  return []
}
function endOwn(world,row,id,command,context,reason) {
  check(['active','returning'].includes(row.engagements[id]),'NO_DAILY_ACTIVITY')
  row.engagements[id]=id===row.helperId&&row.cargoLotId&&!row.returnedEventId?'return_due':'withdrawn'
  if(row.engagements[id]==='return_due')row.nextReturnAt=context.at+60000
  return [emit(world,{...command,actorId:id},context,'daily_participation_ended',{dailyId:row.id,cause:row.startedEventId,reason}),...release(world,row,id,command,context.at)]
}
export function executeDaily(world,catalog,command,context) {
  check(world.relations&&world.continuity?.justiceVersion===1&&context.allowed===true,'DAILY_NOT_READY')
  check(Number.isSafeInteger(context.at)&&context.at>=0&&Number.isSafeInteger(context.at+rules.carryDurationMs),'INVALID_TIME')
  if(command.kind==='enable_daily') {
    check(!world.relations.dailyVersion&&typeof command.seed==='string'&&command.seed.length<=200,'INVALID_DAILY_SEED')
    Object.assign(world.relations,{dailyVersion:1,dailySeed:command.seed,dailyActivities:[],nextDailyAt:context.at})
    const tea=world.places.definitions.find(p=>p.id===rules.teaPlaceId)
    if(tea){tea.previousDailyLabel=tea.label;tea.label='街心茶摊'}
    return [emit(world,command,context,'daily_life_enabled',{placeId:tea?.id??null})]
  }
  check(world.relations.dailyVersion===1,'DAILY_NOT_READY')
  if(command.kind==='start_daily') {
    const offer=dailyOffer(world,catalog,command.actorId,command.targetId,context.at,context)
    check(offer&&offer.type===command.activity,'NO_DAILY_OPPORTUNITY')
    check(typeof context.proofId==='string','MISSING_DAILY_MEETING')
    check(world.relations.dailyActivities.length<4096,'HISTORY_FULL')
    const day=clockAt(world.calendar.clockOrigin,context.at),id=`daily:${world.relations.dailyActivities.length+1}`
    const row={id,type:offer.type,ownerId:command.actorId,helperId:command.targetId,participantIds:[command.actorId,command.targetId],
      pairId:pair(command.actorId,command.targetId),dayIndex:day.dayIndex,placeId:context.placeId,destinationPlaceId:offer.destinationPlaceId??context.placeId,
      startedAt:context.at,until:context.at+(offer.type==='carry'?rules.carryDurationMs:rules.teaDurationMs),startedEventId:null,
      engagements:Object.fromEntries([command.actorId,command.targetId].map(id=>[id,offer.type==='greeting'?'finished':'active'])),cargoLotId:null,returnedEventId:null}
    const line=rules[offer.type]
    const e=emit(world,command,context,offer.type==='greeting'?'daily_greeting':'daily_started',{dailyId:id,activity:offer.type,placeId:row.placeId,
      destinationPlaceId:row.destinationPlaceId,proofId:context.proofId,witnessIds:row.participantIds,
      text:line?.[dailyChoice(world.relations.dailySeed,day.dayIndex,row.pairId,line.length)]??'邻里约好把一份原有干粮帮着带回住处。'})
    row.startedEventId=e.id
    if(offer.type==='carry') {
      const original=world.interactions.inventory.lots.find(l=>l.id===offer.lotId)
      row.cargoLotId=original.quantity===1?original.id:`daily-cargo:${id}`
      world.interactions.inventory=transferLot(world.interactions.inventory,catalog,{lotId:offer.lotId,quantity:1,toHolderId:actor(world,row.helperId).containerId,splitId:row.cargoLotId})
      const saved=world.relations.events.find(r=>r.id===e.id)
      Object.assign(saved,{sourceLotId:offer.lotId,lotId:row.cargoLotId,quantity:1,ownerId:row.ownerId});Object.assign(e,saved)
    }
    world.relations.dailyActivities.push(row);world.relations.nextDailyAt=context.at+rules.cityIntervalMs
    const events=[e]
    if(offer.type!=='greeting')for(const id of row.participantIds)events.push(...executeLife(world,{kind:'interrupt',actorId:id,id:`${command.id}:daily:${id}`,reason:'daily',priority:40},
      {...context,cause:e.id}))
    return events
  }
  const row=world.relations.dailyActivities.find(r=>r.id===command.dailyId)
  check(row&&row.participantIds.includes(command.actorId),'NO_DAILY_ACTIVITY')
  if(command.kind==='begin_daily_return') {
    check(command.actorId===row.helperId&&row.engagements[command.actorId]==='return_due'&&!row.returnedEventId&&context.at>=(row.nextReturnAt??0)&&dailyAvailable(world,command.actorId,context.at),'NO_DAILY_CARGO')
    check(world.interactions.inventory.lots.some(l=>l.id===row.cargoLotId&&l.ownerId===row.ownerId&&l.holderId===actor(world,command.actorId).containerId),'DAILY_CARGO_MISSING')
    row.engagements[command.actorId]='returning';row.returnUntil=context.at+60000
    const e=emit(world,command,context,'daily_return_sought',{dailyId:row.id,cause:row.startedEventId,placeId:row.destinationPlaceId})
    return [e,...executeLife(world,{kind:'interrupt',actorId:command.actorId,id:`${command.id}:daily`,reason:'daily',priority:40},{...context,cause:row.startedEventId})]
  }
  if(command.kind==='end_daily')return endOwn(world,row,command.actorId,command,context,context.reason??'LEFT_MEETING')
  check(command.kind==='finish_daily'&&actor(world,command.actorId)?.health>0,'INVALID_COMMAND')
  const destination=row.type==='carry'&&actor(world,row.ownerId).health===0?estateKeeper(world,row.ownerId)?.placeId??row.destinationPlaceId:row.destinationPlaceId
  check(context.withinRange===true&&context.clear===true&&context.present===true&&context.placeId===destination&&typeof context.proofId==='string','MISSING_DAILY_DELIVERY')
  const events=[]
  if(row.type==='tea') {
    check(row.participantIds.every(id=>actor(world,id)?.health>0&&row.engagements[id]==='active')&&context.at>=row.until,'DAILY_NOT_DUE')
    const e=emit(world,command,context,'daily_tea_finished',{dailyId:row.id,cause:row.startedEventId,placeId:row.placeId,proofId:context.proofId,witnessIds:row.participantIds})
    for(const id of row.participantIds){row.engagements[id]='finished';events.push(...release(world,row,id,command,context.at))}
    return [e,...events]
  }
  check(row.type==='carry'&&command.actorId===row.helperId&&!row.returnedEventId,'NO_DAILY_CARGO')
  const recipient=estateRecipient(world,row.ownerId)
  check(recipient&&context.recipientId===recipient,'NO_ESTATE_KEEPER')
  if(actor(world,row.ownerId).health===0)requireEstateMeeting(world,row.ownerId,context)
  const lot=world.interactions.inventory.lots.find(l=>l.id===row.cargoLotId&&l.ownerId===row.ownerId&&l.holderId===actor(world,row.helperId).containerId)
  check(lot&&availableQuantity(world.interactions,lot.id)>=1,'DAILY_CARGO_MISSING')
  world.interactions.inventory=transferLot(world.interactions.inventory,catalog,{lotId:lot.id,quantity:1,toHolderId:actor(world,row.ownerId).containerId,splitId:`daily-return:${command.id}`})
  const e=emit(world,{...command,targetId:row.ownerId},context,'daily_help_returned',{dailyId:row.id,cause:row.startedEventId,lotId:lot.id,quantity:1,
    ownerId:row.ownerId,receiverId:recipient,placeId:context.placeId,proofId:context.proofId,witnessIds:[row.helperId,recipient]})
  row.returnedEventId=e.id
  // Only the people at this handover learn that the journey is complete.
  for(const id of row.participantIds.filter(id=>[row.helperId,recipient].includes(id))){row.engagements[id]='finished';events.push(...release(world,row,id,command,context.at))}
  return [e,...events]
}
export function interruptDaily(world,sourceEvents,at,requestId) {
  if(!world.relations?.dailyVersion)return []
  const out=[]
  for(const row of world.relations.dailyActivities)for(const id of row.participantIds.filter(id=>['active','returning'].includes(row.engagements[id]))) {
    const cause=sourceEvents.find(e=>['attack_started','guard_started'].includes(e.kind)&&e.actorId===id||
      ['damaged','died','incapacitated','threatened','robbed'].includes(e.kind)&&e.targetId===id||
      e.kind==='activity_interrupted'&&e.reason!=='daily'&&e.actorId===id)
    if(cause)out.push(...endOwn(world,row,id,{id:requestId},{at},cause.id))
  }
  return out
}
