const factWords={aid:'帮助了受伤的人',reward:'答谢了帮助',take:'拿走了药包',threatened:'威胁索取钱财',robbed:'强取了钱财',damaged:'伤了人',parried:'参与了交手',died:'在交手中造成死亡',loot_item:'取走了遗留物品',loot_money:'取走了遗留钱财'}
export function spokenAnswer(world,answer,names) {
  if(answer.kind==='places')return [answer.text,...answer.placeIds.map(id=>world.places.definitions.find(p=>p.id===id)?.label).filter(Boolean)]
  if(answer.kind==='news') {
    const fact=world.social.facts.find(f=>f.id===answer.factId),evidence=world.social.events.find(e=>e.id===answer.evidenceId)
    const who=answer.subjectId?(answer.subjectId==='player'?'你':names[answer.subjectId]??'那个人'):'一个没认出身份的人'
    return [`${evidence?.kind==='witness'?'我亲眼见到':'我听人说'}：${who}${factWords[fact.action]??'参与了那件事'}。${answer.subjectId===null?'我不知道当事人是谁。':''}`]
  }
  if(answer.kind==='requests')return answer.opportunityIds.length?['这些是我想请人帮忙、或之前提过的事情；进展以我亲历和听到的消息为准。',...answer.opportunityIds.map(id=>world.opportunities.entries.find(r=>r.id===id)?.title).filter(Boolean)]:['眼下没有已经登记、可请你承接的请求。']
  return [answer.text]
}
