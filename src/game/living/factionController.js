import { roleHolders } from '../gameplay/factionRoles.js'
import { officerAvailable } from '../gameplay/factionActions.js'
import { distance } from './geometry.js'
import { availableWallet } from '../gameplay/reservations.js'

export function createFactionController({state,clock,point,notice,contact,face,move,atPlace,interrupt,send,talkingTo}) {
  return {
    officerWork(id,dt) {
      const world=state(),at=clock(),law=world.factions?.entries.find(f=>f.kind==='law')
      if(!world.factions?.bountyVersion||id===talkingTo()||!officerAvailable(world,id,at))return false
      const here=law.servicePlaceIds.find(placeId=>atPlace(id,placeId)&&world.factions.bounties.some(b=>b.placeId===placeId&&b.postedEventId&&
        !world.factions.bountyKnowledge.some(k=>k.actorId===id&&k.bountyId===b.id)))
      if(here){send('factions',{kind:'read_bounties',actorId:id},{present:true,placeId:here,proofId:`officer-notice:${id}:${at}`});return 'committed'}
      if(id!==law.treasuryActorId)return false
      const waiting=world.factions.bounties.find(b=>b.issuerId===id&&b.status==='waiting_funds'&&availableWallet(world.interactions,id)>=b.amount)
      const crime=world.crime.cases.find(c=>c.authorityId===id&&!c.resolved&&c.severity>=3&&c.subjectId&&
        world.interactions.actors.some(a=>a.id===c.subjectId&&a.health>0)&&!world.factions.bounties.some(b=>b.incidentId===c.incidentId&&b.victimId===c.victimId))
      if(!waiting&&!crime)return false
      const place=world.places.definitions.find(p=>p.id===(waiting?.placeId??law.servicePlaceIds[0]))
      if(!place)return false
      if(interrupt(id,'report',70,waiting?.sourceEventId??crime.evidenceIds.at(-1)))return 'committed'
      if(!atPlace(id,place.id)){move(id,place.approach,dt,.8);return 'busy'}
      send('factions',waiting?{kind:'fund_bounty',actorId:id,bountyId:waiting.id}:{kind:'post_bounty',actorId:id,caseId:crime.id},
        {present:true,placeId:place.id,proofId:`bounty-desk:${id}:${at}`})
      return 'committed'
    },
    report(id,known,purpose,dt) {
      const world=state(),at=clock(),life=world.life?.actors.find(a=>a.actorId===id)
      if(!known||world.factions?.actionsVersion!==1||id===talkingTo()||life?.interruption?.priority>70)return false
      const intent=world.factions.reportIntents.find(r=>r.reporterId===id&&r.evidenceId===known.evidenceId&&r.purpose===purpose)
      if(!intent){send('factions',{kind:'seek_officer',actorId:id,factId:known.factId,evidenceId:known.evidenceId,purpose});return 'committed'}
      if(intent.status==='delivered')return false
      const candidate=roleHolders(world,'law','constable').filter(other=>other!==id&&other!==talkingTo()&&notice(id,other)&&officerAvailable(world,other,at))
        .sort((a,b)=>distance(point(id),point(a))-distance(point(id),point(b))||a.localeCompare(b))[0]
      if(candidate) {
        if(interrupt(id,'report',70,intent.evidenceId))return 'committed'
        if(contact(id,candidate)) {
          face(id,point(candidate));face(candidate,point(id))
          send('factions',{kind:'deliver_report',actorId:id,targetId:candidate,reportId:intent.id},
            {withinRange:true,clear:true,facing:true,proofId:`report-contact:${id}:${candidate}:${at}`})
          return 'committed'
        }
        move(id,{...point(candidate)},dt,1.3);return 'busy'
      }
      if(intent.status==='waiting') {
        if(at<intent.nextAttemptAt)return false
        send('factions',{kind:'retry_officer',actorId:id,reportId:intent.id});return 'committed'
      }
      if(atPlace(id,intent.placeId)) {
        send('factions',{kind:'wait_officer',actorId:id,reportId:intent.id},{present:true,placeId:intent.placeId});return 'committed'
      }
      const place=world.places.definitions.find(p=>p.id===intent.placeId)
      if(!place)return false
      if(interrupt(id,'report',70,intent.evidenceId))return 'committed'
      move(id,place.approach,dt,.8);return 'busy'
    },
  }
}
