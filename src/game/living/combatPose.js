export function combatPose(f,at) {
  if(!f)return {arm:0,side:0,lean:0,dead:false}
  if(f.phase==='dead')return {arm:0,side:0,lean:0,dead:true}
  if(f.phase==='guard')return {arm:-1.35,side:.3,lean:-.12,dead:false}
  if(f.phase==='broken')return {arm:.3,side:.2,lean:-.35,dead:false}
  if(!f.swing)return {arm:0,side:0,lean:0,dead:false}
  const s=f.swing
  if(at<s.activeAt)return {arm:-.5,side:-.8*(1-(s.activeAt-at)/250),lean:-.12,dead:false}
  if(at<s.recoveryAt){const t=(at-s.activeAt)/180;return {arm:-1.3,side:-.8+1.6*t,lean:.18,dead:false}}
  const t=Math.max(0,(s.endsAt-at)/400);return {arm:-1.3*t,side:.8*t,lean:.18*t,dead:false}
}
