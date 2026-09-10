import { InventoryError } from './inventory.js'
import { meetingEligibility } from './meeting.js'
import { roleHolders } from './factionRoles.js'
import { emitFactionAction } from './factionEvents.js'
import { executeKnowledge } from './knowledge.js'
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
export function warningOptions(world,requesterId,runnerId) {
  if(!world.factions?.actionsVersion||!roleHolders(world,'gang','runner').includes(runnerId))return []
  return world.social.knowledge.filter(k=>k.npcId===requesterId&&k.subjectId&&![requesterId,runnerId].includes(k.subjectId)&&
    world.social.facts.some(f=>f.id===k.factId&&['threatened','robbed','damaged'].includes(f.action))&&
    !world.factions.threatRequests.some(r=>r.requesterId===requesterId&&r.factId===k.factId))
    .map(k=>({factId:k.factId,subjectId:k.subjectId,evidenceId:k.evidenceId}))
}
export function executeGangRequest(world,command,context) {
  const eligible=meetingEligibility(world,command.targetId,command.actorId,context)
  check(eligible.available&&context.identified===true,'MISSING_IDENTIFIED_MEETING')
  const source=warningOptions(world,command.actorId,command.targetId).find(k=>k.factId===command.factId)
  check(source,'NO_PERSONAL_REQUEST_EVIDENCE')
  check(world.factions.threatRequests.length<4096,'HISTORY_FULL')
  // Telling the runner creates hearsay with the requester's actual lineage.
  const prior=world.social.events.find(e=>e.kind==='report'&&e.actorId===command.actorId&&e.targetId===command.targetId&&e.cause===source.evidenceId)
  const report=prior?{ok:true,duplicate:false,state:world.social,events:[]}:executeKnowledge(world.social,
    {id:`${command.id}:request-report`,kind:'report',actorId:command.actorId,targetId:command.targetId,factId:source.factId,expectedRevision:world.social.revision},
    {allowed:true,at:context.at,delivered:true,proofId:context.proofId})
  check(report.ok&&!report.duplicate,report.code);world.social=report.state
  const member=world.factions.entries.find(f=>f.kind==='gang').memberRoles.some(m=>m.actorId===source.subjectId)
  const event=emitFactionAction(world,command,context,'warning_request_recorded',{factId:source.factId,subjectId:source.subjectId,
    cause:prior?.id??report.events[0].id,status:member?'declined':'recorded',reason:member?'MEMBER_CONFLICT':'NO_ENFORCEMENT_PROMISED',proofId:context.proofId})
  world.factions.threatRequests.push({id:event.id,requesterId:command.actorId,runnerId:command.targetId,factId:source.factId,
    subjectId:source.subjectId,status:event.status,reason:event.reason,sourceEventId:event.id,at:context.at})
  return [...report.events,event]
}
