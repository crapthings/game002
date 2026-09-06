export const DASH = Object.freeze({ speed: 20, duration: 0.3, cooldown: 0.65 })
// 米 / 秒；地面与空中共用小步积分，翻滚动画不参与碰撞。
export const JUMP = Object.freeze({
  firstSpeed: 13.5, secondSpeed: 12.5, gravity: 18, fallGravity: 23,
  releaseSpeed: 8.5, terminalSpeed: 21, coyoteTime: 0.1, bufferTime: 0.12,
  groundAcceleration: 32, groundBrake: 40, airAcceleration: 18,
  groundSnap: 0.18, flipDuration: 0.48, step: 1 / 120,
})

export const QINGGONG = Object.freeze({ wallDuration:1.65, wallRunSpeed:10, wallClimbSpeed:7.5, wallJumpSpeed:12, wallKickSpeed:8, detachTime:.25 })

export function createLocomotion() {
  let vx = 0, vz = 0, vy = 0, grounded = true, jumps = 0
  let dashTime=0, dashCooldown=0, dashX=0, dashZ=0
  let wallBudget=QINGGONG.wallDuration,wallLock=0,wallMode=null,wallNormal=null
  let coyote = JUMP.coyoteTime, buffer = 0, jumpAge = 0, flipAge = null
  return {
    reset() {
      wallBudget=QINGGONG.wallDuration;wallLock=0;wallMode=wallNormal=null
      dashTime=dashCooldown=0
      vx = vz = vy = buffer = jumpAge = 0
      grounded = true; jumps = 0; coyote = JUMP.coyoteTime; flipAge = null
    },
    beginFall() {
      wallBudget=QINGGONG.wallDuration;wallLock=0;wallMode=wallNormal=null
      dashTime=dashCooldown=0
      vx = vz = vy = buffer = jumpAge = 0
      grounded = false; jumps = 1; coyote = 0; flipAge = null
    },
    clearInput() { buffer = 0; wallMode=wallNormal=null; if(dashTime>0)vx=vz=0; dashTime=0 },
    update(dt, position, world, { direction, speed, jumpPressed, jumpHeld, dashDirection = null }) {
      let jumpEvent=null,dashStarted=false
      if(dashDirection && dashCooldown<=0 && dashTime<=0) {
        const length=Math.hypot(dashDirection.x,dashDirection.z)
        if(length>.01) {dashX=dashDirection.x/length;dashZ=dashDirection.z/length;dashTime=DASH.duration;dashCooldown=DASH.cooldown;dashStarted=true}
      }
      if (jumpPressed) buffer = JUMP.bufferTime
      const support=(x,z,ceiling)=>world.supportHeight?.(x,z,ceiling)??world.terrain.surfaceHeight(x,z)
      const startX = position.x, startZ = position.z
      let landed = false, landingImpact = 0
      const count = Math.max(1, Math.ceil(dt / JUMP.step)), h = dt / count
      for (let step = 0; step < count; step++) {
        dashCooldown=Math.max(0,dashCooldown-h)
        wallLock=Math.max(0,wallLock-h)
        wallMode=null;wallNormal=null
        if(grounded)wallBudget=QINGGONG.wallDuration
        const contact=!grounded&&wallLock<=0?world.wallContact?.(position.x,position.z,position.y):null
        if(buffer>0&&contact&&wallBudget>0) {
          jumpEvent='wall'
          vy=QINGGONG.wallJumpSpeed;vx=contact.x*QINGGONG.wallKickSpeed;vz=contact.z*QINGGONG.wallKickSpeed
          buffer=0;coyote=0;jumps=1;dashTime=0;jumpAge=0;flipAge=null
          wallLock=QINGGONG.detachTime;wallBudget=Math.max(0,wallBudget-.25)
        }
        if (grounded) coyote = JUMP.coyoteTime
        else coyote = Math.max(0, coyote - h)
        if (buffer > 0 && (grounded || coyote > 0 || jumps < 2)) {
          // 主动跳跃可打断冲刺，避免滞空吞掉二段跳的上升速度。
          if(dashTime>0) {dashTime=0;vx=direction.x*speed;vz=direction.z*speed}
          const first = grounded || (jumps === 0 && coyote > 0)
          jumpEvent=first?'first':'second'
          jumps = first ? 1 : 2
          vy = first ? JUMP.firstSpeed : JUMP.secondSpeed
          flipAge = first ? null : 0
          grounded = false; coyote = 0; buffer = 0; jumpAge = 0
        }
        buffer = Math.max(0, buffer - h)
        const movingInput = Math.hypot(direction.x, direction.z) > 0.01
        const acceleration = grounded ? (movingInput ? JUMP.groundAcceleration : JUMP.groundBrake) : JUMP.airAcceleration
        const targetSpeed = speed
        // 松开方向键时保留空中惯性；有输入时可小幅修正落点。
        if(dashTime>0) {vx=dashX*DASH.speed;vz=dashZ*DASH.speed}
        else if (wallLock<=0 && (grounded || movingInput)) {
          const tx = direction.x * targetSpeed, tz = direction.z * targetSpeed
          const delta = Math.hypot(tx - vx, tz - vz)
          const blend = delta ? Math.min(1, acceleration * h / delta) : 1
          vx += (tx - vx) * blend; vz += (tz - vz) * blend
        } else if(wallLock<=0) {
          vx *= Math.exp(-0.8 * h); vz *= Math.exp(-0.8 * h)
        }
        if(contact&&wallLock<=0&&wallBudget>0&&jumpHeld&&movingInput&&dashTime<=0) {
          const into=direction.x*contact.x+direction.z*contact.z
          if(into<.25) {
            const tx=direction.x-into*contact.x,tz=direction.z-into*contact.z,tangent=Math.hypot(tx,tz)
            wallBudget=Math.max(0,wallBudget-h);wallNormal=contact;flipAge=null
            if(tangent>.35) {
              wallMode='run';vx=tx/tangent*QINGGONG.wallRunSpeed;vz=tz/tangent*QINGGONG.wallRunSpeed
              vy=wallBudget>QINGGONG.wallDuration*.45?1.5:-1.5
            } else {
              wallMode='climb';vx=-contact.x*2;vz=-contact.z*2;vy=QINGGONG.wallClimbSpeed
            }
          }
        }
        let dx = vx * h, dz = vz * h
        // 带高度的实体阻挡：越过屋檐后可落到屋顶，未加载区域仍不可进入。
        const moveSteps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15))
        for (let n = 0; n < moveSteps; n++) {
          const sx = dx / moveSteps, sz = dz / moveSteps
          const canMove = (x, z) => (world.canTraverse?.(x,z,position.y+(grounded?.4:.03))??world.canMove(x,z)) && world.terrain.surfaceHeight(x, z) <= position.y + (grounded ? 0.4 : 0.05)
          if (canMove(position.x + sx, position.z + sz)) {
            position.x += sx; position.z += sz
          } else {
            if(dashTime>0) { dashTime=0; vx=vz=0 }
            if (canMove(position.x + sx, position.z)) position.x += sx
            else vx = 0
            if (canMove(position.x, position.z + sz)) position.z += sz
            else vz = 0
          }
          const floor = support(position.x,position.z,position.y+(grounded?.4:.05))
          if (grounded && position.y - floor <= JUMP.groundSnap && floor-position.y<=.4) position.y = floor
          else if (grounded) { grounded = false; jumps = 0 }
        }
        const hovering = !grounded && dashTime > 0
        if(dashTime>0) {
          dashTime=Math.max(0,dashTime-h)
          if(dashTime===0) {const exitSpeed=Math.min(speed,6);vx=dashX*exitSpeed;vz=dashZ*exitSpeed}
        }
        const floor = support(position.x,position.z,position.y+(grounded?.4:.05))
        if (!grounded) {
          jumpAge += h
          if (flipAge !== null) flipAge += h
          if (hovering) {
            // 空中冲刺锁住高度，结束后从零垂直速度自然下落。
            vy = 0
          } else if(wallMode) {
            position.y+=vy*h
          } else {
          if (!jumpHeld && jumpAge > (jumps === 2 ? 0.22 : 0.20) && vy > JUMP.releaseSpeed) vy = JUMP.releaseSpeed
          const gravity = vy > 0 ? JUMP.gravity : JUMP.fallGravity
          const nextVy = Math.max(-JUMP.terminalSpeed, vy - gravity * h)
          position.y += (vy + nextVy) * 0.5 * h
          vy = nextVy
          }
          if (position.y <= floor && vy <= 0) {
            landingImpact = Math.max(landingImpact, -vy)
            position.y = floor; vy = 0; grounded = true; wallMode=wallNormal=null; jumps = 0; flipAge = null; landed = true
          }
        }
      }
      const groundHeight = support(position.x,position.z,position.y+.1)
      return {
        jumpEvent, dashStarted,
        wallMode, wallNormal, wallRemaining:wallBudget,
        dashing: dashTime>0, dashCooldown,
        grounded, jumpCount: jumps, verticalSpeed: vy, groundHeight,
        heightAboveGround: Math.max(0, position.y - groundHeight),
        flipProgress: flipAge === null ? null : Math.min(1, flipAge / JUMP.flipDuration),
        landed, landingImpact,
        moving: Boolean(wallMode) || Math.hypot(position.x - startX, position.z - startZ) > 0.001,
        heading: wallMode==='climb'?Math.atan2(-wallNormal.x,-wallNormal.z):Math.atan2(vx, vz), speed: Math.hypot(vx, vz),
      }
    },
  }
}
