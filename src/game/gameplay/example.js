import { createCatalog, createInventory } from './inventory.js'
import { createInteractionState, executeInteraction } from './interactions.js'

// Importable integration example, not executed automatically or wired to saves.
export function createTradingExample() {
  const catalog = createCatalog([
    {id:'medicine',name:'止血药',consumable:true,healing:25},
    {id:'ration',name:'干粮',consumable:true,healing:10},
  ])
  const inventory = createInventory(catalog,{
    containers:[{id:'player-bag',capacity:6},{id:'shop-stock',capacity:null},{id:'resident-bag',capacity:6}],
    lots:[
      {id:'shop-medicine',itemType:'medicine',quantity:4,ownerId:'shopkeeper',holderId:'shop-stock'},
      {id:'player-ration',itemType:'ration',quantity:1,ownerId:'player',holderId:'player-bag'},
    ],
  })
  const state = createInteractionState(catalog,inventory,[
    {id:'player',containerId:'player-bag',wallet:100,health:60,maxHealth:100},
    {id:'shopkeeper',containerId:'shop-stock',wallet:60,health:100,maxHealth:100},
    {id:'resident',containerId:'resident-bag',wallet:40,health:50,maxHealth:100},
  ])
  return {catalog,state}
}

export function examplePurchase(state,catalog,policy) {
  return executeInteraction(state,catalog,{
    id:'purchase-1',kind:'buy',actorId:'player',targetId:'shopkeeper',
    lotId:'shop-medicine',quantity:1,expectedRevision:0,
  },policy)
}
