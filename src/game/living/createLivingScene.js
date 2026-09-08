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
import { resolveRoleHomes } from './cityPlaces.js'
import { createCityTravel } from './createCityTravel.js'
import { CITY_NOTICE_TEXT, readCityNotice, learnPlace, placeClues, destinationDirection } from './placeClues.js'
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
  let cityLayout=saved?.version>=2?copy(saved.layout):null
  const preparing=cityLayout?null:prepareCityLayout(plan,world),patrols=copy(saved?.patrols??{})
  const migration=copy(saved?.migration??{fromVersion:saved?1:0})
  let clues=copy(saved?.clues??[]),pendingClues=null
  let housing=null,housingMessage=null
  const point=id=>id==='player'?{x:player.root.position.x,y:player.root.position.y,z:player.root.position.z,heading:player.root.rotation.y}:id==='stall'?spatial.stall:id==='relocation'?cityLayout.parcelSpot:id==='notice'?cityLayout.notice:spatial.npcs.find(n=>n.id===id)
  const loaded=p=>world.isLoaded(p.x,p.z)
  function clear(a,b,r=.06) {
    if(!loaded(a)||!loaded(b))return false
    const count=Math.max(1,Math.ceil(distance(a,b)/.15))
    for(let i=0;i<=count;i++) {const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t
      if(!(world.canTraverse?.(x,z,y+.5,r)??world.canMove(x,z,r)))return false}
    return true
  }
  const alive=id=>simulation?.state().interactions.actors.find(a=>a.id===id)?.health>0
  const body=id=>({...point(id),height:alive(id)?1.75:.25})
  const bodies=exclude=>spatial?spatial.npcs.filter(n=>n.id!==exclude&&loaded(n)).map(n=>body(n.id)):[]
  function visible(a,b,identify=false) {
    const p=point(a),q=point(b)
    return p&&q&&distance(p,q)<=(identify?8:12)&&Math.abs(p.y-q.y)<2.5&&Math.abs(facingAngle(p,q))<=60&&clear(p,q)
  }
  const travel=createCityTravel({world,point,clock:()=>simulation?.clock()??0,canAdvance:()=>!closing&&!disposed&&simulation?.canAdvance(),
    bodies:id=>[...spatial.npcs.filter(n=>n.id!==id).map(n=>body(n.id)),body('player')]})
  const walkable=(x,z)=>world.navigationData.canMove(x,z,.36)||(world.isLoaded(x,z)&&world.canMove(x,z,.36))
  const move=(id,target,dt,stop=1.2)=>travel.move(id,target,dt,stop)
  const contactClear=(a,b)=>loaded(a)&&loaded(b)?clear(a,b):travel.clearGround(a,b,.06)
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
    if(status.status==='blocked'&&housingMessage!==status.reason){housingMessage=status.reason;store().notify(`住处暂未确认：${status.reason}`)}
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
    simulation=createLivingSimulation({world:plan,legacy,saved:saved?.checkpoint,initialHour:progress.worldTime??7.5,space:{point,clear,contactClear,visible,move,
      placeSetup:()=>({definitions:registeredPlaces(simulation.state(),cityLayout),bindings:[...cityLayout.bindings,...simulation.state().registry.actors.filter(a=>a.body).map(a=>a.body.binding)]}),
      lifeSetup,atPlace,routine,
      suspendRoutine:id=>{const intent=simulation.state().life?.actors.find(a=>a.actorId===id)?.intent;if(intent)travel.cancelTravel(intent.id)},
      relocationPending:()=>distance(spatial.stall,cityLayout.parcelSpot)>.1,
      face:(id,q)=>{point(id).heading=Math.atan2(q.x-point(id).x,q.z-point(id).z)},
      canEscape:(id,other)=>{const p=point(id),q=point(other),h=Math.atan2(p.x-q.x,p.z-q.z);return walkable(p.x+Math.sin(h)*2,p.z+Math.cos(h)*2)},
      flee:(id,other,dt)=>{const p=point(id),q=other,h=Math.atan2(p.x-q.x,p.z-q.z);move(id,{x:p.x+Math.sin(h)*4,y:p.y,z:p.z+Math.cos(h)*4},dt,.2)},
      idle},
      notify:message=>store().notify(message),effects:events=>{for(const e of events){
        const name=e.targetId==='player'?'你':npcDefinitions().find(n=>n.id===e.targetId)?.name??'对方'
        if(['damaged','parried','guard_broken','died'].includes(e.kind))flashes.set(e.targetId,{kind:e.kind,until:simulation.clock()+350})
        if(e.kind==='damaged')store().notify(`${name}受到${e.damage}点伤害。`)
        if(e.kind==='parried')store().notify(`${name}挡住了这次攻击。`)
        if(e.kind==='died')store().notify(`${name}倒下了，身上的财物留在原处。`)
        if(e.kind==='threatened')store().notify({fight:'对方选择反抗。',flee:'对方转身逃走。',call_guard:'对方正在向捕快求助。',surrender:'对方选择交出钱财。'}[e.reaction])
        if(e.kind==='robbed')store().notify(`对方交出${e.amount}文，但这笔钱仍被记录为强取。`)
        if(e.kind==='reward')store().notify('柳娘当面送上15文答谢。')
      }},
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
        const living={version:3,legacy:copy(legacy),checkpoint,spatial:nextSpatial,layout:copy(cityLayout),migration:copy(migration),travels:travel.snapshot(),patrols:copy(patrols),clues:nextClues}
        const worldTime=clockAt(checkpoint.gameplay.calendar.clockOrigin,checkpoint.simulationAt).hour
        const ok=await useWorldStore.getState().dispatch({type:'living-checkpoint',living,expectedSequence:meta.expectedSequence,...extras(),worldTime})
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
      const texture=label(model.root,n.name,n.color);models.set(n.id,{model,texture,caption:'',last:copy(point(n.id))})
    }
  }
  const input=createCombatInput(canvas,()=>useGameStore.getState().phase==='playing'&&!!simulation,()=>simulation?.release())
  function remember(next,message) {
    if(!simulation.canAdvance()||pendingClues)return
    if(next===clues){store().notify(message);return}
    pendingClues=next
    simulation.checkpoint().then(result=>{if(!result?.ok)pendingClues=null;else if(!closing)store().notify(message)})
  }
  function selectTarget() {
    const p=point('player')
    const parcelAvailable=simulation.state().interactions.inventory.lots.some(l=>l.id==='medicine-parcel'&&l.holderId==='stall')
    const candidates=[...spatial.npcs.map(n=>({...n,dead:!alive(n.id)})),...(parcelAvailable?[{...spatial.stall,id:'stall'}]:[]),{...cityLayout.notice,id:'notice'}]
    selected=candidates.filter(q=>distance(p,q)<=2&&Math.abs(p.y-q.y)<1.5&&Math.abs(facingAngle(p,q))<65&&clear(p,q)).sort((a,b)=>Math.abs(facingAngle(p,a))-Math.abs(facingAngle(p,b))||distance(p,a)-distance(p,b))[0]?.id??null
  }
  function publish() {
    const at=performance.now(),s=simulation.state(),busy=simulation.busy(),stopped=simulation.stopped()
    if(at-lastPublishedAt<100&&s===lastPublishedState&&busy===lastPublishedBusy&&stopped===lastPublishedStopped)return
    lastPublishedAt=at;lastPublishedState=s;lastPublishedBusy=busy;lastPublishedStopped=stopped
    selectTarget()
    const hero=s.interactions.actors.find(a=>a.id==='player')
    const p=point('player'),seenPlaceIds=registeredPlaces(s,cityLayout).filter(place=>distance(p,place.approach)<=12&&Math.abs(facingAngle(p,place.approach))<=60&&clear(p,place.approach)).map(place=>place.id)
    const seenActors=npcDefinitions().filter(n=>visible('player',n.id)).map(n=>({id:n.id,point:point(n.id)}))
    const temporary=s.interactions.inventory.lots.some(l=>l.id==='medicine-parcel'&&l.holderId==='stall')?spatial.stall:null
    const trade=simulation.tradeStatus(),presentation=presentWorld(s,{at:simulation.clock(),player:p,
      knownPlaces:placeClues(cityLayout,clues,useNavigationStore.getState().fog,p,{},temporary),seenActors,seenPlaceIds,fighters:simulation.view(),targetId:selected,trade})
    const places=presentation.places
    const tracked=places.find(place=>place.id===store().trackedPlaceId)
    store().publish({state:s,fighters:simulation.view(),hero,targetId:selected,names:Object.fromEntries(npcDefinitions().map(n=>[n.id,n.name])),
      ...presentation,tracked:tracked?{...tracked,direction:destinationDirection(p,tracked)}:null,noticeDistance:Math.round(distance(p,cityLayout.notice)),calendar:simulation.calendar(),trade,
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
      const p=point(id),f=fighters.find(f=>f.id===id),enabled=loaded(p)
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
          else if(selected)store().open()
        } else if(kind==='ask_medicine'&&selected==='resident-1'&&alive('resident-1')) {
          remember(learnPlace(clues,'place.medicine','conversation:resident-1',simulation.clock()),'柳娘：去商街的陈记药铺买一份止血药，回来找我就好。药铺位置已记在地图上。')
        } else simulation.command(kind,{...data,...(kind==='threaten'?{targetId:selected}:{})})
      }
      prepareHomes();simulation.update(dt);travel.releaseInactive(simulation.clock(),alive);draw(dt)
      publish()
    },
    dispose(){closing=true;preparing?.dispose();housing?.dispose();input.dispose();if(simulation)simulation.close().finally(()=>{travel.dispose();disposed=true});else{travel.dispose();disposed=true}for(const e of models.values())e.model.dispose();parcel.dispose();notice.dispose();resources.forEach(r=>r.dispose());store().reset()},
  }
}
