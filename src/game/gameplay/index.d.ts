/** Public module contract. These declarations do not add a runtime dependency. */
export interface ItemInput {
  id: string; name: string; unitSpace?: number; consumable?: boolean;
  healing?: number; tradable?: boolean; giftable?: boolean;
  equipment?: { slot: 'weapon' | 'armor'; attack?: number; defense?: number };
}
export interface ItemDefinition {
  readonly id: string; readonly name: string; readonly unitSpace: number;
  readonly consumable: boolean; readonly healing: number;
  readonly tradable: boolean; readonly giftable: boolean;
  readonly equipment?: Readonly<{ slot: 'weapon' | 'armor'; attack: number; defense: number }>;
}
export type Catalog = readonly ItemDefinition[];
export interface Container { id: string; capacity: number | null }
export interface Lot {
  id: string; itemType: string; quantity: number; ownerId: string; holderId: string;
}
export interface Actor {
  id: string; containerId: string; wallet: number; health: number; maxHealth: number;
  /** Required when config.combat is true. */
  attack?: number; defense?: number;
  courage?: number;
}
export interface GameplayConfig {
  id: string; items: ItemInput[]; containers: Container[]; lots?: Lot[]; actors: Actor[];
  combat?: true;
  authorities?: string[];
  village?: VillageSetup;
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
  reservations?:MoneyReservation[]; itemReservations?:ItemReservation[];
}
export interface Reservation {id:string;actorId:string;sourceId:string;status:'held'|'impaired'|'released'|'spent';at:number;reasonEventId:string|null}
export interface MoneyReservation extends Reservation {amount:number}
export interface ItemReservation extends Reservation {lotId:string;holderId:string;quantity:number}
export function availableWallet(state:InteractionState,actorId:string,usingId?:string|null):number;
export function availableQuantity(state:InteractionState,lotId:string,usingId?:string|null):number;
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
export type GameplayStep = (
  | { domain: 'places'; command: {kind:'register'|'extend';actorId:string;definitions:RegisteredPlace[];bindings:RegistryBody['binding'][]}; context:Policy & {geometryConfirmed:true} }
  | { domain: 'places'; command: {kind:'presence';actorId:string;placeId:string;status:'available'|'away'|'resting'|'danger'}; context:Policy & {present:boolean;proofId:string;cause?:string|null} }
  | { domain: 'places'; command: {kind:'enable_services';actorId:string}; context:Policy }
  | { domain:'life'; command:LifeCommand; context:Policy & {present?:boolean;proofId?:string;cause?:string|null;safe?:boolean} }
  | { domain:'dialogue'; command:{kind:'initialize';actorId:string}; context:Policy }
  | { domain:'dialogue'; command:{kind:'tell_place';actorId:string;targetId:string;placeId:string}|{kind:'share_news';actorId:string;targetId:string;factId:string}; context:MeetingContext }
  | { domain:'opportunities'; command:OpportunityCommand; context:Policy & Partial<MeetingContext> & {identified?:boolean;deadActorId?:string} }
  | { domain: 'registry'; command: { kind: 'arrive'; actorId: string; templateId: string };
      context: Policy & { geometryConfirmed: true; proofId: string; body: RegistryBody } }
  | { domain: 'village'; command: { kind: 'take' | 'settle' | 'return' | 'aid' | 'reward' | 'mask'; actorId: string; lotId?: string }; context: Policy & { identified?: boolean } }
  | { domain: 'village'; command: { kind: 'relocate_pickup' | 'relocate_deliver'; actorId: 'merchant' };
      context: Policy & { reachable: true; position: WorldPoint; proofId: string } }
  | { domain: 'pursuit'; command: { kind: 'sight'; actorId: string; targetId: string };
      context: Policy & { visible: boolean; identified: boolean; position: WorldPoint; proofId: string } }
  | { domain: 'pursuit'; command: { kind: 'lost'; actorId: string; targetId: string };
      context: Policy & { visible: boolean; proofId: string } }
  | { domain: 'crime'; command: { kind: 'assess'; actorId: string; factId: string };
      context: Policy }
  | { domain: 'robbery'; command: { kind: 'threaten'; actorId: string; targetId: string; amount: number };
      context: Policy & { reachable: boolean; guardNearby: boolean; escapeRoute: boolean; proofId: string } }
  | { domain: 'equipment'; command: { kind: 'equip'; actorId: string; slot: 'weapon' | 'armor'; lotId: string }; context: Policy }
  | { domain: 'equipment'; command: { kind: 'unequip'; actorId: string; slot: 'weapon' | 'armor' }; context: Policy }
  | { domain: 'property'; command: { kind: 'loot_item'; actorId: string; targetId: string; lotId: string; quantity: number };
      context: Policy & { reachable: boolean; proofId: string } }
  | { domain: 'property'; command: { kind: 'loot_money'; actorId: string; targetId: string; amount: number };
      context: Policy & { reachable: boolean; proofId: string } }
  | { domain: 'combat'; command: { kind: 'attack'; actorId: string }; context: Policy }
  | { domain: 'combat'; command: { kind: 'guard'; actorId: string; held: boolean }; context: Policy }
  | { domain: 'combat'; command: { kind: 'hit'; actorId: string; targetId: string; swingId: string };
      context: Policy & { contact: boolean; clear: boolean; angleDegrees: number; proofId: string } }
  | { domain: 'interaction'; command: InteractionCommand; context: Policy & { unitPrice?: number; service?:TradeContext } }
  | { domain: 'knowledge'; command: { kind: 'fact'; factId: string; actorId: string;
      targetId: string | null; action: string }; context: Policy & { sourceEventId: string } }
  | { domain: 'knowledge'; command: { kind: 'witness'; factId: string; actorId: string };
      context: Policy & { observed: boolean; observedAt: number; identified: boolean; proofId: string } }
  | { domain: 'knowledge'; command: { kind: 'report'; factId: string; actorId: string; targetId: string };
      context: Policy & { delivered: boolean; proofId: string } }
  | { domain: 'knowledge'; command: { kind: 'relationship'; factId: string; actorId: string; targetId: string };
      context: Policy & { trustDelta: number; ruleId: string } }) & { observations?: { npcId: string; identified: boolean; position: WorldPoint; proofId: string }[] };
