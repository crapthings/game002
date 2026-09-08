import { create } from 'zustand'
export const useLivingStore=create((set,get)=>({
  view:null,message:'',panel:false,commands:[],flush:async()=>true,trackedPlaceId:null,
  trackPlace:id=>set({trackedPlaceId:id}),
  setFlush:flush=>set({flush}),
  shift:()=>{if(!get().commands.length)return;const [command,...rest]=get().commands;set({commands:rest});return command},
  publish:view=>set({view}),notify:message=>set({message}),
  toggle:()=>set(s=>({panel:!s.panel})),open:()=>set({panel:true}),
  request:(kind,data={})=>{if(get().commands.length<8)set(s=>({commands:[...s.commands,{kind,data}]}))},
  drain:()=>{const commands=get().commands;set({commands:[]});return commands},
  clear:()=>set({commands:[]}),reset:()=>set({view:null,message:'',panel:false,commands:[],flush:async()=>true,trackedPlaceId:null}),
}))
