export const DASH = Object.freeze({ speed: 20, duration: 0.3, cooldown: 0.65 })
// 米 / 秒；地面与空中共用小步积分，翻滚动画不参与碰撞。
export const JUMP = Object.freeze({
  firstSpeed: 7.8, secondSpeed: 8.6, gravity: 24, fallGravity: 34,
  releaseSpeed: 3.2, terminalSpeed: 24, coyoteTime: 0.1, bufferTime: 0.12,
  groundAcceleration: 32, groundBrake: 40, airAcceleration: 10,
  groundSnap: 0.18, flipDuration: 0.48, step: 1 / 120,
})

export function createLocomotion() {
  let vx = 0, vz = 0, vy = 0, grounded = true, jumps = 0
  let dashTime=0, dashCooldown=0, dashX=0, dashZ=0
  let coyote = JUMP.coyoteTime, buffer = 0, jumpAge = 0, flipAge = null
  return {
    reset() {
      dashTime=dashCooldown=0
      vx = vz = vy = buffer = jumpAge = 0
      grounded = true; jumps = 0; coyote = JUMP.coyoteTime; flipAge = null
    },
    beginFall() {
      dashTime=dashCooldown=0
      vx = vz = vy = buffer = jumpAge = 0
      grounded = false; jumps = 1; coyote = 0; flipAge = null
    },
    clearInput() { buffer = 0; if(dashTime>0)vx=vz=0; dashTime=0 },
    update(dt, position, world, { direction, speed, jumpPressed, jumpHeld, dashDirection = null }) {
      if(dashDirection && dashCooldown<=0 && dashTime<=0) {
        const length=Math.hypot(dashDirection.x,dashDirection.z)
        if(length>.01) {dashX=dashDirection.x/length;dashZ=dashDirection.z/length;dashTime=DASH.duration;dashCooldown=DASH.cooldown}
      }
      if (jumpPressed) buffer = JUMP.bufferTime
      const startX = position.x, startZ = position.z
      let landed = false, landingImpact = 0
      const count = Math.max(1, Math.ceil(dt / JUMP.step)), h = dt / count
      for (let step = 0; step < count; step++) {
        dashCooldown=Math.max(0,dashCooldown-h)
        if (grounded) coyote = JUMP.coyoteTime
        else coyote = Math.max(0, coyote - h)
        if (buffer > 0 && (grounded || coyote > 0 || jumps < 2)) {
          // 主动跳跃可打断冲刺，避免滞空吞掉二段跳的上升速度。
          if(dashTime>0) {dashTime=0;vx=direction.x*speed;vz=direction.z*speed}
          const first = grounded || (jumps === 0 && coyote > 0)
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
        else if (grounded || movingInput) {
          const tx = direction.x * targetSpeed, tz = direction.z * targetSpeed
          const delta = Math.hypot(tx - vx, tz - vz)
          const blend = delta ? Math.min(1, acceleration * h / delta) : 1
          vx += (tx - vx) * blend; vz += (tz - vz) * blend
        } else {
          vx *= Math.exp(-0.8 * h); vz *= Math.exp(-0.8 * h)
        }
        let dx = vx * h, dz = vz * h
        // 延续原世界的实体阻挡：空中也不能穿过建筑或进入未加载区域。
        const moveSteps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15))
        for (let n = 0; n < moveSteps; n++) {
          const sx = dx / moveSteps, sz = dz / moveSteps
          const canMove = (x, z) => world.canMove(x, z) && world.terrain.surfaceHeight(x, z) <= position.y + (grounded ? 0.35 : 0.05)
          if (canMove(position.x + sx, position.z + sz)) {
            position.x += sx; position.z += sz
          } else {
            if(dashTime>0) { dashTime=0; vx=vz=0 }
            if (canMove(position.x + sx, position.z)) position.x += sx
            else vx = 0
            if (canMove(position.x, position.z + sz)) position.z += sz
            else vz = 0
          }
          const floor = world.terrain.surfaceHeight(position.x, position.z)
          if (grounded && position.y - floor <= JUMP.groundSnap) position.y = floor
          else if (grounded) { grounded = false; jumps = 0 }
        }
        const hovering = !grounded && dashTime > 0
        if(dashTime>0) {
          dashTime=Math.max(0,dashTime-h)
          if(dashTime===0) {const exitSpeed=Math.min(speed,6);vx=dashX*exitSpeed;vz=dashZ*exitSpeed}
        }
        const floor = world.terrain.surfaceHeight(position.x, position.z)
        if (!grounded) {
          jumpAge += h
          if (flipAge !== null) flipAge += h
          if (hovering) {
            // 空中冲刺锁住高度，结束后从零垂直速度自然下落。
            vy = 0
          } else {
          if (!jumpHeld && jumpAge > (jumps === 2 ? 0.14 : 0.04) && vy > JUMP.releaseSpeed) vy = JUMP.releaseSpeed
          const gravity = vy > 0 ? JUMP.gravity : JUMP.fallGravity
          const nextVy = Math.max(-JUMP.terminalSpeed, vy - gravity * h)
          position.y += (vy + nextVy) * 0.5 * h
          vy = nextVy
          }
          if (position.y <= floor && vy <= 0) {
            landingImpact = Math.max(landingImpact, -vy)
            position.y = floor; vy = 0; grounded = true; jumps = 0; flipAge = null; landed = true
          }
        }
      }
      const groundHeight = world.terrain.surfaceHeight(position.x, position.z)
      return {
        dashing: dashTime>0, dashCooldown,
        grounded, jumpCount: jumps, verticalSpeed: vy, groundHeight,
        heightAboveGround: Math.max(0, position.y - groundHeight),
        flipProgress: flipAge === null ? null : Math.min(1, flipAge / JUMP.flipDuration),
        landed, landingImpact,
        moving: Math.hypot(position.x - startX, position.z - startZ) > 0.001,
        heading: Math.atan2(vx, vz), speed: Math.hypot(vx, vz),
      }
    },
  }
}
