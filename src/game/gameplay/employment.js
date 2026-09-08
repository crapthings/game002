import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { InventoryError } from './inventory.js'
import { availableWallet,requireAvailableFunds } from './reservations.js'
import { previewCombat } from './combat.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const actor=(world,id)=>world.interactions.actors.find(a=>a.id===id)
const emit=(world,command,at,kind,actorId,targetId,extra={})=>{
  check(activeEventCount(world.economy)<4096,'HISTORY_FULL')
  const event={id:`economy:${nextEventNumber(world.economy)}`,kind,actorId,targetId,at,cause:null,requestId:command.id,...extra}
  world.economy.events.push(event);return structuredClone(event)
}
export function laborEligible(world,job,at) {
  const life=world.life.actors.find(a=>a.actorId===job.workerId)
  return actor(world,job.workerId)?.health>0&&actor(world,job.employerId)?.health>0&&!life?.interruption&&
    life?.intent?.kind==='work'&&life.intent.placeId===job.placeId&&life.intent.phase==='interacting'&&
    previewCombat(world.combat,world.interactions.actors,at).find(f=>f.id===job.workerId)?.phase==='idle'
}
function accrue(world,job,command,context,continuing) {
  check(job.activeSince!==null&&context.at>=job.activeSince,'NO_ACTIVE_LABOR')
  const elapsed=context.at-job.activeSince
  check(Number.isSafeInteger(job.workedMs+elapsed),'TIME_OVERFLOW')
  job.workedMs+=elapsed;job.activeSince=continuing?context.at:null
  const event=emit(world,command,context.at,continuing?'labor_accrued':'labor_paused',job.workerId,job.employerId,
    {employmentId:job.id,cause:job.lastWorkEventId,creditedMs:elapsed,workedMs:job.workedMs,placeId:job.placeId,proofId:context.proofId??null})
  job.lastWorkEventId=event.id;return event
}
export function executeEmployment(world,command,context) {
  check(world.economy&&context.allowed===true,'INTERACTION_DENIED')
  check(Number.isSafeInteger(context.at)&&context.at>=0,'INVALID_TIME')
  if(command.kind==='enable_employment') {
    check(!world.economy.employmentVersion,'EMPLOYMENT_ALREADY_ENABLED')
    world.economy.employmentVersion=1;world.economy.employments=[]
    const available=actor(world,'resident-3')?.health>0&&actor(world,'merchant')?.health>0
    const event=emit(world,command,context.at,available?'employment_agreed':'employment_unavailable',available?'merchant':command.actorId,available?'resident-3':null)
    if(available) {
      const placeId=world.places.bindings.find(b=>b.actorId==='resident-3')?.workPlaceId
      check(placeId,'PLACE_BINDING_MISSING')
      // Keep the existing work address and message destination valid.
      world.economy.employments.push({id:'employment:merchant:resident-3',workerId:'resident-3',employerId:'merchant',placeId,wagePerHour:2,
        sourceEventId:event.id,lastWorkEventId:event.id,workedMs:0,activeSince:null,lastPaidOccurrence:0,unpaidNoticedHours:0})
    }
    return [event]
  }
  const job=world.economy.employments?.find(j=>j.id===command.employmentId)
  check(job,'UNKNOWN_EMPLOYMENT')
  if(command.kind==='labor') {
    check(command.actorId===job.workerId&&typeof context.working==='boolean'&&typeof context.proofId==='string','MISSING_LABOR_EVIDENCE')
    if(!context.working)return [accrue(world,job,command,context,false)]
    check(context.present===true&&laborEligible(world,job,context.at),'NOT_WORKING')
    if(job.activeSince===null) {
      job.activeSince=context.at
      const event=emit(world,command,context.at,'labor_started',job.workerId,job.employerId,{employmentId:job.id,cause:job.lastWorkEventId,placeId:job.placeId,proofId:context.proofId})
      job.lastWorkEventId=event.id;return [event]
    }
    check(Math.floor((job.workedMs+context.at-job.activeSince)/60000)>Math.floor(job.workedMs/60000),'WAGE_NOT_DUE')
    return [accrue(world,job,command,context,true)]
  }
  const earned=Math.floor(job.workedMs/60000)
  if(command.kind==='wage_due') {
    check(command.actorId===job.workerId&&earned>job.lastPaidOccurrence&&earned>job.unpaidNoticedHours,'NO_CHANGE')
    check(availableWallet(world.interactions,job.employerId)<job.wagePerHour||actor(world,job.employerId).health===0,'FUNDS_AVAILABLE')
    job.unpaidNoticedHours=earned
    return [emit(world,command,context.at,'wage_payment_due',job.employerId,job.workerId,{employmentId:job.id,cause:job.lastWorkEventId,earnedHours:earned,unpaidHours:earned-job.lastPaidOccurrence})]
  }
  check(command.kind==='pay_wage'&&command.actorId===job.employerId,'INVALID_COMMAND')
  check(actor(world,job.employerId).health>0&&actor(world,job.workerId).health>0,'ACTOR_DEAD')
  check(Number.isSafeInteger(command.occurrence)&&command.occurrence===job.lastPaidOccurrence+1&&command.occurrence<=earned,'WAGE_NOT_DUE')
  requireAvailableFunds(world.interactions,job.employerId,job.wagePerHour)
  check(Number.isSafeInteger(actor(world,job.workerId).wallet+job.wagePerHour),'AMOUNT_OVERFLOW')
  actor(world,job.employerId).wallet-=job.wagePerHour;actor(world,job.workerId).wallet+=job.wagePerHour;job.lastPaidOccurrence=command.occurrence
  return [emit(world,command,context.at,'wage_paid',job.employerId,job.workerId,{employmentId:job.id,cause:job.lastWorkEventId,
    occurrenceId:`wage:${job.id}:${command.occurrence}`,occurrence:command.occurrence,amount:job.wagePerHour})]
}

/** Stop at the actual interruption/death transaction, before another frame. */
export function applyLaborInterruptions(world,sourceEvents,at,requestId) {
  if(!world.economy?.employmentVersion)return []
  const events=[]
  for(const job of world.economy.employments)if(job.activeSince!==null&&!laborEligible(world,job,at)) {
    const cause=sourceEvents.findLast(e=>e.actorId===job.workerId||e.targetId===job.workerId||e.targetId===job.employerId)
    const event=accrue(world,job,{id:requestId},{at,proofId:cause?.id??null},false)
    events.push(event)
  }
  return events
}
