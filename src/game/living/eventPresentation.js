export const eventWords={
  relations_initialized:'记下亲友与邻里',attitude_changed:'心中态度改变',
  exchange_enabled:'开始邻里传话',news_exchanged:'当面交流消息',exchange_meeting_ended:'相互告辞',
  economy_initialized:'登记生计与供货',arrived:'外来人物入城',ate_food:'吃下干粮',food_needed:'尚未吃上饭',stock_shortage_noticed:'发现铺面缺货',restock_need:'新一轮补货需求',cargo_picked_up:'付货款并取货',stock_delivered:'货物运抵药铺',cargo_returned:'交回未送达的货物',
  relocate_pickup:'物主搬取药包',relocate_deliver:'物主搬回新摊位',attack_started:'出招',guard_started:'招架',guard_released:'松手回气',guard_exhausted:'气力耗尽',guard_broken:'破防',damaged:'受伤',parried:'挡住攻击',died:'死亡',take:'拿走药包',settle:'交还赔偿',return:'送回药包',aid:'救助',reward:'回礼',mask:'改变遮面',buy:'购买',sell:'出售',use:'使用',equip:'装备',unequip:'卸下',threatened:'威胁',robbed:'被迫交钱',loot_item:'搜刮物品',loot_money:'搜刮铜钱',case_assessed:'受理案件',witness:'目击',report:'当面传话',relationship:'关系变化',sight:'认出行踪',lost:'失去视线',
  life_initialized:'开始日常生活',activity_changed:'调整活动',activity_arrived:'抵达场所',activity_interrupted:'中断日常',activity_resumed:'恢复日常',places_registered:'登记场所',places_extended:'登记住处',place_services_enabled:'开设场所服务',place_status_changed:'接待状态变化',
  dialogue_initialized:'准备交谈',address_told:'当面告知地址',news_told:'当面转述消息',
  opportunities_initialized:'登记生活请求',opportunity_autonomy_enabled:'开始自主办事',personal_need:'生活请求的起因',opportunity_offered:'提出委托',opportunity_disclosed:'告知请求',opportunity_accepted:'答应帮忙',opportunity_declined:'婉拒请求',opportunity_cancelled:'取消委托',opportunity_expired:'委托到期',opportunity_failed:'委托未能完成',opportunity_funds_lost:'报酬资金受损',message_delivered:'口信送达',message_acknowledged:'收信人答复',opportunity_payment_due:'约定报酬待付',opportunity_fulfilled:'办妥并结清',opportunity_outcome_learned:'得知委托后续',opportunity_status_told:'当面交代进展',
}
/** Only invoked by an open review panel, including intermediate evidence nodes. */
export function createReviewIndex(state) {
  const events=[...['combat','interactions','village','robbery','property','equipment','crime','pursuit','registry','life','places','dialogue','opportunities','relations','economy','social'].flatMap(domain=>state[domain]?.events??[])]
  for(const need of state.opportunities?.needs??[])events.push({id:need.id,kind:'personal_need',actorId:need.issuerId,targetId:need.targetActorId,at:state.opportunities.events[0].at,cause:null})
  for(const need of state.economy?.needs??[])events.push({id:need.id,kind:'restock_need',actorId:need.issuerId,targetId:need.targetActorId,at:need.at,cause:null})
  const byId=new Map(events.map(e=>[e.id,e])),roots=new Map()
  const parent=e=>e.cause??e.fact?.sourceEventId??null
  function root(id) {
    if(roots.has(id))return roots.get(id)
    let cursor=id;const seen=new Set()
    while(byId.has(cursor)&&!seen.has(cursor)) {
      seen.add(cursor);const event=byId.get(cursor),next=event.rootCauseId??parent(event)
      if(!next)break
      cursor=next
    }
    roots.set(id,cursor);return cursor
  }
  events.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
  return {events,byId,root,parent,label:e=>e?.kind==='fact'?`记录${eventWords[e.fact?.action]??'事实'}`:eventWords[e?.kind]??'记录变化'}
}
