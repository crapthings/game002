# B侧可复用玩法框架

起点：core已提交药包闭环。新增模块位于src/game/gameplay，暂不接入场景、公共UI、存储或A的世界模块；旧progress.ledger与现有体验继续使用原规则。

## 已编写：物品和背包内核

inventory.js以catalog、containers、lots三类数据表示物品。物品定义含id/name/unitSpace、可消耗/交易/赠予标记、恢复量；价格属于后续交易报价，不固定到全世界统一售价。

容器capacity按物品数量×unitSpace计费，null表示无限容量。一个lot保存稳定id、itemType、quantity、ownerId、holderId，所有者与存放容器独立。持有别人的物品同样占容量。同种物品不同所有者保持独立批次。

createCatalog生成冻结配置；createInventory校验后返回独立快照；inventoryContents返回副本。transferLot返回新的状态：整批转移保留id，部分转移必须提供未占用splitId。省略toOwnerId保留所有权；购买/赠予由上层显式指定新所有者。consumeLot移除消耗数量，数量归零移除批次。失败抛出带code的InventoryError，输入状态不修改。

这两项变更函数是可信底层原语，不是直接暴露给玩家的命令：它们不判定授权、距离、资金、意愿或使用效果。下一步统一交互层必须在同一候选状态中完成权限、报价/付款、效果和事件，失败不提交任何变更。

## 后续持续目标

1. 购买/出售/使用/赠予统一命令，成功结果、失败原因、事实事件及重复请求处理。
2. 目击、识别、送达举报、关系变化的通用接口，避免固定NPC依赖。
3. 药包数据接入样例与兼容策略，明确由A提供的空间条件和NPC执行接口。

本轮仅人工源码检查，不运行AGENTS.md禁止的测试/build/lint。内核尚未运行验证，也尚未接入游戏，不能把已验收的旧闭环结果当作此新模块的通过证据。

## 已编写：统一交互事务

interactions.js新增createInteractionState与executeInteraction。角色以id、containerId、wallet、health/maxHealth登记，不绑定药商或柳娘。命令字段为id/kind/actorId/targetId/lotId/quantity/expectedRevision；kind支持buy/sell/use/gift。

buy由actor向target购买，sell由actor向target出售，gift由actor赠予target，use当前只支持自己使用一份恢复道具。交易和赠予要求来源角色同时持有且拥有物品，涉案物不能出售、消耗或赠予。gift仅转移财产，不自动治疗或增加信任；这些后果由后续事件系统明确处理。

可信适配层提供context.allowed、at（模拟毫秒）和交易unitPrice。allowed必须涵盖当前指令的距离、遮挡、同意及拒绝策略，报价必须来自商店策略；绝不能把UI传入的布尔值当作授权。框架不读取Babylon，也不替A决定空间条件。

成功返回{ok:true,code,state,events,appliedEventId,duplicate}，由接入方提交state并转发events；失败返回{ok:false,code,events:[]}，没有半成品state。资金、容量、所有权或效果检查任一失败，原状态不动。事件包含物品批次、数量、双方身份、金额和实际恢复量。

成功请求以id和规范字段指纹去重；完全相同的重试返回ALREADY_APPLIED与原eventId，不产生events、不再次付款。相同id改内容返回REQUEST_ID_CONFLICT。新请求必须带最新revision；失败请求不占id。当前历史上限4096条，达到上限停止新操作，保留已成功请求的去重能力；不偷偷清除账本。

example.js提供可导入的配置/购买调用样例，没有自动执行。由调用方先完成空间和商人策略检查，再传入policy；结果不直接写旧progress.ledger。assertInteractionState目前只校验运行态结构，完整事件来源/存档回放验证尚待实现，不能直接用于不可信存档恢复。

## 已编写：通用知识与定向关系

knowledge.js提供createKnowledgeState(actorIds)、executeKnowledge(state,command,context)、knowledgeFor(state,npcId)。使用与交易相同的结果形状、expectedRevision和请求id去重机制；返回独立状态，失败不返回候选状态。它消费由模块产生的可信运行态，尚未提供不可信存档的完整恢复验证。

