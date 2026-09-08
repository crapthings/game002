import { InventoryError } from './inventory.js'

const copy=value=>structuredClone(value)
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const natural=n=>Number.isSafeInteger(n)&&n>=0
export const HISTORY_DOMAINS=['interactions','social','combat','equipment','property','robbery','crime','pursuit','village','registry','places','life','dialogue','opportunities','relations','economy']
// Version 1 only evicts routine records which no current rule projection needs.
// Offences, ownership changes, promises and personal evidence remain indexed.
// This list is a saved rule: later compaction policies need a new page version.
const routine=new Set(['activity_changed','activity_arrived','activity_interrupted','activity_resumed','place_status_changed',
  'attack_started','guard_started','guard_released','guard_exhausted','guard_broken','sight','lost','mask',
  'labor_started','labor_accrued','labor_paused','wage_paid','wage_payment_due','ate_food','exchange_meeting_ended'])
const pages=new Map()

export function historyCanonical(value,depth=0) {
  check(depth<40,'INVALID_JSON')
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value)
  if(typeof value==='number'){check(Number.isFinite(value),'INVALID_JSON');return JSON.stringify(value)}
  if(Array.isArray(value))return `[${Array.from(value,v=>historyCanonical(v,depth+1)).join(',')}]`
  check(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'INVALID_JSON')
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${historyCanonical(value[k],depth+1)}`).join(',')}}`
}
export const activeEventCount=state=>state.events.length-(state.history?.retainedCount??0)
export function nextEventNumber(state) {
  const value=(state.history?.eventSerial??0)+activeEventCount(state)+1
  check(natural(value),'REVISION_OVERFLOW');return value
}
export function findReceipt(state,requestId) {
  return state.receipts.find(r=>r.requestId===requestId)??
    (Object.hasOwn(state.history?.receiptIndex??{},requestId)?state.history.receiptIndex[requestId]:undefined)
}
export function installHistoryPages(archiveId,entries) {
  check(typeof archiveId==='string'&&archiveId.length<=100&&Array.isArray(entries),'INVALID_ARCHIVE')
  // Installing bytes grants no trust. restoreGameplay must replay every page.
  const index=new Map(pages.get(archiveId)??[])
  for(const entry of entries){check(entry?.archiveId===archiveId&&entry.version===1&&natural(entry.index),'INVALID_ARCHIVE_PAGE');index.set(entry.index,copy(entry))}
  pages.set(archiveId,index)
}
export function historyPage(archiveId,index,provided=[]) {
  const entry=provided.find(p=>p.archiveId===archiveId&&p.index===index)??pages.get(archiveId)?.get(index)
  check(entry,'HISTORY_PAGE_MISSING');return copy(entry)
}
export function archivedRequest(state,requestId) {
  const archive=state.archive?.history
  if(!archive||!Object.hasOwn(archive.requestIndex,requestId))return null
  const ref=archive.requestIndex[requestId],page=historyPage(archive.id,ref.page)
  const request=page.journal[ref.position]
  check(request?.id===requestId,'INVALID_ARCHIVE_RECEIPT');return request
}
export function shouldArchive(state) {
  return state?.version===2&&state.journal.length>0&&(state.journal.length>=512||
    HISTORY_DOMAINS.some(domain=>state[domain]?.events&&activeEventCount(state[domain])>=1024))
}
function collectReferences(value,found) {
  if(typeof value==='string'){found.add(value);return}
  if(!value||typeof value!=='object')return
  if(Array.isArray(value)){for(const child of value)collectReferences(child,found);return}
  for(const [key,child] of Object.entries(value))if(!['events','receipts','history','journal','archive','facts'].includes(key))collectReferences(child,found)
}
/** Pure compaction. It neither writes storage nor publishes a candidate. */
export function compactGameplay(source,archiveId) {
  check(source?.version===2&&source.journal.length>0,'ARCHIVE_NOT_DUE')
  check(typeof archiveId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/.test(archiveId),'INVALID_ARCHIVE_ID')
  const current=source.archive.history
  check(!current||current.version===1&&current.id===archiveId,'INVALID_ARCHIVE')
  const index=current?.pages.length??0,events=[],receipts={}
  for(const domain of HISTORY_DOMAINS)if(source[domain]?.events) {
    events.push(...source[domain].events.slice(source[domain].history?.retainedCount??0).map(event=>({domain,event:copy(event)})))
    if(source[domain].receipts)receipts[domain]=copy(source[domain].receipts)
  }
  const page={version:1,archiveId,index,fromRevision:current?.pages.at(-1)?.throughRevision??source.archive.legacyCheckpoint.gameplay.revision,
    throughRevision:source.revision,at:source.at,journal:copy(source.journal),events,receipts}
  const descriptor={index,fromRevision:page.fromRevision,throughRevision:page.throughRevision,at:page.at,requestCount:page.journal.length,
    ranges:HISTORY_DOMAINS.flatMap(domain=>{
      const rows=events.filter(e=>e.domain===domain),numbered=rows.filter(row=>/^[^:]+:\d+$/.test(row.event.id))
      return rows.length?[{domain,firstId:numbered[0]?.event.id??null,lastId:numbered.at(-1)?.event.id??null,count:rows.length,
        otherIds:rows.filter(row=>!/^[^:]+:\d+$/.test(row.event.id)).map(row=>row.event.id)}]:[]
    })}
  const next=copy(source),refs=new Set()
  collectReferences(source,refs)
  // Crime assessment groups an injury under its actual swing. Losing that
  // ancestor would change incident IDs on a later report and could reopen a
  // settled case. Keep the complete rule ancestry of retained offence facts.
  const legalEvents=['combat','robbery','property','village'].flatMap(domain=>source[domain]?.events??[])
  const legalIndex=new Map(legalEvents.map(event=>[event.id,event]))
  for(const event of legalEvents)if(!routine.has(event.kind)) {
    let current=event;const visited=new Set()
    while(current&&!visited.has(current.id)){visited.add(current.id);refs.add(current.id);current=legalIndex.get(current.cause)}
  }
  const known=new Set(source.social.knowledge.map(k=>k.factId))
  // Preserve first/most recent records for existing adapters using findLast,
  // plus all explicit projection references. Ancestry remains in page storage.
  for(const domain of HISTORY_DOMAINS)if(next[domain]?.events) {
    const state=next[domain],original=source[domain],last=new Map()
    for(const event of original.events)last.set(JSON.stringify([event.kind,event.actorId??event.authorityId??null,event.targetId??event.subjectId??null]),event.id)
    const latest=new Set(last.values()),serial=nextEventNumber(original)-1
    state.events=original.events.filter((event,i)=>i===0||refs.has(event.id)||latest.has(event.id)||!routine.has(event.kind)).map(copy)
    state.history={version:1,eventSerial:serial,retainedCount:state.events.length,receiptIndex:copy(original.history?.receiptIndex??{})}
    if(original.receipts) {
      for(const receipt of original.receipts)state.history.receiptIndex[receipt.requestId]=copy(receipt)
      state.receipts=[]
    }
  }
  // Unknown routine facts cannot be retrospectively witnessed by a live adapter.
  // Identified and anonymous memories both pin their facts and evidence.
  next.social.facts=source.social.facts.filter(f=>known.has(f.id)||refs.has(f.id)||refs.has(f.eventId)||refs.has(f.sourceEventId)||!routine.has(f.action)).map(copy)
  const factIds=new Set(next.social.facts.map(f=>f.id))
  next.social.events=source.social.events.filter(e=>e.kind!=='fact'||factIds.has(e.fact.id)).map(copy)
  next.social.history.retainedCount=next.social.events.length
  const requestIndex=copy(current?.requestIndex??{})
  for(const [position,request] of page.journal.entries()) {
    check(!Object.hasOwn(requestIndex,request.id),'INVALID_ARCHIVE_RECEIPT')
    requestIndex[request.id]={page:index,position}
  }
  next.archive={...next.archive,version:2,history:{version:1,id:archiveId,pages:[...copy(current?.pages??[]),descriptor],requestIndex}}
  next.journal=[]
  return {state:next,page}
}

export function historyPageForEvent(state,eventId) {
  const special=state.archive?.history?.pages.find(page=>page.ranges.some(range=>range.otherIds.includes(eventId)))
  if(special)return special.index
  const match=/^([^:]+):(\d+)$/.exec(eventId??'')
  if(!match)return null
  const domain={interaction:'interactions',opportunity:'opportunities',social:'social'}[match[1]]??match[1],serial=Number(match[2])
  return state.archive?.history?.pages.find(page=>page.ranges.some(range=>range.domain===domain&&
    range.firstId!==null&&Number(range.firstId.split(':').at(-1))<=serial&&Number(range.lastId.split(':').at(-1))>=serial))?.index??null
}
