import InteractionButton from './InteractionButton.jsx'
import { useLivingStore } from '../stores/useLivingStore.js'
const button='mt-2 rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-35 enabled:hover:bg-white/15'
export default function FactionPanel({view,lockReason}) {
  const info=view.factionView
  if(!info)return null
  const request=useLivingStore.getState().request,name=id=>id==='player'?'你':view.names[id]??'告示上的当事人'
  return <>
    {info.noticePlaceId&&<section className="mt-3 rounded border border-white/15 p-3 text-xs">
      <p>府衙接案处 · 悬赏告示</p>
      <InteractionButton className={button} reason={lockReason||(!info.unreadNotices?'暂时没有未读的告示':null)} onClick={()=>request('read_bounties')}>阅读此处悬赏</InteractionButton>
    </section>}
    {!!info.bounties.length&&<details className="mt-3 text-xs"><summary>读过的悬赏</summary>{info.bounties.map(row=><div key={row.bountyId} className="mt-2">
      <p>{name(row.subjectId)} · 告示约定 {row.amount} 文</p>
      <p className="text-stone-400">需实际拘押回执，找到经手捕快确认兑现；这里保留的是读告示时的约定。</p>
      {row.captureEventId&&row.issuerId===view.targetId&&<InteractionButton className={button} reason={lockReason}
        onClick={()=>request('claim_bounty',{targetId:row.issuerId,bountyId:row.bountyId,captureEventId:row.captureEventId})}>出示拘押回执领赏</InteractionButton>}
    </div>)}</details>}
    {!!info.warnings.length&&<section className="mt-3 text-xs"><p>向渡口帮说明一件自己知道的侵害</p><p className="text-stone-400">赵六只登记或拒绝请求，尚未答应替人动手，也不收取费用。</p>
      {info.warnings.map(row=><InteractionButton key={row.factId} className={button} reason={lockReason}
        onClick={()=>request('request_warning',{targetId:view.targetId,factId:row.factId})}>说明关于{name(row.subjectId)}的这件事</InteractionButton>)}
    </section>}
    {!!info.requests.length&&<details className="mt-3 text-xs"><summary>当面提出过的请求</summary>{info.requests.map(row=><p className="mt-2" key={row.id}>
      关于{name(row.subjectId)}：{row.status==='declined'?'赵六因同帮关系拒绝了请求。':'赵六记下了你的说法，未承诺后续行动。'}</p>)}</details>}
    {!!info.escortOffers?.length&&<section className="mt-3 text-xs"><p>这趟采购需要同行照应</p>{info.escortOffers.map(row=><div key={row.escortId} className="mt-2">
      <p>陪{name(row.courierId)}从装货处运回药铺，约定 {row.amount} 文。</p>
      <InteractionButton className={button} reason={lockReason} onClick={()=>request(row.known?'accept_escort':'hear_escort',{escortId:row.escortId})}>
        {row.known?'答应护送 · 去装货处接洽':'询问同行约定'}</InteractionButton>
    </div>)}</section>}
    {!!info.escorts?.length&&<details className="mt-3 text-xs" open><summary>同行约定</summary>{info.escorts.map(row=><div className="mt-2 border-t border-white/10 pt-2" key={row.escortId}>
      <p>与{name(row.courierId)}这一趟 · {({offered:'等待同行者',accepted:'先到装货处接洽',accompanying:'保持6米内随行，离队过久会中止',delivered:'货已送到，回掌柜处领钱',fulfilled:'已结清报酬',failed:'这趟护送未完成'})[row.status]}</p>
      {row.courierId==='player'&&row.status==='offered'&&<p className="text-stone-400">装货处可以等待同行者；没有接洽前离开，对方可能赶不上。</p>}
      {row.assigneeId==='player'&&['accepted','accompanying'].includes(row.status)&&<>
        <button className={button} onClick={()=>useLivingStore.getState().trackPlace(row.status==='accepted'?row.pickupPlaceId:row.returnPlaceId)}>{row.status==='accepted'?'记下装货处方向':'记下药铺方向'}</button>
        {row.status==='accepted'&&view.targetId===row.courierId&&<InteractionButton className={button} reason={lockReason} onClick={()=>request('join_escort',{escortId:row.escortId})}>在装货处接洽同行</InteractionButton>}
        <InteractionButton className={`${button} ml-2`} reason={lockReason} onClick={()=>request('cancel_escort',{escortId:row.escortId})}>结束这趟护送</InteractionButton>
      </>}
      {row.assigneeId==='player'&&row.status==='delivered'&&view.targetId===row.issuerId&&<InteractionButton className={button} reason={lockReason} onClick={()=>request('collect_escort',{escortId:row.escortId})}>领护送报酬 {row.amount} 文</InteractionButton>}
    </div>)}</details>}
  </>
}