| 命令kind | 关键字段 | 可信适配层必须提供 | 效果 |
|---|---|---|---|
| fact | factId/actorId/targetId/action | at/allowed/sourceEventId | 记录唯一外部事实来源，不自动写任何角色知识 |
| witness | factId/actorId（观察者） | observed/observedAt/identified/proofId | 记录一次该角色目击；identified为false时主体保持null |
| report | factId/actorId（举报人）/targetId（接收者） | delivered/proofId | 仅从举报人当前知识取身份，实际送达后接收者获知 |
| relationship | factId/actorId（评价者）/targetId（被评价者） | trustDelta/ruleId | 必须已知道该事实的主体身份；信任限于-100至100，每人每事实只结算一次 |

所有命令另需id、expectedRevision；context需allowed=true和非倒退模拟at。proofId和sourceEventId是接入方提供的证据标识，本层不能验证几何、实际送达或外部账本真实性，不应由UI自行填值。observedAt必须对应事实发生时刻，防止事后看见某人就被当成目击原事件。

知识可以从匿名升级为有证据的具名记录，不能因弱消息降级；重复送达同一证据不重复生成报告。另一角色获知事实需要自己的目击或实际送达；不存在全局声望。举报记录可以作为后续举报依据形成传播链，但不会触发自动移动、自动追捕或自动关系分数。

接入顺序示例：赠予成功的interaction事件→注册gift事实→接收者实际观察并识别施赠者→按gift规则给予定向信任。若未识别，仍可记匿名善举，但relationship命令返回SUBJECT_UNIDENTIFIED。普通gift只转移物品，救助消耗和回礼调度仍需上层玩法明确定义。

后续：将新框架初始状态、指令和可信上下文组成可回放恢复契约；补齐跨模块原子提交与药包接入方案，再提供统一审阅包。当前新层没有接入旧存档或场景，旧玩法验收不能代替新模块验证。

## 已编写：协调提交、重放与A侧接入准备

runtime.js新增createGameplay/executeGameplay/restoreGameplay，index.js为对外入口。一次request包含最多32步，交互事实自动登记至知识模块，任一步失败都不返回可提交状态。全局模拟at不得倒退，请求journal限4096条（各子模块也各有4096条上限）；同请求幂等重试不发事件。达到任何上限整批拒绝，不截断历史。

恢复用应用提供的可信config初始化，再重放journal，核对configSignature、钱包、物品、知识、关系、事件、去重回执等完整投影。重放不执行场景或外部回调，返回events为空。此为一致性验证，不是防篡改认证。

integrationExample.js与A-INTEGRATION.md明确如何绑定NPC及哪些证据由世界层提供。新存档字段、正式场景接入和运行检查仍未实施；旧药包存档保持原样。前文“恢复待实现”描述的是之前进度，本段为最新代码状态；全部新模块仍未运行验证。

公开接口补充：index.d.ts给出配置/容器/批次/角色、命令与策略上下文、事件、快照和结果声明；没有新增依赖或运行类型检查。runtime还将标准化catalog绑定到初始state，每次执行先核对，避免同一状态误用另一套容量或恢复量配置。新快照尚未用于实际游戏，不提供此前开发草案快照的隐式迁移。

## 不依赖世界的后续：会话管理

用户明确要求不等A继续推进后，新增session.js：私有已提交状态、最多32项串行队列、请求副本、保存确认后发布、明确拒绝和结果未知分支、关闭时等待在途写入。存储通过save函数注入；新代码未直接修改A的世界或现有存档层。公开入口和类型声明同步新增createGameplaySession。

后续仍可独立完善指令构造/错误提示契约、配置与策略校验、模块静态审阅和交接材料；不能把A未提交当作所有B侧工作都必须等待的理由。新模块运行验证限制仍适用。
## 请求接入补齐

新增 requests.js / prepareGameplayRequest：自动捕获整体 revision，以同一协调器预检查完整请求，丢弃候选效果并冻结可重试原件。已使用 ID 禁止以新报价和新时间重新构造；实际提交仍通过 session.dispatch。示例与公开声明已同步。会话和准备接口均未连接正式场景或存储，未执行运行验证。

## 当前交付结论

以上分段保留实施过程；“下一步”“尚待实现”的早期描述由后续已编写章节取代。当前持续目标要求的独立模块、公开接口、接入示例及统一审阅材料已齐备。A-INTEGRATION.md 补齐失败原因处理表和玩法规则配置分工。源码审阅已覆盖各模块及声明的一致性；遵守仓库规则，不运行测试、build、lint。

本次交付为可审阅的框架实现与接入准备。正式场景绑定、空间证据、持久化适配和运行验收仍未实施；不得把旧案例验收结果移用于新框架，也不得将本次模块交付写成游戏已完成。
