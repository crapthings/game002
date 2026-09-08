import InteractionButton from './InteractionButton.jsx'
import { useLivingStore } from '../stores/useLivingStore.js'
const button='rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-35 enabled:hover:bg-white/15'

export default function ConversationPanel({view,lockReason}) {
  const request=useLivingStore.getState().request,meeting=view.conversation
  const act=(action,row,terms)=>request('commitment',{action,opportunityId:row.id,meetingId:meeting?.id,...(terms?{terms}:{})})
  if(!meeting) {
    const target=view.state.interactions.actors.find(a=>a.id===view.targetId)
    return target?.health>0?<InteractionButton className={`${button} mt-2 mr-2`} reason={lockReason} onClick={()=>request('talk_start',{targetId:target.id})}>交谈</InteractionButton>:null
  }
  return <section aria-label="当面交谈" className="mt-3 rounded-lg border border-amber-200/20 p-3">
    <div className="flex justify-between gap-2"><h3>与{view.names[meeting.speakerId]??'街坊'}交谈</h3><button className={button} onClick={()=>request('talk_end')}>告辞</button></div>
    <div className="my-2 text-sm text-amber-100" aria-live="polite">{meeting.lines.map((line,i)=><p className="mt-1" key={i}>{line}</p>)}</div>
    {meeting.opportunities?.map(row=><div className="my-2 rounded border border-white/10 p-2 text-xs" key={row.id}>
      <p>{row.title} · {row.quote.unpaid?'无偿帮忙':`约定报酬 ${row.quote.amount}文`}</p>
      <p className="mt-1 text-stone-400">把石伯的口信带给小何，再回来交代答复。</p>
      <p className="mt-1 text-stone-400">{row.returnEventId&&row.status==='accepted'?'事情已经办妥，约定报酬仍待支付':row.expired?'已到期':['fulfilled','failed','cancelled','expired'].includes(row.status)?({fulfilled:'已办妥并结清',failed:'未能完成',cancelled:'已取消',expired:'已过期'}[row.status]):`还剩${Math.max(0,Math.ceil((row.deadlineAt-view.clock)/1000))}游戏分钟`}</p>
      {row.status==='offered'&&!row.declinedBy.includes('player')&&<div className="mt-2 flex flex-wrap gap-2">
        <InteractionButton className={button} reason={lockReason||(row.expired?'委托已过期':null)} onClick={()=>act('accept',row,row.quote.unpaid?'unpaid':'paid')}>{row.quote.unpaid?'愿意无偿帮忙':`答应帮忙 · 报酬${row.quote.amount}文`}</InteractionButton>
        <InteractionButton className={button} reason={lockReason||(row.expired?'委托已过期':null)} onClick={()=>act('decline',row)}>婉拒</InteractionButton>
      </div>}
      {row.declinedBy.includes('player')&&<p className="mt-2 text-stone-400">你已经婉拒；别人仍可以帮忙。</p>}
      {row.status==='accepted'&&row.assigneeId==='player'&&<div className="mt-2 flex flex-wrap gap-2">
        {!row.message.deliveredEventId&&meeting.speakerId===row.targetActorId&&<InteractionButton className={button} reason={lockReason||(row.expired?'委托已过期':null)} onClick={()=>act('deliver',row)}>转达石伯的口信</InteractionButton>}
        {!!row.message.receiptEventId&&meeting.speakerId===row.issuerId&&<InteractionButton className={button} reason={lockReason||(row.expired?'委托已过期':row.returnEventId&&!row.paymentAvailable?'报酬仍不足，稍后再来':null)} onClick={()=>act('collect',row)}>交代答复并结清</InteractionButton>}
        <button className={button} onClick={()=>useLivingStore.getState().trackPlace(row.message.receiptEventId?row.returnPlaceId:row.targetPlaceId)}>{row.message.receiptEventId?'指路：回去找石伯':'指路：小何常去的地方'}</button>
        <InteractionButton className={button} reason={lockReason} onClick={()=>act('cancel',row)}>{row.returnEventId?'放弃报酬请求':'放弃委托'}</InteractionButton>
      </div>}
    </div>)}
    {!!meeting.placeIds.length&&<div className="mb-2">{meeting.placeIds.map(id=>{
      const place=view.places.find(p=>p.id===id)
      return place?<button className={`${button} mr-2 mt-1`} key={id} onClick={()=>useLivingStore.getState().trackPlace(id)}>记路：{place.label}</button>:null
    })}</div>}
    <div className="flex flex-wrap gap-2">{meeting.topics.map(topic=><InteractionButton className={button} key={topic.id} reason={lockReason} onClick={()=>request('talk_topic',{meetingId:meeting.id,topicId:topic.id})}>{topic.label}</InteractionButton>)}</div>
    <p className="mt-2 text-xs text-stone-400">离开交谈距离或遇到危险时，对方会先处理自己的事情。</p>
  </section>
}
