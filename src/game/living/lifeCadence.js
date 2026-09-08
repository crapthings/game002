import { clockAt } from './clock.js'
import { projectedNeeds } from '../gameplay/life.js'

export const LIFE_CADENCE={nearMs:1000,farMs:5000,nearRadius:32}
const natural=n=>Number.isSafeInteger(n)&&n>=0
// Union of current schedule edges. This is a wake-up index, not another schedule.
const scheduleMinutes=[420,480,540,600,720,780,840,900,960,1080,1140]
export function nextLifeBoundary(world,id,at) {
  if(!world.life)return Infinity
  const row=world.life.actors.find(a=>a.actorId===id)
  if(!row)return Infinity
  const origin=world.calendar.clockOrigin,current=clockAt(origin,at)
  const day=Math.floor(current.absoluteMinute/1440)*1440
  const nextMinute=scheduleMinutes.find(m=>day+m>current.absoluteMinute)
  let next=origin.simulationAt+((nextMinute===undefined?day+1440+scheduleMinutes[0]:day+nextMinute)-origin.absoluteMinute)*1000
  const needs=projectedNeeds(row,at)
  const threshold=(value,target,rate)=>{
    if(rate>0&&value<target||rate<0&&value>target)next=Math.min(next,at+Math.max(1,Math.ceil((target-value)*60000/rate)))
  }
  threshold(needs.hunger,60,8)
  const resting=row.intent?.kind==='rest'&&row.intent.phase==='interacting'&&!row.interruption
  if(resting&&row.intent.priority===50)threshold(needs.energy,65,12)
  if(!resting)threshold(needs.energy,25,-4)
  return next
}
export function validateCadence(saved,at,ids) {
  if(saved===undefined)return
  if(saved?.version!==1||!natural(saved.at)||saved.at>at||!Array.isArray(saved.actors)||saved.actors.length>ids.length||
    new Set(saved.actors.map(r=>r?.actorId)).size!==saved.actors.length||!saved.actors.every(r=>r&&ids.includes(r.actorId)&&
      natural(r.lastAt)&&r.lastAt<=saved.at&&natural(r.nextAt)&&r.nextAt>=r.lastAt&&r.nextAt<=saved.at+LIFE_CADENCE.farMs&&
      [LIFE_CADENCE.nearMs,LIFE_CADENCE.farMs].includes(r.intervalMs)))throw new Error('生活调度记录无效，保留原档。')
}
/** The next due boundary limits the shared clock before any body is moved.
 * Due actors are drained at that same time, never backdated after a later trade.
 * Only decision polling is coarse; travel and evidence keep their real geometry. */
export function createLifeCadence(saved,at,ids) {
  validateCadence(saved,at,ids)
  const rows=new Map((saved?.actors??[]).map(r=>[r.actorId,structuredClone(r)]))
  let sampledAt=at,nearPolls=0,farPolls=0,heldFrames=0
  function synchronize(world,now,actors,far) {
    sampledAt=now
    for(const id of actors) {
      const intervalMs=far(id)?LIFE_CADENCE.farMs:LIFE_CADENCE.nearMs
      let row=rows.get(id)
      if(!row){row={actorId:id,lastAt:now,nextAt:now,intervalMs};rows.set(id,row)}
      if(intervalMs<row.intervalMs)row.nextAt=Math.min(row.nextAt,now)
      row.intervalMs=intervalMs
      row.nextAt=Math.min(row.nextAt,nextLifeBoundary(world,id,now))
    }
  }
  return {
    seconds(world,now,dt,actors,far) {
      if(!world.life)return dt
      synchronize(world,now,actors,far)
      const next=Math.min(Infinity,...actors.map(id=>rows.get(id).nextAt))
      return Math.min(dt,Math.max(0,next-now)/1000)
    },
    due:(id,now)=>!rows.has(id)||rows.get(id).nextAt<=now,
    finish(world,id,now,far) {
      const old=rows.get(id)
      if(old&&old.nextAt>now)return
      const intervalMs=far?LIFE_CADENCE.farMs:LIFE_CADENCE.nearMs
      // Stable phase spreads ordinary polls without changing a schedule edge.
      const phase=[...id].reduce((n,c)=>(n*31+c.charCodeAt(0))%intervalMs,0)
      const regular=Math.floor((now-phase)/intervalMs)*intervalMs+intervalMs+phase
      rows.set(id,{actorId:id,lastAt:now,nextAt:Math.min(regular,nextLifeBoundary(world,id,now)),intervalMs})
      sampledAt=now
      if(far)farPolls++;else nearPolls++
    },
    wake(id,now) {const row=rows.get(id);if(row)row.nextAt=Math.min(row.nextAt,now)},
    held:()=>{heldFrames++},
    snapshot:()=>({version:1,at:sampledAt,actors:structuredClone([...rows.values()])}),
    stats:()=>({nearPolls,farPolls,heldFrames,nearActors:[...rows.values()].filter(r=>r.intervalMs===LIFE_CADENCE.nearMs).length,
      farActors:[...rows.values()].filter(r=>r.intervalMs===LIFE_CADENCE.farMs).length}),
  }
}
