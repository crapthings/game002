import InteractionButton from './InteractionButton.jsx'
import { useLivingStore } from '../stores/useLivingStore.js'
import { availableWallet } from '../game/gameplay/reservations.js'
const button='mt-2 mr-2 rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-35 enabled:hover:bg-white/15'
export function CustodyStatus({view}) {
  const info=view.justiceView,phase=info?.condition?.status
  if(!['incapacitated','custody'].includes(phase))return null
  const custody=info.custody,cash=availableWallet(view.state.interactions,'player')
  const lock=view.busy?'正在保存':view.stopped?'记录已暂停':null
  return <div className="mt-2 border-t border-amber-200/25 pt-2 text-amber-100" role="status">
    {phase==='incapacitated'?<p>你被制服了，仍然活着。暂时不能行动；捕快需要走到身边才能控制你。无人控制时稍后恢复意识。</p>:<>
      <p>正在接受现场拘押，涉及本次掌握的{custody.cases.length}件案件。</p>
      <p className="mt-1">可以现在认缴{custody.amount}文赔偿，或等待约{Math.ceil(Math.max(0,custody.releaseAt-view.clock)/1000)}秒世界时间。等待处理后，未付赔偿仍记为欠账。</p>
      <InteractionButton className={button} reason={lock||(cash<custody.amount?'可支配铜钱不足，可等待处理':null)}
        onClick={()=>useLivingStore.getState().request('process_custody')}>认缴本次赔偿并释放</InteractionButton>
    </>}
  </div>
}
export default function AftercarePanel({view,lockReason}) {
  const info=view.justiceView
  if(!info||!info.debts.length&&!info.claims.length&&!info.cargo.length&&!info.items?.length)return null
  const cash=availableWallet(view.state.interactions,'player'),request=useLivingStore.getState().request
  return <section aria-label="赔偿与财物善后" className="mt-3 rounded border border-white/15 p-3 text-xs">
    <p className="text-amber-100">赔偿与财物善后</p>
    {info.debts.map(row=>{const amount=row.payments.reduce((n,p)=>n+p.amount,0);return <div key={row.id} className="mt-2">
      <p>本次处理仍欠赔偿{amount}文，可当面请捕快办理。</p>
      <InteractionButton className={button} reason={lockReason||(!info.canPayDebt?'需在未蒙面时与捕快当面交涉':cash<amount?'可支配铜钱不足':null)}
        onClick={()=>request('pay_custody_debt',{debtId:row.id,targetId:view.targetId})}>结清这笔欠账 · {amount}文</InteractionButton>
    </div>})}
    {info.claims.map(row=><div key={row.id} className="mt-2"><p>保管者确认原账户欠你{row.amount}文。</p>
      <InteractionButton className={button} reason={lockReason||(availableWallet(view.state.interactions,row.accountId,row.reservationId)<row.amount?'原账户现钱不足，欠账仍保留':null)}
        onClick={()=>request('collect_estate_claim',{claimId:row.id})}>凭原回执领款</InteractionButton></div>)}
    {info.cargo.map(row=><div key={row.id} className="mt-2"><p>{row.title}：仍有原物可交回。</p>
      <InteractionButton className={button} reason={lockReason} onClick={()=>request('return_held_cargo',{opportunityId:row.id})}>当面交回仍持有的货物</InteractionButton></div>)}
    {(info.items??[]).map(row=><div key={row.id} className="mt-2"><p>本次案件还有{row.quantity}份原物待归还。</p>
      <InteractionButton className={button} reason={lockReason||(!info.canPayDebt?'需与捕快当面交涉':!row.held?'需找回原物':null)}
        onClick={()=>request('surrender_due_property',{restitutionId:row.id,targetId:view.targetId})}>交给捕快代为归还</InteractionButton></div>)}
  </section>
}
