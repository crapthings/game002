import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createNpcModel } from '../npcs/createNpcModel.js'
import { bodyMoveClear,bodySupportHeight } from '../entities/bodyCollision.js'
import { createLivingSimulation } from './simulation.js'
import { createCombatInput } from './createCombatInput.js'
import { validateLiving } from './persistence.js'
import { LIVING_NPCS } from './config.js'
import { distance,facingAngle,localRoute } from './geometry.js'
import { wantedFor,pursuitFor } from '../gameplay/index.js'
import { useLivingStore } from '../../stores/useLivingStore.js'
import { useGameStore } from '../../stores/useGameStore.js'
import { useWorldStore } from '../../stores/useWorldStore.js'
const copy=v=>structuredClone(v)
export function createLivingScene(scene,plan,world,player,progress,extras=()=>({})) {
  let simulation=null,spatial=null,disposed=false,retry=0,publishTimer=0,selected=null,lastSequence=-1
  const models=new Map(),resources=[],routes=new Map(),flashes=new Map()
  const canvas=scene.getEngine().getRenderingCanvas(),store=()=>useLivingStore.getState()
  store().reset()
  const saved=progress.living,legacy=saved?saved.legacy:progress.ledger??null
  if(saved){validateLiving(saved,plan);spatial=copy(saved.spatial)}
  const point=id=>id==='player'?{x:player.root.position.x,y:player.root.position.y,z:player.root.position.z,heading:player.root.rotation.y}:id==='stall'?spatial.stall:spatial.npcs.find(n=>n.id===id)
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
  const walkable=(x,z)=>world.isLoaded(x,z)&&world.canMove(x,z,.36)
  function move(id,target,dt,stop=1.2) {
    const p=point(id);if(!loaded(p)||distance(p,target)<=stop)return
    let goal=target
    if(!clear(p,target,.36)) {
      let route=routes.get(id)
      if(!route||simulation.clock()>route.until||distance(route.target,target)>2) {
        route={target:copy(target),until:simulation.clock()+2000,path:localRoute(p,target,walkable)};routes.set(id,route)
      }
      while(route.path.length&&distance(p,route.path[0])<.3)route.path.shift()
      if(!route.path.length)return
      goal=route.path[0]
    }
    const heading=Math.atan2(goal.x-p.x,goal.z-p.z),step=Math.min(2.4*dt,distance(p,goal))
    for(const offset of [0,.5,-.5,1,-1,Math.PI/2,-Math.PI/2,2.3,-2.3]) {
      const next={x:p.x+Math.sin(heading+offset)*step,z:p.z+Math.cos(heading+offset)*step}
      next.y=world.terrain.surfaceHeight(next.x,next.z)
      if(!walkable(next.x,next.z)||!clear(p,next,.35)||Math.abs(next.y-p.y)>.4||!bodyMoveClear(p,next,[...bodies(id),body('player')]))continue
      Object.assign(p,next,{heading:heading+offset});return
    }
  }
  function layout() {
    const taken=[]
    function place(anchor) {
      for(const radius of [0,.8,1.6,2.4,3.2])for(let i=0;i<8;i++) {
        const p={x:anchor[0]+Math.cos(i*Math.PI/4)*radius,z:anchor[1]+Math.sin(i*Math.PI/4)*radius}
        p.y=world.terrain.surfaceHeight(p.x,p.z)
        if(walkable(p.x,p.z)&&taken.every(q=>distance(p,q)>1)){taken.push(p);return p}
      }
      return null
    }
    const stall=place(legacy?.item.position??[0,-3]);if(!stall)return null
    const npcs=[]
    for(const n of LIVING_NPCS){const old=legacy?.npcs.find(p=>p.id===n.id),p=place(old?.position??n.home);if(!p)return null;npcs.push({...p,id:n.id,heading:old?.heading??n.heading})}
    return {player:point('player'),stall,npcs}
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
  function start() {
    if(!spatial)spatial=layout()
    if(!spatial)return false
    simulation=createLivingSimulation({world:plan,legacy,saved:saved?.checkpoint,space:{point,clear,visible,move,
      face:(id,q)=>{point(id).heading=Math.atan2(q.x-point(id).x,q.z-point(id).z)},
      canEscape:(id,other)=>{const p=point(id),q=point(other),h=Math.atan2(p.x-q.x,p.z-q.z);return walkable(p.x+Math.sin(h)*2,p.z+Math.cos(h)*2)},
      flee:(id,other,dt)=>{const p=point(id),q=other,h=Math.atan2(p.x-q.x,p.z-q.z);move(id,{x:p.x+Math.sin(h)*4,y:p.y,z:p.z+Math.cos(h)*4},dt,.2)},
      idle:(id,dt,at)=>{const home=legacy?.npcs.find(n=>n.id===id)?.home??LIVING_NPCS.find(n=>n.id===id).home;const goal={x:home[0],z:home[1]};if(distance(point(id),goal)>1.2)move(id,goal,dt,1);else point(id).heading+=dt*.25*Math.sin(at/2200+LIVING_NPCS.findIndex(n=>n.id===id))}},
      notify:message=>store().notify(message),effects:events=>{for(const e of events){
        const name=e.targetId==='player'?'你':LIVING_NPCS.find(n=>n.id===e.targetId)?.name??'对方'
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
        const living={version:1,legacy:copy(legacy),checkpoint,spatial:{...copy(spatial),player:point('player')}}
        const ok=await useWorldStore.getState().dispatch({type:'living-checkpoint',living,expectedSequence:meta.expectedSequence,...extras()})
        if(!ok)throw new Error('保存结果未确认，请重新读档。')
        lastSequence=checkpoint.sequence;return {status:'committed',sequence:checkpoint.sequence}
      }})
    store().setFlush(async()=>{const result=await simulation.checkpoint(true);return result?.ok===true})
    for(const n of LIVING_NPCS) {
      const model=createNpcModel(scene,n.id.startsWith('guard')?'npc.guard':n.id==='merchant'?'npc.vendor':n.id==='resident-1'?'npc.citizen-woman':'npc.citizen')
      const texture=label(model.root,n.name,n.color);models.set(n.id,{model,texture,caption:'',last:copy(point(n.id))})
    }
    return true
  }
  const input=createCombatInput(canvas,()=>useGameStore.getState().phase==='playing'&&!!simulation,()=>simulation?.release())
  function publish() {
    const s=simulation.state(),hero=s.interactions.actors.find(a=>a.id==='player'),p=point('player')
    const candidates=[...spatial.npcs.map(n=>({...n,dead:!alive(n.id)})),{...spatial.stall,id:'stall'}]
    selected=candidates.filter(q=>distance(p,q)<=2&&Math.abs(p.y-q.y)<1.5&&Math.abs(facingAngle(p,q))<65&&clear(p,q)).sort((a,b)=>Math.abs(facingAngle(p,a))-Math.abs(facingAngle(p,b))||distance(p,a)-distance(p,b))[0]?.id??null
    store().publish({state:s,fighters:simulation.view(),hero,targetId:selected,names:Object.fromEntries(LIVING_NPCS.map(n=>[n.id,n.name])),
      bagCount:s.interactions.inventory.lots.filter(l=>l.holderId==='player-bag').reduce((n,l)=>n+l.quantity,0),clock:simulation.clock(),
      wanted:['guard','guard-2'].map(id=>wantedFor(s.crime,id,'player')).sort((a,b)=>b.level-a.level)[0],pursuit:['guard','guard-2'].map(id=>pursuitFor(s,id,'player',simulation.clock())).sort((a,b)=>({follow:2,search:1,idle:0}[b.mode]-{follow:2,search:1,idle:0}[a.mode]))[0],
      busy:simulation.busy(),stopped:simulation.stopped(),legacyEvents:legacy?.events??[]})
  }
  function draw(dt) {
    for(const [id,entry] of models) {
      const p=point(id),f=simulation.view().find(f=>f.id===id)
      entry.model.root.setEnabled(loaded(p));entry.model.root.position.set(p.x,p.y,p.z);entry.model.root.rotation.y=p.heading
      const gear=simulation.state().equipment.loadouts.find(l=>l.actorId===id)
      entry.model.setEquipment?.(gear.weapon,gear.armor)
      entry.model.update(dt,distance(p,entry.last)>.001);entry.model.combatPose?.(f,simulation.clock(),flashes.get(id));entry.last=copy(p)
      const caption=`${LIVING_NPCS.find(n=>n.id===id).name} ${f.health}/100${selected===id?' · E':''}`
      if(caption!==entry.caption){entry.texture.clear();entry.texture.drawText(caption,null,64,'bold 30px sans-serif',f.health?'#ffffff':'#aaaaaa','transparent',true);entry.caption=caption}
    }
    const lot=simulation.state().interactions.inventory.lots.find(l=>l.id==='medicine-parcel')
    parcel.setEnabled(lot.holderId==='stall'&&loaded(spatial.stall));parcel.position.set(spatial.stall.x,spatial.stall.y+.25,spatial.stall.z)
    const gear=simulation.state().equipment.loadouts.find(l=>l.actorId==='player')
    player.setEquipment?.(gear.weapon,gear.armor)
    player.combatPose?.(simulation.view().find(f=>f.id==='player'),simulation.clock(),flashes.get('player'))
  }
  return {
    present:()=>{if(simulation){publish();draw(0)}},
    canAdvance:()=>!simulation||simulation.canAdvance(),isAlive:()=>!simulation||alive('player'),
    bodyClear:(from,to)=>bodyMoveClear(from,to,bodies()),bodySupport:(x,z,ceiling)=>bodySupportHeight(x,z,ceiling,bodies()),
    revision:()=>lastSequence,snapshot:()=>undefined,
    clearCommands(){input.clear();simulation?.release()},
    checkpoint:(release=false)=>simulation?.checkpoint(release),
    update(dt) {
      if(disposed)return
      if(!simulation){retry-=dt;if(retry>0)return;retry=1;if(!start()){store().notify('请回到中心街道，等待街坊就位。');return}}
      publish()
      const request=store().shift()
      if(request) {
        const {kind,data}=request
        if(kind==='interact') {
          if(selected==='stall')simulation.command('take')
          else if(selected)store().open()
        } else simulation.command(kind,{...data,...(kind==='threaten'?{targetId:selected}:{})})
      }
      simulation.update(dt);draw(dt)
      publishTimer+=dt;if(publishTimer>=.1){publishTimer=0;publish()}
    },
    dispose(){input.dispose();simulation?.close().finally(()=>{disposed=true});for(const e of models.values())e.model.dispose();parcel.dispose();resources.forEach(r=>r.dispose());store().reset()},
  }
}
