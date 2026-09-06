/**
 * World Ledger v0.1.0-draft — JSON DTO reference, NOT a language/engine decision.
 * Authoritative types remain private to trusted A/B services. Never serialize them
 * directly to player UI, NPC dialogue, mods, telemetry intended for players, or LLMs.
 * JSON numbers used as times, sequence values, distances, or money must be finite.
 */
export type SchemaVersion = "0.1.0-draft";
export type Id = string;
export type WorldId = Id;
export type EntityId = Id;
export type EventId = Id;
export type NpcId = EntityId;
export type SimTimeMs = number;
export type Probability = number; // [0, 1]
export type MoneyMinor = number; // nonnegative safe integer, no floating point money
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface Vec3 { x: number; y: number; z: number }
export interface PositionSnapshot {
  spaceId: Id;
  pointM: Vec3;
  zoneId: Id;
  capturedAt: SimTimeMs;
  frameId: Id;
}
export interface ActorProfile {
  id: EntityId;
  kind: "player" | "npc";
  publicName: string;
  publicRole: string;
  persistent: boolean;
  factionIds: Id[];
  /** Authoritative self knowledge/capabilities, not a public view. */
  privateTraits: { hiddenRole?: string; capabilities: string[] };
}
export interface Relationship {
  id: Id;
  fromId: EntityId;
  toId: EntityId;
  kind: "family" | "friend" | "employer" | "trade" | "debt" | "gratitude" | "hostility";
  strength: number; // [-1, 1]; direction is explicit, never infer reverse edge
  knownBy: NpcId[];
  evidenceEventIds: EventId[];
  updatedAt: SimTimeMs;
  expiresAt: SimTimeMs | null;
}
export interface Faction {
  id: Id;
  publicName: string;
  kind: "authority" | "gang" | "guild" | "civilian";
  memberIds: NpcId[];
  reportReceiverIds: NpcId[];
  /** Institutional decisions require delivered evidence in this inbox. */
  inboxKnowledgeIds: Id[];
  jurisdictionZoneIds: Id[];
  treasuryMinor: MoneyMinor;
}

/** A perceived subject is observer-scoped; it is NOT an undisguised entity ID. */
export interface PerceivedSubject {
  handle: Id;
  description: string;
  appearanceToken: Id;
  recognizedEntityId: EntityId | null;
  recognitionConfidence: Probability;
  recognitionEvidenceEventIds: EventId[];
}
export interface Witness {
  id: Id;
  observerId: NpcId;
  sourceEventId: EventId;
  observedAt: SimTimeMs;
  observerPosition: PositionSnapshot;
  targetPosition: PositionSnapshot;
  modality: "sight" | "hearing";
  fieldOfViewPassed: boolean | null;
  lineOfSight: "clear" | "blocked" | "not_applicable";
  distanceM: number;
  perceptionRangeM: number;
  perceptible: boolean;
  /** A hearing-only observation cannot support a visual identity match. */
  perceivedActor: PerceivedSubject | null;
  perceivedAction: "theft" | "aid" | "movement" | "unknown";
  observationConfidence: Probability;
  sensorVersion: string;
}
export interface Claim {
  predicate: "committed_theft" | "provided_aid" | "last_seen";
  subject: PerceivedSubject;
  targetEntityId: EntityId | null;
  itemId: Id | null;
  zoneId: Id;
  happenedAt: SimTimeMs;
  lastKnownPosition: PositionSnapshot | null;
}
export interface Knowledge {
  id: Id;
  holderId: NpcId;
  claim: Claim;
  acquiredAt: SimTimeMs;
  source: {
    kind: "direct_observation" | "report";
    witnessId: Id | null;
    informantId: NpcId | null;
    parentKnowledgeId: Id | null;
    deliveryEventId: EventId | null;
  };
  /** Private audit provenance. holderId is not entitled to inspect these facts. */
  auditSourceEventIds: EventId[];
  confidence: Probability;
  state: "active" | "disputed" | "retracted" | "expired";
  expiresAt: SimTimeMs | null;
  hops: number;
}
export interface Crime {
  id: Id;
  kind: "theft";
  authorityFactionId: Id;
  victimId: EntityId;
  suspect: PerceivedSubject;
  evidenceKnowledgeIds: Id[];
  /** Values are rule outputs, not a player's global wanted level. */
  severity: number;
  evidenceConfidence: Probability;
  state: "reported" | "investigating" | "wanted" | "dismissed" | "resolved";
  assessedAt: SimTimeMs;
  sourceEventIds: EventId[];
}
export interface Bounty {
  id: Id;
  issuer: { kind: "npc" | "faction"; id: Id };
  target: PerceivedSubject;
  crimeId: Id | null;
  motiveKnowledgeIds: Id[];
  amountMinor: MoneyMinor;
  escrowReservationId: Id;
  action: "locate_and_report" | "apprehend";
  state: "open" | "claimed" | "completed" | "cancelled" | "expired";
  postedAt: SimTimeMs;
  expiresAt: SimTimeMs;
  assigneeId: NpcId | null;
  completionReceiptId: Id | null;
}
export interface Reaction {
  id: Id;
  npcId: NpcId;
  kind: "report" | "pursue" | "post_bounty" | "accept_bounty" | "offer_aid" | "flee" | "refuse_trade";
  triggerKnowledgeIds: Id[];
  causeEventIds: EventId[];
  target: PerceivedSubject | null;
  state: "planned" | "queued" | "dispatched" | "succeeded" | "failed" | "cancelled" | "expired";
  reasonCode: string;
  ruleVersion: string;
  createdAt: SimTimeMs;
  notBefore: SimTimeMs;
  expiresAt: SimTimeMs;
  queueItemId: Id | null;
  goalId: Id | null;
}
export interface ScheduledItem {
  id: Id;
  reactionId: Id;
  dueAt: SimTimeMs;
  expiresAt: SimTimeMs;
  priority: number;
  state: "pending" | "dispatched" | "completed" | "cancelled" | "expired";
  attempt: number;
  idempotencyKey: string;
  preconditions: {
    npcMustBeAlive: boolean;
    activeKnowledgeIds: Id[];
    bountyId: Id | null;
  };
}