export interface GameplayRequest { id: string; expectedRevision: number; steps: GameplayStep[] }
/** Retain the returned request unchanged; preparation performs no commit. */
export function prepareGameplayRequest(state: GameplayState, catalog: Catalog, input: {
  id: string; steps: GameplayStep[];
}): Failure | { ok: true; code: 'PREPARED'; request: GameplayRequest };
/** Treat as one snapshot; do not mutate projections or journal independently. */
export interface GameplayState {
  version: 1 | 2; configId: string; configSignature: string; catalogSignature: string;
  revision: number; at: number; interactions: InteractionState; social: KnowledgeState;
  journal: GameplayRequest[];
  combat?: CombatState;
  property?: PropertyState;
  equipment?: EquipmentState;
  robbery?: RobberyState;
  crime?: CrimeState;
  pursuit?: PursuitState;
  village?: VillageState;
  archive?: { version:1; legacyCheckpoint:WorldCheckpoint };
  migration?: { clockOrigin:ClockOrigin; bodyActorIds:string[] };
  calendar?: { version:1; clockOrigin:ClockOrigin };
  registry?: { version:1; actors:RegistryActor[]; events:RegistryEvent[] };
  places?: {version:1;serviceVersion?:1;definitions:RegisteredPlace[];bindings:RegistryBody['binding'][];entries:PlaceEntry[];events:PlaceEvent[]};
  life?: {version:1;actors:LifeActor[];events:LifeEvent[]};
  dialogue?: {version:1;addresses:KnownAddress[];events:DialogueEvent[]};
  opportunities?:{version:1;autonomyVersion?:1;needs:{id:string;templateId:string;issuerId:string;targetActorId:string;source:string}[];entries:Opportunity[];events:OpportunityEvent[]};
}
export interface Opportunity {
  id:string;templateId:string;title:string;issuerId:string;rootCauseId:string;offeredEventId:string;
  targetActorId:string;targetPlaceId:string;returnPlaceId:string;requirements:{kind:'message_roundtrip';messageId:string};
  proposedReward:number;rewardAmount:number|null;rewardReservationId:string|null;deadlineAt:number;
  status:'offered'|'accepted'|'fulfilled'|'failed'|'cancelled'|'expired';assigneeId:string|null;acceptedAt:number|null;identifiedAssignee:boolean;
  completionEventId:string|null;returnEventId?:string|null;reason:string|null;fundsBlocked:boolean;knownBy:string[];declinedBy:string[];
  message:{id:string;senderId:string;recipientId:string;contentType:string;deliveredEventId:string|null;receiptEventId:string|null};
}
export type OpportunityCommand =
  | {kind:'initialize'|'enable_autonomy';actorId:string}
  | {kind:'offer';actorId:string;needId:string}
  | {kind:'reveal'|'tell_status';actorId:string;targetId:string;opportunityId:string}
  | {kind:'accept';actorId:string;opportunityId:string;terms:'paid'|'unpaid'}
  | {kind:'decline'|'cancel'|'expire'|'deliver_message'|'collect_reward'|'notice_outcome';actorId:string;opportunityId:string};
