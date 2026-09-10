# 共享约定与拟新增接口

本文件是开发约定，所列新增接口尚不存在。基线及执行顺序见 [README](README.md)。在当前卡片需要时才引入对应域，不提前生成全部空模块。

## 当前源码入口

| 职责 | 已有文件 | 接入要求 |
| --- | --- | --- |
| 场景组装、位置与表现 | `src/game/living/createLivingScene.js` | 提供位置、真实可见/到达证据，接收表现；不直接改钱、血量或物品 |
| NPC 执行 | `src/game/living/simulation.js` | 统一选择当前行为，复用一次一个提交的 session |
| 玩法协调 | `src/game/gameplay/runtime.js`、`requests.js`、`index.js`、`index.d.ts` | 新领域通过同一请求事务进入；同步公开接口和恢复逻辑 |
| 唯一保存入口 | `gameplay/worldSession.js`、`living/persistence.js`、`persistence/worldRepository.js` | 保留 revision/sequence 比较、保存确认、未知结果恢复 |
| 钱、血、物品 | `gameplay/interactions.js`、`inventory.js` | 钱/血在 actors，物品在 lots；所有权与保管权分开 |
| 社会事实与知识 | `gameplay/knowledge.js` | 世界事实不是所有人已知；NPC 决策读自己的知识 |
| 既有性能优化 | `living/createLivingStateIndex.js`、`createNavigationWorker.js`、`world/chunks/collisionIndex.js` | 派生索引随已提交不可变状态重建；视线、接触和时钟不作为永久缓存 |
| 画面时间、地图、UI | `world/createDayNightCycle.js`、`map/drawMap.js`、`ui/LivingHud.jsx` | UI 发语义命令，规则与存档中不保存组件/模型引用 |

## 身份、位置与配置

P0 保持七个角色 ID：`merchant`、`witness`、`guard`、`guard-2`、`resident-1`、`resident-2`、`resident-3`。不修改旧 `worldLedger/firstLoop.js` 中的定义来搬动新场景，旧案例仍需用于恢复。

规划的静态场所记录：

```text
PlaceDefinition {
  id, label, kind, buildingId|null, parcelId|null,
  entrance:{x,y,z}, approach:{x,y,z}, districtId|null,
  hours:[{startMinute,endMinute}], public:boolean
}
ActorBinding { actorId, homePlaceId|null, workPlaceId|null, idlePlaceId, patrolPlaceIds:[] }
```

`entrance` 是可交互入口，`approach` 是街侧可到达候选点，都必须通过实际碰撞确认。地标坐标用于选址排序，不直接当出生点。角色的当前坐标只保存在 `living.spatial`；归属和日程不能覆盖正在执行的行动。

P0 静态地点目录作为 living 的布局元数据保存，不放进旧 `livingConfig`，因此七名角色及原物品配置签名保持不变。后续营业状态/权限属于 gameplay 的 `places` 域，由单一 session 写入。

## 行动与领域接口

拟新增的统一意图记录：

```text
Intent { id, actorId, kind, targetId|null, placeId|null,
         sourceEventId|null, priority, startedAt, phase, resumeIntentId|null }
phase = planned | travelling | interacting | suspended | completed | failed
```

行为优先级起始值：死亡/失能 100；正在受击与近身自卫 90；合法追捕/逃险 80；报告或移交赃物 70；已经承诺的交付 60；紧急休息/吃饭 50；工作/采购 40；社交与闲逛 10。相同优先级保持当前行为，不每帧来回切换；同类候选以到期时间、稳定 ID 排序。

既有一次挥击和招架结算保持原时序。新日程不能在攻击有效期覆盖位置或清空战斗状态。取消/中断行为只改变执行状态，不自动取消已经发生的案件、转账或承诺。

拟新增行为适配接口：`requestTravel(actorId,destination,intentId)`、`travelStatus(intentId)`、`cancelTravel(intentId)`。返回 `planning/travelling/arrived/waiting_for_geometry/blocked/cancelled`，附 routeId、目标和阻塞原因。只有实际抵达才生成 delivered 证据；UI 中“走到目的地”的动画不触发第二次交付。

未来领域统一使用已有 request.steps 形式，新增 domain 时同时补 reducer、协调器白名单、恢复路径、类型与错误解释。结果沿用 `{ok, code, state, events, duplicate}`。一次领取报酬中的交付、转款、任务完成必须原子提交；任一步失败均不公开部分成功。

## 时间与调度

继续使用 `checkpoint.simulationAt` 的递增毫秒作为游戏逻辑时钟。当前一天是 24 分钟现实运行时间；保留这个速度。

12-A 引入 `clockOrigin:{simulationAt,absoluteMinute}`：新世界从第 0 日 07:30 开始；旧存档以已保存的画面时间和当前模拟时间建立第 0 日基准，不猜测此前过去几天。

