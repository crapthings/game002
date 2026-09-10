import { useMemo } from 'react'
import { useLivingStore } from '../stores/useLivingStore.js'
import { personalTasks } from '../game/living/taskPresentation.js'

export default function TaskPanel({view,onReview}) {
  const tasks=useMemo(()=>personalTasks(view.state,view.clock,view.names),[view.state,view.clock,view.names])
  const button='mt-2 mr-2 rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/15'
  return <section className="mt-4 border-t border-white/10 pt-3" aria-label="我的委托与消息">
    <h3 className="text-amber-200">委托与消息</h3>
    <p className="mt-1 text-xs text-stone-400">按你亲历或当面得知的版本记下。地点是常去之处，不是实时位置。</p>
    {[false,true].map(ended=><details key={String(ended)} open={!ended} className="mt-2">
      <summary>{ended?'已结束':'进行中'} · {tasks.filter(t=>t.ended===ended).length}</summary>
      {tasks.filter(t=>t.ended===ended).map(t=><article key={t.id} className="my-2 rounded border border-white/10 p-2 text-xs">
        <p className="text-amber-100">{t.title} · {t.issuer}</p><p className="mt-1">{t.next}</p>
        <p className="mt-1 text-stone-400">{t.reward}</p>
        {!t.ended&&t.deadlineAt!==null&&<p className="mt-1 text-stone-400">{t.hasDebt?'已按时交代，保留待付报酬':`期限还剩${Math.max(0,Math.ceil((t.deadlineAt-view.clock)/1000))}游戏分钟`}</p>}
        {!t.ended&&view.places.some(p=>p.id===t.placeId)&&<button className={button} onClick={()=>useLivingStore.getState().trackPlace(t.placeId)}>指路：{t.placeLabel}</button>}
        <button className={button} onClick={()=>onReview(t.rootId)}>查看事情来由</button>
      </article>)}
    </details>)}
    {!tasks.length&&<p className="mt-2 text-xs text-stone-400">还没有记下委托。遇见街坊时可以询问。</p>}
  </section>
}
