export const DAILY_ACTIVITIES_V1=Object.freeze({
  startMinute:480,endMinute:1080,teaStartMinute:780,teaEndMinute:1020,teaPlaceId:'place.central-contact',
  teaDurationMs:6000,carryDurationMs:120000,cityIntervalMs:5000,
  greeting:['互道了一声早安，问起近来的生活。','停下来说了两句家常。','碰面点头，叮嘱对方路上留神。'],
  tea:['在茶摊旁歇了片刻，听街上的动静。','在茶摊旁说起这一天的琐事。'],
})
export function dailyChoice(seed,day,pair,choices) {
  let h=2166136261
  for(const c of `${seed}:${day}:${pair}`)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0
  return h%choices
}
