import { LIVING_NPCS } from './config.js'

export const SCALE_RESIDENTS=['resident-4','resident-5','resident-6']
export function validatePopulation(saved,ids) {
  if(saved===undefined)return
  const allowed=saved?.target===7?LIVING_NPCS.map(n=>n.id):[...LIVING_NPCS.map(n=>n.id),'supplier-1','gang-1',...(saved?.target===12?SCALE_RESIDENTS:[])]
  if(saved?.version!==1||![7,9,12].includes(saved.target)||ids.some(id=>!allowed.includes(id)))throw new Error('人口观察档案不匹配，保留原档。')
}
/** Only a new world can opt into a development comparison. Old saves retain
 * their original bodies and the normal nine-person arrival policy. */
export function populationProfile(progress,search='',development=false) {
  if(progress.living?.population)return structuredClone(progress.living.population)
  const target=!progress.living&&!progress.ledger&&development?Number(new URLSearchParams(search).get('livingPopulation')):9
  return {version:1,target:[7,12].includes(target)?target:9}
}