export interface OpportunityEvent {
  id:string;kind:string;actorId:string;targetId:string|null;at:number;cause:string|null;requestId:string;
  opportunityId?:string;rootCauseId?:string;reason?:string;amount?:number;reservationId?:string|null;proofId?:string;identified?:boolean;declaredNeedIds?:string[];messageId?:string;contentType?:string;
  knownState?:{status:string;stage:string;assigneeId:string|null;amount:number|null;reason:string|null;evidenceId:string};
}
export function opportunityQuote(state:GameplayState,opportunity:Opportunity):{amount:number;unpaid:boolean};
export function knownOpportunities(state:GameplayState,actorId:string,at:number,meetingSpeakerId?:string|null):(Opportunity & {expired:boolean;paymentAvailable:boolean;quote:{amount:number|null;unpaid:boolean}})[];
export function prepareCommitment(state:GameplayState,input:{kind:'accept'|'decline'|'cancel'|'deliver'|'collect';actorId:string;opportunityId:string;terms?:'paid'|'unpaid'},context:Policy & Partial<MeetingContext> & {identified?:boolean}):
  {ok:false;code:string}|{ok:true;duplicate:boolean;receiptId:string|null;steps:GameplayStep[]};
export interface MeetingContext extends Policy {withinRange:boolean;clear:boolean;facing:boolean;meetingId:string;proofId:string}
export interface KnownAddress {listenerId:string;speakerId:string;placeId:string;at:number;eventId:string}
export interface DialogueEvent {
  id:string;kind:'dialogue_initialized'|'address_told'|'news_told';actorId:string;targetId:string|null;at:number;cause:string|null;requestId:string;
  meetingId?:string;proofId?:string;placeId?:string;factId?:string;subjectId?:string|null;deliveredEvidenceId?:string;
}
export function meetingEligibility(state:GameplayState,speakerId:string,listenerId:string,context:MeetingContext):{available:boolean;reason:string|null};
export function dialogueTopics():{id:string;label:string}[];
export function dialogueAnswer(state:GameplayState,speakerId:string,listenerId:string,topicId:string,context:MeetingContext):
  {ok:false;code:string}|{ok:true;kind:'text'|'places'|'news'|'requests';text?:string;placeIds?:string[];factId?:string;subjectId?:string|null;evidenceId?:string;opportunityIds?:string[]};
