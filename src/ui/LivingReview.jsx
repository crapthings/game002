import { useMemo,useState } from 'react'
import { createReviewIndex } from '../game/living/eventPresentation.js'
import { taskReasons } from '../game/living/taskPresentation.js'

export default function LivingReview({view,focusId,onFocus}) {
  const [limit,setLimit]=useState(40)
  const index=useMemo(()=>createReviewIndex(view.state),[view.state])
  const rootId=focusId?index.root(focusId):null
  const chain=rootId?index.events.filter(e=>index.root(e.id)===rootId):index.events
  const shown=chain.slice(-limit),name=id=>id==='player'?'你':view.names[id]??'街坊'
  const link='text-left text-amber-200 underline'
  const choose=id=>{onFocus(id);setLimit(40)}
  return <section aria-label="事后因果链" className="mt-2 text-xs">
    <p className="text-stone-400">这里展示世界事实。打开回顾不会让任何人物获得消息。</p>
    {focusId&&<button className={`${link} my-2`} onClick={()=>choose(null)}>返回全部记录</button>}
    <p className="mt-2 text-stone-400">{focusId?'这一件事的经过':'全部记录'} · 显示{shown.length}/{chain.length}条</p>
    <ol className="mt-2 space-y-2">{shown.map(e=>{
      const cause=index.parent(e),source=index.byId.get(cause)
      return <li key={e.id} className={`rounded border p-2 ${focusId===e.id?'border-amber-200/60':'border-white/10'}`}>
        <button className={link} onClick={()=>choose(e.id)}>{(e.at/1000).toFixed(1)}秒 · {index.label(e)}</button>
        <p className="mt-1">{name(e.actorId??e.authorityId??e.fact?.actorId)}{e.targetId?` → ${name(e.targetId)}`:''}{e.placeId?` · ${view.state.places?.definitions.find(p=>p.id===e.placeId)?.label??'原定场所'}`:''}{e.damage?` −${e.damage}气血`:''}{e.amount?` · ${e.amount}文`:''}{e.subjectId===null?' · 身份未确认':''}</p>
        {taskReasons[e.reason]&&<p className="mt-1">{taskReasons[e.reason]}</p>}
        {cause&&<p className="mt-1 text-stone-400">源于：{source?<button className={link} onClick={()=>choose(cause)}>{index.label(source)} · {(source.at/1000).toFixed(1)}秒</button>:'较早的已记录事实'}</p>}
      </li>
    })}</ol>
    {shown.length<chain.length&&<button className={`${link} mt-2`} onClick={()=>setLimit(n=>n+40)}>再看较早的40条</button>}
    {!chain.length&&<p className="mt-2">暂无记录。</p>}
  </section>
}
