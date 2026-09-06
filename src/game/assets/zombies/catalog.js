import wanderer from './definitions/wanderer.js'
import runner from './definitions/runner.js'
import worker from './definitions/worker.js'
import medic from './definitions/medic.js'
import firefighter from './definitions/firefighter.js'
import riot from './definitions/riot.js'
import hazmat from './definitions/hazmat.js'
import bloater from './definitions/bloater.js'
import crawler from './definitions/crawler.js'
import howler from './definitions/howler.js'

export const zombieDefinitions = [wanderer, runner, worker, medic, firefighter, riot, hazmat, bloater, crawler, howler]
export const zombieCatalog = zombieDefinitions.map(definition => ({
  assetId: `character.zombie.${definition.id}`, name: definition.name, category: 'character',
  zones: definition.zones, tags: ['zombie', ...definition.tags], description: definition.description,
  size: { width: definition.width, height: definition.height, depth: definition.depth },
}))
