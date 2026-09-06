export default { id: 'firefighter', name: '余烬消防员', height: 1.92, width: 1.1, depth: 1.05, build: 1.22, lean: 0.1, armReach: 0.25, gait: 2.8,
  skin: '#7a8070', cloth: '#716044', pants: '#4b4538', accent: '#b6ad62', zones: ['city', 'industrial'], tags: ['消防', '厚重装备'],
  description: '宽檐消防盔、厚重防护服和背后气瓶，形成宽肩厚背轮廓。',
  parts: [{ anchor:'head',shape:'sphere',size:[0.46,0.24,0.46],at:[0,0.15,0],color:'cloth' }, { anchor:'head',size:[0.53,0.045,0.58],at:[0,0.08,-0.04],color:'cloth' }, { anchor:'torso',size:[0.6,0.07,0.035],at:[0,-0.1,0.21],color:'accent' }, { anchor:'torso',shape:'sphere',size:[0.26,0.64,0.25],at:[0,0,-0.31],color:'accent' }] }
