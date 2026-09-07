# B侧战斗与犯罪模块：接入审阅记录

基线d902f34（通用玩法框架），分支feature/b-combat-rules。范围仅src/game/gameplay及B文档，没有改场景、移动、生成器、公共UI、正式存储或旧药包规则。

## 要求与源码证据

| 要求 | 当前实现 | 接入状态 |
|---|---|---|
| 玩家/NPC普通攻击、命中去重 | combat.js的attack/hit、swing.hitIds | 规则已编写，动作和扫掠命中由A提供 |
| 招架方向、气力、破防与回气 | COMBAT_RULES与时间推进/previewCombat | 120度、100点、8/s、25/击、600ms后30/s已编码 |
| 单一气血与死亡因果 | runtime将combat返回的actors写回interactions；damaged→died | 与用药共用气血，死亡状态不复制 |
| 装备、背包与属性 | inventory装备定义、equipment引用单件批次、refreshEquipment | 不释放背包格，忙碌拒绝换装，基础值重算 |
| 尸体搜刮 | property.js核对真实死亡事件、库存、钱包 | 所有权保留，铜钱来源以moneyClaims保留 |
| 威胁与抢劫 | robbery.js确定反应、转移实际金额、冷却与来源 | A执行呼救/逃跑/反抗，不自动送达举报 |
| 目击/举报/通缉升级 | knowledge与crime按个人证据处理 | 匿名不具名，同因果根同受害者合案升级 |
| 追捕与反击 | pursuit固定最后坐标及过期搜索、forcePolicy命中判责 | 追捕输出未挂AI；命中仍需空间证据 |
| 可保存接口 | restoreGameplay重放完整投影；worldSession保存独立时钟与sequence | 尚无正式存储适配，不宣称已落地读档 |
| A/B合并交接 | COMBAT-PLAN与独立B分支 | 远端实际状态以Git核对结果为准 |

## 本轮审阅修正

发现普通knowledge调用原本没有检查死亡状态，会允许死去的目击者继续举报。runtime现对非fact知识动作检查行为者存活，举报还检查接收者存活；事实登记仍允许描述已死亡角色。已有知识保留，不抹掉生前已送达的报告。示例新增捕快/目击者配置和分开的目击、举报、评估请求，避免把整个传播过程写成瞬时发生。

## A连接时的最小顺序

1. openCombatExample仅用于理解配置，正式ID由A的持久NPC决定。选createWorldSession，以同一世界时钟和完整检查点保存。
2. 接左键attack与右键guard按下/松开；播放提交后的attack_started，按swingId和有效阶段提供hit证据。
3. 接气血、气力和装备面板；UI显示预览不直接修改规则状态。
4. 命中/威胁/搜刮提交后，从fact事件取得factId；实际见证者写witness。实际抵达捕快后写report，再assess。
5. 捕快真实识别目标后写sight，失去视线写lost；依据pursuitFor移动，但攻击仍走attack/hit。
6. 停止输入/暂停时间后按COMBAT-PLAN的顺序保存退出。旧progress.ledger不覆盖，新字段需正式适配。

## 证据边界和未完成项

遵守AGENTS.md，不运行测试、build或lint。上述为源码审阅和实现清单，不是运行成功报告。此次没有让用户重复旧案例测试。正式世界输入/碰撞/动画、NPC执行、界面和存储尚未接入。

仍须处理当前历史上限对持续知觉采样的影响、最终统一差异/类型/回放路径审阅和分支交接。长期历史压缩、拘捕/投降、案件撤销与索偿偿还尚无实现；这些不得写成已经完成的功能。当前Goal保持进行中。
