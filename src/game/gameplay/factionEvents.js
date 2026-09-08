import { InventoryError } from './inventory.js'
import { activeEventCount,nextEventNumber } from './historyArchive.js'
export function emitFactionAction(world,command,context,kind,extra={}) {
  if(activeEventCount(world.factions)>=4096)throw new InventoryError('HISTORY_FULL')
  const event={id:`factions:${nextEventNumber(world.factions)}`,kind,actorId:command.actorId,targetId:command.targetId??null,
    at:context.at,requestId:command.id,cause:null,...extra}
  world.factions.events.push(event);return structuredClone(event)
}
