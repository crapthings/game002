import { create } from 'zustand'
const key='game002:audio:v1'
const clamp=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(1,Number(value))):.6
function read(){try {const data=JSON.parse(localStorage.getItem(key));return {volume:clamp(data?.volume??.6),muted:data?.muted===true}}catch{return {volume:.6,muted:false}}}
export const useAudioStore=create(set=>({
  ...read(),
  setVolume(value){const volume=clamp(value);set({volume});save()},
  setMuted(muted){set({muted:Boolean(muted)});save()},
}))
function save(){const {volume,muted}=useAudioStore.getState();try{localStorage.setItem(key,JSON.stringify({volume,muted}))}catch{/* 当前会话仍生效。 */}}
