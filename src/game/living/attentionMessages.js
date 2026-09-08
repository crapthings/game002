/** Narrate only personal receipts or an event actually visible right now. */
export function attentionMessages(events,{seen,name}) {
  const out=[]
  const add=(e,text,priority,group)=>out.push({text,priority,group,sourceId:e.id})
  for(const e of events) {
    const personal=e.actorId==='player'||e.targetId==='player'
    const combatSeen=personal||e.targetId&&seen(e.targetId)
    if(['damaged','parried','died'].includes(e.kind)&&combatSeen) {
      add(e,e.kind==='damaged'?`${name(e.targetId)}受到${e.damage}点伤害。`:e.kind==='parried'?`${name(e.targetId)}挡住了这次攻击。`:
        `${name(e.targetId)}倒下了，原有财物留在原处。`,0,`combat:${e.targetId}`)
    } else if(e.kind==='threatened'&&personal) {
      add(e,{fight:'对方选择反抗。',flee:'对方转身逃走。',call_guard:'对方正在向捕快求助。',surrender:'对方选择交出钱财。'}[e.reaction],0,`threat:${e.targetId}`)
    } else if(e.kind==='robbed'&&personal)add(e,`对方交出${e.amount}文，这笔钱仍被记录为强取。`,0,`threat:${e.targetId}`)
    else if(e.kind==='reward'&&e.targetId==='player')add(e,'柳娘当面送上15文答谢。',1,'aid:liu')
    else if(e.kind==='incapacitated'&&e.targetId==='player')add(e,'你被制服了，仍然活着，暂时不能行动。',0,'custody:player')
    else if(e.kind==='taken_into_custody'&&e.targetId==='player')add(e,'捕快已经走到身边控制你，可认缴本次赔偿或等待处理。',0,'custody:player')
    else if(['custody_released','custody_abandoned','consciousness_returned'].includes(e.kind)&&e.actorId==='player')
      add(e,e.kind==='custody_released'?`本次拘押已处理，可以行动。${e.debt?`仍欠赔偿${e.debt}文。`:''}`:'你可以重新行动，尚未处理的案件仍然保留。',1,'custody:player')
    else if(['daily_greeting','daily_started','daily_tea_finished','daily_help_returned'].includes(e.kind)&&(e.witnessIds??[]).length&&e.witnessIds.every(seen))
      add(e,`${name(e.actorId)}与${name(e.targetId)}：${e.text??(e.kind==='daily_help_returned'?'亲手交回了帮忙带来的原物。':'在茶摊歇脚后互相告辞。')}`,3,`daily:${e.dailyId}`)
    else if(personal&&['opportunity_accepted','opportunity_fulfilled','opportunity_payment_due','cargo_returned','message_acknowledged','stock_delivered','opportunity_outcome_learned','opportunity_status_told'].includes(e.kind)) {
      const text={opportunity_accepted:'已约好帮忙，可在委托列表查看目的地。',opportunity_fulfilled:`事情已办妥，结清${e.amount??0}文报酬。`,opportunity_payment_due:'对方确认事情已办到，报酬仍待支付。',cargo_returned:'原货已当面交回。',message_acknowledged:'收信人给了答复，可以回去交代。',stock_delivered:'这趟采购货物已实际交抵。',opportunity_outcome_learned:'你确认了这件委托的后续，可在列表查看。',opportunity_status_told:'对方当面交代了委托的最新进展。'}[e.kind]
      add(e,text,1,`task:${e.opportunityId}`)
    } else if(e.kind==='news_told'&&e.targetId==='player')add(e,`${name(e.actorId)}当面说起一条街坊消息。`,2,`news:${e.factId??e.id}`)
    else if(personal&&['case_settled','custody_debt_paid','estate_debt_paid','escort_paid','training_completed'].includes(e.kind))
      add(e,{case_settled:'这次案件处理已有回执，其他未结事项仍保留。',custody_debt_paid:'这笔赔偿欠账已结清。',estate_debt_paid:`保管者从原账户付清了${e.amount}文欠款。`,escort_paid:`收到${e.amount}文护送报酬。`,training_completed:'已经完成入门练习，学费结清，基础攻击有所提高。'}[e.kind],1,`receipt:${e.custodyId??e.escortId??e.trainingId??e.claimId??e.id}`)
  }
  return out
}
