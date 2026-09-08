export function messageKnowledge(state,knowledge,names) {
  const fact=state.social.facts.find(f=>f.id===knowledge.factId)
  if(!fact)return null
  if(fact.action==='message_delivered') {
    const row=state.opportunities?.entries.find(r=>r.message.deliveredEventId===fact.sourceEventId)
    if(!row)return null
    const courier=knowledge.subjectId==='player'?'你':names[knowledge.subjectId]??'未认出身份的信使'
    return `收到${names[row.issuerId]??'发信人'}请自己回住处见面的口信，由${courier}当面带到。`
  }
  if(fact.action==='message_acknowledged') {
    const row=state.opportunities?.entries.find(r=>r.message.receiptEventId===fact.sourceEventId)
    if(!row)return null
    return `${names[row.targetActorId]??'收信人'}当面确认收到了口信；可以向${names[row.issuerId]??'委托人'}转交这份答复。`
  }
  return null
}
