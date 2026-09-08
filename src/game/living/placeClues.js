import { isExplored } from '../map/fog.js'
import { distance } from './geometry.js'

export const CITY_NOTICE_TEXT='商街陈记药铺售药；柳娘在居民区住处养伤；石伯常在自家门口，小何在中心商区；药包纠纷可到府衙找捕快。'
const destinations=[['place.medicine','merchant'],['place.yamen-desk','guard'],['place.home-liu','resident-1'],['place.home-shi','resident-2'],['place.central-contact','resident-3']]
export function readCityNotice(previous,at) {
  const known=new Set(previous.map(c=>c.placeId))
  return [...previous,...destinations.filter(([id])=>!known.has(id)).map(([placeId])=>({placeId,source:'notice:city-v1',at}))]
}
export function learnPlace(previous,placeId,source,at) {
  if(previous.some(c=>c.placeId===placeId))return previous
  return [...previous,{placeId,source,at}]
}
/** All markers are fixed places. This projection never receives NPC positions. */
export function placeClues(layout,known,fog,player,presence={},temporaryStall=null) {
  const result=[]
  for(const [id,actorId] of destinations) {
    const place=layout.places.find(p=>p.id===id),explored=isExplored(fog,place.approach.x,place.approach.z)
    const clue=known.find(c=>c.placeId===id)
    if(!explored&&!clue)continue
    result.push({id,label:place.label,actorId,point:{...place.approach},explored,source:clue?.source??'exploration',
      distance:Math.round(distance(player,place.approach)),presence:presence[id]??'通常在此'})
  }
  if(temporaryStall&&isExplored(fog,temporaryStall.x,temporaryStall.z)&&distance(temporaryStall,layout.parcelSpot)>.1) {
    result.push({id:'temporary-stall',label:'药包临时存放处',point:{...temporaryStall},explored:true,source:'exploration',
      distance:Math.round(distance(player,temporaryStall)),presence:'药包仍在原处'})
  }
  return result
}
export function destinationDirection(player,marker) {
  const angle=Math.atan2(marker.point.x-player.x,marker.point.z-player.z)
  const names=['北','东北','东','东南','南','西南','西','西北']
  return `${names[(Math.round(angle/(Math.PI/4))+8)%8]}方 · 直线约${Math.round(distance(player,marker.point))}米`
}
