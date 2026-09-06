// 模型与步行使用相同的一米分段剖面，桥头水平衔接两岸。
export const BRIDGE_HALF_LENGTH=9
export function bridgeHeight(z) {
  const t=Math.max(0,Math.min(1,(z+BRIDGE_HALF_LENGTH)/(2*BRIDGE_HALF_LENGTH)))
  return 2.2*Math.sin(Math.PI*t)**2
}
export function bridgeWalkHeight(z) {
  const a=Math.floor(z),t=z-a
  return bridgeHeight(a)*(1-t)+bridgeHeight(a+1)*t
}
