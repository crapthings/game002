import { activeLease,growthSafe,trainingFor } from '../gameplay/growth.js'
import { hasStanding } from '../gameplay/standing.js'
import { GROWTH_V1 as rules } from '../gameplay/content/standingV1.js'
export function createGrowthController({state,clock,context,nearPlace,send}) {
  return {
    update() {
      const world=state(),at=clock()
      if(!world.standing?.growthVersion)return false
      for(const row of world.standing.training.filter(r=>r.active)) {
        const proof=context(row.holderId),life=world.life.actors.find(a=>a.actorId===row.mentorId)
        const safe=proof.dangerFree&&proof.present&&proof.mentorPresent&&proof.withinRange&&proof.clear&&proof.facing&&proof.identified&&
          growthSafe(world,row.holderId,at)&&growthSafe(world,row.mentorId,at)&&hasStanding(world,row.mentorId,row.holderId)&&life?.interruption?.kind==='training'
        if(!safe) {send('standing',{kind:'pause_training',actorId:row.holderId},{reason:'LEFT_OR_UNSAFE'});return true}
        if(at-row.lastSampleAt>=rules.sampleMs) {send('standing',{kind:'sample_training',actorId:row.holderId},proof);return true}
      }
      for(const rest of world.standing.rests.filter(r=>r.active)) {
        const lease=activeLease(world,rest.holderId,at),proof=context(rest.holderId)
        if(!lease||!nearPlace(rest.holderId,rest.placeId)||!proof.dangerFree||!growthSafe(world,rest.holderId,at)) {
          send('standing',{kind:'end_rest',actorId:rest.holderId},{reason:!lease?'LEASE_ENDED':'LEFT_OR_UNSAFE'});return true
        }
      }
      return false
    },
    busyMentor:id=>state().standing?.training?.some(r=>r.mentorId===id&&r.active)??false,
    stopSteps() {
      const steps=[]
      for(const row of state().standing?.training??[])if(row.active)steps.push({domain:'standing',command:{kind:'pause_training',actorId:row.holderId},context:{reason:'SAVED_EXIT'}})
      for(const row of state().standing?.rests??[])if(row.active)steps.push({domain:'standing',command:{kind:'end_rest',actorId:row.holderId},context:{reason:'SAVED_EXIT'}})
      return steps
    },
    playerTraining:()=>trainingFor(state(),'player'),
  }
}
