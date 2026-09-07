# A接入B侧模块：世界准备好后怎么连接

当前交付是规则模块，不含正式场景、NPC站位或势力范围。旧药包案例继续可用；新模块尚未挂到场景，未运行测试/build/lint，也未要求重复试玩旧案例。

## 接入入口和数据

从src/game/gameplay/index.js导入createGameplay、executeGameplay、restoreGameplay。integrationExample.js包含独立世界配置、购买、具名赠予及信任变化调用；示例不会自动执行。

同目录index.d.ts描述公开配置、请求、事件、快照和结果类型，可供编辑器补全。失败结果没有state；成功重复请求的events为空。声明文件不改变仓库JS技术栈，也没有引入TypeScript依赖。

A提供稳定的NPC ID及ID→世界角色映射。config包含独立世界/规则版本id、items、containers、lots、actors。每名角色绑定一个不共享的容器，登记钱包和气血；批次记录所有者与持有容器。场景坐标、mesh、寻路对象和势力多边形都留在A侧，不放进这些可保存数据。

不要将config.id仅设为通用版本号后跨世界复用：它需要区分世界种子及规则配置版本。恢复时使用与原世界一致的可信初始配置；配置签名也会参与一致性核对。配置变更需要显式迁移，不能以新初始化覆盖读档失败。

执行时也会核对catalogSignature，传入另一套物品容量/效果配置返回CATALOG_MISMATCH，不能通过换catalog让旧状态采用新规则。签名是规范化配置文本的一致性标记，不是加密或身份认证。

## 世界层需要给出的结果

| A或接入适配层 | B规则模块 |
|---|---|
| 检查距离、遮挡、加载、落地及是否可交互 | 检查容量、数量、财产权、资金和效果 |
| 商人是否接受当前交易、实际报价 | 按报价在双方钱包间转账，记录事实 |
| 接收者是否接受赠予 | 转移所有权和持有权，不自动增信任 |
| 事实发生时，谁看见、是否认出及证据ID | 给对应角色生成具名或匿名知识 |
| 举报者实际走到接收者处，提供送达证据 | 接收者获得举报人知道的信息 |
| 玩法策略为某类事实配置trustDelta/ruleId | 必须有身份知识才结算定向信任，且同一事实不重复结算 |

context.allowed/proofId不能直接来自玩家UI，必须由可信游戏适配器计算。完整势力成员规则、区域管辖和追捕调度仍是后续功能；当前模块不会根据站位自动创建势力，也不会自行移动任何NPC。

## 一次指令怎么提交

1. UI表达意图；适配器读取当前世界结果，组装request，分配唯一id与当前state.revision。
2. request.steps每项含domain（interaction或knowledge）、command、context；最多32步。子命令id和expectedRevision由协调器生成。
3. executeGameplay返回ok:false时只显示code对应的原因，不改当前状态。成功时将整个result.state作为一次进度更新；不要分别写钱包、背包和知识。
4. 交互事件自动登记社会事实，ID为fact:interaction:N。事实登记失败，整批交易也不提交。事实仍不自动让角色知情，后续witness/report要有真实依据。
5. 串行处理状态提交；成功保存后发布事件给表现层。不要在各个reducer内部启动寻路、播放通知或支付外部余额。

同一已成功请求重复送达，只返回ALREADY_APPLIED且events为空。重试必须保留原请求id、expectedRevision、steps和上下文；重建带新revision的请求属于新尝试，不能当原请求重试。示例购买/赠予函数为构造新请求提供示意，正式适配器须保留发出的原始request用于重试。

## 保存与旧案例兼容

保存新runtime的完整state（含journal与各投影）。restoreGameplay用初始配置重放成功请求并比较全部投影，恢复结果events为空，不重播表现、不重复实际付款。它验证记录自洽，不能证明本地文件中的几何证据未被整体伪造。

当前不要把新state塞进旧progress.ledger：旧校验只接受药包v1结构。建议后续接入时新增明确版本的独立字段，并与玩家位置同事务保存。此字段目前没有加入仓库存储层；由双方联调时接入。旧ledger不删除、不迁移、不重算。旧一次救助/延迟回礼/案件调度并未自动搬入新模块。

## 可选会话层：串行指令与保存确认

新增createGameplaySession(config,{saved,save})。会话私有持有已提交状态，snapshot()给出副本，dispatch(request)按顺序执行；同一时刻最多32个未完成请求。排队不会自动改写expectedRevision：需要在上一操作确认后创建新的意图请求；原请求重试保持原样。

注入save(candidate,metadata)，metadata包含configId、expectedRevision、nextRevision、requestId。保存器必须按世界/版本原子比较后写入完整candidate，并返回{status:'committed',revision:nextRevision}才算成功。初始世界没有记录时须由保存器明确处理首次创建，已有记录不能被当作初始空档覆盖。

只有确定未写入时返回{status:'rejected'}。若是其他写入者造成冲突，返回code:'STORAGE_CONFLICT'，会话要求重读。保存抛错、超时或回执不完整均视为结果未知，返回SAVE_OUTCOME_UNKNOWN并停止后续变更；必须从存储恢复新会话，不能假设没有写入就用旧内存继续付款。恢复后的原请求会按成功日志去重。

