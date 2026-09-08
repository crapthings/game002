import { recoveryEligibility } from '../gameplay/continuity.js'
import { CONTINUITY_V1 as rules } from '../gameplay/content/continuityV1.js'
export function createRecoveryController({state,clock,context,send}) {
  return {
    update() {
      const world=state(),at=clock()
      if(!world.continuity)return false
      for(const person of world.interactions.actors) {
        const row=world.continuity.recovery.find(r=>r.actorId===person.id),proof=context(person.id)
        const eligible=recoveryEligibility(world,person.id,at,proof)
        if(row?.active&&(!eligible.available||eligible.foodLotId)) {
          send('continuity',{kind:'stop_recovery',actorId:person.id},{reason:eligible.reason??'NEW_MEAL_REQUIRED'});return true
        }
        if(!eligible.available)continue
        if(!row?.active) {send('continuity',{kind:'start_recovery',actorId:person.id},{...proof,placeId:eligible.placeId});return true}
        if(at-row.lastAt>=rules.sampleMs) {send('continuity',{kind:'sample_recovery',actorId:person.id},{...proof,placeId:eligible.placeId});return true}
      }
      return false
    },
    stopSteps:()=> (state().continuity?.recovery??[]).filter(r=>r.active).map(r=>({domain:'continuity',command:{kind:'stop_recovery',actorId:r.actorId},context:{reason:'SAVED_EXIT'}})),
  }
}