/** World facts supplied by A only after a successful physical-world action. */
export type EngineFact =
  | { type: "identity.familiarity_registered"; payload: {
      observerId: NpcId; knownEntityId: EntityId; publicName: string;
      basis: "scenario_seed" | "verified_introduction";
    } }
  | { type: "action.theft_completed"; payload: {
      actorId: EntityId; victimId: EntityId; itemId: Id; quantity: number;
      transferId: Id; location: PositionSnapshot;
    } }
  | { type: "action.aid_completed"; payload: {
      helperId: EntityId; beneficiaryId: EntityId; aidKind: "heal" | "rescue" | "supply";
      transferId: Id | null; location: PositionSnapshot;
    } }
  | { type: "perception.captured"; payload: { witnesses: Witness[] } }
  | { type: "report.delivered"; payload: {
      goalId: Id; receiptId: Id; fromNpcId: NpcId; toNpcId: NpcId;
      knowledgeIds: Id[]; channel: "in_person" | "notice_board";
      location: PositionSnapshot;
    } }
  | { type: "goal.receipt_recorded"; payload: { receipt: GoalReceipt } };

export type LedgerFact =
  | { type: "knowledge.acquired"; payload: { knowledge: Knowledge } }
  | { type: "knowledge.changed"; payload: { knowledge: Knowledge } }
  | { type: "relationship.changed"; payload: { relationship: Relationship } }
  | { type: "crime.assessed"; payload: { crime: Crime } }
  | { type: "bounty.changed"; payload: { bounty: Bounty } }
  | { type: "reaction.planned"; payload: { reaction: Reaction } }
  | { type: "reaction.changed"; payload: { reaction: Reaction } }
  | { type: "queue.changed"; payload: { item: ScheduledItem } };
export type DomainFact = EngineFact | LedgerFact;
export interface FactInput {
  schemaVersion: SchemaVersion;
  worldId: WorldId;
  producerId: Id;
  idempotencyKey: string;
  occurredAt: SimTimeMs;
  causeEventIds: EventId[];
  correlationId: Id;
  fact: EngineFact;
}
export interface EventRecord {
  schemaVersion: SchemaVersion;
  worldId: WorldId;
  id: EventId;
  sequence: number;
  producerId: Id;
  idempotencyKey: string;
  occurredAt: SimTimeMs;
  recordedAt: SimTimeMs;
  causeEventIds: EventId[];
  correlationId: Id;
  ruleVersion: string;
  fact: DomainFact;
}

/** Commands express intent. Acceptance is not execution and never proves a fact. */
export type EngineGoalIntent =
  | { kind: "deliver_report"; recipientNpcId: NpcId; knowledgeIds: Id[] }
  | { kind: "investigate"; lastKnownPosition: PositionSnapshot; locationKnowledgeId: Id; target: PerceivedSubject }
  | { kind: "pursue"; target: PerceivedSubject; lastKnownPosition: PositionSnapshot; locationKnowledgeId: Id; crimeId: Id }
  | { kind: "offer_aid"; beneficiary: PerceivedSubject; aidKind: "heal" | "supply" }
  | { kind: "flee"; from: PositionSnapshot };
