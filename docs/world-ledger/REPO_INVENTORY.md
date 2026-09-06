# 仓库只读盘点与接口差异

历史盘点提示：本地已于 2026-09-06 更新到 `6705bdfc3af46a2a8a821277a44ab2e4a31d8b21`。新版删除感染者/生存/背包和旧建筑模块，生成器与存储为 v6，包名已改为 game002；原架构总览也已更新。下文保留首次接入的 f1c56b4 基线证据，不能据此认定旧路径仍存在。开始 B 实现前需核对新版适配位置。

日期：2026-09-06；基线：`f1c56b472c2726e79a4e59a172aa52a7ff8b9fc4`，main。

## 已核实事实

用户提供的仓库是 https://github.com/crapthings/game002 。clone 成功，初始工作区干净；本地准备分支为 `b/project-bootstrap-docs`。包名仍为 game001，不据此改名或改错仓库。

`package.json`：JavaScript ESM / JSX，pnpm 10.33.2，Node >=22.12.0；Babylon 9.25.0、React 19.2.8、Vite 8.2.2、Zustand 5.0.15。本机 Node 22.20.0 满足声明版本。项目提供 dev/build/preview，没有声明 test/lint 脚本；tests 目录存在不代表已执行。

根 AGENTS.md 明确“不运行测试”“不运行 build”“不运行 lint”。本轮仅代码阅读和版本盘点，未装依赖、未启动、未执行上述检查，运行基线未验证。

## 实际入口与接入影响

| 入口 | 阅读结果 | 对 Ledger 的影响 |
|---|---|---|
| `src/game/world/worldConfig.js` | WORLD_SIZE=512，X/Z 范围 [-256,256)，1 单位=1 米 | DTO 使用米，2D 地图 x/z 与 3D x/y/z 显式转换 |
| `src/game/world/generation/generateWorld.js` | GENERATOR_VERSION=4、PLAN_VERSION=2；中央城市与周边区域 | 保存 seed、生成器版本及实体命名空间，不只保存 seed |
| `src/game/scenes/createWorldScene.js` | 世界、玩家、流式区块、昼夜、感染者与检查点的装配入口 | A 挂接适配器、暂停边界、感知采样与回执，不让 B 直接改场景 |
| `src/game/entities/createPlayer.js` | 脚底根节点、面向 +Z、空手侠客模型 | 角色题材已变化，不能按旧末世人物文档判断当前实现 |
| `src/game/spawning/createSpawnPlan.js` | 感染者有 infected-v1/x/z/index ID；遮挡函数为建筑占地线段判定 | 现有 ID 只证明感染者出生点标识，不等于 6 名社会 NPC；遮挡函数不是完整事件时刻感知系统 |
| `src/game/spawning/createSpawnManager.js` | 根据位置与可见性加载/卸载感染者模型 | 模型卸载不能视为社会 NPC 死亡；不能把面向玩家的可见性判断直接当作 NPC 知情 |
| `src/game/world/createDayNightCycle.js` | dt 驱动小时数，时间在 [0,24) 取模 | 不能直接当单调 Ledger 时间；跨日和保存恢复需要额外 elapsedSimMs/序号 |
| `src/game/world/progress.js` | 探索、位置、背包、生存和 worldTime 进度入口 | 尚不能推断已保存社会关系、知识、待办队列和执行幂等状态 |
| `src/game/persistence/asyncWorldRepository.js` | IndexedDB game002-worlds-512-v4，worlds/progress 分存，revision 检查 | 跨世界/社会的联合检查点、兼容性与恢复策略须共同设计，不直接增加数据库字段 |

对 src/docs/tests 的 Ledger、Witness、Knowledge、Relationship、Faction、Crime、Bounty、Reaction 名称搜索没有命中社会系统实现。结合已读入口，本轮未发现所需社会核心；这不是对所有潜在行为的运行证明。

## 文档差异

`docs/architecture.md` 仍描述 2048 世界、旧相机与 game001 存储。当前尺寸和保存命名以代码及 `docs/world-512.md` 为准。旧总览由 A 后续核对更新，本轮不扩大修改范围。

## 给 A 的第一轮审阅事项

1. 确认上述模块归属；A 实现薄适配器，B 实现纯 JS 社会核心。
2. 定义 6 名持久 NPC 的身份及卸载后状态，不复用渲染对象 ID。
3. 确认暂停冻结的单调模拟毫秒、事件排序与保存恢复；昼夜小时数只用于表现。
4. 提供事件发生时的感知证据，区分看到/听到/认出；所有 NPC 行动依据各自认知。
5. 确认目标执行、失败、取消及重复回执规则；送达举报后才产生机构知情。
6. 确认存档版本和跨模块检查点；旧存档不被草案覆盖。

这些属于待联审接口，并非已冻结或已完成任务。下一项 B 工作是根据审阅结果实现最小规则链；当前仅迁入设计材料。
