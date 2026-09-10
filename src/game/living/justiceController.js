import { bodyCondition,bodyLocked,canIdentifyDisabled,CUSTODY_MS } from '../gameplay/justice.js'
import { estateRecipient,estateKeeper } from '../gameplay/estates.js'
import { availableWallet } from '../gameplay/reservations.js'
import { captureForBounty } from '../gameplay/bounties.js'
import { distance } from './geometry.js'
export function createJusticeController({state,clock,point,notice,contact,face,move,atPlace,send,fighter,identified,talkingTo,interrupt}) {
  const actor=(w,id)=>w.interactions.actors.find(a=>a.id===id)
  const proof=(a,b)=>({withinRange:contact(a,b),clear:contact(a,b),visible:notice(a,b),identified:identified(a,b),
    position:{...point(b)},proofId:`custody:${a}:${b}:${clock()}`})
  const meeting=(a,b,placeId)=>({withinRange:a===b||contact(a,b),clear:a===b||contact(a,b),facing:true,identified:a===b||identified(b,a),recipientId:b,
    present:atPlace(b,placeId),placeId,proofId:`estate:${a}:${b}:${clock()}`,meetingId:`estate:${a}:${b}:${clock()}`})
  return {
    update() {
      const world=state(),at=clock()
      if(!world.continuity?.justiceVersion)return false
      for(const row of world.continuity.conditions.filter(r=>bodyLocked(world,r.actorId)&&actor(world,r.actorId).health>0)) {
        if(row.status==='incapacitated'&&at>=row.at+CUSTODY_MS) {
          send('continuity',{kind:'wake',actorId:row.actorId});return true
        }
        const custody=world.continuity.custodies.find(r=>r.subjectId===row.actorId&&r.status==='held')
        if(custody&&actor(world,custody.officerId).health===0) {
          send('continuity',{kind:'release_abandoned',actorId:row.actorId});return true
        }
        if(custody&&at>=custody.releaseAt&&contact(custody.officerId,row.actorId)) {
          send('continuity',{kind:'process_custody',actorId:row.actorId,choice:'wait'},proof(custody.officerId,row.actorId));return true
        }
      }
      return false
    },
    updateNpc(id,dt,urgentOnly=false) {
      const world=state(),at=clock()
      if(!world.continuity?.justiceVersion||fighter(id)?.phase!=='idle'||id===talkingTo())return false
      const custody=world.continuity.custodies.find(r=>r.officerId===id&&r.status==='held')
      if(custody) {
        // A controlled, stationary person is already under this officer's physical care.
        const location=bodyCondition(world,custody.subjectId)?.position
        if(location&&distance(point(id),location)>1.5)move(id,location,dt,1.2)
        else if(location)face(id,location)
        return 'busy'
      }
      if(world.crime.authorities.includes(id))for(const disabled of world.continuity.conditions.filter(r=>r.status==='incapacitated')) {
        const known=world.crime.cases.some(c=>c.authorityId===id&&c.subjectId===disabled.actorId&&!c.resolved&&c.factIds.length&&
          c.factIds.every(f=>world.social.knowledge.some(k=>k.npcId===id&&k.factId===f&&k.subjectId===disabled.actorId)))
        const evidence=proof(id,disabled.actorId)
        if(!known||!canIdentifyDisabled(world,id,disabled.actorId,evidence))continue
        if(evidence.visible&&evidence.withinRange) {
          send('continuity',{kind:'take_custody',actorId:id,targetId:disabled.actorId},evidence);return 'committed'
        }
        if(disabled.officerId===id||evidence.visible) {move(id,disabled.position,dt,1.2);return 'busy'}
      }
      if(urgentOnly)return false
      const mandate=world.continuity.estateMandates.find(m=>m.keeperId===id&&actor(world,m.ownerId)?.health===0&&
        !world.continuity.estates.some(e=>e.ownerId===m.ownerId)&&notice(id,m.ownerId))
      if(mandate) {
        if(contact(id,mandate.ownerId)) {
          send('continuity',{kind:'take_estate_custody',actorId:id,targetId:mandate.ownerId},{observed:true,withinRange:true,clear:true,proofId:`estate-found:${id}:${at}`});return 'committed'
        }
        if(interrupt(id,'delivery',70,mandate.sourceEventId))return 'committed'
        move(id,{...point(mandate.ownerId)},dt,1.2);return 'busy'
      }
      const returning=world.continuity.restitutions.find(r=>r.officerId===id&&r.status==='carried'&&
        world.interactions.inventory.lots.some(l=>l.id===r.lotId&&l.ownerId===r.ownerId&&l.holderId===actor(world,id).containerId&&l.quantity>=r.quantity))
      if(returning) {
        const recipient=estateRecipient(world,returning.ownerId),parcel=returning.lotId==='medicine-parcel'
        const binding=world.places.bindings.find(b=>b.actorId===returning.ownerId)
        const placeId=estateKeeper(world,returning.ownerId)?.placeId??binding?.workPlaceId??binding?.homePlaceId
        const place=world.places.definitions.find(p=>p.id===placeId)
        if(parcel&&contact(id,'stall')||!parcel&&recipient&&notice(id,recipient)&&contact(id,recipient)&&(!estateKeeper(world,returning.ownerId)||atPlace(recipient,placeId))) {
          send('continuity',{kind:'return_seized_property',actorId:id,restitutionId:returning.id},parcel?
            {withinRange:true,clear:true,atStall:true,proofId:`parcel-return:${id}:${at}`}:meeting(id,recipient,placeId));return 'committed'
        }
        const destination=parcel?point('stall'):recipient&&notice(id,recipient)?{...point(recipient)}:place?.approach
        if(destination&&distance(point(id),destination)>2){if(interrupt(id,'delivery',70,returning.id))return 'committed';move(id,destination,dt,1.2);return 'busy'}
      }
      const claim=world.continuity.estateClaims.find(c=>(c.recipientId===id||estateKeeper(world,c.recipientId)?.keeperId===id)&&c.status==='due'&&availableWallet(world.interactions,c.accountId,c.reservationId)>=c.amount)
      const keeper=claim&&estateKeeper(world,claim.accountId)
      if(keeper&&(id===keeper.keeperId||notice(id,keeper.keeperId))&&atPlace(keeper.keeperId,keeper.placeId)&&(id===keeper.keeperId||contact(id,keeper.keeperId))) {
        if(id!==keeper.keeperId){face(id,point(keeper.keeperId));face(keeper.keeperId,point(id))}
        send('continuity',{kind:'collect_estate_claim',actorId:id,claimId:claim.id},meeting(id,keeper.keeperId,keeper.placeId));return 'committed'
      }
      const bounty=world.factions.bounties.find(b=>b.status==='claim_due'&&b.claimantId===id&&actor(world,b.issuerId)?.health>0&&
        availableWallet(world.interactions,b.issuerId,b.reservationId)>=(id===b.issuerId?0:b.amount))
      if(bounty&&captureForBounty(world,bounty,id)&&fighter(bounty.issuerId)?.phase==='idle'&&(id===bounty.issuerId||notice(id,bounty.issuerId)&&contact(id,bounty.issuerId))) {
        send('factions',{kind:'claim_bounty',actorId:id,bountyId:bounty.id,captureEventId:bounty.captureEventId},
          {...meeting(id,bounty.issuerId,bounty.placeId),withinRange:true,clear:true});return 'committed'
      }
      return false
    },
  }
}
