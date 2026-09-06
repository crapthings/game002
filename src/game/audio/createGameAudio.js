import { useAudioStore } from '../../stores/useAudioStore.js'

// 无外部下载：短 PCM 音效在音频解锁时生成并缓存；每次发声只创建播放节点。
export function createGameAudio() {
  let context=null,master=null,disposed=false,active=false,focused=document.hasFocus(),distance=0,lastPosition=null,wall=false
  const buffers=new Map(),voices=new Set(),maxVoices=10
  function buffer(kind) {
    if(buffers.has(kind))return buffers.get(kind)
    const whoosh=['jump','double','dash','wallJump'].includes(kind),duration=whoosh?(kind==='dash'?.32:.26):kind==='land'?.28:.16
    const sound=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),data=sound.getChannelData(0)
    let low=0,seed=kind.split('').reduce((v,c)=>v+c.charCodeAt(0),17)
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1}
    for(let i=0;i<data.length;i++) {
      const t=i/context.sampleRate,p=t/duration,noise=random()
      low+=.15*(noise-low)
      const attack=Math.min(1,t/.006),tail=(1-p)**2
      if(whoosh) {
        const sweep=Math.sin(2*Math.PI*((kind==='double'?310:190)*t-160*t*t))*.06
        data[i]=(low*.75+(noise-low)*.12+sweep)*Math.sin(Math.PI*p)**1.4*.55
      } else {
        const soft=kind==='grass',wood=kind==='wood',tile=kind==='tile',landing=kind==='land'
        const body=Math.sin(2*Math.PI*(wood?155:tile?220:landing?65:100)*t)*Math.exp(-t*(wood?32:48))
        const grit=(soft?low*.7:(noise-low)*.22)*Math.exp(-t*(soft?18:35))
        const heel=Math.exp(-(((t-.033)/.012)**2))*low*.25
        data[i]=(body*.4+grit+heel)*attack*tail*(landing?.95:soft?.65:.8)
      }
    }
    buffers.set(kind,sound);return sound
  }
  function enabled(){return active&&focused&&!document.hidden}
  function applyVolume() {
    if(!master)return
    const state=useAudioStore.getState(),gain=enabled()&&!state.muted?state.volume:0
    master.gain.setTargetAtTime(gain,context.currentTime,.015)
  }
  function stop() {
    distance=0;lastPosition=null;wall=false
    for(const voice of [...voices]){try{voice.source.stop()}catch{/* 已结束。 */}voice.source.disconnect();voice.gain.disconnect();voices.delete(voice)}
  }
  function unlock(event) {
    if(disposed||!event.isTrusted)return
    try {
      if(!context) {
        const AudioContext=window.AudioContext||window.webkitAudioContext
        if(!AudioContext)return
        context=new AudioContext();master=context.createGain();master.gain.value=0;master.connect(context.destination)
        for(const kind of ['stone','grass','wood','tile','jump','double','wallJump','dash','land'])buffer(kind)
      }
      if(enabled()&&context.state==='suspended')context.resume().catch(()=>{})
      applyVolume()
    } catch { /* 音频不可用时游戏仍可继续。 */ }
  }
  function play(kind,level=1) {
    const settings=useAudioStore.getState()
    if(!enabled()||settings.muted||settings.volume===0||context?.state!=='running')return
    if(voices.size>=maxVoices)return
    const source=context.createBufferSource(),gain=context.createGain()
    source.buffer=buffer(kind);source.playbackRate.value=.94+Math.random()*.12
    gain.gain.value=Math.min(1,level)*.65;source.connect(gain);gain.connect(master)
    const voice={source,gain};voices.add(voice)
    source.onended=()=>{source.disconnect();gain.disconnect();voices.delete(voice)}
    source.start()
  }
  function visibility(event){focused=event.type==='blur'?false:document.hasFocus();if(!enabled())stop();applyVolume()}
  window.addEventListener('pointerdown',unlock,{capture:true})
  window.addEventListener('keydown',unlock,{capture:true})
  window.addEventListener('focus',visibility)
  window.addEventListener('blur',visibility)
  document.addEventListener('visibilitychange',visibility)
  const unsubscribe=useAudioStore.subscribe(applyVolume)
  return {
    setActive(value){active=value;stop();applyVolume()},
    reset:stop,
    update(dt,position,motion,running,surface) {
      if(!enabled()){lastPosition=null;return}
      const previous=lastPosition;lastPosition={x:position.x,y:position.y,z:position.z}
      if(motion.jumpEvent)play(motion.jumpEvent==='first'?'jump':motion.jumpEvent==='wall'?'wallJump':'double',.85)
      if(motion.dashStarted&&!motion.jumpEvent)play('dash',.8)
      if(motion.landed){play('land',Math.max(.25,Math.min(1,motion.landingImpact/18)));distance=0;return}
      const stepping=motion.grounded||Boolean(motion.wallMode)
      if(!stepping||!motion.moving||!previous){distance=0;wall=Boolean(motion.wallMode);return}
      const onWall=Boolean(motion.wallMode)
      if(onWall!==wall)distance=0
      wall=onWall
      const moved=Math.hypot(position.x-previous.x,position.z-previous.z,onWall?position.y-previous.y:0)
      // 不在瞬移/异常长帧后补播积压脚步，每帧至多一声。
      if(dt>.1||moved>3){distance=0;return}
      distance+=moved
      const stride=onWall?1.3:running?1.65:1.2
      if(distance>=stride) {distance%=stride;play(onWall?'stone':surface(),running||onWall?.8:.55)}
    },
    dispose(){disposed=true;stop();unsubscribe();window.removeEventListener('pointerdown',unlock,true);window.removeEventListener('keydown',unlock,true);window.removeEventListener('focus',visibility);window.removeEventListener('blur',visibility);document.removeEventListener('visibilitychange',visibility);master?.disconnect();context?.close().catch(()=>{});buffers.clear()},
  }
}
