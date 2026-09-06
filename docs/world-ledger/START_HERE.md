# World Ledger 仓库启动说明

当前入口更新：用户已指定远端 core，并明确由 B 负责核心机制和道具。基线为 `37ab62c`，本地 core 跟踪 origin/core，第一阶段代码已编写，见 [first-loop.md](first-loop.md)。未运行测试/build/lint 或场景，未提交推送。下方未实现/未建目录及旧职责描述属于历史启动草案，以 `.lpm/CURRENT_STATE.md` 最新段为准。

最新同步：2026-09-06，本地分支已快进到远端 main 的 `6705bdf`。新版已移除旧感染者、背包、生存和现代建筑模块，并加入城防、地图传送及左键相机。以下目录分工仍是草案，涉及旧模块的映射须以 `.lpm/CURRENT_STATE.md` 和当前代码重新核对。

用户 A 维护当前 Babylon 世界，用户 B 负责社会账本。先在现有场景一角用 6 个持久 NPC 验证“偷窃→目击→举报→追捕”和“救助→感激→延迟帮助”。Unity 武侠 GTA 仍为未来候选，当前没有引擎迁移决定。

读取顺序：根 `AGENTS.md` → `.lpm/INDEX.md` → `.lpm/CURRENT_STATE.md` → 本目录 `REPO_INVENTORY.md` → `proposal/contract.md`。已有根规则保持原样：不运行测试、build 或 lint。

## 本轮交付

这是最小文档与接口提案变更，尚未提交或推送。不修改 A 的生成、场景、NPC 表现、存档源码，不升级依赖，不将参考 TypeScript 声明改造成项目工具链。

`proposal/` 保留模型说明、类型声明与 JSON 设计场景。它们来自仓库到位前的准备包，是待联审草案；检查器、历史结果与完整 A/B 任务说明保留在 B 的 `D:\WorldLedger\pre-repo` 及已交付启动包。契约内历史检查方法是准备阶段记录，不是对本仓库根规则的覆盖。

## 分工与待审阅目录

| 职责 | 路径 | 归属与状态 |
|---|---|---|
| 世界生成与规划 | `src/game/world/` | A，沿用现有实现 |
| 物理世界与场景装配 | `src/game/scenes/`、`entities/`、`spawning/` | A，沿用现有实现 |
| 世界持久化 | `src/game/persistence/`、`world/progress.js` | A，现有存档不可被 B 擅自扩写 |
| 世界适配器 | 提议 `src/game/worldLedgerAdapter/` | A，尚未创建，待审阅 |
| 社会规则核心 | 提议 `src/game/worldLedger/` | B，尚未创建，纯 JavaScript ESM，无引擎依赖 |
| 契约正式入口 | 当前 `docs/world-ledger/proposal/`；冻结后确定正式位置 | B 整理、A 审阅；尚未冻结 |

共同确认单调模拟毫秒、稳定 NPC 身份、事件时刻感知帧、识别证据、Goal/回执和联合保存，再落实正式接口。A 管物理执行与真实结果，B 管事实账本、认知、关系和社会计划；NPC 不得从全知事实获得尚未得知的身份或位置。

M1 规则层与真实场景联调层均满足验收才算整体通过。M2 死亡、亲属报复、势力关系与完整存档需要后续契约扩展；不能从现有 DTO 推断它们已经支持。

## 协作入口

[Notion 项目页](https://app.notion.com/p/World-Ledger-A-B-3d3035b50c2c8045addfd27365d2d755) · [任务看板](https://app.notion.com/p/3d3035b50c2c801ea070f1dfb15f5dcd?v=3d3035b50c2c8022bfda000c93923677)

GitHub 保存代码与版本化契约，Notion 保存任务和证据链接。没有后台自动同步。本轮仓库 URL、基线和本地分支尚未更新到 Notion；不要在页面里标成已 PR 或已完成联调。A 账号访问仍需核验。