export interface EngineGoal {
  schemaVersion: SchemaVersion;
  worldId: WorldId;
  id: Id;
  idempotencyKey: string;
  reactionId: Id;
  npcId: NpcId;
  issuedAt: SimTimeMs;
  expiresAt: SimTimeMs;
  expectedWorldRevision: number;
  intent: EngineGoalIntent;
}
export type GoalReceipt = {
  id: Id;
  goalId: Id;
  npcId: NpcId;
  observedAt: SimTimeMs;
  engineRevision: number;
} & (
  | { status: "accepted" | "running"; terminal: false; outcomeEventIds: EventId[]; reason: null }
  | { status: "succeeded"; terminal: true; outcomeEventIds: EventId[]; reason: null }
  | { status: "rejected" | "failed" | "cancelled" | "expired"; terminal: true;
      outcomeEventIds: EventId[]; reason: "unreachable" | "npc_dead" | "target_unknown" |
      "target_lost" | "precondition_changed" | "timeout" | "insufficient_resource" | "unsupported" }
);
export interface IngestReceipt {
  eventId: EventId;
  sequence: number;
  duplicate: boolean;
  generatedEventIds: EventId[];
}
export interface TickRequest {
  worldId: WorldId;
  now: SimTimeMs;
  worldRevision: number;
  actorStates: { entityId: EntityId; alive: boolean; available: boolean }[];
}
export interface LedgerOutput {
  newEventIds: EventId[];
  engineGoals: EngineGoal[];
  nextDueAt: SimTimeMs | null;
}
export type ErrorCode = "SCHEMA_UNSUPPORTED" | "WORLD_MISMATCH" | "INVALID_VALUE" |
  "UNKNOWN_REFERENCE" | "DUPLICATE_CONFLICT" | "TIME_REGRESSION" |
  "STALE_PERCEPTION" | "INVALID_EVIDENCE" | "ILLEGAL_TRANSITION" |
  "PRECONDITION_FAILED" | "UNAUTHORIZED_PROJECTION" | "SNAPSHOT_MISMATCH";
export interface ContractError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  correlationId: Id;
  fieldPath: string | null;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: ContractError };

/** Debug projection is a distinct permission and cannot be requested by an NPC. */
export interface NpcKnowledgeView {
  holderId: NpcId;
  entries: {
    id: Id;
    claim: Omit<Claim, "subject"> & {
      subject: Omit<PerceivedSubject, "recognitionEvidenceEventIds">;
    };
    acquiredAt: SimTimeMs; confidence: Probability;
    sourceKind: "direct_observation" | "report"; informantId: NpcId | null;
    state: Knowledge["state"];
  }[];
}
export interface PlayerCausalView {
  /** View IDs are independently scoped; no hidden entity/event/knowledge IDs. */
  visibleEntries: { viewId: Id; time: SimTimeMs; text: string; visibleCauseViewIds: Id[] }[];
}
export interface LedgerSnapshot {
  schemaVersion: SchemaVersion;
  worldId: WorldId;
  ruleVersion: string;
  lastSequence: number;
  simulationTime: SimTimeMs;
  rng: { algorithm: string; seed: string; state: JsonValue };
  /** MVP keeps complete facts in the snapshot. External log storage is a later contract. */
  events: EventRecord[];
  witnesses: Witness[];
  actors: ActorProfile[];
  factions: Faction[];
  relationships: Relationship[];
  knowledge: Knowledge[];
  crimes: Crime[];
  bounties: Bounty[];
  reactions: Reaction[];
  queue: ScheduledItem[];
  outstandingGoals: EngineGoal[];
  receipts: GoalReceipt[];
  processedInputs: { producerId: Id; key: string; canonicalPayloadHash: string; eventId: EventId }[];
  /** Protocol-defined canonical SHA-256, not arbitrary JSON stringify order. */
  checkpointHash: string;
}
export interface LedgerApi {
  ingest(input: FactInput): Result<IngestReceipt>;
  tick(request: TickRequest): Result<LedgerOutput>;
  readNpcKnowledge(holderId: NpcId): Result<NpcKnowledgeView>;
  readPlayerCausalView(playerId: EntityId): Result<PlayerCausalView>;
  exportSnapshot(): Result<LedgerSnapshot>;
  restore(snapshot: LedgerSnapshot, tail: EventRecord[]): Result<LedgerOutput>;
}
export interface EngineAdapter {
  dispatch(goal: EngineGoal): Result<GoalReceipt>;
  /** Reconciliation is required after reconnect/load; do not rerun uncertain goals. */
  queryGoal(goalId: Id): Result<GoalReceipt | null>;
  cancelGoal(goalId: Id, reason: string): Result<GoalReceipt>;
}
export interface ScenarioFixture {
  schemaVersion: SchemaVersion;
  fixtureId: Id;
  worldId: WorldId;
  ruleVersion: string;
  status: "design_fixture_not_execution_evidence";
  clock: { now: SimTimeMs; unit: "simulation_milliseconds" };
  actors: ActorProfile[];
  factions: Faction[];
  relationships: Relationship[];
  events: EventRecord[];
  witnesses: Witness[];
  knowledge: Knowledge[];
  crimes: Crime[];
  bounties: Bounty[];
  reactions: Reaction[];
  queue: ScheduledItem[];
  goals: EngineGoal[];
  receipts: GoalReceipt[];
  expectedChecks: { id: string; assertion: string }[];
}
