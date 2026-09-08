import { laborEligible } from '../gameplay/employment.js'
import { availableWallet } from '../gameplay/reservations.js'

export function createPayrollController({state,clock,atPlace,send,talkingTo}) {
  return {update() {
    const world=state(),at=clock()
    if(!world.economy?.employmentVersion)return false
    for(const job of world.economy.employments) {
      const working=talkingTo()!==job.workerId&&laborEligible(world,job,at)&&atPlace(job.workerId,job.placeId)
      const projected=job.workedMs+(job.activeSince===null?0:at-job.activeSince)
      if(working!==(job.activeSince!==null)||working&&Math.floor(projected/60000)>Math.floor(job.workedMs/60000)) {
        send('economy',{kind:'labor',actorId:job.workerId,employmentId:job.id},{working,present:working,proofId:`labor-presence:${at}`});return true
      }
      const earned=Math.floor(job.workedMs/60000)
      if(earned<=job.lastPaidOccurrence)continue
      const living=world.interactions.actors.filter(a=>[job.workerId,job.employerId].includes(a.id)).every(a=>a.health>0)
      if(living&&availableWallet(world.interactions,job.employerId)>=job.wagePerHour) {
        send('economy',{kind:'pay_wage',actorId:job.employerId,employmentId:job.id,occurrence:job.lastPaidOccurrence+1});return true
      }
      if(earned>job.unpaidNoticedHours&&(availableWallet(world.interactions,job.employerId)<job.wagePerHour||world.interactions.actors.find(a=>a.id===job.employerId).health===0)) {
        send('economy',{kind:'wage_due',actorId:job.workerId,employmentId:job.id});return true
      }
    }
    return false
  }}
}
