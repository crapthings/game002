export const eventWords={
  standing_initialized:'开始按履约记录认可',completion_presented:'当面出示结算收条',standing_granted:'本人确认认可与服务',standing_suspended:'本人暂停认可',standing_explained:'当面交代认可变化',
  growth_enabled:'开放租住和武艺入门',home_rented:'付清本期租金',rest_started:'在租住处歇脚',rest_ended:'结束歇脚',
  training_started:'预留学费并开始入门',training_resumed:'继续原来的练习',training_progress:'记录实际练习进度',training_paused:'暂停并保留已练时长',training_payment_due:'练习完成，学费待结',training_completed:'结清学费并学会入门',training_cancelled:'取消练习并释放预留',
  factions_initialized:'登记组织与职责',faction_member_arrived:'组织成员到达',
  faction_actions_enabled:'开始按职责办事',officer_sought:'准备当面报案',officer_waiting:'未遇接案人，稍后再来',officer_sought_again:'再去接案处',report_presented:'向捕快当面交代',
  case_settled:'按案交还财物并赔偿',case_resolution_learned:'捕快得知这件案子已处理',
  bounty_claim_due:'实际拘押已办妥，赏钱待领',warning_request_recorded:'当面登记警告请求',
  escorts_enabled:'开始商会护送约定',escort_offered:'为这趟采购预留护送报酬',escort_terms_told:'当面说明护送约定',escort_accepted:'答应护送',
  escort_rendezvous_opened:'承运人在装货处等候',escort_joined:'在装货处接洽同行',escort_route_seen:'确认一段真实随行',escort_arrived:'亲见货物交抵',escort_paid:'结清护送报酬',escort_ended:'护送约定中止',escort_outcome_seen:'确认本次护送未完成',
  bounties_enabled:'登记悬赏开支',bounty_posted:'备妥赏钱并张贴告示',bounty_waiting_funds:'悬赏经费待补',bounty_notices_read:'读过悬赏告示',bounty_cancelled:'结束悬赏开支',bounty_paid:'凭实际拘押结清赏钱',bounty_closed_by_issuer:'本人办结并收回预留',
  relations_initialized:'记下亲友与邻里',attitude_changed:'心中态度改变',
  exchange_enabled:'开始邻里传话',news_exchanged:'当面交流消息',exchange_meeting_ended:'相互告辞',
  economy_initialized:'登记生计与供货',arrived:'外来人物入城',ate_food:'吃下干粮',food_needed:'尚未吃上饭',stock_shortage_noticed:'发现铺面缺货',restock_need:'新一轮补货需求',cargo_picked_up:'付货款并取货',stock_delivered:'货物运抵药铺',cargo_returned:'交回未送达的货物',
  employment_agreed:'约定搬运工作',employment_unavailable:'工作暂时空缺',labor_started:'到岗开始做工',labor_accrued:'记下实际工时',labor_paused:'暂停做工',wage_paid:'支付一小时工钱',wage_payment_due:'工钱暂未付清',
  relocate_pickup:'物主搬取药包',relocate_deliver:'物主搬回新摊位',attack_started:'出招',guard_started:'招架',guard_released:'松手回气',guard_exhausted:'气力耗尽',guard_broken:'破防',damaged:'受伤',parried:'挡住攻击',died:'死亡',take:'拿走药包',settle:'交还赔偿',return:'送回药包',aid:'救助',reward:'回礼',mask:'改变遮面',buy:'购买',sell:'出售',use:'使用',equip:'装备',unequip:'卸下',threatened:'威胁',robbed:'被迫交钱',loot_item:'搜刮物品',loot_money:'搜刮铜钱',case_assessed:'受理案件',witness:'目击',report:'当面传话',relationship:'关系变化',sight:'认出行踪',lost:'失去视线',
  life_initialized:'开始日常生活',activity_changed:'调整活动',activity_arrived:'抵达场所',activity_interrupted:'中断日常',activity_resumed:'恢复日常',places_registered:'登记场所',places_extended:'登记住处',place_services_enabled:'开设场所服务',place_status_changed:'接待状态变化',
  dialogue_initialized:'准备交谈',address_told:'当面告知地址',news_told:'当面转述消息',
  opportunities_initialized:'登记生活请求',opportunity_autonomy_enabled:'开始自主办事',personal_need:'生活请求的起因',opportunity_offered:'提出委托',opportunity_disclosed:'告知请求',opportunity_accepted:'答应帮忙',opportunity_declined:'婉拒请求',opportunity_cancelled:'取消委托',opportunity_expired:'委托到期',opportunity_failed:'委托未能完成',opportunity_funds_lost:'报酬资金受损',message_delivered:'口信送达',message_acknowledged:'收信人答复',opportunity_payment_due:'约定报酬待付',opportunity_fulfilled:'办妥并结清',opportunity_outcome_learned:'得知委托后续',opportunity_status_told:'当面交代进展',
}
/** Only invoked by an open review panel, including intermediate evidence nodes. */
export function createReviewIndex(state,archived=[]) {
  const current=['combat','interactions','village','robbery','property','equipment','crime','pursuit','registry','life','places','dialogue','opportunities','relations','economy','factions','standing','social'].flatMap(domain=>state[domain]?.events??[])
  const events=[...new Map([...archived,...current].map(e=>[e.id,e])).values()]
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
