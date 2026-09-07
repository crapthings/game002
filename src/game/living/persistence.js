import { validFog } from '../map/fog.js'
import { validStamina } from '../entities/createStamina.js'
import { validWorldTime } from '../world/createDayNightCycle.js'
import { livingConfig, LIVING_NPCS } from './config.js'
import { restoreWorldCheckpoint } from '../gameplay/worldSession.js'
const finitePoint=p=>p && ['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=(k==='y'?1024:256))
export function validateLivingSpatial(s) {
  if(!s || !finitePoint(s.player) || !Array.isArray(s.npcs) || s.npcs.length!==LIVING_NPCS.length ||
    !LIVING_NPCS.every(n=>s.npcs.filter(p=>p.id===n.id).length===1) ||
    !s.npcs.every(n=>finitePoint(n)&&Number.isFinite(n.heading)) || !finitePoint(s.stall)) throw new Error('江湖角色位置无效。')
  return s
}
export function validateLiving(saved,world) {
  if(saved?.version!==1 || !Object.hasOwn(saved,'legacy')) throw new Error('江湖新存档版本无效。')
  const config=livingConfig(saved.legacy,world)
  const restored=restoreWorldCheckpoint(config,saved.checkpoint)
  if(!restored.ok) throw new Error(`江湖记录校验失败：${restored.code}，保留原档。`)
  validateLivingSpatial(saved.spatial)
  return {config,checkpoint:restored.checkpoint}
}
// Cheap per-commit checks; full replay belongs to load. The scene session is the
// only command writer and the repository additionally CAS-checks world revision.
export function applyLivingCheckpoint(progress,event) {
  const current=progress.living, next=event.living
  if(next?.version!==1 || !Number.isSafeInteger(event.expectedSequence) ||
    (current?.checkpoint.sequence??0)!==event.expectedSequence ||
    next.checkpoint?.sequence!==event.expectedSequence+1 ||
    (current && JSON.stringify(current.legacy)!==JSON.stringify(next.legacy))) throw new Error('江湖检查点冲突，请重新读档。')
  validateLivingSpatial(next.spatial)
  if(event.fog!==undefined&&!validFog(event.fog)||event.stamina!==undefined&&!validStamina(event.stamina)||event.worldTime!==undefined&&!validWorldTime(event.worldTime))throw new Error('世界检查点无效。')
  const extras={}
  for(const key of ['stamina','worldTime'])if(event[key]!==undefined)extras[key]=structuredClone(event[key])
  if(event.fog!==undefined){extras.exploredFog={...(progress.exploredFog??{})};for(const [key,mask] of Object.entries(event.fog))extras.exploredFog[key]=(extras.exploredFog[key]??0)|mask}
  return {...progress,...extras,living:structuredClone(next),playerPosition:[next.spatial.player.x,next.spatial.player.z]}
}
