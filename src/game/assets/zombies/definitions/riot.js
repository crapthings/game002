export default { id: 'riot', name: '残甲防暴警员', height: 1.86, width: 1.05, depth: 1, build: 1.15, lean: 0.06, armReach: 0.38, gait: 3,
  skin: '#828b7c', cloth: '#343f43', pants: '#303637', accent: '#596668', zones: ['city', 'roadside'], tags: ['防暴', '护甲'],
  description: '深色头盔、破旧面罩、分块胸甲和肩甲，避免与普通感染者混淆。',
  parts: [{ anchor:'head',shape:'sphere',size:[0.45,0.38,0.44],at:[0,0.08,-0.025],color:'cloth' }, { anchor:'head',size:[0.37,0.28,0.04],at:[0,0.01,0.22],color:'accent' }, { anchor:'torso',size:[0.58,0.4,0.09],at:[0,0.03,0.23],color:'accent' }, { anchor:'leftArm',size:[0.32,0.17,0.32],at:[0,-0.02,0],color:'accent' }, { anchor:'rightArm',size:[0.32,0.17,0.32],at:[0,-0.02,0],color:'accent' }] }
