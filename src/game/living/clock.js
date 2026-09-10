const safe = n => Number.isSafeInteger(n) && n >= 0 && Number.isSafeInteger(n + 100000)
export function validClockOrigin(origin) {
  return Boolean(origin && safe(origin.simulationAt) && safe(origin.absoluteMinute))
}
export function createClockOrigin(simulationAt=0,hour=7.5) {
  if(!safe(simulationAt)||!Number.isFinite(hour)||hour<0||hour>=24)throw new Error('INVALID_CLOCK_ORIGIN')
  return {simulationAt,absoluteMinute:Math.floor(hour*60)}
}
export function clockAt(origin,simulationAt) {
  if(!validClockOrigin(origin)||!safe(simulationAt)||simulationAt<origin.simulationAt)throw new Error('INVALID_TIME')
  const absoluteMinute=origin.absoluteMinute+Math.floor((simulationAt-origin.simulationAt)/1000)
  if(!safe(absoluteMinute))throw new Error('INVALID_TIME')
  const minuteOfDay=absoluteMinute%1440,dayIndex=Math.floor(absoluteMinute/1440)
  const fraction=((simulationAt-origin.simulationAt)%1000)/1000
  return {absoluteMinute,minuteOfDay,dayIndex,hour:(minuteOfDay+fraction)/60,
    label:`第${dayIndex+1}日 ${String(Math.floor(minuteOfDay/60)).padStart(2,'0')}:${String(minuteOfDay%60).padStart(2,'0')}`}
}
/** Coarse decisions may catch boundaries; this never advances world time. */
export function crossedMinutes(origin,from,to,limit=1440) {
  const first=clockAt(origin,from).absoluteMinute,last=clockAt(origin,to).absoluteMinute
  if(to<from||last-first>limit)throw new Error('CLOCK_CATCHUP_LIMIT')
  return Array.from({length:last-first},(_,i)=>first+i+1)
}
