import { useEffect, useState } from 'react'
import { useLedgerStore } from '../stores/useLedgerStore.js'
import { ITEMS } from '../game/worldLedger/community.js'
import LedgerReview from './LedgerReview.jsx'

const descriptions = {
  idle: '试着拿走药包，或者等待街坊转身。',
  unreported: '尚无具名通缉。是否有人正在举报？',
  anonymous: '捕快收到匿名嫌疑报告，尚未确认你的身份。',
  wanted: '捕快正在寻找你；失去视线后只搜查最后见到的位置。',
  settled: '纠纷已了结，捕快会把药包送回摊位。',
}
export default function LedgerHud() {
  const view = useLedgerStore(s => s.view)
  const message = useLedgerStore(s => s.message)
  const [review, setReview] = useState(false)
  useEffect(() => {
    const key = event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return
      const kind = { KeyE: 'take', KeyR: 'settle', KeyH: 'mask', KeyF: 'aid' }[event.code]
      if (kind) { event.preventDefault(); useLedgerStore.getState().request(kind) }
    }
    window.addEventListener('keydown',key)
    return () => window.removeEventListener('keydown',key)
  },[])
  const button = 'rounded border border-white/20 px-2 py-1.5 text-xs enabled:hover:bg-white/10 disabled:opacity-40'
  const protectKeyboardNavigation = event => {
    // Keep native button/select/summary behavior without passing navigation keys
    // to the world's window-level movement listener. Key-up still releases movement.
    if (event.target.closest('button,select,summary') && ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.stopPropagation()
  }
  return <section onKeyDown={protectKeyboardNavigation} className="absolute bottom-4 left-4 z-10 max-h-[55vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-amber-200/20 bg-stone-950/85 p-3 text-sm text-stone-100" aria-label="药包风波">
    <h2 className="font-semibold text-amber-200">药包风波</h2>
    {!view ? <p className="mt-2 text-xs">{message || '正在准备中心街坊…'}</p> : <>
      <p className="mt-1 text-xs text-stone-300">铜钱 {view.wallet} 文 · 气血 {view.health}/100 · {view.masked ? '已蒙面' : '未蒙面'}</p>
      <p className="mt-2">背包 {view.bagCount}/{view.capacity}</p>
      {view.holding && <p className="text-xs text-amber-200">止血药包 ×1（陈掌柜所有，不可消耗）</p>}
      {Object.entries(ITEMS).map(([id,item]) => <div key={id} className="mt-1 flex items-center justify-between text-xs">
        <span>{item.name} ×{view.inventory[id]}（自有）</span>
        <button type="button" className={button} disabled={!view.inventory[id] || view.health >= 100} onClick={() => useLedgerStore.getState().request(`use-${id}`)}>使用 · 气血+{item.healing}</button>
      </div>)}
      <p className="mt-2 text-xs text-amber-100">{view.status === 'settled' && view.holder === 'stall' ? '纠纷已了结，药包已送回摊位。' : descriptions[view.status]}</p>
      <p className="mt-1 text-xs text-stone-400">药摊 {view.stallDistance} 米 · 捕快周平 {view.guardDistance} 米</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!view.canTake} onClick={() => useLedgerStore.getState().request('take')}>E 拿取药包</button>
        <button type="button" className={button} onClick={() => useLedgerStore.getState().request('mask')}>H {view.masked ? '摘下面巾' : '蒙面'}</button>
        <button type="button" className={button} disabled={!view.canSettle} onClick={() => useLedgerStore.getState().request('settle')}>R 交还并赔偿 {view.fine} 文</button>
      </div>
      <div className="mt-3 border-t border-white/10 pt-2">
        <p className="text-xs">陈掌柜 · {view.merchantDistance} 米 · 现钱 {view.merchantCash} 文</p>
        <div className="mt-2 flex gap-2">{Object.entries(ITEMS).map(([id,item]) => <button key={id} type="button" className={button} disabled={!view.canBuy || !view.stock[id] || view.wallet < item.price || view.bagCount >= view.capacity} onClick={() => useLedgerStore.getState().request(`buy-${id}`)}>买{item.name} {item.price}文 · 余{view.stock[id]}</button>)}</div>
        <div className="mt-2 flex gap-2">{Object.entries(ITEMS).map(([id,item]) => <button key={id} type="button" className={button} disabled={!view.canBuy || !view.inventory[id] || view.merchantCash < item.sellPrice} onClick={() => useLedgerStore.getState().request(`sell-${id}`)}>卖{item.name} {item.sellPrice}文</button>)}</div>
        <p className="mt-3 text-xs">柳娘 · {view.patientDistance} 米 · 信任 {view.trust}</p>
        <p className="mt-1 text-xs text-stone-300">{{ injured:'柳娘受伤了，可以用自有止血药救助她。', waiting:'柳娘记住了恩情，稍后会寻找你当面答谢。', 'unknown-helper':'柳娘恢复了，但未能认出蒙面的恩人。', thanked:'柳娘已经当面送上15文答谢。' }[view.aidStatus]}</p>
        <button type="button" className={`${button} mt-2`} disabled={!view.canAid} onClick={() => useLedgerStore.getState().request('aid')}>F 用止血药救助</button>
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-stone-300">{message}</p>
      <p className="mt-2 text-[11px] text-stone-400">先尝试等待街坊转身或蒙面拿取，再比较后果。本轮仅带名字的六人参与目击。</p>
      <button type="button" className="mt-2 text-xs text-amber-200 underline" onClick={() => setReview(!review)}>{review ? '收起' : '查看'}事后因果回顾</button>
      {review && <LedgerReview view={view} />}
    </>}
  </section>
}
