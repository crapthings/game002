import { create } from 'zustand'

const condition=sample=>JSON.stringify({seed:sample.world?.living?.seed,population:sample.world?.living?.populationTarget,
  actors:sample.world?.living?.actors,graphics:sample.graphics,width:sample.width,height:sample.height})
export const usePerformanceStore = create((set,get) => ({
  sample: null,
  capture:null,
  startCapture:()=>{
    const sample=get().sample
    if(!sample?.world?.living||sample.world.living.actors!==sample.world.living.populationTarget||sample.phase!=='playing')return
    set({capture:{version:1,scenario:'city-loop-v1',implementation:'living-cadence-v1',codeCommit:null,status:'recording',
      startedAtMs:sample.sampledAtMs,endedAtMs:null,conditions:condition(sample),conditionsChanged:false,interrupted:false,samples:[]}})
  },
  stopCapture:()=>set(state=>state.capture?.status==='recording'?{capture:{...state.capture,status:'stopped',endedAtMs:state.sample?.sampledAtMs??state.capture.startedAtMs,interrupted:true}}:{}),
  publish: sample => set(state=>{
    const capture=state.capture
    if(capture?.status!=='recording')return {sample}
    if(!sample)return {sample,capture:{...capture,status:'stopped',interrupted:true,endedAtMs:state.sample?.sampledAtMs??capture.startedAtMs}}
    const elapsed=sample.sampledAtMs-capture.startedAtMs,samples=[...capture.samples,structuredClone(sample)]
    const finished=elapsed>=60000||samples.length>=140
    return {sample,capture:{...capture,samples,conditionsChanged:capture.conditionsChanged||condition(sample)!==capture.conditions,
      interrupted:capture.interrupted||sample.phase!=='playing',status:finished?'complete':'recording',endedAtMs:finished?sample.sampledAtMs:null}}
  }),
}))
