const clone=v=>structuredClone(v)
const natural=n=>Number.isSafeInteger(n)&&n>=0
const statuses=['pending','showing','closed','expired','superseded']
export const ATTENTION_RULES={ordinaryIntervalMs:20000,displayMs:6000,historyLimit:80,pendingLimit:24}
export function validateAttention(saved,at) {
  if(saved===undefined)return
  if(saved?.version!==1||!natural(saved.serial)||!natural(saved.at)||saved.at>at||
    saved.lastOrdinaryAt!==null&&(!natural(saved.lastOrdinaryAt)||saved.lastOrdinaryAt>saved.at)||
    !Array.isArray(saved.entries)||saved.entries.length>ATTENTION_RULES.historyLimit||
    new Set(saved.entries.map(e=>e?.id)).size!==saved.entries.length||
    !saved.entries.every(e=>e&&typeof e.id==='string'&&/^notice:[1-9]\d*$/.test(e.id)&&natural(Number(e.id.slice(7)))&&Number(e.id.slice(7))<=saved.serial&&typeof e.text==='string'&&e.text.length>0&&e.text.length<=600&&
      typeof e.group==='string'&&e.group.length<=180&&[0,1,2,3].includes(e.priority)&&natural(e.at)&&e.at<=saved.at&&natural(e.expiresAt)&&e.expiresAt>=e.at&&
      (e.shownAt===null||natural(e.shownAt)&&e.shownAt<=saved.at)&&(e.closedAt===null||natural(e.closedAt)&&e.closedAt<=saved.at)&&
      statuses.includes(e.status)&&(e.status!=='showing'||e.shownAt!==null)&&Array.isArray(e.sourceIds)&&e.sourceIds.length<=8&&e.sourceIds.every(id=>typeof id==='string'&&id.length<=120))||
    saved.entries.filter(e=>e.status==='showing').length>1)throw new Error('提示记录无效，保留原档。')
}
/** Presentation only: this queue never changes an event, a wallet or knowledge. */
export function createAttentionQueue(saved,at=0) {
  validateAttention(saved,at)
  const data=saved?clone(saved):{version:1,serial:0,at,lastOrdinaryAt:null,entries:[]}
  let revision=0
  const showing=()=>data.entries.find(e=>e.status==='showing')
  function finish(row,status) {row.status=status;row.closedAt=data.at;revision++}
  function trim() {
    const pending=data.entries.filter(e=>e.status==='pending').sort((a,b)=>a.priority-b.priority||b.at-a.at)
    for(const row of pending.slice(ATTENTION_RULES.pendingLimit))finish(row,'superseded')
    while(data.entries.length>ATTENTION_RULES.historyLimit) {
      const index=data.entries.findIndex(e=>e.status!=='showing'&&e.status!=='pending')
      data.entries.splice(index<0?0:index,1)
    }
  }
  return {
    add(message,{priority=1,group='reply',sourceId=null,ttlMs=priority===0?15000:priority===1?60000:90000}={},now=data.at) {
      if(typeof message!=='string'||!message.trim()||!natural(now)||now<data.at||![0,1,2,3].includes(priority)||!natural(ttlMs)||!natural(now+ttlMs)||!natural(data.serial+1))return false
      data.at=now
      const text=message.slice(0,600),key=String(group).slice(0,180)
      const latest=data.entries.findLast(e=>e.group===key)
      const source=typeof sourceId==='string'&&sourceId.length<=120?sourceId:null
      if(source&&data.entries.some(e=>e.sourceIds.includes(source)))return false
      if(latest&&latest.text===text&&!source&&now-latest.at<5000)return false
      let row=data.entries.findLast(e=>e.group===key&&['pending','showing'].includes(e.status)&&now-e.at<20000)
      if(row?.status==='showing'&&row.priority>=2&&priority>=2)row=null
      if(row) {
        Object.assign(row,{text,priority:Math.min(priority,row.priority),at:now,expiresAt:now+ttlMs})
        if(source)row.sourceIds=[...new Set([...row.sourceIds,source])].slice(-8)
        if(row.status==='showing'&&row.priority===0)row.shownAt=now
      } else {
        row={id:`notice:${++data.serial}`,text,priority,group:key,at:now,expiresAt:now+ttlMs,shownAt:null,closedAt:null,status:'pending',sourceIds:source?[source]:[]}
        data.entries.push(row)
      }
      revision++;trim();return true
    },
    tick(now,{combat=false}={}) {
      if(!natural(now)||now<data.at)return
      data.at=now
      for(const row of data.entries)if(['pending','showing'].includes(row.status)&&now>=row.expiresAt)finish(row,'expired')
      let current=showing()
      if(current&&now-current.shownAt>=ATTENTION_RULES.displayMs){finish(current,'closed');current=null}
      if(current&&combat&&current.priority>=2){current.status='pending';revision++;current=null}
      const candidate=data.entries.filter(e=>e.status==='pending'&&(!combat||e.priority<2)&&
        (e.priority<2||data.lastOrdinaryAt===null||now-data.lastOrdinaryAt>=ATTENTION_RULES.ordinaryIntervalMs))
        .sort((a,b)=>a.priority-b.priority||a.at-b.at||a.id.localeCompare(b.id))[0]
      if(candidate&&(!current||candidate.priority<current.priority)) {
        if(current)finish(current,'superseded')
        candidate.status='showing';candidate.shownAt=now;candidate.closedAt=null
        if(candidate.priority>=2)data.lastOrdinaryAt=now
        revision++
      }
    },
    dismiss(id,now=data.at) {
      if(!natural(now)||now<data.at)return
      data.at=now
      const row=data.entries.find(e=>e.id===id&&['showing','pending'].includes(e.status))
      if(row)finish(row,'closed')
    },
    revision:()=>revision,
    view:()=>({current:clone(showing()??null),entries:clone([...data.entries].reverse())}),
    snapshot:()=>clone(data),
  }
}
