import { natureCatalog } from '../nature/catalog.js'

// 简单部件配方：尺寸、位置、材质；同一模块可被预制组合和生态散布重复引用。
const box = (size, position, color, rotation = [0, 0, 0]) => ({ shape: 'box', size, position, color, rotation })
const cylinder = (size, position, color, rotation = [0, 0, 0]) => ({ shape: 'cylinder', size, position, color, rotation })
const sphere = (size, position, color) => ({ shape: 'sphere', size, position, color })
const C = { wood: '#78654a', rust: '#79563e', metal: '#646f6c', dark: '#303b38', leaf: '#4c6241', concrete: '#929084' }

export const environmentCatalog = {
  ...natureCatalog,
  'nature.broadleaf': { radius: 0.55, parts: [cylinder([0.55, 3.4, 0.4], [0, 1.7, 0], C.wood), sphere([3.8, 3, 3.4], [0, 4.1, 0], C.leaf), sphere([2.4, 2.3, 2.4], [1.2, 3.5, 0.4], '#63784b')] },
  'nature.dead-tree': { radius: 0.4, parts: [cylinder([0.5, 4.5, 0.15], [0, 2.25, 0], '#6d6856'), cylinder([0.18, 1.8, 0.04], [0.6, 3.2, 0], C.wood, [0, 0, -0.7]), cylinder([0.16, 1.4, 0.03], [-0.5, 2.7, 0.15], C.wood, [0, 0, 0.7])] },
  'nature.bush': { radius: 0, parts: [sphere([1.4, 0.9, 1.2], [0, 0.45, 0], C.leaf), sphere([0.8, 0.7, 0.9], [0.6, 0.35, 0.3], '#6a754b')] },
  'nature.reeds': { radius: 0, parts: Array.from({ length: 7 }, (_, i) => cylinder([0.06, 0.9 + i * 0.12, 0.025], [(i % 3 - 1) * 0.22, (0.9 + i * 0.12) / 2, (Math.floor(i / 3) - 1) * 0.2], '#7e8858')) },
  'nature.flowers': { radius: 0, parts: Array.from({ length: 4 }, (_, i) => sphere([0.16, 0.12, 0.16], [(i % 2) * 0.4, 0.25, Math.floor(i / 2) * 0.35], '#b7ae73')) },
  'nature.log-pile': { footprint: { width: 2.4, depth: 1.2 }, parts: [cylinder([0.4, 2.2, 0.4], [0, 0.25, -0.25], C.wood, [0, 0, Math.PI / 2]), cylinder([0.4, 2.2, 0.4], [0, 0.25, 0.25], C.wood, [0, 0, Math.PI / 2]), cylinder([0.4, 2.2, 0.4], [0, 0.6, 0], C.wood, [0, 0, Math.PI / 2])] },
}
