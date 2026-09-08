# 12-A：版本结构与字段映射

设计基线：78cf8df（P0）。本页先固定迁移规则，再由当前 Goal 实施与源码审阅；不是运行验收证明。当前已接入 living v3 / document schema 5 / gameplay v2；living v1、P0 v2 仍可恢复。

## 版本读取

- gameplay v1：复制 P0 提交的 reducer 依赖闭包到 `gameplay/versions/v1/`，旧档始终通过这份规则完整重放。后续营业、预留资金、制服等改动不能改变旧重放结果。
- gameplay v2：保留一份已经验证的 v1 世界检查点作为 `archive.legacyCheckpoint`，明确记录迁移起点与原始身体参与者。以此生成新基线，再重放 v2 的增量请求。不能接受任意投影为新基线。
- 旧接口创建/执行 v1 的行为保留；场景显式调用一次性迁移。外层世界 sequence 延续，第一次成功保存才写新版；失败保留原始档案和原恢复行为。
- 新领域通过本版本明确支持的初始化/语义命令加入，同一个 session 原子提交。新增领域不会使旧初始基线凭空多字段，也不靠修改 configSignature 通过校验。

## v1 → v2 映射

| 原字段 | 新字段/处理 |
| --- | --- |
| interactions.actors / inventory | 原样保留所有钱、血、所有者、保管者和数量 |
| combat / equipment / robbery | 保留挥击、气力、装备、冷却和人格数据 |
| social | 保留事实、个人认知、身份不明、关系与证据来源 |
| crime / pursuit / property | 保留案件、最后见到的位置、证据和财物责任 |
| village | 保留原救助/回礼、蒙面、药包与搬运事件 |
| revision / at | 保持递增，不归零；全局请求编号不得复用 |
| journal | 原日志留在 archive.legacyCheckpoint；v2 活跃增量从空列表开始 |
| configSignature / catalogSignature | 与应用可信初始配置一致；迁移不伪造签名 |
| sequence / simulationAt | 外层检查点原值延续，下一次保存 sequence +1 |
| legacy、spatial、layout、travels、patrols、clues | living 封装保留，不重置或瞬移 |
| 新 calendar | origin={simulationAt,absoluteMinute}；起点来自旧检查点与已保存画面时间 |
| 新 registry | 显式列出参与规则的 actorId 和 hasBody；既有角色逐一映射 |

重复请求先查活跃日志，再查归档旧日志，内容一致返回既有成功，内容不同拒绝。12-B 之前继续原容量保护，不删除旧回执或把上限调大。

## 时间与新增人物

日历以 simulationAt 为唯一运行时钟；1000 模拟毫秒对应 1 游戏分钟，1440 秒一游戏日。旧世界只以保存的时刻设为第 0 日，不猜测过往天数；新世界 07:30。画面昼夜读同一日历投影，暂停、地图、保存等待和离线均不推进。

新增具名人物必须引用内置、版本固定的 arrival 模板，明确有限初始钱物来源。一次到达事务同时扩充 actors、container/lots、social actorIds、combat、equipment、robbery、crime 身份及 registry；已存在 ID 不得再次出生。场景在确认合法位置后提供到达依据，身体坐标与玩法检查点同时保存。

registry 的身体登记是出生/身份记录，当前坐标始终只在 living.spatial。新人物不是把背景人群全接进来；供货商、组织成员和最后的 12 人观察分别由后续卡片触发。

## 集中审阅结论

保留冻结的旧读取路径；新基线由已验证原档推导；财物和案件逐字段保留；新增人物使用有限模板和原子到达；单一时钟与原有保存确认对齐。允许据此继续实现。正常旧档、追捕/待回礼/尸体档、损坏档及重复打开仍需后续针对性运行证据。

实现入口：`migrations/v2.js`、`living/clock.js`、`registry.js`、`living/actorRegistry.js`。场景主体名单、模型与旧档位置验证已按 registry 扩展；新增身体只在到达检查点保存确认后加入。当前仅登记供货商的有限到达模板，尚未触发出生，实际供货由 04-A 接入。

新增领域将在 v2 增量日志中通过明确命令初始化，因此后续领域上线不会改变 v2 的迁移初始基线。旧 v1 日志参与请求 ID 去重，`live-N` 编号也查旧档最大值，避免迁移后重用已消耗编号。当前尚未做 12-B 历史分页，原容量保护保留。