export type RoutineKind = 'work'|'rest'|'social'|'eat'|'patrol';
export type InterruptionKind = 'combat'|'pursuit'|'report'|'delivery'|'reward'|'flee'|'seek_help'|'contract';
export interface LifeIntent {
  id:string;actorId:string;kind:RoutineKind;placeId:string;targetId:null;sourceEventId:string|null;
  priority:number;startedAt:number;phase:'travelling'|'interacting'|'suspended';resumeIntentId:null;
}
export interface LifeActor {
  actorId:string;activityId:string|null;activityStartedAt:number;energy:number;hunger:number;lastNeedsAt:number;
  intent:LifeIntent|null;
  interruption:null|{kind:InterruptionKind;priority:number;sourceEventId:string|null;at:number;resumeIntentId:string};
  assignment?:{opportunityId:string;acceptedEventId:string;deadlineAt:number;outcomeEventId:string|null};
}
export type LifeCommand =
  | {kind:'initialize';actorId:string}
  | {kind:'activity';actorId:string;activity:RoutineKind;placeId:string;priority:10|40|50}
  | {kind:'arrive';actorId:string;intentId:string}
  | {kind:'interrupt';actorId:string;reason:InterruptionKind;priority:40|60|70|80|90}
  | {kind:'resume';actorId:string};
export interface LifeEvent {
  id:string;kind:'life_initialized'|'activity_changed'|'activity_arrived'|'activity_interrupted'|'activity_resumed';
  actorId:string;targetId:null;at:number;cause:string|null;requestId:string;
  activity?:RoutineKind;placeId?:string;intentId?:string;proofId?:string;reason?:InterruptionKind;
}
export function projectedNeeds(row:LifeActor,at:number):{hunger:number;energy:number};
export interface ClockOrigin { simulationAt:number; absoluteMinute:number }
export interface RegisteredPlace {
  id:string; label:string; kind:string; roadId:string; heading:number;
  approach:WorldPoint; entrance:WorldPoint; access:WorldPoint;
  public:boolean; hours:{startMinute:number;endMinute:number}[];
  status:'confirmed'; geometryConfirmed:true;
}
export interface RegistryBody {
  spawn:WorldPoint & {heading:number}; place:RegisteredPlace;
  binding:{actorId:string;homePlaceId:string|null;workPlaceId:string|null;idlePlaceId:string;patrolPlaceIds:string[]};
}
export interface RegistryActor { actorId:string; hasBody:boolean; sourceEventId:string|null; templateId?:string; body?:RegistryBody }
export interface PlaceEntry {placeId:string;operatorId:string|null;residentIds:string[];status:'unassessed'|'available'|'away'|'resting'|'danger';reasonEventId:string;presenceAt:number|null}
export interface PlaceEvent {id:string;kind:'places_registered'|'places_extended'|'place_services_enabled'|'place_status_changed';actorId:string;targetId:null;at:number;cause:string|null;requestId:string;placeId?:string;status?:PlaceEntry['status'];proofId?:string}
export interface TradeContext {at:number;placeId:string|null;operatorId:string|null;withinRange:boolean;clear:boolean;facing:boolean;operatorPresent:boolean;proofId:string}
export function tradeEligibility(state:GameplayState,actorId:string,targetId:string,context:TradeContext):{available:boolean;reason:string|null;placeId:string|null;operatorId:string|null};
export function servicePresence(state:GameplayState,entry:PlaceEntry,context:{present:boolean;phase:string}):PlaceEntry['status'];
export function placeStatus(state:GameplayState,placeId:string,at:number):{placeId:string;status:string;reason:string|null;open:boolean;operatorId?:string|null;residentIds?:string[];reasonEventId?:string;inHours?:boolean;label?:string};
export function availablePlaceActions(state:GameplayState,actorId:string,placeId:string,context:{at:number;withinRange:boolean;clear:boolean;facing:boolean;targetId:string|null}):{kind:string;available:boolean;reason:string|null;targetId:string|null}[];
export interface RegistryEvent {
  id:string; kind:'arrived'; actorId:string; targetId:null; cause:null; at:number;
  templateId:string; source:string; initialWallet:number; initialLots:{itemType:string;quantity:number}[]; proofId:string; requestId:string;
}
export function physicalActorIds(state:GameplayState):string[];
/** Validates source with frozen v1 rules; sequence is not incremented until a save. */
export function migrateWorldToV2(config:GameplayConfig,source:WorldCheckpoint,migration:{clockOrigin:ClockOrigin;bodyActorIds:string[]}):
  Failure | {ok:true;code:'MIGRATED';catalog:Catalog;checkpoint:WorldCheckpoint;events:[]};
