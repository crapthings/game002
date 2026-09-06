export default { id: 'worker', name: '锈盔工人', height: 1.88, width: 1, depth: 0.95, build: 1.17, lean: 0.08, armReach: 0.2, gait: 3.4,
  skin: '#858a74', cloth: '#a07837', pants: '#58594d', accent: '#bcb58a', zones: ['industrial', 'city'], tags: ['工人', '安全帽'],
  description: '黄色安全帽、褪色反光背心和粗壮手臂，适合工地与仓储区。',
  parts: [{ anchor:'head',shape:'sphere',size:[0.43,0.22,0.43],at:[0,0.17,0],color:'cloth' }, { anchor:'head',size:[0.48,0.04,0.48],at:[0,0.11,0.015],color:'cloth' }, { anchor:'torso',size:[0.57,0.06,0.035],at:[0,-0.06,0.21],color:'accent' }] }
