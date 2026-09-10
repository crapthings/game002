import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createNpcModel } from '../npcs/createNpcModel.js'
import { bodyMoveClear,bodySupportHeight } from '../entities/bodyCollision.js'
import { createLivingSimulation } from './simulation.js'
import { createCombatInput } from './createCombatInput.js'
import { validateLiving } from './persistence.js'
import { prepareCityLayout } from './prepareCityLayout.js'
import { resolveRoleHomes,resolveSupplierPlace,resolveGangPlace,resolvePopulationHomes } from './cityPlaces.js'
import { createCityTravel } from './createCityTravel.js'
import { CITY_NOTICE_TEXT, readCityNotice, placeClues, destinationDirection } from './placeClues.js'
import { clockAt } from './clock.js'
import { sceneActorDefinitions, actorPlaceBinding, registeredPlaces } from './actorRegistry.js'
import { createPresentationSelectors } from './presentationSelectors.js'
import { LIVING_NPCS } from './config.js'
import { distance,facingAngle } from './geometry.js'
import { wantedFor,pursuitFor } from '../gameplay/index.js'
import { useLivingStore } from '../../stores/useLivingStore.js'
import { useGameStore } from '../../stores/useGameStore.js'
import { useWorldStore } from '../../stores/useWorldStore.js'
import { useNavigationStore } from '../../stores/useNavigationStore.js'
import { createAttentionQueue } from './attentionQueue.js'
import { attentionMessages } from './attentionMessages.js'
import { populationProfile,SCALE_RESIDENTS } from './populationProfile.js'
const copy=v=>structuredClone(v)
export function createLivingScene(scene,plan,world,player,progress,extras=()=>({})) {
  let simulation=null,spatial=null,disposed=false,closing=false,retry=0,selected=null,lastSequence=-1
  let lastPublishedAt=-Infinity,lastPublishedState=null,lastPublishedBusy=null,lastPublishedStopped=null
  const models=new Map(),resources=[],flashes=new Map()
  const presentWorld=createPresentationSelectors()
  let definitionsState=null,definitionsCache=LIVING_NPCS
  const npcDefinitions=()=>{const state=simulation?.state();if(state&&state!==definitionsState){definitionsState=state;definitionsCache=sceneActorDefinitions(state)}return definitionsCache}
  const canvas=scene.getEngine().getRenderingCanvas(),store=()=>useLivingStore.getState()
  store().reset()
  const saved=progress.living,legacy=saved?saved.legacy:progress.ledger??null
  if(saved){validateLiving(saved,plan);spatial=copy(saved.spatial)}
  const population=populationProfile(progress,window.location.search,import.meta.env.DEV)
  const attention=createAttentionQueue(saved?.attention,saved?.checkpoint.simulationAt??0)
  let attentionRevision=-1
  function notify(message,detail={}) {
    if(!simulation){store().notify(message);return}
    const failure=typeof message==='string'&&/^[A-Z_]+$/.test(message)
    attention.add(message,{priority:failure?0:1,group:failure?`error:${message}`:'reply',...detail},simulation.clock())
  }
  function presentAttention() {
    if(!simulation)return
    const fights=simulation.view(),hero=fights.find(f=>f.id==='player')
    const active=['windup','active','recovery','guard','broken','incapacitated','custody']
    const combat=active.includes(hero?.phase)||fights.some(f=>f.id!=='player'&&active.includes(f.phase)&&visible('player',f.id)&&distance(point('player'),point(f.id))<12)
    attention.tick(simulation.clock(),{combat})
    if(attention.revision()!==attentionRevision){attentionRevision=attention.revision();store().setAttention(attention.view())}
  }
  store().setDismissNotice(id=>{attention.dismiss(id,simulation?.clock());presentAttention()})
  let cityLayout=saved?.version>=2?copy(saved.layout):null
  const preparing=cityLayout?null:prepareCityLayout(plan,world),patrols=copy(saved?.patrols??{})
  const migration=copy(saved?.migration??{fromVersion:saved?1:0})
  let clues=copy(saved?.clues??[]),pendingClues=null
  let housing=null,housingMessage=null
  let supplierPlace=null,supplierMessage=null
  let gangPlace=null,gangMessage=null
  let populationPlaces=null,populationMessage=null
  const point=id=>id==='player'?{x:player.root.position.x,y:player.root.position.y,z:player.root.position.z,heading:player.root.rotation.y}:id==='stall'?spatial.stall:id==='relocation'?cityLayout.parcelSpot:id==='notice'?cityLayout.notice:spatial.npcs.find(n=>n.id===id)
  const loaded=p=>world.isLoaded(p.x,p.z)
  const bodyReady=p=>loaded(p)&&(world.bodyLocationStatus?.(p.x,p.y,p.z)??'ready')==='ready'
  function clear(a,b,r=.06) {
    if(!loaded(a)||!loaded(b))return false
    const count=Math.max(1,Math.ceil(distance(a,b)/.15))
    for(let i=0;i<=count;i++) {const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t
      if(!(world.canTraverse?.(x,z,y+.5,r)??world.canMove(x,z,r)))return false}
    return true
  }
  const alive=id=>simulation?.state().interactions.actors.find(a=>a.id===id)?.health>0
  const body=id=>({...point(id),height:alive(id)?1.75:.25})
  const bodies=exclude=>spatial?spatial.npcs.filter(n=>n.id!==exclude&&models.get(n.id)?.model.root.isEnabled()&&bodyReady(n)).map(n=>body(n.id)):[]
  function visible(a,b,identify=false) {
    const p=point(a),q=point(b)
    return p&&q&&distance(p,q)<=(identify?8:12)&&Math.abs(p.y-q.y)<2.5&&Math.abs(facingAngle(p,q))<=60&&
      (b==='player'||models.get(b)?.model.root.isEnabled()&&bodyReady(q))&&(a==='player'||models.get(a)?.model.root.isEnabled()&&bodyReady(p))&&clear(p,q)
  }
  const travel=createCityTravel({world,point,clock:()=>simulation?.clock()??0,canAdvance:()=>!closing&&!disposed&&simulation?.canAdvance(),
    bodies:id=>[...spatial.npcs.filter(n=>n.id!==id).map(n=>body(n.id)),body('player')]})
  const walkable=(x,z)=>world.navigationData.canMove(x,z,.36)||(world.isLoaded(x,z)&&world.canMove(x,z,.36))
  const move=(id,target,dt,stop=1.2)=>travel.move(id,target,dt,stop)
  const contactClear=(a,b)=>loaded(a)&&loaded(b)?clear(a,b):travel.clearGround(a,b,.06)
  const bodyPresent=id=>id==='player'||!spatial.npcs.some(n=>n.id===id)||(loaded(point(id))?!!models.get(id)?.model.root.isEnabled()&&bodyReady(point(id)):travel.clearGround(point(id),point(id),.35))
  const canMaterialize=id=>bodyMoveClear(point(id),point(id),[body('player'),...bodies(id)],{radius:.35,height:alive(id)?1.75:.25})
  function initialSpatial() {
    const ground=anchor=>({x:anchor[0],y:world.terrain.surfaceHeight(anchor[0],anchor[1]),z:anchor[1]})
    const npcs=LIVING_NPCS.map(n=>{
      const old=legacy?.npcs.find(p=>p.id===n.id),binding=cityLayout.bindings.find(b=>b.actorId===n.id),place=cityLayout.places.find(p=>p.id===binding.idlePlaceId)
      return {...(legacy?ground(old?.position??n.home):copy(place.approach)),id:n.id,heading:legacy?(old?.heading??n.heading):place.heading}
    })
    return {player:point('player'),stall:legacy?ground(legacy.item.position):copy(cityLayout.parcelSpot),npcs}
  }
  function idle(id,dt,at) {
    const binding=actorPlaceBinding(simulation.state(),cityLayout,id),patrol=binding.patrolPlaceIds
    const state=patrols[id]??{index:0,until:0}
    const place=registeredPlaces(simulation.state(),cityLayout).find(p=>p.id===(patrol.length?patrol[state.index%patrol.length]:binding.idlePlaceId))
    if(distance(point(id),place.approach)>1)move(id,place.approach,dt,.8)
    else {
      travel.cancelTravel(`move:${id}`)
      if(patrol.length) {
        if(!state.until)state.until=at+6000
        else if(at>=state.until){state.index=(state.index+1)%patrol.length;state.until=0}
        patrols[id]=state
      }
      point(id).heading+=dt*.25*Math.sin(at/2200+npcDefinitions().findIndex(n=>n.id===id))
    }
  }
  function prepareHomes() {
    const state=simulation.state()
    if(state.life||!state.places)return
    if(!housing)housing=prepareCityLayout(plan,world,{extra:true,candidates:resolveRoleHomes(plan),knownPlaces:state.places.definitions})
    housing.update()
    const status=housing.status()
    if(status.status==='blocked'&&housingMessage!==status.reason){housingMessage=status.reason;notify(`住处暂未确认：${status.reason}`,{priority:1,group:'place:housing'})}
  }
  function lifeSetup() {
    const ready=housing?.result()
    if(!ready)return null
    const definitions=ready.places,bindings=copy(simulation.state().places.bindings)
    for(const binding of bindings) {
      const home=definitions.find(p=>p.id===`place.home-${binding.actorId}`)
      if(home)binding.homePlaceId=home.id
    }
    return {definitions,bindings}
  }
  function prepareSupplier() {
    const state=simulation.state()
    if(!state.economy||state.registry.actors.some(a=>a.actorId==='supplier-1'))return
    if(!supplierPlace)supplierPlace=prepareCityLayout(plan,world,{extra:true,owner:'city-supplier',candidates:resolveSupplierPlace(plan),knownPlaces:state.places.definitions})
    supplierPlace.update()
    const status=supplierPlace.status()
    if(status.status==='blocked'&&supplierMessage!==status.reason){supplierMessage=status.reason;notify(`货郎的停靠地点尚未确认：${status.reason}`,{priority:1,group:'place:supplier'})}
  }
  function supplierSetup() {
    return confirmedArrival(supplierPlace,'supplier-1')
  }
  function prepareGang() {
    const state=simulation.state()
    if(!state.factions||state.registry.actors.some(a=>a.actorId==='gang-1'))return
    if(!gangPlace)gangPlace=prepareCityLayout(plan,world,{extra:true,owner:'city-river-member',candidates:resolveGangPlace(plan),knownPlaces:state.places.definitions})
    gangPlace.update()
    const status=gangPlace.status()
    if(status.status==='blocked'&&gangMessage!==status.reason){gangMessage=status.reason;notify(`渡口会面处尚未确认：${status.reason}`,{priority:1,group:'place:gang'})}
  }
  function gangSetup() {
    return confirmedArrival(gangPlace,'gang-1')
  }
  function preparePopulation() {
    if(population.target!==12||!simulation.state().relations?.dailyVersion||SCALE_RESIDENTS.every(id=>simulation.state().registry.actors.some(a=>a.actorId===id)))return
    if(!populationPlaces) {
      const missing=new Set(SCALE_RESIDENTS.filter(id=>!simulation.state().registry.actors.some(a=>a.actorId===id)).map(id=>`place.home-${id}`))
      const resolved=resolvePopulationHomes(plan),candidates={...resolved,places:resolved.places.filter(p=>missing.has(p.id)),unresolved:resolved.unresolved.filter(p=>p.placeId===null||missing.has(p.placeId))}
      populationPlaces=prepareCityLayout(plan,world,{extra:true,owner:'population-homes',candidates,knownPlaces:registeredPlaces(simulation.state(),cityLayout)})
    }
    populationPlaces.update()
    const status=populationPlaces.status()
    if(status.status==='blocked'&&populationMessage!==status.reason){populationMessage=status.reason;notify('扩展街坊的住处暂未确认，保留已到达的人物。',{priority:1,group:'place:population'})}
  }
  function populationSetup() {
    const id=SCALE_RESIDENTS.find(id=>!simulation.state().registry.actors.some(a=>a.actorId===id))
    const body=id&&confirmedArrival(populationPlaces,id,`place.home-${id}`)
    return body?{actorId:id,body}:null
  }
  function confirmedArrival(prepared,actorId,placeId=null) {
    const place=placeId?prepared?.result()?.places.find(p=>p.id===placeId):prepared?.result()?.places[0]
    if(!place)return null
    if([point('player'),...spatial.npcs].some(p=>distance(p,place.approach)<2))return null
    if(registeredPlaces(simulation.state(),cityLayout).some(p=>p.id!==place.id&&distance(p.approach,place.approach)<2))return null
    return {spawn:{...copy(place.approach),heading:place.heading},place:copy(place),
      binding:{actorId,homePlaceId:place.id,workPlaceId:place.id,idlePlaceId:place.id,patrolPlaceIds:[]}}
  }
  function atPlace(id,placeId) {
    const place=registeredPlaces(simulation.state(),cityLayout).find(p=>p.id===placeId),p=point(id)
    return !!place&&distance(p,place.approach)<=1&&Math.abs(p.y-place.approach.y)<.5&&contactClear(p,place.approach)
  }
  function routine(id,intent,dt,at) {
    if(intent.phase==='interacting'&&(intent.kind==='patrol'||id==='witness'&&intent.kind==='social')){idle(id,dt,at);return}
    const place=registeredPlaces(simulation.state(),cityLayout).find(p=>p.id===intent.placeId)
    if(!place)return
    if(!atPlace(id,intent.placeId))travel.move(id,place.approach,dt,.8,intent.id)
    else point(id).heading+=dt*.2*Math.sin(at/2200+npcDefinitions().findIndex(n=>n.id===id))
  }
  function label(root,text,color) {
    const texture=new DynamicTexture('living-label',{width:512,height:96},scene,false);texture.hasAlpha=true
    texture.drawText(text,null,64,'bold 32px sans-serif',color,'transparent',true)
    const mat=new StandardMaterial('living-label',scene);mat.diffuseTexture=texture;mat.useAlphaFromDiffuseTexture=true;mat.emissiveColor=Color3.White();mat.disableLighting=true;mat.backFaceCulling=false
    const plane=MeshBuilder.CreatePlane('living-label',{width:2.2,height:.4},scene);plane.parent=root;plane.position.y=2.05;plane.billboardMode=7;plane.material=mat;plane.isPickable=false
    resources.push(texture,mat);return texture
  }
  const parcel=MeshBuilder.CreateBox('living-parcel',{width:.5,height:.35,depth:.4},scene),parcelMat=new StandardMaterial('living-parcel',scene)
  parcelMat.diffuseColor=Color3.FromHexString('#e9c578');parcel.material=parcelMat;parcel.isPickable=false;parcel.setEnabled(false);resources.push(parcelMat)
  const notice=MeshBuilder.CreateBox('city-notice',{width:.8,height:.9,depth:.1},scene)
  notice.material=parcelMat;notice.isPickable=false;notice.setEnabled(false)
  function start() {
    if(!cityLayout){preparing.update();cityLayout=preparing.result();if(!cityLayout)return false}
    if(!spatial)spatial=initialSpatial()
    simulation=createLivingSimulation({world:plan,legacy,saved:saved?.checkpoint,savedCadence:saved?.cadence,populationTarget:population.target,initialHour:progress.worldTime??7.5,space:{point,clear,contactClear,bodyPresent,visible,move,
      placeSetup:()=>({definitions:registeredPlaces(simulation.state(),cityLayout),bindings:[...cityLayout.bindings,...simulation.state().registry.actors.filter(a=>a.body).map(a=>a.body.binding)]}),
      lifeSetup,supplierSetup,gangSetup,populationSetup,atPlace,routine,
      knownPlaceIds:()=>clues.map(c=>c.placeId),
      conversationOpen:()=>store().panel,
      suspendRoutine:id=>{const intent=simulation.state().life?.actors.find(a=>a.actorId===id)?.intent;if(intent)travel.cancelTravel(intent.id)},
      relocationPending:()=>distance(spatial.stall,cityLayout.parcelSpot)>.1,
      face:(id,q)=>{point(id).heading=Math.atan2(q.x-point(id).x,q.z-point(id).z)},
      canEscape:(id,other)=>{const p=point(id),q=point(other),h=Math.atan2(p.x-q.x,p.z-q.z);return walkable(p.x+Math.sin(h)*2,p.z+Math.cos(h)*2)},
      flee:(id,other,dt)=>{const p=point(id),q=other,h=Math.atan2(p.x-q.x,p.z-q.z);move(id,{x:p.x+Math.sin(h)*4,y:p.y,z:p.z+Math.cos(h)*4},dt,.2)},
      idle},
      notify,effects:events=>{
        for(const e of events)if(['damaged','parried','guard_broken','died'].includes(e.kind))flashes.set(e.targetId,{kind:e.kind,until:simulation.clock()+350})
        const name=id=>id==='player'?'你':npcDefinitions().find(n=>n.id===id)?.name??'对方'
        for(const item of attentionMessages(events,{seen:id=>visible('player',id),name}))attention.add(item.text,item,simulation.clock())
      },
      save:async(checkpoint,meta)=>{
        if(disposed||useWorldStore.getState().document?.world!==plan)throw new Error('场景已关闭')
        const nextSpatial={...copy(spatial),player:point('player')},parcelLot=checkpoint.gameplay.interactions.inventory.lots.find(l=>l.id==='medicine-parcel')
        for(const actor of checkpoint.gameplay.registry.actors)if(actor.hasBody&&actor.actorId!=='player'&&!nextSpatial.npcs.some(n=>n.id===actor.actorId)) {
          if(!actor.body?.spawn)throw new Error('新人物缺少已确认的落位依据。')
          nextSpatial.npcs.push({...copy(actor.body.spawn),id:actor.actorId})
        }
        // Moving an empty stall changes no custody. A held parcel moves only
        // through the owner's recorded pickup/delivery transaction.
        if(!['stall','merchant-bag'].includes(parcelLot.holderId)||checkpoint.gameplay.village.events.some(e=>e.kind==='relocate_deliver'))nextSpatial.stall=copy(cityLayout.parcelSpot)
        const nextClues=copy(pendingClues??clues)
        const living={version:checkpoint.gameplay.archive.history?4:3,legacy:copy(legacy),checkpoint,spatial:nextSpatial,layout:copy(cityLayout),migration:copy(migration),travels:travel.snapshot(),patrols:copy(patrols),clues:nextClues,attention:attention.snapshot(),cadence:simulation.cadenceSnapshot(),population:copy(population)}
        const worldTime=clockAt(checkpoint.gameplay.calendar.clockOrigin,checkpoint.simulationAt).hour
        const ok=await useWorldStore.getState().dispatch({type:'living-checkpoint',living,expectedSequence:meta.expectedSequence,archivePages:meta.archivePages,...extras(),worldTime})
        if(!ok)throw new Error('保存结果未确认，请重新读档。')
        spatial=nextSpatial
        clues=nextClues;pendingClues=null
        lastSequence=checkpoint.sequence;return {status:'committed',sequence:checkpoint.sequence}
      }})
    travel.restore(saved?.travels)
    notice.position.set(cityLayout.notice.x,cityLayout.notice.y+.6,cityLayout.notice.z)
    label(notice,'街坊便笺 · E 阅读','#ffe3a6')
    store().setFlush(async()=>{const result=await simulation.checkpoint(true);return result?.ok===true})
    syncModels()
    return true
  }
  function syncModels() {
    for(const n of npcDefinitions())if(!models.has(n.id)) {
      const model=createNpcModel(scene,n.model??(n.id.startsWith('guard')?'npc.guard':n.id==='merchant'?'npc.vendor':n.id==='resident-1'?'npc.citizen-woman':'npc.citizen'))
      model.root.setEnabled(false)
      const texture=label(model.root,n.name,n.color);models.set(n.id,{model,texture,caption:'',last:copy(point(n.id))})
    }
  }
  const input=createCombatInput(canvas,()=>useGameStore.getState().phase==='playing'&&!!simulation,()=>simulation?.release())
  function remember(next,message) {
    if(!simulation.canAdvance()||pendingClues)return
    if(next===clues){notify(message);return}
    pendingClues=next
    simulation.checkpoint().then(result=>{if(!result?.ok)pendingClues=null;else if(!closing)notify(message)})
  }
  function selectTarget() {
    const p=point('player')
    const parcelAvailable=simulation.state().interactions.inventory.lots.some(l=>l.id==='medicine-parcel'&&l.holderId==='stall')
    const candidates=[...spatial.npcs.map(n=>({...n,dead:!alive(n.id)})),...(parcelAvailable?[{...spatial.stall,id:'stall'}]:[]),{...cityLayout.notice,id:'notice'}]
    selected=candidates.filter(q=>distance(p,q)<=2&&Math.abs(p.y-q.y)<1.5&&Math.abs(facingAngle(p,q))<65&&(['stall','notice'].includes(q.id)||bodyPresent(q.id))&&clear(p,q)).sort((a,b)=>Math.abs(facingAngle(p,a))-Math.abs(facingAngle(p,b))||distance(p,a)-distance(p,b))[0]?.id??null
  }
  function publish() {
    presentAttention()
    const at=performance.now(),s=simulation.state(),busy=simulation.busy(),stopped=simulation.stopped()
    if(at-lastPublishedAt<100&&s===lastPublishedState&&busy===lastPublishedBusy&&stopped===lastPublishedStopped)return
    lastPublishedAt=at;lastPublishedState=s;lastPublishedBusy=busy;lastPublishedStopped=stopped
    selectTarget()
    const hero=s.interactions.actors.find(a=>a.id==='player')
    const p=point('player'),seenPlaceIds=registeredPlaces(s,cityLayout).filter(place=>distance(p,place.approach)<=12&&Math.abs(facingAngle(p,place.approach))<=60&&clear(p,place.approach)).map(place=>place.id)
    const seenActors=npcDefinitions().filter(n=>visible('player',n.id)).map(n=>({id:n.id,point:point(n.id)}))
    const temporary=s.interactions.inventory.lots.some(l=>l.id==='medicine-parcel'&&l.holderId==='stall')?spatial.stall:null
    const addresses=(s.dialogue?.addresses??[]).filter(a=>a.listenerId==='player')
    const escortClues=(s.factions?.escortKnowledge??[]).filter(k=>k.actorId==='player').flatMap(k=>[k.pickupPlaceId,k.returnPlaceId]
      .map(placeId=>({placeId,source:k.evidenceId,at:k.at})))
    const growthClues=(s.standing?.acknowledgments??[]).filter(k=>k.holderId==='player'&&k.service==='rent_and_training')
      .map(k=>({placeId:s.places.bindings.find(b=>b.actorId===k.issuerId)?.homePlaceId,source:k.eventId,at:k.at})).filter(k=>k.placeId)
    const allClues=[...clues,...addresses.map(a=>({placeId:a.placeId,source:a.eventId,at:a.at})),...escortClues,...growthClues]
    const trade=simulation.tradeStatus(),presentation=presentWorld(s,{at:simulation.clock(),
      knownPlaces:placeClues({...cityLayout,places:registeredPlaces(s,cityLayout)},allClues,useNavigationStore.getState().fog,p,{},temporary,addresses),seenActors,seenPlaceIds,fighters:simulation.view(),targetId:selected,trade})
    const places=presentation.places
    const tracked=places.find(place=>place.id===store().trackedPlaceId)
    store().publish({state:s,fighters:simulation.view(),hero,targetId:selected,names:Object.fromEntries(npcDefinitions().map(n=>[n.id,n.name])),
      ...presentation,tracked:tracked?{...tracked,direction:destinationDirection(p,tracked)}:null,noticeDistance:Math.round(distance(p,cityLayout.notice)),calendar:simulation.calendar(),trade,
      conversation:simulation.conversation(),
      caseOptions:simulation.caseOptions(selected),
      factionView:simulation.factionView(selected),
      standingView:simulation.standingView(selected),
      justiceView:simulation.justiceView(selected),
      bagCount:s.interactions.inventory.lots.filter(l=>l.holderId==='player-bag').reduce((n,l)=>n+l.quantity,0),clock:simulation.clock(),
      wanted:['guard','guard-2'].map(id=>wantedFor(s.crime,id,'player')).sort((a,b)=>b.level-a.level)[0],pursuit:['guard','guard-2'].map(id=>pursuitFor(s,id,'player',simulation.clock())).sort((a,b)=>({follow:2,search:1,idle:0}[b.mode]-{follow:2,search:1,idle:0}[a.mode]))[0],
      busy:simulation.busy(),stopped:simulation.stopped(),legacyEvents:legacy?.events??[]})
  }
  function draw(dt) {
    const state=simulation.state(),fighters=simulation.view(),at=simulation.clock()
    syncModels()
    const noticeEnabled=loaded(cityLayout.notice)
    if(notice.isEnabled()!==noticeEnabled)notice.setEnabled(noticeEnabled)
    for(const [id,entry] of models) {
      const p=point(id),f=fighters.find(f=>f.id===id),enabled=bodyReady(p)&&(entry.model.root.isEnabled()||canMaterialize(id))
      if(entry.model.root.isEnabled()!==enabled)entry.model.root.setEnabled(enabled)
      if(!enabled)continue
      entry.model.root.position.set(p.x,p.y,p.z);entry.model.root.rotation.y=p.heading
      const gear=state.equipment.loadouts.find(l=>l.actorId===id)
      entry.model.setEquipment?.(gear.weapon,gear.armor)
      entry.model.update(dt,distance(p,entry.last)>.001);entry.model.combatPose?.(f,at,flashes.get(id));Object.assign(entry.last,p)
      const caption=`${npcDefinitions().find(n=>n.id===id).name} ${f.health}/100${selected===id?' · E':''}`
      if(caption!==entry.caption){entry.texture.clear();entry.texture.drawText(caption,null,64,'bold 30px sans-serif',f.health?'#ffffff':'#aaaaaa','transparent',true);entry.caption=caption}
    }
    const lot=state.interactions.inventory.lots.find(l=>l.id==='medicine-parcel')
    const parcelEnabled=lot.holderId==='stall'&&loaded(spatial.stall)
    if(parcel.isEnabled()!==parcelEnabled)parcel.setEnabled(parcelEnabled)
    parcel.position.set(spatial.stall.x,spatial.stall.y+.25,spatial.stall.z)
    const gear=state.equipment.loadouts.find(l=>l.actorId==='player')
    player.setEquipment?.(gear.weapon,gear.armor)
    player.combatPose?.(fighters.find(f=>f.id==='player'),at,flashes.get('player'))
  }
  return {
    present:()=>{if(simulation){publish();draw(0)}},
    stepSeconds:dt=>simulation?.stepSeconds(dt)??dt,
    performanceStats:()=>simulation?{...simulation.performanceStats(),populationTarget:population.target,seed:String(plan.seed),player:point('player'),
      bodyWaiting:spatial.npcs.filter(p=>loaded(p)&&world.bodyLocationStatus?.(p.x,p.y,p.z)==='waiting_for_geometry').length,
      bodyOverlap:spatial.npcs.filter(p=>bodyReady(p)&&!models.get(p.id)?.model.root.isEnabled()&&!canMaterialize(p.id)).length,
      bodyBlocked:spatial.npcs.filter(p=>loaded(p)&&world.bodyLocationStatus?.(p.x,p.y,p.z)==='blocked').length}:null,
    canAdvance:()=>!simulation||simulation.canAdvance(),isAlive:()=>!simulation||alive('player'),
    fighter:id=>simulation?.view().find(f=>f.id===id),
    bodyClear:(from,to)=>bodyMoveClear(from,to,bodies()),bodySupport:(x,z,ceiling)=>bodySupportHeight(x,z,ceiling,bodies()),
    revision:()=>lastSequence,snapshot:()=>undefined,
    worldHour:()=>simulation?.calendar().hour??null,
    clearCommands(){input.clear();simulation?.release()},
    checkpoint:(release=false)=>simulation?.checkpoint(release),
    update(dt) {
      if(disposed||closing)return
      if(!simulation){retry-=dt;if(retry>0)return;retry=.2;if(!start()){
        const status=preparing.status();store().notify(status.status==='blocked'?`城内落位暂未完成：${status.reason}`:`正在准备城内场所 ${status.completed}/${status.total}。`);return}}
      const request=store().shift()
      if(request) {
        selectTarget()
        const {kind,data}=request
        if(kind==='interact') {
          if(selected==='stall')simulation.command('take')
          else if(selected==='notice')remember(readCityNotice(clues,simulation.clock()),CITY_NOTICE_TEXT)
          else if(selected){store().open();if(alive(selected))simulation.command('talk_start',{targetId:selected})}
        } else if(kind==='ask_medicine'&&selected==='resident-1'&&alive('resident-1')) {
          simulation.command('talk_start',{targetId:'resident-1'})
          const meeting=simulation.conversation()
          if(meeting?.speakerId==='resident-1')simulation.command('talk_topic',{meetingId:meeting.id,topicId:'hours'})
        } else simulation.command(kind,{...data,...(kind==='threaten'?{targetId:selected}:{})})
      }
      prepareHomes();if(population.target>=9){prepareSupplier();prepareGang()}preparePopulation();simulation.update(dt)
      // Explicit, bounded foreground rest. Reuse physical steps and stop at the
      // first pending commit; no wall-clock/offline catch-up or inferred travel.
      let extraSeconds=0
      const restBudget=performance.now()
      for(let i=0;i<4&&simulation.canAdvance()&&simulation.fastRestActive()&&performance.now()-restBudget<6;i++) {
        const extra=simulation.stepSeconds(dt),before=simulation.clock()
        simulation.update(extra)
        const advanced=(simulation.clock()-before)/1000
        extraSeconds+=advanced
        if(advanced>0)world.updateNpcs(advanced,point('player').x,point('player').z)
        if(!advanced)break
      }
      travel.releaseInactive(simulation.clock(),alive);draw(dt+extraSeconds)
      publish()
      return extraSeconds
    },
    dispose(){closing=true;preparing?.dispose();housing?.dispose();supplierPlace?.dispose();gangPlace?.dispose();populationPlaces?.dispose();input.dispose();if(simulation)simulation.close().finally(()=>{travel.dispose();disposed=true});else{travel.dispose();disposed=true}for(const e of models.values())e.model.dispose();parcel.dispose();notice.dispose();resources.forEach(r=>r.dispose());store().reset()},
  }
}
