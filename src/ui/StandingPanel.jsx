import InteractionButton from './InteractionButton.jsx'
import { useLivingStore } from '../stores/useLivingStore.js'
import { availableWallet } from '../game/gameplay/reservations.js'
import { clockAt } from '../game/living/clock.js'
const button='mt-2 mr-2 rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-35 enabled:hover:bg-white/15'
export default function StandingPanel({view,lockReason,onReview}) {
  const info=view.standingView
  if(!info)return null
  const request=useLivingStore.getState().request,cash=availableWallet(view.state.interactions,'player'),name=id=>view.names[id]??'当事人'
  const quote=info.quote,lesson=info.training,mentor=info.issuerId==='resident-2'
  const practiceReason=lockReason||(!info.canPractice?'请在石伯住宅门口、安全地与他当面练习':null)
  return <>
    {info.issuerId&&quote?.required&&<section className="mt-3 rounded border border-emerald-200/20 p-3 text-xs">
      <p>{name(info.issuerId)}认可的履约 · {Math.min(quote.required,quote.sources.length)}/{quote.required}</p>
      <p className="mt-1 text-stone-400">不同需求的具名结算才算数，可以当面出示已有收条。</p>
      {info.records.map(record=><InteractionButton key={record.eventId} className={button} reason={lockReason}
        onClick={()=>request('present_record',{targetId:info.issuerId,eventId:record.eventId})}>出示{name(record.issuerId)}的结算收条</InteractionButton>)}
      {quote.reason==='PERSONAL_HARM_PENDING'&&<p className="mt-2 text-amber-200">他还记得未处理的侵害，需先处理并让他知道结果。</p>}
      <InteractionButton className={button} reason={lockReason||(!quote.available?'还未满足认可条件':info.recognized?'已认可':null)}
        onClick={()=>request('review_standing',{targetId:info.issuerId})}>请对方确认认可</InteractionButton>
      {info.recognized&&<p className="mt-1 text-emerald-200">{mentor?'可以商量租住和武艺入门。':'药铺自有的止血药、干粮每份优惠1文；卖价不变。'}</p>}
      {!quote.available&&info.acknowledgments.some(r=>r.issuerId===info.issuerId&&r.status==='active')&&<InteractionButton className={button} reason={lockReason}
        onClick={()=>request('review_standing',{targetId:info.issuerId})}>询问为何暂停认可</InteractionButton>}
      {mentor&&info.recognized&&<>
        <button className={button} onClick={()=>useLivingStore.getState().trackPlace(info.homePlaceId)}>记下石伯住宅的方向</button>
        <InteractionButton className={button} reason={practiceReason||(cash<5?'可支配铜钱不足5文':null)} onClick={()=>request('rent')}>{info.lease?'续租一日':'租住一日'} · 5文</InteractionButton>
        {!lesson&&<InteractionButton className={button} reason={practiceReason||(cash<5?'需要预留5文':null)} onClick={()=>request('start_training')}>武艺入门 · 30游戏分钟 / 5文</InteractionButton>}
      </>}
    </section>}
    {!!info.acknowledgments.length&&<details className="mt-3 text-xs"><summary>上次当面确认的认可</summary>{info.acknowledgments.map(row=><div key={row.issuerId} className="mt-2">
      <p>{name(row.issuerId)}：{row.status==='active'?'认可你的履约':'暂停认可，需当面处理'}。</p>
      {row.sourceEventIds.map(id=><button key={id} className={button} onClick={()=>onReview(id)}>查看这次认可的依据</button>)}
    </div>)}</details>}
    {info.lease&&<section className="mt-3 text-xs"><p>租住至{clockAt(view.state.calendar.clockOrigin,info.lease.endsAt).label}</p>
      <button className={button} onClick={()=>useLivingStore.getState().trackPlace(info.lease.placeId)}>住宅方向</button>
      <InteractionButton className={button} reason={lockReason||(!info.resting&&!info.atHome?'请到租住点歇脚':null)} onClick={()=>request(info.resting?'end_rest':'start_rest')}>{info.resting?'起身':'在门口歇脚'}</InteractionButton>
      {info.resting&&<p className="text-stone-400">正在歇脚，世界时间照常流逝；走开或遇险会结束休息。</p>}
    </section>}
    {lesson&&<section className="mt-3 text-xs"><p>武艺入门 · {Math.floor(lesson.trainedMs/1000)}/30 游戏分钟 · {({training:'正在练习',paused:'已暂停，进度保留',payment_due:'练习已足，尚待结算',completed:'已学会，基础攻击永久+2'})[lesson.status]}</p>
      <div className="my-2 h-1 rounded bg-stone-700"><div className="h-full rounded bg-emerald-300" style={{width:`${lesson.trainedMs/300}%`}}/></div>
      {lesson.status!=='completed'&&<>
        <InteractionButton className={button} reason={lesson.active?lockReason:practiceReason}
          onClick={()=>request(lesson.active?'pause_training':'resume_training')}>{lesson.active?'先暂停':'继续练习或结算'}</InteractionButton>
        <InteractionButton className={button} reason={lockReason} onClick={()=>request('cancel_training')}>取消并释放预留</InteractionButton>
      </>}
    </section>}
  </>
}
