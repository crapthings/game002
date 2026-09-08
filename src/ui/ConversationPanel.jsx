import InteractionButton from './InteractionButton.jsx'
import { useLivingStore } from '../stores/useLivingStore.js'
const button='rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-35 enabled:hover:bg-white/15'

export default function ConversationPanel({view,lockReason}) {
  const request=useLivingStore.getState().request,meeting=view.conversation
  if(!meeting) {
    const target=view.state.interactions.actors.find(a=>a.id===view.targetId)
    return target?.health>0?<InteractionButton className={`${button} mt-2 mr-2`} reason={lockReason} onClick={()=>request('talk_start',{targetId:target.id})}>交谈</InteractionButton>:null
  }
  return <section aria-label="当面交谈" className="mt-3 rounded-lg border border-amber-200/20 p-3">
    <div className="flex justify-between gap-2"><h3>与{view.names[meeting.speakerId]??'街坊'}交谈</h3><button className={button} onClick={()=>request('talk_end')}>告辞</button></div>
    <div className="my-2 text-sm text-amber-100" aria-live="polite">{meeting.lines.map((line,i)=><p className="mt-1" key={i}>{line}</p>)}</div>
    {meeting.opportunities?.map(row=><div className="my-2 rounded border border-white/10 p-2 text-xs" key={row.id}><p>{row.title} · {row.quote.unpaid?'目前只能请人无偿帮忙':`约定报酬 ${row.quote.amount}文`}</p><p className="mt-1 text-stone-400">请给小何带话，再回来交代他的答复。</p></div>)}
    {!!meeting.placeIds.length&&<div className="mb-2">{meeting.placeIds.map(id=>{
      const place=view.places.find(p=>p.id===id)
      return place?<button className={`${button} mr-2 mt-1`} key={id} onClick={()=>useLivingStore.getState().trackPlace(id)}>记路：{place.label}</button>:null
    })}</div>}
    <div className="flex flex-wrap gap-2">{meeting.topics.map(topic=><InteractionButton className={button} key={topic.id} reason={lockReason} onClick={()=>request('talk_topic',{meetingId:meeting.id,topicId:topic.id})}>{topic.label}</InteractionButton>)}</div>
    <p className="mt-2 text-xs text-stone-400">离开交谈距离或遇到危险时，对方会先处理自己的事情。</p>
  </section>
}
