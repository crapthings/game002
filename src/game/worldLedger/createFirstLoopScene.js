import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createNpcModel } from '../npcs/createNpcModel.js'
import { createFirstLoop, restoreFirstLoop, createFirstLoopRules, distance, NPCS, FINE } from './firstLoop.js'
import { useLedgerStore } from '../../stores/useLedgerStore.js'
import { ITEMS, BAG_CAPACITY, bagCount, merchantCash } from './community.js'

// Thin engine adapter. No world-generation edits, no decisions from global event history.
export function createFirstLoopScene(scene, plan, world, player, saved, onChange) {
  let rules = saved === undefined ? null : createFirstLoopRules(restoreFirstLoop(saved, plan))
  const models = new Map(), materials = [], textures = []
  let itemMesh = null, accumulator = 0, messageSent = false, disposed = false, layoutRetry = 0
  useLedgerStore.getState().reset()
  const position = () => [player.root.position.x, player.root.position.z]
  const loaded = p => world.isLoaded(...p)
  const material = (name, color) => {
    const m = new StandardMaterial(name, scene)
    m.diffuseColor = Color3.FromHexString(color)
    materials.push(m)
    return m
  }
  const clear = (a, b, radius = .06) => {
    // Conservative loaded-world collision samples: occlusion can reject an observation,
    // never invent knowledge through an unloaded chunk. Height/FOV handled separately.
    const count = Math.max(1, Math.ceil(distance(a, b) / .2))
    for (let i = 0; i <= count; i++) {
      const t = i / count, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
      if (!world.isLoaded(x, z) || !world.canMove(x, z, radius)) return false
    }
    return true
  }
  const sees = (person, target, identification = false) => {
    if (!loaded(person.position) || !loaded(target)) return false
    const d = distance(person.position, target)
    if (d > (identification ? 8 : 12)) return false
    if (Math.abs(player.root.position.y - world.terrain.surfaceHeight(...person.position)) > 2.5) return false
    if (d > .3 && ((target[0] - person.position[0]) * Math.sin(person.heading) + (target[1] - person.position[1]) * Math.cos(person.heading)) / d < Math.cos(Math.PI / 3)) return false
    return clear(person.position, target)
  }
  const move = (person, target, step) => {
    const d = distance(person.position, target)
    if (d < .12) return
    const amount = Math.min(step, d), dx = (target[0] - person.position[0]) / d * amount, dz = (target[1] - person.position[1]) / d * amount
    for (const [x, z] of [[person.position[0] + dx, person.position[1] + dz], [person.position[0] + dx, person.position[1]], [person.position[0], person.position[1] + dz]]) {
      if (distance(person.position, [x,z]) < .001 || !world.isLoaded(x,z) || !world.canMove(x,z,.38) || !clear(person.position,[x,z])) continue
      person.heading = Math.atan2(x - person.position[0], z - person.position[1])
      person.position = [x,z]
      return
    }
  }
  const adapter = {
    loaded, clear, move, playerPosition: position,
    seesPlayer: guard => !rules.state.masked && sees(guard, position(), true),
  }
  function findLayout() {
    const layout = {}, taken = []
    for (const [id, anchor] of [['stall',[0,-3]], ...NPCS.map(n => [n.id,n.home])]) {
      if (!loaded(anchor)) return null
      let found = null
      for (const radius of [0, .75, 1.5, 2.25]) {
        for (let i = 0; i < 8; i++) {
          const p = [anchor[0] + Math.cos(i * Math.PI / 4) * radius, anchor[1] + Math.sin(i * Math.PI / 4) * radius]
          if (loaded(p) && world.canMove(...p,.65) && taken.every(q => distance(q,p) > 1.1)) { found = p; break }
        }
        if (found) break
      }
      if (!found) return null
      layout[id] = found
      taken.push(found)
    }
    // Participants must be able to reach one another on the initial street.
    if (!NPCS.every(n => clear(layout[n.id],layout.guard,.45)) || !clear(layout.stall,layout.guard,.45)) return null
    return layout
  }
  function label(root, text, color) {
    const texture = new DynamicTexture(`ledger-label-${text}`, { width: 512, height: 96 }, scene, false)
    texture.hasAlpha = true
    texture.drawText(text, null, 64, 'bold 40px sans-serif', color, 'transparent', true)
    textures.push(texture)
    const mat = new StandardMaterial('ledger-label', scene)
    mat.diffuseTexture = texture
    mat.useAlphaFromDiffuseTexture = true
    mat.emissiveColor = Color3.White()
    mat.disableLighting = true
    mat.backFaceCulling = false
    materials.push(mat)
    const plane = MeshBuilder.CreatePlane('ledger-label', { width: 3.2, height: .6 }, scene)
    plane.parent = root
    plane.position.y = 2.4
    plane.billboardMode = 7
    plane.material = mat
    plane.isPickable = false
  }
  function publish() {
    const s = rules.state, p = position(), guard = s.npcs.find(n => n.id === 'guard')
    const merchant = s.npcs.find(n => n.id === 'merchant'), patient = s.npcs.find(n => n.id === 'resident-1')
    const close = person => distance(p,person.position) <= 3 && clear(p,person.position) && Math.abs(player.root.position.y-world.terrain.surfaceHeight(...person.position)) < 1.5
    const incident = s.incidents.find(i => i.status !== 'settled')
    const canTake = s.item.holderId === 'stall' && distance(p,s.item.position) <= 2.5 && clear(p,s.item.position) && Math.abs(player.root.position.y - world.terrain.surfaceHeight(...s.item.position)) < 1.5
    const canSettle = s.item.holderId === 'player' && distance(p,guard.position) <= 3 && clear(p,guard.position) && Math.abs(player.root.position.y - world.terrain.surfaceHeight(...guard.position)) < 1.5
    useLedgerStore.getState().publish({
      wallet: s.wallet, masked: s.masked, holding: s.item.holderId === 'player', holder: s.item.holderId,
      canTake, canSettle, fine: FINE, status: incident?.status ?? (s.incidents.length ? 'settled' : 'idle'),
      stallDistance: Math.round(distance(p,s.item.position)), guardDistance: Math.round(distance(p,guard.position)),
      events: s.events.map(({id,kind,at,cause,text}) => ({id,kind,at,cause,text})),
      incidents: s.incidents.map(({id,status,reporterId}) => ({id,status,reporterId})),
      knowledge: s.knowledge.map(k => ({ ...k })),
      aid: { eventId:s.community.aid.eventId, subject:s.community.aid.subject },
      inventory: { ...s.community.inventory }, stock: { ...s.community.stock }, health: s.community.health,
      merchantCash: merchantCash(s.community),
      bagCount: bagCount(s.community)+Number(s.item.holderId === 'player'), capacity: BAG_CAPACITY,
      canBuy: close(merchant), canAid: close(patient) && !s.community.aid.eventId && s.community.inventory.medicine > 0,
      merchantDistance: Math.round(distance(p,merchant.position)), patientDistance: Math.round(distance(p,patient.position)),
      trust: s.community.relationship.trust,
      aidStatus: !s.community.aid.eventId ? 'injured' : s.community.aid.rewardEvent ? 'thanked' : s.community.aid.subject === null ? 'unknown-helper' : 'waiting',
    })
  }
  function draw(dt) {
    const s = rules.state
    for (const person of s.npcs) {
      const visible = loaded(person.position) && distance(position(),person.position) < 60
      let entry = models.get(person.id)
      if (!entry && visible) {
        const role = person.id === 'guard' ? 'guard' : person.id === 'merchant' ? 'vendor' : person.id === 'resident-1' ? 'citizen-woman' : 'citizen'
        const model = createNpcModel(scene, `npc.${role}`)
        const def = NPCS.find(n => n.id === person.id)
        label(model.root,def.name,def.color)
        entry = { model, previous: [...person.position], movingUntil: 0 }
        models.set(person.id,entry)
      }
      if (!entry) continue
      entry.model.root.setEnabled(visible)
      if (visible) {
        entry.model.root.position.set(person.position[0],world.terrain.surfaceHeight(...person.position),person.position[1])
        entry.model.root.rotation.y = person.heading
        if (distance(person.position,entry.previous) > .001) entry.movingUntil = s.nowMs + 100
        entry.model.update(dt,s.nowMs < entry.movingUntil)
      }
      entry.previous = [...person.position]
    }
    if (!itemMesh) {
      itemMesh = MeshBuilder.CreateBox('owned-medicine', { width: .6, height: .45, depth: .45 }, scene)
      itemMesh.material = material('medicine-cloth','#e9c578')
      itemMesh.isPickable = false
      label(itemMesh,'陈掌柜的药包 · E 拿取','#f5d888')
    }
    itemMesh.setEnabled(s.item.holderId === 'stall' && loaded(s.item.position))
    if (loaded(s.item.position)) itemMesh.position.set(s.item.position[0],world.terrain.surfaceHeight(...s.item.position)+.3,s.item.position[1])
  }
  return {
    snapshot: () => rules?.snapshot(),
    revision: () => rules?.state.revision ?? -1,
    clearCommands: () => useLedgerStore.getState().clearCommands(),
    update(dt) {
      if (disposed) return
      if (!rules) {
        layoutRetry -= dt
        if (layoutRetry > 0) { useLedgerStore.getState().clearCommands(); return }
        layoutRetry = 1
        const layout = findLayout()
        if (!layout) {
          if (!messageSent) { useLedgerStore.getState().notify('请回到城中心十字街附近，等待药摊与六位街坊就位。'); messageSent = true }
          useLedgerStore.getState().clearCommands()
          return
        }
        rules = createFirstLoopRules(createFirstLoop(plan.seed,plan.generatorVersion,layout))
        useLedgerStore.getState().notify('药包在中心路口南侧。只有带名字的六位角色参与这次江湖事件。')
        onChange()
      }
      const beforeCommands = rules.state.revision
      for (const command of useLedgerStore.getState().drain()) {
        publish()
        const view = useLedgerStore.getState().view
        let result
        if (command === 'mask') result = rules.mask()
        if (command === 'take') result = view.canTake ? rules.take(position(),rules.state.npcs.map(n => ({ npcId:n.id, saw:sees(n,position()) && sees(n,rules.state.item.position), identified:!rules.state.masked && sees(n,position(),true) }))) : '请落地并靠近药包，不能隔着障碍拿取。'
        if (command === 'settle') result = view.canSettle ? rules.settle(position()) : '请落地并靠近捕快交还药包。'
        if (command.startsWith('buy-')) result = view.canBuy ? rules.buy(command.slice(4),position()) : '请靠近陈掌柜，不能隔墙交易。'
        if (command.startsWith('sell-')) result = view.canBuy ? rules.sell(command.slice(5),position()) : '请落地并靠近陈掌柜，不能隔墙出售。'
        if (command.startsWith('use-') && ITEMS[command.slice(4)]) result = rules.use(command.slice(4))
        if (command === 'aid') result = view.canAid ? rules.aid(position()) : '请带一份自有止血药，靠近受伤的柳娘。'
        if (result) useLedgerStore.getState().notify(result)
      }
      const changed = rules.state.revision !== beforeCommands
      const previousEvents = rules.state.events.length
      const previousRevision = rules.state.revision
      accumulator += dt * 1000
      while (accumulator >= 100) { rules.step(100,adapter); accumulator -= 100 }
      draw(dt)
      if (changed || previousRevision !== rules.state.revision || !useLedgerStore.getState().view) publish()
      if (changed || previousEvents !== rules.state.events.length) onChange()
    },
    dispose() {
      disposed = true
      for (const { model } of models.values()) model.dispose()
      itemMesh?.dispose()
      materials.forEach(m => m.dispose())
      textures.forEach(t => t.dispose())
      useLedgerStore.getState().reset()
    },
  }
}
