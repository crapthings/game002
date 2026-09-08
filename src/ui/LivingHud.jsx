import { useMemo, useState } from 'react'
import { useLivingStore } from '../stores/useLivingStore.js'
import { LIVING_ITEMS,PRICES } from '../game/living/config.js'
import { SERVICE_REASONS } from '../game/living/serviceMessages.js'
import InteractionButton from './InteractionButton.jsx'
import ConversationPanel from './ConversationPanel.jsx'
const button='rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-35 enabled:hover:bg-white/15'
const lifeWords={life_initialized:'开始日常生活',activity_changed:'调整活动',activity_arrived:'抵达场所',activity_interrupted:'中断日常',activity_resumed:'恢复日常',places_registered:'登记场所',places_extended:'登记住处',place_services_enabled:'开设场所服务',place_status_changed:'接待状态变化'}
const dialogueWords={dialogue_initialized:'准备交谈',address_told:'当面告知地址',news_told:'当面转述消息'}
const words={relocate_pickup:'物主搬取药包',relocate_deliver:'物主搬回新摊位',attack_started:'出招',guard_started:'招架',guard_released:'松手回气',guard_exhausted:'气力耗尽',guard_broken:'破防',damaged:'受伤',parried:'挡住攻击',died:'死亡',take:'拿走药包',settle:'交还赔偿',return:'送回药包',aid:'救助',reward:'回礼',mask:'改变遮面',buy:'购买',sell:'出售',use:'使用',equip:'装备',unequip:'卸下',threatened:'威胁',robbed:'被迫交钱',loot_item:'搜刮物品',loot_money:'搜刮铜钱',case_assessed:'受理案件',witness:'目击',report:'当面举报',sight:'认出行踪',lost:'失去视线'}
const errors={HISTORY_FULL:'本轮记录已满，请保存退出后换新种子体验',TARGET_BUSY:'对方正忙，暂时无法交涉',NOT_AVAILABLE:'物品已不在原处',OWN_MEDICINE_REQUIRED:'需要一份自有止血药',REWARD_NOT_DUE:'尚未满足答谢条件',SUBJECT_UNIDENTIFIED:'对方没有确认你的身份',ACTOR_DEAD:'角色已经倒下',TARGET_NOT_DEAD:'对方仍然活着，不能搜刮',INSUFFICIENT_QUANTITY:'物品数量不足',NO_CHANGE:'当前状态无需更改',ACTOR_BUSY:'正在出招或收招',RELEASE_REQUIRED:'先松开招架，再回气至25',INSUFFICIENT_STAMINA:'气力不足',BAG_FULL:'背包已满',INSUFFICIENT_FUNDS:'铜钱不足',NOT_OWNED:'这件物品仍属于别人',ITEM_EQUIPPED:'先卸下装备',THREAT_COOLDOWN:'对方仍在警惕，稍后再试',SAVE_OUTCOME_UNKNOWN:'保存结果未确认，请返回菜单重新读档',RECOVERY_REQUIRED:'请重新读档后继续',ALREADY_HELPED:'柳娘已经接受过救助',HEALTH_FULL:'气血已满',BUSY:'正在保存上一动作'}
export default function LivingHud(){
 const [reviewOpen,setReviewOpen]=useState(false),[knowledgeOpen,setKnowledgeOpen]=useState(false)
 const v=useLivingStore(s=>s.view),panel=useLivingStore(s=>s.panel),message=useLivingStore(s=>s.message),request=useLivingStore.getState().request
 const events=useMemo(()=>{
  if(!panel||!reviewOpen||!v)return []
  const s=v.state
  return [...s.combat.events,...s.interactions.events,...s.village.events,...s.robbery.events,...s.property.events,...s.equipment.events,...s.crime.events,...(s.life?.events??[]),...(s.places?.events??[]),...(s.dialogue?.events??[]),...s.social.events.filter(e=>e.kind==='report'||e.kind==='witness')].sort((a,b)=>a.at-b.at)
 },[panel,reviewOpen,v?.state])
 if(!v)return <p className="absolute bottom-4 left-4 rounded bg-black/80 p-3 text-sm">{message||'正在准备街坊…'}</p>
 const s=v.state,f=v.fighters.find(f=>f.id==='player'),target=s.interactions.actors.find(a=>a.id===v.targetId)
 const name=id=>id==='player'?'你':v.names[id]??id
 const item=id=>LIVING_ITEMS.find(i=>i.id===id)
 const lots=s.interactions.inventory.lots,own=lots.filter(l=>l.holderId==='player-bag'),loadout=s.equipment.loadouts.find(l=>l.actorId==='player')
 const med=own.find(l=>l.ownerId==='player'&&l.itemType==='medicine')
 const lockReason=v.busy?'正在保存上一动作':v.stopped?'当前记录已暂停，请保存退出':v.hero.health===0?'你已经倒下':null
 const noTrade=lockReason||(!v.trade?.available&&(SERVICE_REASONS[v.trade?.reason]??errors[v.trade?.reason]??'暂时无法交易'))
 const targetFighter=v.fighters.find(f=>f.id===target?.id)
 const threatReason=lockReason||(f.phase!=='idle'?'请先结束当前动作':targetFighter?.phase!=='idle'?'对方正在行动':s.robbery.cooldowns.some(c=>c.targetId===v.targetId&&c.until>v.clock)?'对方仍在警惕，稍后再试':null)
 const act=(kind,data)=>request(kind,data)
 return <>
  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 text-xl text-white/70">·</div>
  <aside className="absolute bottom-4 left-1/2 w-80 max-w-[90vw] -translate-x-1/2 rounded-xl border border-white/20 bg-stone-950/90 p-3 text-xs text-stone-100" aria-label="战斗状态">
   <p>气血 {v.hero.health}/100 · 铜钱 {v.hero.wallet} 文 · 攻击 {f.attack} / 防御 {f.defense}</p>
   {v.calendar&&<p className="mt-1 text-stone-400">{v.calendar.label}{v.currentPlace?` · ${v.currentPlace}`:''}</p>}
   <div className="my-2 h-2 rounded bg-red-950"><div className="h-full rounded bg-red-400" style={{width:`${v.hero.health}%`}} /></div>
   <p>气力 {Math.floor(f.stamina/1000)}/100 · {f.phase==='guard'?'招架中':f.mustRelease?'松开招架后回气':f.phase==='broken'?'破防':f.phase==='dead'?'已死亡':({windup:'起手',active:'挥击',recovery:'收招'}[f.phase]??'就绪')}</p>
   <div role="progressbar" aria-label="招架气力" aria-valuenow={Math.floor(f.stamina/1000)} aria-valuemin={0} aria-valuemax={100} className="my-2 h-2 rounded bg-stone-700"><div className="h-full rounded bg-cyan-300" style={{width:`${f.stamina/1000}%`}} /></div>
   <p>{s.village.masked?'已蒙面':'未蒙面'} · {v.pursuitText}</p>
   <p className="mt-2 text-amber-200">{v.targetId?`${v.targetId==='notice'?'街坊便笺':v.targetId==='stall'?'陈掌柜的药包':name(v.targetId)} · E ${v.targetId==='notice'?'阅读':v.targetId==='stall'?'拿取':'交互'}`:'靠近并面向角色，2米内 E 交互'}</p>
   {v.tracked?<p className="mt-2 text-emerald-200">前往{v.tracked.label} · {v.tracked.direction}<br/><span className="text-stone-400">{v.tracked.presence}；过河请走桥。</span></p>:v.noticeDistance<16&&<p className="mt-2 text-stone-300">入口便笺 {v.noticeDistance}米：靠近按 E，可记下药铺、府衙和街坊住处。M 打开地图。</p>}
   <p className="mt-1 text-stone-500">城内 {Object.keys(v.names).length} 名具名角色参与战斗与江湖事件</p>
   <p className="mt-1 text-stone-400">左键 / J 出招 · 右键 / K 按住招架 · T 威胁 · H 蒙面</p>
   <button className={`${button} mt-2`} onClick={()=>useLivingStore.getState().toggle()}>背包与江湖记录 · Tab</button>
   {v.hero.health===0&&<p className="mt-2 text-red-300">你已倒下。当前种子会保留死亡结果，可从菜单换新种子再试。</p>}
   {message&&<p aria-live="polite" className="mt-2 text-amber-200">{SERVICE_REASONS[message]??errors[message]??(/^[A-Z_]+$/.test(message)?'当前条件不满足，暂时无法执行。':message)}</p>}
  </aside>
  {panel&&<section aria-label="背包与交互" className="absolute left-4 top-28 z-20 max-h-[70vh] w-96 max-w-[92vw] overflow-y-auto rounded-xl border border-white/20 bg-stone-950/95 p-4 text-sm text-stone-100">
   <div className="flex justify-between"><h2>行囊 {v.bagCount}/6</h2><button className={button} onClick={()=>useLivingStore.getState().toggle()}>关闭</button></div>
   {!!v.places?.length&&<details className="mt-3"><summary>已知地点 · 选择方向</summary>{v.places.map(place=><button key={place.id} className={`${button} mt-2 mr-2`} onClick={()=>useLivingStore.getState().trackPlace(place.id)}>{place.label} · 约{place.distance}米</button>)}{v.tracked&&<button className={`${button} mt-2`} onClick={()=>useLivingStore.getState().trackPlace(null)}>取消指引</button>}</details>}
   {own.map(l=><div className="mt-3 border-b border-white/10 pb-2" key={l.id}><p>{item(l.itemType).name} ×{l.quantity} · {l.ownerId==='player'?'自有':`${name(l.ownerId)}所有`}</p>
    {item(l.itemType).consumable&&<InteractionButton className={button} reason={lockReason||(l.ownerId!=='player'?'物品仍属于别人':v.hero.health>=100?'气血已满':null)} onClick={()=>act('use',{lotId:l.id})}>使用</InteractionButton>}
    {item(l.itemType).equipment&&<InteractionButton className={button} reason={lockReason||(l.ownerId!=='player'?'装备仍属于别人':f.phase!=='idle'?'先结束当前动作再调整装备':null)} onClick={()=>act(loadout[item(l.itemType).equipment.slot]===l.id?'unequip':'equip',{lotId:l.id,slot:item(l.itemType).equipment.slot})}>{loadout[item(l.itemType).equipment.slot]===l.id?'卸下':'装备'}</InteractionButton>}
    {v.targetId==='merchant'&&PRICES[l.itemType]&&<InteractionButton className={`${button} ml-2`} reason={noTrade||(l.ownerId!=='player'?'物品仍属于别人':Object.values(loadout).includes(l.id)?'请先卸下装备':target.wallet<PRICES[l.itemType][1]?'掌柜的现钱不足':null)} onClick={()=>act('sell',{lotId:l.id})}>出售 {PRICES[l.itemType][1]}文</InteractionButton>}
   </div>)}
   <h3 className="mt-4 text-amber-200">{target?`${name(target.id)} · 气血 ${target.health}/${target.maxHealth}`:'面向近处角色以交互'}</h3>
   {v.targetStatus&&<p className="mt-1 text-xs text-stone-300">{v.targetStatus}</p>}
   <ConversationPanel view={v} lockReason={lockReason}/>
   {target&&<p className="mt-2 text-xs text-stone-400">{target.id.startsWith('guard')?'官府':target.id==='merchant'?'商户':'街坊'} · 攻击 {v.fighters.find(f=>f.id===target.id)?.attack} / 防御 {v.fighters.find(f=>f.id===target.id)?.defense}</p>}
   {target?.health>0&&<InteractionButton className={`${button} mt-2`} reason={threatReason} onClick={()=>act('threaten',{targetId:target.id})}>威胁索要20文</InteractionButton>}
   {v.targetId==='merchant'&&target?.health>0&&<><p className="mt-2 text-xs text-amber-200">{v.trade?.available?'药铺正在营业。':SERVICE_REASONS[v.trade?.reason]??errors[v.trade?.reason]??'暂时无法交易。'}</p>{lots.filter(l=>l.holderId==='merchant-bag'&&l.ownerId==='merchant'&&PRICES[l.itemType]).map(l=><InteractionButton key={l.id} className={`${button} mt-2 mr-2`} reason={noTrade||(v.bagCount>=6?'背包已满':v.hero.wallet<PRICES[l.itemType][0]?'铜钱不足':null)} onClick={()=>act('buy',{lotId:l.id})}>买{item(l.itemType).name} {PRICES[l.itemType][0]}文 · 余{l.quantity}</InteractionButton>)}</>}
   {v.targetId==='guard'&&own.some(l=>l.id==='medicine-parcel')&&<InteractionButton className={`${button} mt-2`} reason={lockReason||(target?.health===0?'捕快已经倒下':v.hero.wallet<20?'赔偿需要20文':null)} onClick={()=>act('settle')}>交还药包并赔偿20文</InteractionButton>}
   {v.targetId==='resident-1'&&<><InteractionButton className={`${button} mt-2 mr-2`} reason={lockReason||(target?.health===0?'柳娘已经倒下':null)} onClick={()=>act('ask_medicine')}>询问药铺在哪</InteractionButton><InteractionButton className={`${button} mt-2`} reason={lockReason||(target?.health===0?'柳娘已经倒下':s.village.aid.eventId?'柳娘已经受过救助':!med?'需要自有止血药':null)} onClick={()=>act('aid',{lotId:med?.id})}>用自有止血药救助</InteractionButton></>}
   {target?.health===0&&<><InteractionButton className={`${button} mt-2`} reason={lockReason||(!target.wallet?'身上没有铜钱':null)} onClick={()=>act('loot_money',{targetId:target.id})}>取走铜钱 {target.wallet}文</InteractionButton>{lots.filter(l=>l.holderId===target.containerId).map(l=><InteractionButton className={`${button} mt-2 mr-2`} reason={lockReason||(v.bagCount>=6?'背包已满':null)} key={l.id} onClick={()=>act('loot_item',{targetId:target.id,lotId:l.id})}>搜取{item(l.itemType).name} ×1</InteractionButton>)}</>}
   <details className="mt-4" open={reviewOpen} onToggle={e=>setReviewOpen(e.currentTarget.open)}><summary>事后因果回顾</summary><p className="my-2 text-xs text-stone-400">这里展示世界事实；附近看不到的案件和人物状态，不会成为地图上的实时追踪。</p>{events.slice(-40).map(e=><p className="my-2 text-xs" key={e.id}>{(e.at/1000).toFixed(1)}秒 · {dialogueWords[e.kind]??lifeWords[e.kind]??words[e.kind]??'记录变化'} · {name(e.actorId??e.authorityId)}{e.targetId?` → ${name(e.targetId)}`:''}{e.placeId?` · ${s.places?.definitions.find(p=>p.id===e.placeId)?.label??'原定场所'}`:''}{e.damage?` -${e.damage}气血`:''}{e.amount?` ${e.amount}文`:''}{e.subjectId===null?' · 身份不明':''}<br/><span className="text-stone-500">{e.cause?`源于：${words[events.find(source=>source.id===e.cause)?.kind]??'已记录的事件'}`:''}</span></p>)}</details>
   <details className="mt-4" open={knowledgeOpen} onToggle={e=>setKnowledgeOpen(e.currentTarget.open)}><summary>角色各自知道什么</summary>{knowledgeOpen&&Object.entries(v.names).map(([id,n])=><div key={id} className="mt-2 text-xs"><strong>{n}</strong>{s.social.knowledge.filter(k=>k.npcId===id).map(k=><p key={k.factId}>{words[s.social.facts.find(f=>f.id===k.factId)?.action]??'事件'} · {k.subjectId?name(k.subjectId):'身份不明'} · {s.social.events.find(e=>e.id===k.evidenceId)?.kind==='report'?'获知举报':'亲眼目击'}</p>)}</div>)}</details>
   {!!v.legacyEvents.length&&<details className="mt-4"><summary>迁移前药包记录（原档保留）</summary>{v.legacyEvents.map(e=><p key={e.id} className="mt-2 text-xs">{e.text}</p>)}</details>}
  </section>}
 </>
}
