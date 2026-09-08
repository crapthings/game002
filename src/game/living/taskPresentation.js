import { personalOpportunity } from '../gameplay/opportunityKnowledge.js'

export const taskReasons={DEADLINE_PASSED:'约定期限已过',CANCELLED_BY_PARTY:'一方已取消约定',DECLINED:'你婉拒了这件事',ISSUER_DEAD:'委托人已经去世',RECIPIENT_DEAD:'收信人或供货人已经去世',ASSIGNEE_DEAD:'承接人已经去世',CARGO_UNAVAILABLE:'约定货物已无法交付',AWAITING_PAYMENT:'事情已交代，报酬仍待支付',SUPPLIER_EXHAUSTED:'货郎的有限存货已不足',PROCUREMENT_FUNDS_UNAVAILABLE:'预留采购款已不足，尚未购货'}
export function personalTasks(state,at,names) {
  const name=id=>id==='player'?'你':names[id]??'街坊'
  const rows=(state.opportunities?.entries??[]).flatMap(row=>{
    const known=personalOpportunity(state,row,'player',at)
    if(!known)return []
    const ended=['fulfilled','failed','cancelled','expired','declined'].includes(known.status)
    const own=known.assigneeId==='player'
    const procurement=row.requirements.kind==='procurement'
    const next=ended?(known.status==='fulfilled'?'已按约定办妥并结清':taskReasons[known.reason]??'这件事已结束'):
      known.status==='offered'?`再见${name(row.issuerId)}确认是否仍需帮忙`:
      !own?`${name(known.assigneeId)}已经答应帮忙；之后可向委托人打听`:
      known.stage==='payment'?`等${name(row.issuerId)}筹到钱，再当面结清`:
      known.stage==='return'?(procurement?'把实际货物运回药铺':`把答复带回给${name(row.issuerId)}`):`找到${name(row.targetActorId)}，${procurement?'领取掌柜委托采购的货物':'当面传达口信'}`
    const placeId=known.stage==='deliver'&&own?row.targetPlaceId:row.returnPlaceId
    return [{id:row.id,title:row.title,issuer:name(row.issuerId),ended,next,placeId,
      placeLabel:state.places.definitions.find(p=>p.id===placeId)?.label??'约定的地点',
      reward:known.amount===null?`原请求报酬${row.proposedReward}文，需当面确认`:known.amount?`约定${known.amount}文`:'约定无偿',
      deadlineAt:row.deadlineAt,hasDebt:known.stage==='payment',rootId:row.rootCauseId,evidenceId:known.evidenceId}]
  })
  // The older aid chain is projected only; it remains the sole reward owner.
  const aid=state.village.aid
  if(aid.eventId)rows.push({id:'legacy-liu-aid',title:'柳娘的谢意',issuer:name('resident-1'),
    ended:!!aid.rewardEvent||aid.subject!=='player',
    next:aid.rewardEvent?'柳娘已经当面送过答谢':aid.subject==='player'?'柳娘认出了施救的你；她若找到你，可以当面答谢':'柳娘受到了帮助，但没有认出蒙面的恩人',
    placeId:'place.home-liu',placeLabel:'柳娘住处',reward:'恩情记录，不是新增的领奖任务',
    deadlineAt:null,hasDebt:false,rootId:aid.eventId,evidenceId:aid.rewardEvent??aid.eventId})
  return rows
}