export interface Fighter {
  id: string; attack: number; defense: number; stamina: number;
  guardHeld: boolean; guarding: boolean; mustRelease: boolean; regenAt: number; brokenUntil: number;
  swing: null | { id: string; cause: string; activeAt: number; recoveryAt: number; endsAt: number; hitIds: string[] };
}
export interface CombatEvent {
  id: string; kind: 'attack_started' | 'guard_started' | 'guard_released' | 'guard_exhausted' |
    'parried' | 'guard_broken' | 'damaged' | 'died';
  at: number; actorId: string; cause: string | null; targetId?: string;
  swingId?: string; damage?: number; proofId?: string;
  justification?: { unlawful: boolean; ruleId: string; basisIds: string[] };
}
export interface CombatState {
  version: 1; revision: number; at: number; fighters: Fighter[]; events: CombatEvent[];
  receipts: { requestId: string; fingerprint: string }[];
}
export type CombatView = Fighter & { health: number; phase: 'dead' | 'broken' | 'guard' | 'idle' | 'windup' | 'active' | 'recovery' };
/** Read-only projection; stamina uses milli-points (100000 = 100). */
export function previewGameplayCombat(state: GameplayState, at: number): CombatView[];
export const COMBAT_RULES: Readonly<{
  maxStamina: number; guardDrainPerMs: number; guardHitCost: number; regenPerMs: number;
  regenDelayMs: number; rearmStamina: number; windupMs: number; activeMs: number;
  recoveryMs: number; breakMs: number; guardHalfAngleDegrees: number;
}>;
interface PropertyEventBase {
  id: string; at: number; actorId: string; targetId: string; cause: string;
  proofId: string; requestId: string;
}
export type PropertyEvent =
  | (PropertyEventBase & { kind: 'loot_item'; sourceLotId: string; resultLotId: string;
      itemType: string; quantity: number; ownerId: string; fromHolderId: string; toHolderId: string })
  | (PropertyEventBase & { kind: 'loot_money'; amount: number; claimId: string });
export interface PropertyState {
  version: 1; revision: number; events: PropertyEvent[];
  receipts: { requestId: string; fingerprint: string }[];
  moneyClaims: { id: string; sourceEventId: string; claimantId: string; holderId: string; amount: number }[];
}
export interface EquipmentEvent {
  id: string; kind: 'equip' | 'unequip'; at: number; actorId: string;
  slot: 'weapon' | 'armor'; previousLotId: string | null; lotId: string | null;
  cause: null; requestId: string;
}
export interface EquipmentState {
  version: 1; revision: number;
  loadouts: { actorId: string; weapon: string | null; armor: string | null }[];
  events: EquipmentEvent[]; receipts: { requestId: string; fingerprint: string }[];
}
interface RobberyEventBase { id: string; at: number; actorId: string; targetId: string; proofId: string; requestId: string }
export type RobberyEvent =
  | (RobberyEventBase & { kind: 'threatened'; demand: number; reaction: 'call_guard' | 'fight' | 'flee' | 'surrender'; cause: null })
  | (RobberyEventBase & { kind: 'robbed'; amount: number; cause: string });
