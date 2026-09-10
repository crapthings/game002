import InteractionButton from './InteractionButton.jsx'
import { useLivingStore } from '../stores/useLivingStore.js'
import { availableWallet } from '../game/gameplay/reservations.js'
const button='mt-2 rounded border border-white/20 px-2 py-1 text-xs disabled:opacity-35 enabled:hover:bg-white/15'
const reasons={CUSTODY_REQUIRED:'这件案子须先接受拘押处理，不能直接用钱了结',PARCEL_RETURN_REQUIRED:'请使用下方交还药包的选项',RETURN_ITEMS_REQUIRED:'需要先找回仍应归还的原财物',CLAIM_REQUIRES_REVIEW:'财物的归属还需要核对',AUTHORITY_UNINFORMED:'这位捕快掌握的证据还不足以确认赔偿',NO_NAMED_CASE:'当前没有这宗具名案件',NO_AVAILABLE_OFFICER:'当前没有可接案的捕快'}
export default function CasePanel({view,lockReason}) {
  if(!view.caseOptions?.length)return null
  const cash=availableWallet(view.state.interactions,'player'),fighter=view.fighters.find(f=>f.id==='player')
  return <section aria-label="当面处理案件" className="mt-3 rounded border border-amber-200/20 p-3 text-xs">
    <p className="text-amber-100">与{view.names[view.targetId]??'捕快'}处理眼下的案件</p>
    {view.caseOptions.map(row=><div key={row.caseId} className="mt-2 border-t border-white/10 pt-2">
      <p>{row.severity>=3?'重大案件':row.severity===2?'伤害或财物纠纷':'一般纠纷'}{row.victimId?` · ${view.names[row.victimId]??'当事人'}`:''}</p>
      {row.available?<>
        <p className="mt-1">赔偿{row.fine}文{row.amount>row.fine?`，另归还铜钱${row.amount-row.fine}文`:''}{row.items.length?`，并归还原物${row.items.reduce((n,r)=>n+r.quantity,0)}份`:''}。</p>
        <InteractionButton className={button} reason={lockReason||(fighter.phase!=='idle'?'请先收手':cash<row.amount?'可支配铜钱不足':null)}
          onClick={()=>useLivingStore.getState().request('settle_case',{targetId:view.targetId,caseId:row.caseId})}>按这件案子交还并赔偿 · {row.amount}文</InteractionButton>
      </>:<p className="mt-1 text-stone-400">{reasons[row.reason]??'尚不能完成这件案子的赔偿。'}</p>}
    </div>)}
  </section>
}
