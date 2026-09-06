import { useState } from 'react'
import { NPCS } from '../game/worldLedger/firstLoop.js'

const names = Object.fromEntries(NPCS.map(n => [n.id,n.name]))
const label = { take:'拿取', witness:'目击', report:'举报', settle:'交还赔偿', return:'送回', buy:'购买', sell:'出售', use:'使用', aid:'救助', reward:'回礼' }
const status = { unreported:'尚未送达举报', anonymous:'已举报，身份不明', wanted:'具名追捕中', settled:'已了结' }

// A read-only view of recorded facts. Selection never changes NPC knowledge.
export default function LedgerReview({ view }) {
  const [selected, setSelected] = useState(null)
  const events = new Map(view.events.map(e => [e.id,e]))
  const roots = new Map()
  for (const event of view.events) roots.set(event.id,roots.get(event.cause) ?? event.id)
  const focused = events.get(selected)
  const rootId = focused ? roots.get(focused.id) : null
  const chain = rootId ? view.events.filter(e => roots.get(e.id) === rootId) : view.events
  const incident = view.incidents.find(i => i.id === rootId)
  const aidEvent = events.get(view.aid.eventId)
  const showAid = aidEvent && (!rootId || rootId === aidEvent.id)
  const link = 'text-left text-amber-200 underline focus-visible:outline focus-visible:outline-amber-200'
  const choose = id => setSelected(id)
  return <section className="mt-2 border-t border-white/10 pt-2" aria-label="事后因果回顾">
    <p className="text-[11px] text-stone-400">这里展示世界事实。知道事件发生，不等于认出了当事人；角色只依据自己的记忆行动。</p>
    <label className="mt-2 block text-xs">回顾范围
      <select className="mt-1 w-full rounded bg-stone-900 p-2" value={rootId ?? ''} onChange={e => choose(e.target.value || null)}>
        <option value="">全部事件</option>
        {view.events.filter(e => e.cause === null).map(e => <option key={e.id} value={e.id}>{(e.at/1000).toFixed(1)}秒 · {label[e.kind]}</option>)}
      </select>
    </label>
    {incident && <p className="mt-2 text-xs">本案：{status[incident.status]}。{incident.reporterId ? `选定举报人：${names[incident.reporterId]}。` : '没有记录到目击者。'}{incident.status === 'settled' && '案件已了结，历史记忆仍保留。'}</p>}
    <ol className="mt-2 space-y-2 text-xs">
      {chain.map(e => <li key={e.id} className={`rounded border p-2 ${e.id === focused?.id ? 'border-amber-200/70 bg-amber-200/10' : 'border-white/10'}`}>
        <button type="button" className={link} onClick={() => choose(e.id)} aria-pressed={e.id === focused?.id}>{(e.at/1000).toFixed(1)}秒 · {label[e.kind]}</button>
        <p className="mt-1">{e.text}</p>
        {e.cause && events.has(e.cause) && <p className="mt-1 text-stone-400">源于：<button type="button" className={link} onClick={() => choose(e.cause)}>{label[events.get(e.cause).kind]} · {(events.get(e.cause).at/1000).toFixed(1)}秒</button></p>}
        {focused?.id === e.id && <p className="mt-1 text-stone-400">直接后续：{view.events.filter(next => next.cause === e.id).map((next,index) => <span key={next.id}>{index > 0 && '、'}<button type="button" className={link} onClick={() => choose(next.id)}>{label[next.kind]} · {(next.at/1000).toFixed(1)}秒</button></span>)}{!view.events.some(next => next.cause === e.id) && '尚无记录'}</p>}
      </li>)}
    </ol>
    {!chain.length && <p className="mt-2 text-xs">尚未发生事件。</p>}
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-amber-200">角色各自知道什么</summary>
      <ul className="mt-2 space-y-2">
        {NPCS.map(npc => {
          const knowledge = view.knowledge.filter(k => k.npcId === npc.id && (!rootId || k.eventId === rootId))
          const aid = npc.id === 'resident-1' && showAid
          return <li key={npc.id} className="rounded border border-white/10 p-2">
            <p className="font-medium">{npc.name}</p>
            {knowledge.map(k => <p key={`${k.npcId}/${k.eventId}`} className="mt-1 text-stone-300">{k.source === 'saw' ? '亲眼目击' : '收到当面举报'}，{k.subject === 'player' ? '记录的拿取者是你' : '拿取者身份不明'}。<button type="button" className={link} onClick={() => choose(k.evidence)}>查看依据</button></p>)}
            {aid && <p className="mt-1 text-stone-300">记得自己受过救助，{view.aid.subject === 'player' ? '认出了施救的你' : '不知道蒙面恩人是谁'}。<button type="button" className={link} onClick={() => choose(aidEvent.id)}>查看依据</button></p>}
            {!knowledge.length && !aid && <p className="mt-1 text-stone-400">当前回顾范围内，没有记录到目击、举报或救助记忆。</p>}
          </li>
        })}
      </ul>
    </details>
  </section>
}
