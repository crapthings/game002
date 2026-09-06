export default { id: 'hazmat', name: '泄漏防化员', height: 1.84, width: 1.05, depth: 1.05, build: 1.12, lean: 0.17, armReach: 0.35, gait: 2.7,
  skin: '#909b75', cloth: '#a29b4c', pants: '#8a8845', accent: '#3c5149', zones: ['industrial', 'city'], tags: ['防化', '密闭服'],
  description: '圆鼓兜帽、暗色观察窗和双滤罐呼吸器，适合隔离区。',
  parts: [{ anchor:'head',shape:'sphere',size:[0.52,0.54,0.5],at:[0,0.02,-0.02],color:'cloth' }, { anchor:'head',size:[0.32,0.21,0.05],at:[0,0.035,0.235],color:'accent' }, { anchor:'head',size:[0.13,0.14,0.14],at:[-0.14,-0.12,0.23],color:'accent' }, { anchor:'head',size:[0.13,0.14,0.14],at:[0.14,-0.12,0.23],color:'accent' }] }
