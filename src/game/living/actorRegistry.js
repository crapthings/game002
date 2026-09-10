import { LIVING_NPCS } from './config.js'
import { ARRIVAL_TEMPLATES_V1 } from '../gameplay/content/arrivalTemplatesV1.js'

export function sceneActorDefinitions(state) {
  const extra=(state?.registry?.actors??[]).filter(a=>a.hasBody&&a.templateId).map(a=>{
    const definition=ARRIVAL_TEMPLATES_V1[a.templateId]
    return {id:a.actorId,name:definition.name,color:definition.color,model:definition.model,
      home:[a.body.place.approach.x,a.body.place.approach.z],heading:a.body.spawn.heading}
  })
  return [...LIVING_NPCS,...extra]
}
export function actorPlaceBinding(state,layout,actorId) {
  return state.places?.bindings.find(b=>b.actorId===actorId)??layout.bindings.find(b=>b.actorId===actorId)??state.registry?.actors.find(a=>a.actorId===actorId)?.body?.binding
}
export function registeredPlaces(state,layout) {
  return state.places?.definitions??[...layout.places,...(state.registry?.actors??[]).filter(a=>a.body).map(a=>a.body.place)]
}
