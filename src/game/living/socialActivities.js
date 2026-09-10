import { ownDaily,dailyAvailable,dailyOffer } from '../gameplay/dailyActivities.js'
import { projectedNeeds } from '../gameplay/life.js'
import { estateRecipient,estateKeeper } from '../gameplay/estates.js'
/** Decisions read an actor's own agreement and actual nearby people. */
export function createSocialActivities({state,clock,catalog,ids,point,contact,notice,atPlace,nearPlace,face,move,send,talkingTo}) {
  const scanDue=new Map()
  const person=(w,id)=>w.interactions.actors.find(a=>a.id===id)
  const life=(w,id)=>w.life.actors.find(a=>a.actorId===id)
  const proof=(id,other,placeId)=>({withinRange:contact(id,other),clear:contact(id,other),present:nearPlace(id,placeId)&&nearPlace(other,placeId),
    placeId,recipientId:other,proofId:`daily:${id}:${other}:${clock()}`})
  const stop=(id,row,reason)=>{send('relations',{kind:'end_daily',actorId:id,dailyId:row.id},{reason});return 'committed'}
  return {
    updateNpc(id,dt) {
      const world=state(),at=clock()
      if(!world.relations?.dailyVersion)return false
      const row=ownDaily(world,id),needs=projectedNeeds(life(world,id),at)
      if(row) {
        if(id===talkingTo()||person(world,id).health<80||needs.hunger>=60||needs.energy<30)return stop(id,row,'PERSONAL_NEED')
        const other=row.participantIds.find(a=>a!==id)
        if(row.type==='tea') {
          if(!contact(id,other)||notice(id,other)&&row.engagements[other]!=='active')return stop(id,row,'MEETING_ENDED')
          face(id,point(other))
          if(at>=row.until){send('relations',{kind:'finish_daily',actorId:id,targetId:other,dailyId:row.id},proof(id,other,row.placeId));return 'committed'}
          return 'busy'
        }
        if(row.type==='carry') {
          const returning=row.engagements[id]==='returning'
          if(at>=(returning?row.returnUntil:row.until))return stop(id,row,'AGREED_TIME_PASSED')
          const place=world.places.definitions.find(p=>p.id===row.destinationPlaceId)
          if(id===row.helperId&&person(world,row.ownerId).health>0&&contact(id,row.ownerId)&&nearPlace(id,row.destinationPlaceId)&&nearPlace(row.ownerId,row.destinationPlaceId)) {
            send('relations',{kind:'finish_daily',actorId:id,targetId:row.ownerId,dailyId:row.id},proof(id,row.ownerId,row.destinationPlaceId));return 'committed'
          }
          if(nearPlace(id,row.destinationPlaceId)&&nearPlace(row.ownerId,row.destinationPlaceId)&&id===row.helperId&&notice(id,row.ownerId)&&person(world,row.ownerId).health>0)move(id,{...point(row.ownerId)},dt,1.2)
          else if(!nearPlace(id,row.destinationPlaceId)&&place)move(id,place.approach,dt,id===row.helperId?0.8:1.2)
          else if(returning)return stop(id,row,'OWNER_NOT_MET')
          else if(notice(id,other))face(id,point(other))
          return 'busy'
        }
      }
      // Owed goods stay in this very bag; the owner must actually receive them.
      const owed=world.relations.dailyActivities.find(r=>r.helperId===id&&r.engagements[id]==='return_due'&&!r.returnedEventId&&
        world.interactions.inventory.lots.some(l=>l.id===r.cargoLotId&&l.holderId===person(world,id).containerId&&l.ownerId===r.ownerId))
      if(owed&&dailyAvailable(world,id,at)) {
        const recipient=estateRecipient(world,owed.ownerId),keeper=estateKeeper(world,owed.ownerId)
        const placeId=keeper?.placeId??owed.destinationPlaceId
        if(recipient&&notice(id,recipient)&&contact(id,recipient)&&nearPlace(id,placeId)&&atPlace(recipient,placeId)) {
          send('relations',{kind:'finish_daily',actorId:id,targetId:owed.ownerId,dailyId:owed.id},proof(id,recipient,placeId));return 'committed'
        }
        if(at>=(owed.nextReturnAt??0)&&life(world,id).intent.priority<=10) {
          send('relations',{kind:'begin_daily_return',actorId:id,dailyId:owed.id});return 'committed'
        }
      }
      if(at<(scanDue.get(id)??0)||id===talkingTo()||!dailyAvailable(world,id,at))return false
      scanDue.set(id,at+1000)
      const placeId=life(world,id).intent.placeId
      if(!atPlace(id,placeId))return false
      for(const other of [...ids()].sort()) {
        if(other===id||other===talkingTo()||!contact(id,other))continue
        const context=proof(id,other,placeId),offer=dailyOffer(world,catalog,id,other,at,context)
        if(!offer)continue
        face(id,point(other));face(other,point(id))
        send('relations',{kind:'start_daily',actorId:id,targetId:other,activity:offer.type},context);return 'committed'
      }
      return false
    },
    stopSteps:()=> (state().relations?.dailyActivities??[]).filter(r=>r.type==='tea')
      .flatMap(r=>r.participantIds.filter(id=>r.engagements[id]==='active').map(id=>({domain:'relations',command:{kind:'end_daily',actorId:id,dailyId:r.id},context:{reason:'SAVED_EXIT'}}))),
  }
}
