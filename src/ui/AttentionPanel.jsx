import { useLivingStore } from '../stores/useLivingStore.js'
import { clockAt } from '../game/living/clock.js'

const states={pending:'稍后提醒',showing:'当前提示',closed:'已收起',expired:'提醒已过时',superseded:'已由后续提示接替'}
export default function AttentionPanel({view,formatMessage,onReview}) {
  const attention=useLivingStore(s=>s.attention)
  return <details className="mt-4 border-t border-white/10 pt-3">
    <summary>最近提示 · {attention.entries.length}</summary>
    <p className="mt-2 text-xs text-stone-400">记录你亲历、当面听说或看见的消息。普通消息在危险结束后依次提醒；过时的提示不改变事情本身。</p>
    {attention.entries.map(row=><article key={row.id} className="mt-2 rounded border border-white/10 p-2 text-xs">
      <p className="text-stone-400">{clockAt(view.state.calendar.clockOrigin,row.at).label} · {states[row.status]}</p>
      <p className="mt-1">{formatMessage(row.text)}</p>
      {row.sourceIds.length>0&&<button className="mt-2 text-amber-200 underline" onClick={()=>onReview(row.sourceIds.at(-1))}>查看最近依据</button>}
      {['pending','showing'].includes(row.status)&&<button className="ml-2 mt-2 text-stone-300 underline" onClick={()=>useLivingStore.getState().dismissNotice(row.id)}>收起提示</button>}
    </article>)}
    {!attention.entries.length&&<p className="mt-2 text-xs text-stone-400">暂时没有新提示。</p>}
  </details>
}