```text
absoluteMinute = origin.absoluteMinute + floor((simulationAt-origin.simulationAt)/1000)
dayIndex = floor(absoluteMinute/1440)
minuteOfDay = absoluteMinute % 1440
```

画面昼夜随后读同一映射，停止独立累加。暂停、菜单、保存等待不推进时间；本计划不补离线时间。工资、补货、到期委托使用唯一 occurrenceId，例如 `wage:merchant:day-2`，进入次日或读档都不能重复结算。

普通生活决策从每模拟秒一次开始，角色错峰处理；运动与战斗保留当前细粒度。需求用“上次值 + 经过时间”计算，仅在真实消费、活动切换或检查点时保存，不能每帧写事实。调度器按现有可推进状态工作，不能在 save 未确认时偷跑另一套时钟。

## 存档演进

P0-03：在七人和原玩法配置不变的前提下，新增 `living.version=2` 的布局封装；保留读取 v1，并先走原有 `validateLiving`/`restoreWorldCheckpoint` 完整验证，再添加经过验证的布局元数据。旧坐标保持，新 home 生效后由闲置角色走过去。原始 legacy 内容、玩法检查点和请求编号不重建。一次迁移只保存一次，重复打开不再搬家。

当前旧读者会因 living.version 不支持而拒绝新版，必须保持这种拒绝行为；执行时核对 document 外层版本与读取路径。不要靠“忽略未知字段”让旧版本继续写新世界。

12-A：首次新增 gameplay 领域前实现显式版本迁移。旧配置、旧目录及旧 reducer 语义需要可验证的版本读取路径；旧档先以对应规则完整恢复，再转换为新版本的初始基线和增量日志。新基线的每项财物、案件、知识、血量都须来自已验证旧状态，保留原始档案供回顾；不能把导入的任意投影直接当可信状态，也不能仅改 configSignature 让校验通过。此卡先交付版本结构和映射表供集中审阅，再落代码。

新领域与位置、时钟、待办意图在同一个 world checkpoint 中原子保存。继续比较世界 revision 和 checkpoint sequence；失败/结果未知时沿用停止提交、重新读取的恢复行为。延迟回礼、工资和任务奖励有稳定 occurrenceId 和结果回执。

新增角色/道具只在 12-A 提供相应迁移能力后进行；新 actor 必须同时进入血量/钱袋、装备、战斗、知识、位置和身份目录，不能只加一个模型。

## 经济、知识与表达

钱为非负整数文，数量为正整数；配方是显式输入消耗与输出生成，外部补货由有限来源库存和运输批次说明。借款、赊账及合同资金逐项登记；初版不产生隐形无限资金。物品所有者、实际持有人和合同收件人独立。

06-A 引入资金预留：`interactions.reservations[{id,actorId,amount,sourceId,status}]`，这是钱包的支出约束，不是第二份余额。统一 `availableWallet` 查询扣除有效预留；正常购买、赠款、工资和赔偿都检查可支配余额。结算本合同可使用它自己的预留，并把释放、双方实际钱包变动和完成状态放进同一事务；取消只释放约束，不能再次加钱。强抢/搜刮仍针对真实钱包，若损及预留资金，合同转为资金不足并记录原因，不能让资金因“预留”免于被抢或在支付时凭空补齐。UI 使用“约定报酬”，不称银行托管。

货物预留同样只约束实际 lot 的可用数量；正常出售/使用不得消费已预留部分，抢夺可使交付受损并产生失败原因。不可用 UI 限制替代 reducer 校验。

`opportunities` 是委托生命周期的唯一状态；07-B 的 commitments 模块负责把语义动作组成原子命令，不再维护另一份同名任务状态。06-A 先完成状态机和资金预留，找小何的完整场景交付由 07-B 接通。

现场感知只发生在有可靠位置、可见性与身份依据的情况下。朋友关系只影响是否愿意告诉对方，不自动复制知识；匿名证据不会因关系或全局事实转为具名。远处简化模拟不生成虚构目击。

玩家可见线索来自公告、本人经历、当面告知或已探索地点；不会直接展示陌生 NPC 的秘密、未知案件或实时全城坐标。因果回顾继续作为显式打开的世界事实视图，与人物认知分开。

## 每卡交付格式

提供实际改动文件、公开接口变化、旧档影响、依据及尚未执行的验收场景。用户于 2026-09-08 要求由当前持续 Goal 统一完成全部卡片；完成当前卡并审阅后，继续下一张依赖满足的卡片，不再等待另一位开发者。发生架构冲突时记录两处冲突契约和最小解决方案，由当前任务集中审阅。遵守现行验证授权，不虚报测试或性能。
