# 战斗与犯罪小循环 / A-B 接入计划

## 当前进度

2026-09-07：已有通用框架保存为 d902f34，B开发分支 feature/b-combat-rules。已 fetch 核对 origin/core 仍为 2b988b0；没有待吸收的 A 更新。本轮新增 combat.js 战斗规则草稿，尚未导出公共入口或接入运行协调器，不可当作已完成战斗系统。遵守 AGENTS，不运行测试/build/lint。

已编写普通攻击起手250ms、有效180ms、收招400ms，挥击ID和目标去重；玩家与NPC相同规则。基础属性气血/攻击/防御；伤害最低1且不超过剩余气血。招架正面120度，气力100，持续每秒8，每击25；不足受伤并破防700ms，恰好足额挡住后耗尽。松手600ms后每秒恢复30，恢复25才允许重启。气力内部用千分点避免帧率小数误差。

后续优先：审阅时间推进与日志容量（不能把每帧tick无限记成玩家指令）、战斗状态恢复及与现有玩家气血统一，再补公开声明/配置示例。随后装备与搜刮、抢劫、犯罪升级。当前草稿不应直接与 interactions 的气血分别保存，接入时只能有一个权威来源。

## A现在可以做的工作

### 2026-09-07 接口续进

当前协调器已接受 domain:'combat'，command为attack/guard/hit；初始化config显式combat:true且每个actors条目提供attack、defense。现有无combat配置不增加战斗状态。气血唯一来源为state.interactions.actors，combat.fighters只保存攻击防御和战斗姿态/气力，避免用药与受伤分别维护两份气血。死亡角色不能执行普通交易、使用或赠予，搜刮后续另走专用规则。

攻击成功事件attack_started给出swingId；有效期为activeAt（含）至recoveryAt（不含）。命中必须引用这个ID。parried/damaged/died自动登记社会事实，但不会自动通知NPC，也尚未自动创建案件；伤害→死亡保留因果来源。任一步失败时整批候选状态丢弃。原请求重试沿用已有协调器去重规则。

每帧调用previewGameplayCombat(state,simulationAt)获得气力和攻击阶段的只读显示值；stamina/1000才是0～100点气力，条比例为stamina/100000。不要将显示投影写回state，不要每帧发送tick：tick命令已移除。实际战斗操作结算自上次操作经过的时间；持续招架耗尽事件按实际耗尽时刻记录。preview只复制战斗角色，不复制整段历史。

restoreGameplay通过可信初始config和完整请求日志重建战斗、物品、气血及知识投影。世界当前模拟时钟需要与完整快照同事务保存，并在读档后继续该时间轴；runtime.at只是最后一次提交动作的时间，不能用它重置世界时钟。正式世界时钟/存储适配仍未接入。会话和预检查可用于combat请求；示例见combatExample.js。

下一步：持久化世界时钟的边界、装备改变战斗属性，以及尸体财物转移。当前新增接口仅完成源码编写，未运行验证或推送。

1. 鼠标直接转视角，锁定鼠标；Esc和背包释放。左键攻击，右键按下/松开招架，E交互，Tab面板。失焦/开菜单须清理按住状态，不能留下永久招架。
2. 玩家与NPC胶囊体初始高1.8m、半径0.3m，阻止穿人穿墙；NPC接近到攻击距离停下并能绕行。尺寸可按模型调整。
3. 攻击做起手/挥击/收招，玩家和NPC都要有；只在有效挥击阶段提供扫掠命中，不能每帧身体重叠就扣血。命中须无遮挡。
4. 为B提供 attackerId、targetId、swingId、模拟毫秒、接触/无遮挡证据及 proofId。angleDegrees是“目标朝向与目标指向攻击者方向”的夹角，正前方0，正后方180；不是攻击者自己的朝向夹角。
5. 表现消费B返回的attack_started/parried/guard_broken/damaged/died事件，播放挥击、火花、受击、破防和死亡。不要由动画再额外扣血。
6. 展示玩家/NPC气血、玩家气力条与招架状态；2m交互距离、视线无遮挡、单个高亮目标。范围属于可调整配置。

## B继续负责

### 世界时间与保存接口续进

新增createWorldSession(config,{saved,save})，作为有独立模拟时钟的世界会话入口。snapshot返回{version:1,sequence,simulationAt,gameplay}；请求expectedRevision取gameplay.revision。A的当前模拟时间从simulationAt恢复，运行时由暂停状态控制推进，不能使用Date.now差值补离线时间。显示预览使用当前模拟时间，不能退回最后一次动作的gameplay.at。

dispatch仍走同一玩法协调器；请求时间不得早于已确认simulationAt（原成功请求重试先去重，不受此限制）。checkpoint(at)在没有操作时也可保存完整状态与当前时间，不增加玩法journal、不改gameplay.revision。每次实际保存增加独立sequence，避免两个仅时间不同、玩法revision相同的快照相互覆盖。

存储save(candidate,{configId,expectedSequence,nextSequence})必须同事务比较世界ID和sequence后写入完整candidate，返回{status:'committed',sequence:nextSequence}。新世界第一次保存需要明确create-if-absent；已有记录必须匹配expectedSequence。失败或不明确回执处理与旧会话一致，未知结果需重读存储，禁止继续以旧内存写入。新旧两种会话不能同时写同一世界。

