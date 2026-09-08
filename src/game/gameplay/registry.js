import { activeEventCount,nextEventNumber } from './historyArchive.js'
import { ARRIVAL_TEMPLATES_V1 } from './content/arrivalTemplatesV1.js'
import { InventoryError,assertInventory } from './inventory.js'
import { createCombatState } from './combat.js'
import { createEquipmentState } from './equipment.js'
import { createRobberyState } from './robbery.js'

const clone=value=>structuredClone(value)
const check=(ok,code)=>{if(!ok)throw new InventoryError(code)}
const point=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=(k==='y'?1024:255))
export function physicalActorIds(state) {
  return state.registry.actors.filter(a=>a.hasBody).map(a=>a.actorId)
}
/** Only called on the coordinator's transaction candidate, after geometry proof. */
export function executeRegistry(world,catalog,command,context) {
  const definition=ARRIVAL_TEMPLATES_V1[command.templateId],body=context.body
  check(world.version===2&&world.registry?.version===1,'REGISTRY_DISABLED')
  check(command.kind==='arrive'&&definition&&command.actorId===definition.id,'UNKNOWN_ARRIVAL')
  check(Number.isSafeInteger(context.at)&&context.at>=0&&Number.isSafeInteger(context.at+100000),'INVALID_TIME')
  check(context.allowed===true&&context.geometryConfirmed===true&&typeof context.proofId==='string'&&context.proofId.length>0,'MISSING_ARRIVAL_EVIDENCE')
  check(!world.interactions.actors.some(a=>a.id===definition.id)&&!world.registry.actors.some(a=>a.actorId===definition.id),'ACTOR_ALREADY_EXISTS')
  check(point(body?.spawn)&&Number.isFinite(body.spawn.heading)&&point(body.place?.approach)&&point(body.place?.entrance)&&point(body.place?.access)&&
    typeof body.place.id==='string'&&body.place.id.startsWith('place.')&&typeof body.place.label==='string'&&
    typeof body.place.kind==='string'&&typeof body.place.public==='boolean'&&Array.isArray(body.place.hours)&&
    body.place.hours.every(h=>Number.isSafeInteger(h.startMinute)&&Number.isSafeInteger(h.endMinute)&&h.startMinute>=0&&h.endMinute<=1440&&h.endMinute>h.startMinute)&&
    typeof body.place.roadId==='string'&&Number.isFinite(body.place.heading)&&body.place.geometryConfirmed===true&&body.place.status==='confirmed'&&
    body.binding?.actorId===definition.id&&body.binding.idlePlaceId===body.place.id&&
    [body.binding.homePlaceId,body.binding.workPlaceId].every(id=>id===null||id===body.place.id)&&
    Array.isArray(body.binding.patrolPlaceIds)&&body.binding.patrolPlaceIds.every(id=>id===body.place.id),'INVALID_ARRIVAL_BODY')
  check(activeEventCount(world.registry)<4096,'HISTORY_FULL')
  const actor={id:definition.id,containerId:`${definition.id}-bag`,wallet:definition.wallet,health:definition.health,maxHealth:definition.maxHealth,
    attack:definition.attack,defense:definition.defense,courage:definition.courage}
  const event={id:`registry:${nextEventNumber(world.registry)}`,kind:'arrived',actorId:actor.id,targetId:null,cause:null,at:context.at,
    templateId:command.templateId,source:definition.source,initialWallet:actor.wallet,initialLots:clone(definition.lots),proofId:context.proofId,requestId:command.id}
  world.interactions.actors.push(actor)
  world.interactions.inventory.containers.push({id:actor.containerId,capacity:null})
  for(const [index,lot] of definition.lots.entries())world.interactions.inventory.lots.push({id:`arrival:${actor.id}:${index+1}`,itemType:lot.itemType,
    quantity:lot.quantity,ownerId:actor.id,holderId:actor.containerId})
  world.interactions.inventory.revision++
  assertInventory(world.interactions.inventory,catalog)
  world.social.actorIds.push(actor.id)
  world.combat.fighters.push(...createCombatState([actor]).fighters)
  world.equipment.loadouts.push(...createEquipmentState([actor]).loadouts)
  world.robbery.personalities.push(...createRobberyState([actor]).personalities)
  world.registry.actors.push({actorId:actor.id,hasBody:true,templateId:command.templateId,body:clone(body),sourceEventId:event.id})
  world.registry.events.push(event)
  return [clone(event)]
}