snapshot在保存中仍显示最近已确认状态；成功事件只从dispatch成功结果发布。close()禁止新指令和未开始的排队指令，但不取消正在写入的事务，等待其结束后返回最终快照。没有设置强制超时来假装取消不可撤回的存储写入。保存器仍由接入方实现，此处没有修改现有IndexedDB代码。

## 交接状态补充

已编写：道具/容器/批次、buy/sell/use/gift、目击与送达传播、定向信任、跨模块候选状态原子更新、日志恢复、配置与调用示例。

尚待：A侧世界实体映射、空间证据、动画/移动执行、商店和关系策略、UI错误文案、新存档字段及联合运行检查。B继续负责模块缺陷与接入协助，不负责本轮世界搭建。
## 请求准备与重试

通过 `prepareGameplayRequest(state,catalog,{id,steps})` 一次性构造请求，成功返回 PREPARED 和冻结的 request。它调用同一套规则检查当前容量、资金、所有权与知识前提，但丢弃候选状态与事件，不保存、不预占库存。正式结果仍以 `session.dispatch(request)` 为准。

接入顺序：读取会话快照 → A 的适配层计算当时的空间证据、报价及意愿 → 准备请求 → 保存原 request 供重试 → dispatch → 收到确认后更新表现。不要把 PREPARED 当作购买完成。示例见 integrationExample.js 的 preparePurchaseExample。

SAVE_REJECTED 可重发原请求；SAVE_OUTCOME_UNKNOWN、STORAGE_CONFLICT 或 RECOVERY_REQUIRED 先重新读取持久化快照并打开会话，再重发原请求。STALE_REVISION 表示此请求未被当前状态接受；刷新后若仍要执行，重新计算策略并生成新的请求 ID。已使用 ID 无法重新准备，返回 REQUEST_ID_ALREADY_USED；成功请求的原件仍可直接 dispatch，返回 ALREADY_APPLIED 且不再次发布事件。

这些接口不允许把 UI 提供的 allowed、价格或目击结果直接当可信策略。请求在内存中冻结只防误改，不验证空间证据真实性。未接入正式存储前，不宣称崩溃恢复已经落地。

## 失败原因处理契约

以下是接入层的处理约定，不直接修改公共 UI。交易中的 INSUFFICIENT_FUNDS 指付款方：buy 是玩家，sell 是收购物品的商人；BAG_FULL 指收货容器，不能一律显示“你的背包已满”。

| code | 含义与处理 |
|---|---|
| BAG_FULL / INSUFFICIENT_QUANTITY | 收货方容量不足／该批次数量不足；刷新相关库存，保留原状态 |
| INSUFFICIENT_FUNDS | 付款方资金不足；按交易方向说明是谁缺钱 |
| NOT_HELD / NOT_OWNED | 来源角色未持有／不拥有此批次；不能仅凭背包中可见就出售 |
| NOT_TRADABLE / NOT_GIFTABLE | 物品配置禁止该操作 |
| HEALTH_FULL / NO_USABLE_EFFECT / USE_ONE_AT_A_TIME | 已满血／没有当前支持的恢复效果／一次只能使用一份 |
| INTERACTION_DENIED | 适配层未允许；距离、意愿等具体原因由适配层保留并展示，不凭这个代码猜测 |
| SUBJECT_UNIDENTIFIED | 角色尚不知道事实主体身份；不增加具名信任，不用全局事实补身份 |
| REPORTER_UNINFORMED / REPORT_NOT_DELIVERED / MISSING_OBSERVATION | 缺少知识或空间证据；交回适配层处理，不能当成功 |
| ALREADY_WITNESSED / REPORT_ALREADY_DELIVERED / RELATIONSHIP_ALREADY_APPLIED | 该语义效果已记录；不再次播放成功效果，不靠换请求 ID 绕过 |
| STALE_REVISION / REQUEST_ID_CONFLICT / REQUEST_ID_ALREADY_USED | 按上文版本和原请求重试契约处理 |
| QUEUE_FULL / SESSION_CLOSED | 队列已满／会话已关闭；不继续自动堆积新请求 |
| SAVE_REJECTED | 明确未保存；保留原请求，允许稍后重试 |
| SAVE_OUTCOME_UNKNOWN / STORAGE_CONFLICT / RECOVERY_REQUIRED | 恢复持久化状态后再决定；不展示“已经扣款”或“肯定没扣款” |
| HISTORY_FULL | 当前账本达到上限；不删除历史来继续，不反复自动重试 |
| INVALID_* / UNKNOWN_* / CATALOG_MISMATCH / PROJECTION_MISMATCH 等 | 配置、绑定或数据问题；保留代码供 B 排查，不映射为资金不足或操作成功 |

失败结果的 events 为空且没有可提交 state；不意味着可以丢弃恢复所需的原请求。业务错误使用返回结果；初始化配置错误和未预期的编程异常仍可能抛出，宿主应记录并停止该次操作，不能伪造成功回执。

分工：B维护物品效果、交易和关系规则及失败代码；A提供实体、空间证据、移动与表现。商店报价和信任规则数值由玩法侧配置，世界适配层负责在正确时点传入，双方联调时确定配置所在文件。