退出顺序：停止推进世界和接收新输入，清理按住输入所需的release请求，等待当前动作提交，再await checkpoint(当前模拟时间)，确认成功后close。close本身不额外保存也不取消已在途写入。恢复用restoreWorldCheckpoint或createWorldSession的saved参数，重放完整玩法日志后核对投影，随后按保存的模拟时间显示回气/搜索；不重发旧表现事件。

这是独立模块接口，尚未修改正式IndexedDB字段或A的菜单退出流程，也未执行运行验证。旧药包progress.ledger仍保持原样。

### 命中判责续进（取代此前调用方提供unlawful的草案）

新增forcePolicy.js，由runtime在hit结算前读取当时状态，为parried/damaged/died写入justification:{unlawful,ruleId,basisIds}。同次命中的死亡沿用该次伤害责任。调用方不能通过context.unlawful/ruleId改变结果；crime.assess现在只需Policy，读取实际来源事件上的判责。正当武力返回LAWFUL_FORCE，不生成案件。

第一版游戏规则：登记捕快有目标具名通缉且pursuitFor.mayEngage时可作为执法攻击；该捕快近期主动袭击/威胁对方则不享受此判定。10秒内遭到对方违法命中（含被招架的攻击）或威胁者可反击；自己10秒内主动袭击或30秒内威胁对方，不能借对方反应洗成自卫。其余命中认定为主动袭击。此处是虚构玩法规则，不模拟现实完整法律。

捕快后来收到的举报不会倒推改变先前攻击责任。合法执法命中不会给嫌疑人生成自卫依据，因此反击捕快仍可能升级为新案件；但案件升级仍要捕快的目击/已送达举报，不能凭全局命中自动具名立案。责任窗口与执法使用武力范围是初版固定配置，投降/拘捕/过度武力细分尚未实现。

没有改变A的攻击动作或命中空间检查。当前仍未运行验证；时钟保存及跨模块整体验证边界待继续整理。

### 捕快追踪接口续进

新增pursuit域sight/lost，actorId为捕快、targetId为嫌疑人；需要捕快已有此人的具名案件且双方存活。sight的context含at/allowed/visible:true/identified:true/position:{x,y,z}/proofId；lost需要visible:false和proofId。看见未认出的蒙面人不能凭全局ID续接追踪，必须由A的识别规则提供真实依据。

pursuitFor(world,authorityId,subjectId,simulationAt)返回idle/follow/search、固定destination和mayEngage。视线确认保留1秒；失去视线或确认过期后搜索最后见到的坐标30秒，再返回idle且destination=null。迟到的lost不能重新延长已过期搜索。搜索结束仅失去追踪，不消除案件；再次真实识别可重新追踪。

mayEngage仅在有效视线确认和通缉等级至少2时为true，只是接近交战的规则条件，不是命中许可。A仍须检查实际攻击距离、当前遮挡并发送combat.attack和有效挥击阶段的combat.hit。玩家反击同样走伤害/招架/死亡链。当前没有把mayEngage直接接到AI，也没有把合法执法、正当防卫判责做完。

每帧可只读查询pursuitFor，不要每帧写sight。A按知觉采样（例如500ms）及视线状态变化提交真实观察，且要意识到当前4096请求/子模块历史上限尚未做长期压缩，长时间持续追踪会消耗预算；不能静默清空历史绕过去重和存档校验。正式长期运行容量属于待审阅项。

### 证据驱动案件接口续进

combat配置可增加authorities数组，填实际捕快actorId；缺省空数组，不把任意NPC当执法者。新增crime域assess，command含actorId（评估捕快）和factId，context含at/allowed/unlawful/ruleId。必须是活着的已登记捕快，且其个人knowledge中已有该事实；只存在全局事实或别人尚未送达的举报都不够。

unlawful/ruleId是玩法判责适配器提供的依据，不可由玩家UI决定；此版尚未实现正当防卫/合法执法判责，调用方未明确判为违法则拒绝立案，不默认所有伤害都是犯罪。可受理实际战斗、抢劫和搜刮模块产生的事实，不能用外部任意fact伪造案件来源。

案件按捕快+因果根+受害人聚合。一次攻击伤害和死亡沿同一attack_started根升级为最高严重度，不叠加成两案；威胁和交钱也沿同一威胁根升级。搜刮单独归搜刮者，不沿死亡因果错误指认搜刮者为凶手。另一捕快必须获得自己的证据，不自动共享全局通缉。

subjectId始终来自该捕快的个人知识，匿名案件不产生具名追捕；后续有具名证据可升级。相同证据重复assess返回EVIDENCE_ALREADY_ASSESSED，原请求重试仍返回ALREADY_APPLIED。新证据不降低已有严重度或已知身份。

