export const box = (size, position, color, rotation = [0, 0, 0]) => ({ shape: 'box', size, position, color, rotation })
export const cylinder = (size, position, color, rotation = [0, 0, 0]) => ({ shape: 'cylinder', size, position, color, rotation })
export const sphere = (size, position, color) => ({ shape: 'sphere', size, position, color })
export const colors = { rust: '#795440', metal: '#626a64', dark: '#252c29', wood: '#76634a', cloth: '#77785a', concrete: '#89877b' }

// 每件道具独立维护变体配方；不使用 Math.random，外观由稳定 variant ID 决定。
export function defineNature(metadata, variants) {
  const defaultVariant = Object.keys(variants)[0]
  return { ...metadata, defaultVariant, variants, parts: variants[defaultVariant]() }
}
