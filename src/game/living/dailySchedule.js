import { clockAt } from './clock.js'
import { projectedNeeds } from '../gameplay/life.js'
import { CONTINUITY_V1 } from '../gameplay/content/continuityV1.js'
import { rememberedStaffPlace } from '../gameplay/staffing.js'

const within=(minute,start,end)=>start<=end?minute>=start&&minute<end:minute>=start||minute<end
/** Stable activity choice from time/own condition; no coordinates or payments. */
export function scheduledActivity(state,actorId,at) {
  const binding=state.places?.bindings.find(b=>b.actorId===actorId)
  if(!binding?.homePlaceId||!state.places.definitions.some(p=>p.id===binding.homePlaceId))return {status:'blocked',reason:'HOME_PLACE_MISSING'}
  const minute=clockAt(state.calendar.clockOrigin,at).minuteOfDay
  const home={kind:'rest',placeId:binding.homePlaceId,priority:10}
  const work={kind:'work',placeId:rememberedStaffPlace(state,actorId)??binding.workPlaceId??binding.idlePlaceId,priority:40}
  if(actorId==='merchant')return within(minute,480,1080)?work:home
  if(actorId==='witness')return within(minute,480,720)||within(minute,840,1080)?{kind:'social',placeId:binding.workPlaceId,priority:10}:home
  if(actorId==='guard')return within(minute,420,1140)?work:home
  if(actorId==='guard-2') {
    if(within(minute,1140,420))return work
    if(within(minute,540,600)||within(minute,900,960))return {kind:'patrol',placeId:binding.idlePlaceId,priority:40}
    return home
  }
  if(actorId==='resident-1')return (state.village.aid.eventId||state.continuity&&state.interactions.actors.find(a=>a.id===actorId).health>=CONTINUITY_V1.returnToWorkAt)&&within(minute,900,960)?{kind:'social',placeId:'place.central-contact',priority:10}:home
  if(actorId==='resident-2')return within(minute,780,960)?{kind:'social',placeId:'place.central-contact',priority:10}:home
  if(actorId==='resident-3')return within(minute,480,1080)?work:home
  return within(minute,480,1080)?work:home
}

/** Needs override ordinary plans only; danger/obligations are resolved first. */
export function nextDailyActivity(state,actorId,at) {
  const scheduled=scheduledActivity(state,actorId,at)
  if(scheduled.status==='blocked')return scheduled
  const row=state.life?.actors.find(a=>a.actorId===actorId)
  if(!row)return scheduled
  const needs=projectedNeeds(row,at),binding=state.places.bindings.find(b=>b.actorId===actorId)
  if(needs.energy<=25||row.intent?.kind==='rest'&&row.intent.priority===50&&needs.energy<65)
    return {kind:'rest',placeId:binding.homePlaceId,priority:50}
  if(needs.hunger>=60||row.intent?.kind==='eat'&&needs.hunger>=40) {
    const actor=state.interactions.actors.find(a=>a.id===actorId)
    const food=state.interactions.inventory.lots.some(l=>l.itemType==='ration'&&l.ownerId===actorId&&l.holderId===actor.containerId&&l.quantity>0)
    // Own food is eaten at home. Seeking food heads to the known public shop;
    // the economy domain will require a real purchase/consumption transaction.
    return {kind:'eat',placeId:food?binding.homePlaceId:'place.medicine',priority:50}
  }
  const person=state.interactions.actors.find(a=>a.id===actorId)
  if(state.continuity&&person.health>0&&(person.health<CONTINUITY_V1.injuredBelow||row.intent?.kind==='rest'&&row.intent.priority===50&&person.health<CONTINUITY_V1.returnToWorkAt))
    return {kind:'rest',placeId:binding.homePlaceId,priority:50}
  return scheduled
}
