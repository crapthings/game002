/** Assemble semantic actions; opportunities remains the only lifecycle store. */
export function prepareCommitment(world,{kind,actorId,opportunityId,terms},context) {
  const row=world.opportunities?.entries.find(r=>r.id===opportunityId)
  if(!row)return {ok:false,code:'UNKNOWN_OPPORTUNITY'}
  let receiptId=null
  if(row.assigneeId===actorId) {
    if(['collect','deliver_cargo'].includes(kind)&&row.status==='fulfilled')receiptId=row.completionEventId
    if(kind==='deliver'&&row.message?.deliveredEventId)receiptId=row.message.deliveredEventId
    if(kind==='pickup'&&row.shipment?.pickedUpEventId)receiptId=row.shipment.pickedUpEventId
    if(kind==='return_cargo'&&row.restitution?.returnedEventId)receiptId=row.restitution.returnedEventId
    if(kind==='accept'&&row.status==='accepted') {
      if(terms!==(row.rewardAmount===0?'unpaid':'paid'))return {ok:false,code:'TERMS_ALREADY_FIXED'}
      receiptId=world.opportunities.events.find(e=>e.kind==='opportunity_accepted'&&e.opportunityId===row.id)?.id
    }
  }
  if(kind==='decline'&&row.declinedBy.includes(actorId))receiptId=world.opportunities.events.find(e=>e.kind==='opportunity_declined'&&e.opportunityId===row.id&&e.actorId===actorId)?.id
  if(kind==='cancel'&&row.status==='cancelled'&&[row.issuerId,row.assigneeId].includes(actorId))receiptId=row.completionEventId
  if(receiptId)return {ok:true,steps:[],duplicate:true,receiptId}
  const commandKind={accept:'accept',decline:'decline',cancel:'cancel',deliver:'deliver_message',collect:'collect_reward',pickup:'pickup_cargo',deliver_cargo:'deliver_cargo',return_cargo:'return_cargo'}[kind]
  if(!commandKind)return {ok:false,code:'INVALID_COMMAND'}
  const command={kind:commandKind,actorId,opportunityId,...(kind==='accept'?{terms}:{})}
  return {ok:true,duplicate:false,receiptId:null,steps:[{domain:'opportunities',command,context}]}
}
