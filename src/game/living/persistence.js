import { validFog } from '../map/fog.js'
import { validStamina } from '../entities/createStamina.js'
import { validWorldTime } from '../world/createDayNightCycle.js'
import { livingConfig, LIVING_NPCS } from './config.js'
import { restoreWorldCheckpoint } from '../gameplay/worldSession.js'
import { validateAttention } from './attentionQueue.js'
import { validateCadence } from './lifeCadence.js'
import { validatePopulation } from './populationProfile.js'
const finitePoint=p=>p && ['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=(k==='y'?1024:256))
const placeIds=['place.medicine','place.market-neighbor','place.yamen-desk','place.yamen-patrol','place.home-liu','place.home-shi','place.central-contact']
export function validateCityLayout(layout) {
  if(layout?.version!==1||!finitePoint(layout.parcelSpot)||!finitePoint(layout.notice)||layout.places?.length!==placeIds.length||layout.bindings?.length!==LIVING_NPCS.length||
    !placeIds.every(id=>layout.places.filter(p=>p.id===id).length===1)||
    !layout.places.every(p=>p.status==='confirmed'&&p.geometryConfirmed===true&&finitePoint(p.approach)&&finitePoint(p.entrance)&&finitePoint(p.access)&&
      Number.isFinite(p.heading)&&typeof p.label==='string'&&typeof p.roadId==='string'&&typeof p.fallback==='boolean'&&
      (p.buildingId===null||typeof p.buildingId==='string')&&(p.parcelId===null||typeof p.parcelId==='string'))||
    !LIVING_NPCS.every(n=>layout.bindings.filter(b=>b.actorId===n.id).length===1)||
    !layout.bindings.every(b=>placeIds.includes(b.idlePlaceId)&&[b.homePlaceId,b.workPlaceId].every(id=>id===null||placeIds.includes(id))&&
      Array.isArray(b.patrolPlaceIds)&&b.patrolPlaceIds.length<=4&&b.patrolPlaceIds.every(id=>placeIds.includes(id))))throw new Error('城内场所绑定无效，保留原档。')
  return layout
}
function validateCityEnvelope(saved) {
  validateCityLayout(saved.layout)
  const bodyIds=saved.checkpoint.gameplay.registry?.actors.filter(a=>a.hasBody&&a.actorId!=='player').map(a=>a.actorId)??LIVING_NPCS.map(n=>n.id)
  if(!Array.isArray(saved.clues)||saved.clues.length>placeIds.length||new Set(saved.clues.map(c=>c.placeId)).size!==saved.clues.length||
    !saved.clues.every(c=>placeIds.includes(c.placeId)&&['notice:city-v1','conversation:resident-1'].includes(c.source)&&Number.isSafeInteger(c.at)&&c.at>=0)||
    ![0,1].includes(saved.migration?.fromVersion)||!Array.isArray(saved.travels)||saved.travels.length>bodyIds.length||
    !saved.travels.every(t=>bodyIds.includes(t.actorId)&&typeof t.intentId==='string'&&t.intentId.length<=100&&
      finitePoint({...t.destination,y:t.destination?.y??0})&&Number.isFinite(t.stop)&&t.stop>=0&&t.stop<=3)||
    new Set(saved.travels.map(t=>t.actorId)).size!==saved.travels.length||
    !saved.patrols||typeof saved.patrols!=='object'||Array.isArray(saved.patrols)||
    !Object.entries(saved.patrols).every(([id,p])=>bodyIds.includes(id)&&Number.isSafeInteger(p.index)&&p.index>=0&&p.index<4&&Number.isSafeInteger(p.until)&&p.until>=0))throw new Error('城内行动记录无效，保留原档。')
}
export function validateLivingSpatial(s,bodyActorIds=LIVING_NPCS.map(n=>n.id)) {
  if(!s || !finitePoint(s.player) || !Array.isArray(s.npcs) || s.npcs.length!==bodyActorIds.length ||
    !bodyActorIds.every(id=>s.npcs.filter(p=>p.id===id).length===1) ||
    !s.npcs.every(n=>finitePoint(n)&&Number.isFinite(n.heading)) || !finitePoint(s.stall)) throw new Error('江湖角色位置无效。')
  return s
}
export function validateLivingEnvelope(saved) {
  if(![1,2,3,4].includes(saved?.version) || !Object.hasOwn(saved,'legacy') ||
    (saved.version>=3?saved.checkpoint?.gameplay.version!==2:saved.checkpoint?.gameplay.version!==1)||
    (saved.version===4)!==!!saved.checkpoint?.gameplay.archive?.history) throw new Error('江湖新存档版本无效。')
  const bodyIds=saved.checkpoint.gameplay.registry?.actors.filter(a=>a.hasBody&&a.actorId!=='player').map(a=>a.actorId)
  validateLivingSpatial(saved.spatial,bodyIds)
  validateAttention(saved.attention,saved.checkpoint.simulationAt)
  validateCadence(saved.cadence,saved.checkpoint.simulationAt,bodyIds??LIVING_NPCS.map(n=>n.id))
  validatePopulation(saved.population,bodyIds??LIVING_NPCS.map(n=>n.id))
  if(saved.version>=2)validateCityEnvelope(saved)
}
export function validateLiving(saved,world) {
  validateLivingEnvelope(saved)
  const config=livingConfig(saved.legacy,world)
  const restored=restoreWorldCheckpoint(config,saved.checkpoint)
  if(!restored.ok) throw new Error(`江湖记录校验失败：${restored.code}，保留原档。`)
  const bodyIds=restored.checkpoint.gameplay.registry?.actors.filter(a=>a.hasBody&&a.actorId!=='player').map(a=>a.actorId)
  validateLivingSpatial(saved.spatial,bodyIds)
  if(saved.version>=2)validateCityEnvelope(saved)
  return {config,catalog:restored.catalog,checkpoint:restored.checkpoint}
}
// Cheap per-commit checks; full replay belongs to load. The scene session is the
// only command writer and the repository additionally CAS-checks world revision.
export function applyLivingCheckpoint(progress,event) {
  const current=progress.living, next=event.living
  if(![1,2,3,4].includes(next?.version) || (current&&next.version<current.version) || !Number.isSafeInteger(event.expectedSequence) ||
    (current?.checkpoint.sequence??0)!==event.expectedSequence ||
    next.checkpoint?.sequence!==event.expectedSequence+1 ||
    (current && JSON.stringify(current.legacy)!==JSON.stringify(next.legacy))) throw new Error('江湖检查点冲突，请重新读档。')
  const bodyIds=next.checkpoint.gameplay.registry?.actors.filter(a=>a.hasBody&&a.actorId!=='player').map(a=>a.actorId)
  validateLivingSpatial(next.spatial,bodyIds)
  validateAttention(next.attention,next.checkpoint.simulationAt)
  validateCadence(next.cadence,next.checkpoint.simulationAt,bodyIds??LIVING_NPCS.map(n=>n.id))
  validatePopulation(next.population,bodyIds??LIVING_NPCS.map(n=>n.id))
  if(current&&(current.population?.target??9)!==(next.population?.target??9))throw new Error('不能在已有种子中切换人口观察条件，保留原档。')
  if(next.version>=2) {
    validateCityEnvelope(next)
    if(current?.version>=2&&(JSON.stringify(current.layout)!==JSON.stringify(next.layout)||JSON.stringify(current.migration)!==JSON.stringify(next.migration)))throw new Error('城内布局发生冲突，请重新读档。')
  }
  if(event.fog!==undefined&&!validFog(event.fog)||event.stamina!==undefined&&!validStamina(event.stamina)||event.worldTime!==undefined&&!validWorldTime(event.worldTime))throw new Error('世界检查点无效。')
  const extras={}
  for(const key of ['stamina','worldTime'])if(event[key]!==undefined)extras[key]=structuredClone(event[key])
  if(event.fog!==undefined){extras.exploredFog={...(progress.exploredFog??{})};for(const [key,mask] of Object.entries(event.fog))extras.exploredFog[key]=(extras.exploredFog[key]??0)|mask}
  return {...progress,...extras,living:structuredClone(next),playerPosition:[next.spatial.player.x,next.spatial.player.z]}
}
