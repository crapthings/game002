import { clockAt } from './clock.js'

const within=(minute,start,end)=>start<=end?minute>=start&&minute<end:minute>=start||minute<end
/** Stable activity choice from time/own condition; no coordinates or payments. */
export function scheduledActivity(state,actorId,at) {
  const binding=state.places?.bindings.find(b=>b.actorId===actorId)
  if(!binding?.homePlaceId)return {status:'blocked',reason:'HOME_PLACE_MISSING'}
  const minute=clockAt(state.calendar.clockOrigin,at).minuteOfDay
  const home={kind:'rest',placeId:binding.homePlaceId,priority:10}
  const work={kind:'work',placeId:binding.workPlaceId??binding.idlePlaceId,priority:40}
  if(actorId==='merchant')return within(minute,480,1080)?work:home
  if(actorId==='witness')return within(minute,480,720)||within(minute,840,1080)?{kind:'social',placeId:binding.workPlaceId,priority:10}:home
  if(actorId==='guard')return within(minute,420,1140)?work:home
  if(actorId==='guard-2') {
    if(within(minute,1140,420))return work
    if(within(minute,540,600)||within(minute,900,960))return {kind:'patrol',placeId:binding.idlePlaceId,priority:40}
    return home
  }
  if(actorId==='resident-1')return state.village.aid.eventId&&within(minute,900,960)?{kind:'social',placeId:'place.central-contact',priority:10}:home
  if(actorId==='resident-2')return within(minute,780,960)?{kind:'social',placeId:'place.central-contact',priority:10}:home
  if(actorId==='resident-3')return within(minute,480,1080)?work:home
  return within(minute,480,1080)?work:home
}