wantedFor(state.crime,authorityId,subjectId)只读计算：0无通缉；轻微1盘问；2逮捕；死亡严重案或多案累计达到3请求增援。这里只是第一版游戏数值，不触发瞬移、移动或自动伤害。实际位置必须通过后续目击/追踪接口获取。尚待案件解除/赔偿、执法与反击判责、搜索记忆接口；当前不能宣称捕快追捕循环已完整。

### 威胁抢劫接口续进

新增robbery域threaten，command含actorId/targetId/amount，context含at/allowed/reachable/guardNearby/escapeRoute/proofId。双方须存活、idle且未按住招架；A提供近距离接触、附近可求助捕快和逃路证据。courage在初始actors配置，0～100，缺省50。每名目标有30秒世界时间冷却，换请求ID或换威胁者也不能跳过。

第一版反应规则确定且可回放：附近有捕快优先call_guard；高胆量且没有明显力量劣势则fight；有退路且压力不足则flee；压力达到胆量则surrender；其余fight。压力由双方实际攻击力比例与气血比例差计算，不接受UI指定“必定投降”。这些是可调整玩法初值，不是已验证的平衡结论。

call_guard/flee/fight只是NPC行动选择，交由A实际执行；呼救不会直接让捕快获得具名知识，fight也不会直接扣玩家血。surrender时即时交付不超过实际钱包和索要金额的铜钱，登记property.moneyClaims；空钱包只记录威胁与投降，无虚构收入。当前不处理抢走指定物品。

threatened与robbed分别自动登记社会事实，robbed.cause指向威胁事件；受害者和街坊仍需要实际目击/识别上下文，不能默认全员认识蒙面人。后续案件模块将按证据处理升级，当前尚未生成通缉。所有资金/索偿/冷却/事实在同一候选状态提交，失败整体丢弃，成功原请求可去重恢复。公开类型与prepareThreatExample已补齐，未运行验证。

### 装备与属性接口续进

新增equipment域equip（actorId/slot/lotId）与unequip（actorId/slot），slot为weapon或armor，沿用context.at/allowed。物品可配置equipment:{slot,attack,defense}，非负整数加成且不可同时是消耗品；没有equipment字段的旧物品保持原序列化结构。

角色基础attack/defense保存在interactions.actors，实际战斗值在combat.fighters，按基础值+有效装备重新计算，不能重复累加。装备是指向背包批次的槽位引用，不创建额外物品，不释放背包空间。第一版装备批次必须quantity=1且角色拥有并持有；批量购买的装备需要先以单件批次获得，当前没有通用背包拆堆指令。每槽一件，新装备替换旧槽位，旧物品仍在背包。

只有存活且idle、未持续按住招架的角色可换装；攻击起手/挥击/收招/破防期间拒绝。已装备物不能直接买卖/赠予/使用，需先卸下，可以组成同一请求依次卸下再交易。死亡清空槽位、恢复基础战斗值，原物品仍留原容器；搜刮不会复制装备，也不会把他人装备变成自有可装备物。

每一步提交后刷新装备引用和加成，恢复时同样从指令重建。equipment事件只表示装备变化，本版不自动变成犯罪或个人知识。combatExample已加入铁剑/布甲及prepareEquipExample。未修改A的面板/武器挂点，不运行测试/build/lint。

### 尸体搜刮接口续进

新增property域的loot_item（actorId/targetId/lotId/quantity）和loot_money（actorId/targetId/amount），context要求allowed、模拟at、reachable及proofId。A提供玩家确实可触及尸体、无遮挡的证据；B核对搜刮者存活、目标死亡且有真实died事件，不能把活人作为掉落容器。初始配置直接设置死亡但没有死亡事件的角色当前不能搜刮。

尸体使用死者原背包/钱包，死亡不复制或随机生成物品。loot_item只改holderId，ownerId保持实际原所有者，可能是死者或第三人；代持物不能经普通出售、使用、赠予洗成自有物。金币从死者钱包等量扣除，进入搜刮者钱包，并写入property.moneyClaims，保留索偿主体、金额及搜刮来源；币可以流通，但消费不清除索偿记录。偿还/没收结算和继承主体尚未实现，不能把claims当已执行罚款。

搜刮事件cause指向死亡事件，自动注册fact:property:N但不自动让角色知情。要有人看见搜刮，仍需独立witness；不能把死亡目击自动当搜刮目击。重复请求去重；容量/金额/社会事实写入失败时整批不提交。combatExample.js新增物品+铜钱整批搜刮请求示例，纯接口示例不自动运行。

尚待：装备占用与属性刷新、威胁抢劫、案件与通缉升级、索偿结算，以及正式世界/存储接入。未修改场景或尸体表现，未执行测试/build/lint。

战斗时间与结算、气力、破防、死亡因果、存档一致性；道具装备与角色属性；财物来源和搜刮；威胁/抢劫/袭击/杀人案件及证据驱动的通缉升级。A执行捕快移动/搜索/动作，B决定规则状态。普通挥刀不自动等于已犯罪，命中和案件须有明确因果依据。

## 合并约定

A开发并推core；B在独立分支提交，先吸收core最新改动再提交合并。双方整合后core合dev。冲突按世界/操作由A、规则由B的职责逐段处理，不按提交时间整体覆盖。当前未推送B分支，也未合并dev。
