import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import { createReviewIndex } from '../game/living/eventPresentation.js'
import { taskReasons } from '../game/living/taskPresentation.js'
import { historyPageForEvent } from '../game/gameplay/historyArchive.js'
import { useWorldStore } from '../stores/useWorldStore.js'

export default function LivingReview({view,focusId,onFocus}) {
  const [limit,setLimit]=useState(40)
  const [loaded,setLoaded]=useState({}),[loading,setLoading]=useState(false),[error,setError]=useState(null)
  const owner=view.state.archive?.history?.id??null,live=useRef(owner)
  const requestedFocus=useRef(new Set())
  useEffect(()=>{live.current=owner;requestedFocus.current.clear();setLoaded({});setError(null);setLoading(false);return()=>{live.current=null}},[owner])
  const archived=useMemo(()=>Object.values(loaded).flat(),[loaded])
  const index=useMemo(()=>createReviewIndex(view.state,archived),[view.state,archived])
  const rootId=focusId?index.root(focusId):null
  const chain=rootId?index.events.filter(e=>index.root(e.id)===rootId):index.events
  const shown=chain.slice(-limit),name=id=>id==='player'?'你':view.names[id]??'街坊'
  const link='text-left text-amber-200 underline'
  const readPage=useCallback(async(pageIndex,focus=null)=>{
    if(loading||pageIndex===null)return
    const document=useWorldStore.getState().document,scope=owner
    if(document?.progress.living?.checkpoint.gameplay.archive?.history?.id!==scope)return
    setLoading(true);setError(null)
    try {
      const repository=(await import('../game/persistence/asyncWorldRepository.js')).asyncWorldRepository
      const page=await repository.readHistoryPage(document,pageIndex)
      if(live.current!==scope)return
      setLoaded(previous=>({...previous,[pageIndex]:page.events.map(row=>row.event)}))
      if(focus){onFocus(focus);setLimit(40)}
    } catch(failure){if(live.current===scope)setError(failure.message)}
    finally {if(live.current===scope)setLoading(false)}
  },[loading,owner,onFocus])
  const choose=id=>{
    if(id&&!index.byId.has(id)){const page=historyPageForEvent(view.state,id);if(page!==null){readPage(page,id);return}}
    onFocus(id);setLimit(40)
  }
  useEffect(()=>{
    if(!focusId||loading||index.byId.has(focusId))return
    const page=historyPageForEvent(view.state,focusId),key=`${owner}:${focusId}`
    if(page===null||requestedFocus.current.has(key))return
    requestedFocus.current.add(key)
    readPage(page,focusId)
  },[focusId,owner,index,loading,readPage,view.state])
  const older=[...(view.state.archive?.history?.pages??[])].reverse().find(page=>!Object.hasOwn(loaded,page.index))
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
        {e.text&&<p className="mt-1 text-stone-300">{e.text}</p>}
        {cause&&<p className="mt-1 text-stone-400">源于：{source?<button className={link} onClick={()=>choose(cause)}>{index.label(source)} · {(source.at/1000).toFixed(1)}秒</button>:historyPageForEvent(view.state,cause)!==null?<button className={link} disabled={loading} onClick={()=>choose(cause)}>读取原始记录</button>:'较早的已记录事实'}</p>}
      </li>
    })}</ol>
    {shown.length<chain.length&&<button className={`${link} mt-2`} onClick={()=>setLimit(n=>n+40)}>再看较早的40条</button>}
    {older&&<button className={`${link} mt-2 ml-3`} disabled={loading} onClick={()=>readPage(older.index)}>{loading?'正在读取…':'翻阅一页旧账'}</button>}
    {error&&<p className="mt-2 text-amber-200">{error}</p>}
    {!chain.length&&<p className="mt-2">暂无记录。</p>}
  </section>
}
