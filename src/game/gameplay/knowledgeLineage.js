export const SHAREABLE_ACTIONS=new Set(['aid','reward','take','threatened','robbed','damaged','parried','died','loot_item','loot_money','case_settled'])
const indexes=new WeakMap()
export function evidenceDepth(social,evidenceId) {
  let index=indexes.get(social)
  if(!index||index.size!==social.events.length){index={size:social.events.length,events:new Map(social.events.map(e=>[e.id,e])),depths:new Map()};indexes.set(social,index)}
  if(index.depths.has(evidenceId))return index.depths.get(evidenceId)
  let id=evidenceId,depth=0;const seen=new Set(),events=index.events
  while(id&&!seen.has(id)) {
    seen.add(id);const event=events.get(id)
    if(event?.kind==='witness'){index.depths.set(evidenceId,depth);return depth}
    if(event?.kind!=='report')return Infinity
    depth++;id=event.cause
  }
  return Infinity
}
