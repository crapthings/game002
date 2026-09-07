/** Public module contract. These declarations do not add a runtime dependency. */
export interface ItemInput {
  id: string; name: string; unitSpace?: number; consumable?: boolean;
  healing?: number; tradable?: boolean; giftable?: boolean;
}
export interface ItemDefinition {
  readonly id: string; readonly name: string; readonly unitSpace: number;
  readonly consumable: boolean; readonly healing: number;
  readonly tradable: boolean; readonly giftable: boolean;
}
export type Catalog = readonly ItemDefinition[];
export interface Container { id: string; capacity: number | null }
export interface Lot {
  id: string; itemType: string; quantity: number; ownerId: string; holderId: string;
}
export interface Actor {
  id: string; containerId: string; wallet: number; health: number; maxHealth: number;
}
export interface GameplayConfig {
  id: string; items: ItemInput[]; containers: Container[]; lots?: Lot[]; actors: Actor[];
}
export interface InventoryState {
  version: 1; revision: number; containers: Container[]; lots: Lot[];
}
export interface Receipt { requestId: string; fingerprint: string; eventId: string }
export interface InteractionEvent {
  id: string; kind: 'buy' | 'sell' | 'use' | 'gift'; at: number; cause: null;
  actorId: string; targetId: string; itemType: string; sourceLotId: string;
  resultLotId: string | null; quantity: number; fromOwnerId: string;
  toOwnerId: string | null; amount: number; restoredHealth: number; requestId: string;
}
export interface InteractionState {
  version: 1; revision: number; inventory: InventoryState; actors: Actor[];
  events: InteractionEvent[]; receipts: Receipt[];
}
export interface Fact {
  id: string; actorId: string; targetId: string | null; action: string;
  at: number; sourceEventId: string; eventId: string;
}
export interface Knowledge {
  npcId: string; factId: string; subjectId: string | null; evidenceId: string;
}
export interface Relationship { fromId: string; toId: string; trust: number }
interface SocialEventBase { id: string; at: number; requestId: string }
export type SocialEvent =
  | (SocialEventBase & { kind: 'fact'; cause: null; fact: Fact })
  | (SocialEventBase & { kind: 'witness'; cause: string; factId: string; actorId: string;
      subjectId: string | null; proofId: string; observedAt: number })
  | (SocialEventBase & { kind: 'report'; cause: string; factId: string; actorId: string;
      targetId: string; subjectId: string | null; proofId: string })
  | (SocialEventBase & { kind: 'relationship'; cause: string; factId: string; actorId: string;
      targetId: string; ruleId: string; requestedDelta: number; appliedDelta: number });
export interface KnowledgeState {
  version: 1; revision: number; actorIds: string[]; facts: Fact[];
  events: SocialEvent[]; knowledge: Knowledge[]; relationships: Relationship[]; receipts: Receipt[];
}
/** at is simulation milliseconds; allowed is computed by the trusted adapter. */
export interface Policy { at: number; allowed: boolean }
export interface InteractionCommand {
  kind: 'buy' | 'sell' | 'use' | 'gift'; actorId: string; targetId: string;
  lotId: string; quantity: number;
}
export type GameplayStep =
  | { domain: 'interaction'; command: InteractionCommand; context: Policy & { unitPrice?: number } }
  | { domain: 'knowledge'; command: { kind: 'fact'; factId: string; actorId: string;
      targetId: string | null; action: string }; context: Policy & { sourceEventId: string } }
  | { domain: 'knowledge'; command: { kind: 'witness'; factId: string; actorId: string };
      context: Policy & { observed: boolean; observedAt: number; identified: boolean; proofId: string } }
  | { domain: 'knowledge'; command: { kind: 'report'; factId: string; actorId: string; targetId: string };
      context: Policy & { delivered: boolean; proofId: string } }
  | { domain: 'knowledge'; command: { kind: 'relationship'; factId: string; actorId: string; targetId: string };
      context: Policy & { trustDelta: number; ruleId: string } };
export interface GameplayRequest { id: string; expectedRevision: number; steps: GameplayStep[] }
/** Retain the returned request unchanged; preparation performs no commit. */
export function prepareGameplayRequest(state: GameplayState, catalog: Catalog, input: {
  id: string; steps: GameplayStep[];
}): Failure | { ok: true; code: 'PREPARED'; request: GameplayRequest };
/** Treat as one snapshot; do not mutate projections or journal independently. */
export interface GameplayState {
  version: 1; configId: string; configSignature: string; catalogSignature: string;
  revision: number; at: number; interactions: InteractionState; social: KnowledgeState;
  journal: GameplayRequest[];
}
export type GameplayEvent = InteractionEvent | SocialEvent;
export type Failure = { ok: false; code: string; events: [] };
export type ExecuteResult = Failure | {
  ok: true; code: 'APPLIED' | 'ALREADY_APPLIED'; duplicate: boolean;
  state: GameplayState; events: GameplayEvent[];
};
export type RestoreResult = Failure | {
  ok: true; code: 'RESTORED'; catalog: Catalog; state: GameplayState; events: [];
};
/** Throws if the application's initial configuration is invalid. */
export function createGameplay(config: GameplayConfig): { catalog: Catalog; state: GameplayState };
/** Consumes trusted live state. Use restoreGameplay for persisted input first. */
export function executeGameplay(state: GameplayState, catalog: Catalog, request: GameplayRequest): ExecuteResult;
export function restoreGameplay(config: GameplayConfig, saved: unknown): RestoreResult;
/** Query results are detached copies; inventory is state.interactions.inventory. */
export function inventoryContents(state: InventoryState, holderId: string, ownerId?: string): Lot[];
export function occupiedSpace(state: InventoryState, catalog: Catalog, holderId: string): number;
export function itemDefinition(catalog: Catalog, itemType: string): ItemDefinition;
export function knowledgeFor(state: KnowledgeState, npcId: string): Knowledge[];

export interface SaveMetadata {
  configId: string; expectedRevision: number; nextRevision: number; requestId: string;
}
/** 'rejected' guarantees no candidate write; exceptions mean outcome unknown. */
export type SaveReceipt =
  | { status: 'committed'; revision: number }
  | { status: 'rejected'; code?: string };
export interface GameplaySession {
  snapshot(): GameplayState;
  status(): { closed: boolean; recoveryRequired: boolean; saving: boolean; pending: number; revision: number };
  dispatch(request: GameplayRequest): Promise<ExecuteResult>;
  close(): Promise<GameplayState>;
}
/** Invalid initial configuration or saved state throws without opening a session. */
export function createGameplaySession(config: GameplayConfig, options: {
  saved?: unknown;
  save: (candidate: GameplayState, metadata: SaveMetadata) => SaveReceipt | Promise<SaveReceipt>;
}): GameplaySession;