export interface RobberyState {
  version: 1; revision: number; personalities: { actorId: string; courage: number }[];
  events: RobberyEvent[]; receipts: { requestId: string; fingerprint: string }[];
  cooldowns: { targetId: string; until: number }[];
}
export interface CrimeCase {
  id: string; authorityId: string; incidentId: string; victimId: string; subjectId: string | null;
  severity: number; factIds: string[]; evidenceIds: string[]; resolved?: boolean;
}
export interface CrimeEvent {
  id: string; kind: 'case_assessed'; at: number; authorityId: string; caseId: string;
  factId: string; evidenceId: string; subjectId: string | null; severity: number;
  ruleId: string; cause: string; requestId: string;
}
export interface CrimeState {
  version: 1; revision: number; authorities: string[]; cases: CrimeCase[];
  events: CrimeEvent[]; receipts: { requestId: string; fingerprint: string }[];
}
export function wantedFor(state: CrimeState, authorityId: string, subjectId: string): {
  authorityId: string; subjectId: string; level: number; points: number; caseIds: string[];
  response: 'none' | 'question' | 'arrest' | 'reinforce';
};
export interface WorldPoint { x: number; y: number; z: number }
export interface PursuitTrack {
  authorityId: string; subjectId: string; position: WorldPoint; seenAt: number;
  lostAt: number | null; proofId: string;
}
export interface PursuitEvent extends PursuitTrack {
  id: string; kind: 'sight' | 'lost'; at: number; requestId: string;
}
export interface PursuitState {
  version: 1; revision: number; tracks: PursuitTrack[]; events: PursuitEvent[];
  receipts: { requestId: string; fingerprint: string }[];
}
export const PURSUIT_RULES: Readonly<{ sightLeaseMs: number; searchMs: number }>;
export function pursuitFor(world: GameplayState, authorityId: string, subjectId: string, at: number): {
  authorityId: string; subjectId: string; level: number; points: number; caseIds: string[];
  response: 'none' | 'question' | 'arrest' | 'reinforce';
  mode: 'idle' | 'follow' | 'search'; destination: WorldPoint | null; mayEngage: boolean;
};
export type GameplayEvent = OpportunityEvent | DialogueEvent | LifeEvent | PlaceEvent | RegistryEvent | VillageEvent | InteractionEvent | SocialEvent | CombatEvent | PropertyEvent | EquipmentEvent | RobberyEvent | CrimeEvent | PursuitEvent;
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

export interface WorldCheckpoint {
  version: 1; sequence: number; simulationAt: number; gameplay: GameplayState;
}
export function historyCapacity(state: GameplayState): {
  status: 'available' | 'low' | 'full'; checkpointConsumesHistory: false;
  channels: { domain: string; used: number; limit: number; remaining: number;
    standaloneOperations: number; status: 'available' | 'low' | 'full' }[];
};
export type WorldSaveReceipt = { status: 'committed'; sequence: number } | { status: 'rejected'; code?: string };
export function restoreWorldCheckpoint(config: GameplayConfig, saved: unknown): Failure | {
  ok: true; code: 'RESTORED'; catalog: Catalog; checkpoint: WorldCheckpoint; events: [];
};
export interface WorldSession {
  snapshot(): WorldCheckpoint;
  status(): { closed: boolean; recoveryRequired: boolean; saving: boolean; pending: number; sequence: number; simulationAt: number };
  dispatch(request: GameplayRequest): Promise<ExecuteResult>;
  checkpoint(at: number): Promise<Failure | { ok: true; code: 'CHECKPOINTED'; checkpoint: WorldCheckpoint; events: [] }>;
  close(): Promise<WorldCheckpoint>;
}
export function createWorldSession(config: GameplayConfig, options: {
  saved?: unknown;
  save: (candidate: WorldCheckpoint, metadata: { configId: string; expectedSequence: number; nextSequence: number }) => WorldSaveReceipt | Promise<WorldSaveReceipt>;
}): WorldSession;

export interface VillageEvent {
  id: string; kind: 'take'|'settle'|'return'|'aid'|'reward'|'mask'|'relocate_pickup'|'relocate_deliver'; at:number;
  actorId:string; targetId:string|null; cause:string|null; requestId:string;
  amount?:number; masked?:boolean; subjectId?:string|null;
  operationId?:string; position?:WorldPoint; proofId?:string;
}
export interface VillageState {
  version:1; masked:boolean; events:VillageEvent[]; settled:string[];
  aid:{eventId:string|null; dueAt:number|null; subject:string|null; rewardEvent:string|null};
}
/** Constructed by the trusted livingConfig migration adapter. */
export interface VillageSetup extends Omit<VillageState,'version'> {
  at:number; trust:number;
  knowledge:{kind:'witness'|'report'; actorId:string; sourceId:string; subjectId:string|null; proofId:string; position?:WorldPoint}[];
}
