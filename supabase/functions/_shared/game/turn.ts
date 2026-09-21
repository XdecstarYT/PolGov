/**
 * turn.ts — the turn state machine and every way a player can change the world.
 *
 * The design's spine. Each turn walks the canonical phase order:
 *
 *   1 briefing → 2 events* → 3 agenda* → 4 budget* → 5 legislature
 *   → 6 resolution → 7 report → 8 advance          (* = player may act)
 *
 * Player actions are expressed as `Intent`s rather than direct mutations.
 * `applyIntent` validates cost and legality and is the ONLY way state changes
 * outside of resolution. That is what lets the `resolve-turn` edge function be
 * genuinely authoritative: it runs exactly this code over the client's intents
 * and never trusts a number the client computed.
 */

import {
  BUDGET_TURN_INTERVAL,
  CAMPAIGN_START_TURN,
  COALITION_FAILURE_APPROVAL_PENALTY,
  COALITION_MAX_ATTEMPTS,
  COUNTER_OFFER_PC_COST,
  DEBATE_SWING_PER_WIN,
  MOOD_CONCESSION_GAIN,
  MOOD_RED_LINE_VIOLATION,
  MOOD_RESHUFFLE_GAIN,
  MOOD_START,
  PC_COSTS,
  PUBLIC_ADDRESS_APPROVAL,
  PUBLIC_ADDRESS_DIMINISH,
  SECTOR_LABELS,
  TURNS_PER_TERM,
  TURNS_PER_YEAR,
  WHIP_MAX_STEPS,
  AD_BUY_INVESTMENT,
  CAMPAIGN_STOP_INVESTMENT,
  PC_REDRAW_BOUNDARIES,
  REDRAW_APPROVAL_PENALTY,
  PC_COSTS_PARTY,
  PC_COSTS_PROCEDURE,
  AMENDMENT_STRENGTH,
  AMENDMENT_DILUTION,
  CROSSBENCH_SENATE_BONUS,
  PC_COSTS_POLICY,
  PC_COSTS_MEDIA,
  RALLY_COST,
  TOWN_HALL_COST,
  MANIFESTO_SIZE,
  SUNSET_DEFAULT_TURNS,
  FUNDRAISING_DRIVE_YIELD,
  HEADQUARTERS_COST,
  AD_BUY_PARTY_COST,
} from './balance.ts';
import { generateNews, fallbackDebateAttack } from './content/news.ts';
import { Rng } from './rng.ts';
import type {
  Bill,
  Deployment,
  FiscalRuleKind,
  TreatyKind,
  DebateExchange,
  Effects,
  GameEvent,
  GameState,
  LogEntry,
  MovementResponse,
  Party,
  Resolution,
  SectorKey,
} from './types.ts';
import {
  clampApproval,
  clampPc,
  computeApprovalTarget,
  computePcRegen,
  driftApproval,
  turnsServed,
} from './systems/approval.ts';
import {
  clamp01to100,
  averageSectorHealth,
  driftSectorHealth,
  fiscalImpulse,
  findSector,
  resolveFiscalTurn,
} from './systems/budget.ts';
import {
  applyCounterOffer,
  buildNegotiation,
  clampMood,
  coalitionPartners,
  computeMoodTarget,
  driftMood,
  hasMajority,
  noConfidenceTriggered,
  partnersWalkingOut,
  playerIsLargestParty,
  playerParty,
} from './systems/coalition.ts';
import { buildWeightContext, drawEvents } from './systems/eventEngine.ts';
import { simulateElection } from './systems/election.ts';
import { meanDistortion, redrawBoundaries } from './systems/districts.ts';
import {
  decreeEffects,
  executiveOrderCost,
  implementationDelay,
  judgePromises,
  reverseEffects,
  runReferendum,
  sunsetTurn,
} from './systems/policy.ts';
import { computeIssueScores } from './systems/electorate.ts';
import { applyShock } from './systems/economy.ts';
import {
  describeCycle,
  economyIssueScore,
  productivityTarget,
  stepEconomy,
} from './systems/economy.ts';
import {
  CREDIT_RATINGS,
  FISCAL_RULE_PC_COST,
  FISCAL_RULE_REPEAL_PC_COST,
  INFLATION_TARGET,
  RATING_REVIEW_TURNS,
  RESERVE_CONTRIBUTION_MAX,
  RESERVE_CONTRIBUTION_PC_COST,
  DIPLOMACY_EFFECTS,
  DIPLOMACY_PC_COSTS,
  BUDGET_DEFEAT_APPROVAL,
  BUDGET_DEFEAT_MOOD,
  BUDGET_DEFEAT_PC,
  BUDGET_LINE_PC_COST,
  BUDGET_PRESENT_PC_COST,
  SUPPLY_COHESION_COST,
  MAINTENANCE_LEVEL_MAX,
  MAX_TREATIES,
  STATE_VISIT_APPROVAL,
  SUMMIT_APPROVAL,
  MAX_ACTIVE_PROJECTS,
  PROJECT_PC_COST,
  REGIONAL_JOBS_WEIGHT,
  COMPLAINT_RELATIONS,
  COMPLAINT_REPUTATION,
  RESOLUTION_DEFEAT_INFLUENCE,
  RESOLUTION_TARGET_RELATIONS,
  AGENCY_SCANDAL_APPROVAL,
  CRISIS_BASE_RISK,
  GLOBAL_RESPONSE_PC_DEFAULT,
  EMERGENCY_CUT_MAX,
  SHUTOUT_APPROVAL,
  SHUTOUT_WEEKS_FATAL,
  LOG_HISTORY_WEEKS,
  IS_TRADE_WEIGHT,
  months,
  OVERSIGHT_PC_COST,
  POSTURE_PC_COST,
  DEESCALATE_PC_COST,
  DEESCALATION_APPROVAL,
  DEPLOY_PC_COST,
  ESCALATE_PC_COST,
  ESCALATION_APPROVAL,
  PROCUREMENT_OVERRUN,
  PROGRAMME_PC_COST,
  SETTLE_PC_COST,
  SURCHARGE_MAX,
  TARIFF_PC_COST,
  TRADE_COMPLAINT_PC_COST,
  TAX_CHANGE_PC_COST,
  TOTAL_SEATS,
  WITHDRAWAL_RELATIONS,
  WITHDRAWAL_REPUTATION,
  DRAFT_BILL_PC_COST,
  DRAFT_BILL_LIMIT,
  REMARK_LIMIT,
} from './balance.ts';
import { findService, sectorHealthEffects, stepServices } from './systems/services.ts';
import { stepSociety } from './systems/society.ts';
import {
  ARMY_SHARE,
  applyMobilisation,
  mobilisationChange,
  stepManpower,
  underArms,
} from './systems/manpower.ts';
import {
  buildTheatre,
  garrison,
  setPosture,
  setReconnaissance,
  stepTheatre,
} from './systems/theatre.ts';
import { afloat, orderShip, seaworthy, station, stepNavy } from './systems/naval.ts';
import {
  aircrewQuality,
  orderSquadron,
  readyShare,
  setEffort,
  stepAir,
} from './systems/air.ts';
import {
  SEA_ZONE_LABELS,
  findSeaZone,
  findShip,
  type SeaZone,
  type ShipClass,
} from './content/naval.ts';
import { stepLogistics, stockOf, weeksRemaining } from './systems/logistics.ts';
import {
  cancelResearch,
  doctrineChange,
  forceDoctrine,
  orderDoctrine,
  researchCost,
  startResearch,
  stepDoctrine,
} from './systems/doctrine.ts';
import {
  appoint as appointMinister,
  ministerFor,
  plotting,
  removalCost,
  reshuffle as fullReshuffle,
  setMachinePosture,
  sittingMinisters,
  stepCabinet,
  stepCivilService,
} from './systems/cabinet.ts';
import {
  MACHINE_POSTURES,
  findBasis,
  type AppointmentBasis,
  type MachinePosture,
} from './content/cabinet.ts';
import {
  courtsQuality,
  driveAntiCorruption,
  policingQuality,
  setEnforcementPosture,
  setJudicialStance,
  setSentencing,
  stepJustice,
} from './systems/justice.ts';
import {
  auditValue,
  launchAudit,
  setAnticorruption,
  setTransparency,
  simplifyLaw,
  stepIntegrity,
} from './systems/integrity.ts';
import {
  ANTICORRUPTION_POSTURES,
  TRANSPARENCY_REGIMES,
  type AnticorruptionPosture,
  type TransparencyRegime,
} from './content/integrity.ts';
import { regulatoryQuality } from './systems/integrity.ts';
import {
  declareEmergency,
  investReadiness,
  standDown,
  standDownCost,
  stepStateCapacity,
} from './systems/stateCapacity.ts';
import { EMERGENCY_LEVELS, type EmergencyLevel } from './content/emergency.ts';
import {
  breakUpOwnership,
  consolidateOwnership,
  launchMediaLiteracy,
  pressureOutlet,
  setPressPosture,
  stepPress,
} from './systems/press.ts';
import { PRESS_POSTURES, type OwnerType, type PressPosture } from './content/press.ts';
import {
  addressEffectMultiplier,
  releaseInformation,
  setCommsStrategy,
  stepCommunications,
} from './systems/communications.ts';
import { COMMS_STRATEGIES, type CommsStrategy } from './content/communications.ts';
import {
  respondToScandal,
  severityFromLeak,
  spawnScandal,
  stepScandals,
} from './systems/scandal.ts';
import { buildAmbassador } from './systems/diplomats.ts';
import { addGrievance } from './systems/grievances.ts';
import { sweetenOffer, sweetenValue } from './systems/negotiation.ts';
import { investSoftPower } from './systems/softPower.ts';
import { allianceRippleTargets } from './systems/diplomacyWeb.ts';
import { SWEETEN_OFFER_PC } from './balance.ts';
import { SOFT_POWER_INVEST_PC } from './balance.ts';
import { EMBASSY_TIERS, type EmbassyTier } from './content/diplomats.ts';
import { SET_EMBASSY_TIER_PC, RECALL_AMBASSADOR_PC } from './balance.ts';
import { SCANDAL_RESPONSES, type ScandalResponse } from './content/scandal.ts';
import {
  CONFIRMED_APPROVAL_COST,
  CORRUPTION_SCANDAL_SEVERITY,
  CORRUPTION_SCANDAL_THRESHOLD,
} from './balance.ts';
import {
  SET_TRANSPARENCY_PC,
  SET_ANTICORRUPTION_PC,
  LAUNCH_AUDIT_PC,
  SIMPLIFY_LAW_PC,
  SIMPLIFY_LAW_EFFECT,
  REGULATORY_STOCK_START,
} from './balance.ts';
import { DECLARE_EMERGENCY_PC, DECLARE_MARTIAL_LAW_PC, INVEST_READINESS_PC } from './balance.ts';
import {
  PRESSURE_OUTLET_PC,
  SET_PRESS_POSTURE_PC,
  CONSOLIDATE_OWNERSHIP_PC,
  BREAK_UP_OWNERSHIP_PC,
  LAUNCH_MEDIA_LITERACY_PC,
} from './balance.ts';
import { RELEASE_INFORMATION_PC, SET_COMMS_STRATEGY_PC } from './balance.ts';
import {
  findEnforcementPosture,
  findSentencing,
  findStance,
  type EnforcementPosture,
  type JudicialStance,
  type SentencingPolicy,
} from './content/justice.ts';
import {
  closeEntry,
  openEntryFor,
  record as recordEntry,
  warPressure,
  warSummary,
  weightOf,
  yearOf,
} from './systems/timeline.ts';
import { WAR_OUTCOME_LABELS } from './content/war.ts';
import type { WarRecord } from './types.ts';
import {
  accept,
  blockedByAim,
  breakOffTalks,
  buildWarTalks,
  domesticCost,
  offerValue,
  openTalks,
  refuse,
  revisAim,
  stepPeace,
} from './systems/peace.ts';
import { OFFER_LIFE, REVISE_AIM_APPROVAL, REVISE_AIM_PC } from './balance.ts';
import {
  findBias,
  findMediator,
  findTerm,
  type Mediator,
  type PeaceTerm,
} from './content/peace.ts';
import { DOCTRINE_FORCE_APPROVAL, FORCE_DOCTRINE_PC, RESEARCH_PC } from './balance.ts';
import {
  findResearch as findResearchField,
  findWarDoctrine,
  type ResearchField,
  type WarDoctrine,
} from './content/doctrine.ts';
import {
  footingChange,
  militaryOutput,
  setFinance,
  setFooting,
  stepWarEconomy,
} from './systems/warEconomy.ts';
import {
  findFinance,
  findFooting,
  findSupply,
  type WarFinance,
  type WarFooting,
} from './content/logistics.ts';
import {
  findAircraft,
  findCampaign,
  type AirCampaign,
  type AircraftKind,
} from './content/air.ts';
import { ROTATION_RATIO, SHIP_ORDER_PC, SQUADRON_ORDER_PC } from './balance.ts';
import { ATTACK_SUPPLY_FLOOR } from './balance.ts';
import { MACHINE_CAPABILITY, APPOINT_MINISTER_PC, RESHUFFLE_PC, MACHINE_POSTURE_PC } from './balance.ts';
import {
  SET_SENTENCING_PC,
  SET_JUDICIAL_STANCE_PC,
  SET_ENFORCEMENT_POSTURE_PC,
  ANTI_CORRUPTION_DRIVE_PC,
  ANTI_CORRUPTION_DRIVE_EFFECT,
} from './balance.ts';
import { SECTOR_POSTURE_LABELS, type SectorPosture } from './content/theatre.ts';
import {
  commanderOf,
  dismissCommander,
  forceValue,
  orderLag,
  replacementDemand,
  serving,
  setCommitment,
  stepOrbat,
  unreliableShare,
} from './systems/orbat.ts';
import { findManpowerModel, type ManpowerModel } from './content/manpower.ts';
import { accessOf, stepLiving } from './systems/living.ts';
import {
  belongingGap,
  excludedShare,
  institutionOf,
  leastIncluded,
  stepCulture,
} from './systems/culture.ts';
import {
  complianceFactor,
  institutionalTrust,
  mobilisation,
  stepOpinion,
  trustOf,
} from './systems/opinion.ts';
import {
  describeProblems,
  problemOf,
  severity,
  stepProblems,
} from './systems/problems.ts';
import {
  describeGenerations,
  generationGap,
  stepGenerations,
} from './systems/generations.ts';
import { responseEffects, stepMovements } from './systems/movements.ts';
import { TACTIC_LABELS, findMovement } from './content/movements.ts';
import { findProblem } from './content/problems.ts';
import { homeownership } from './systems/society.ts';
import { findTrust } from './content/trust.ts';
import { findCulturalInstitution } from './content/culture.ts';
import { findAccess } from './content/access.ts';
import { findClass } from './content/classes.ts';
import { duesTotal, tradeBlocPartners } from './systems/organisations.ts';
import { readDraft, type RawDraft } from './systems/drafting.ts';
import { findPersona, remember, stepCast } from './systems/personas.ts';
import { driftPower, globalEffects, stepWorldSim } from './systems/worldSim.ts';
import { findGlobalEvent } from './content/globalEvents.ts';
import {
  assess,
  launch,
  operationOdds,
  scandalRisk,
  stepIntelligence,
} from './systems/intelligence.ts';
import {
  findOperation,
  findPower,
  findSubject,
  type AssessmentSubject,
  type OperationKey,
} from './content/intelligence.ts';
import {
  atWar,
  deEscalate as deEscalateCrisis,
  escalate as escalateCrisis,
  live as liveCrises,
  openCrisis,
  settle as settleCrisis,
  stepConflicts,
  STAGE_LABELS,
} from './systems/conflict.ts';
import {
  cancelProgramme,
  combatPower,
  committedShare,
  findDoctrine,
  deploy,
  deploymentCost,
  programmeCost,
  deploymentTerms,
  doctrineCost,
  findProgramme,
  programmeSpend,
  startProgramme,
  stepMilitary,
  withdraw,
} from './systems/military.ts';
import {
  findFlow,
  importPriceEffect,
  setDispute,
  setSurcharge,
  stepTrade,
  tradeImpulse,
} from './systems/trade.ts';
import {
  assignMinistries,
  cabinetReaction,
  divideOnBudget,
  enactBudget,
  discretionaryTotal,
  enactedTotal,
  findMinistry,
  indexEntitlements,
  isStatutory,
  lapseBudget,
  lineBounds,
  lineFor,
  ministryFor,
  proposedTotal,
  rejectBudget,
  sectorsFromBudget,
  serviceFunding,
  setSectorFunding,
  supplyCost,
} from './systems/budgetProcess.ts';
import type { MinistryKey } from './content/ministries.ts';
import {
  RESOLUTION_TEMPLATES,
  duesOf,
  findOrganisation,
  type OrganisationKey,
  type ResolutionKind,
} from './content/organisations.ts';
import {
  admissionCheck,
  describeOutcome,
  findMembership,
  isMember,
  voteOnResolution,
} from './systems/organisations.ts';
import {
  TREATY_LABELS,
  applyDiplomaticAct,
  boundToDefend,
  clampRelations,
  breakAgreement,
  canSummit,
  findNation,
  obligationOf,
  stepWorld,
  willSign,
} from './systems/diplomacy.ts';
import {
  canStartProject,
  commission,
  findInfrastructure,
  utilisation,
  industryEffects,
  infrastructureSpend,
  sectorEffects,
  stepInfrastructure,
  totalBacklog,
  type InfrastructureKey,
} from './systems/infrastructure.ts';
import type { NationKey } from './content/nations.ts';
import type { DoctrineKey } from './content/forces.ts';
import type { ServiceKey } from './content/services.ts';
import {
  apportionSeats,
  isApportionmentDue,
  skillsDrag,
  populationGrowth,
  stepDemography,
  workforceGrowth,
} from './systems/demography.ts';
import {
  employmentGap,
  findIndustry,
  industryPressure,
  regionalEmployment,
  stepIndustries,
} from './systems/industry.ts';
import {
  findTaxTemplate,
  forgetOldChanges,
  recordChange,
  taxEffects,
  type TaxKey,
} from './systems/taxation.ts';
import {
  FISCAL_RULE_LABELS,
  averageCoupon,
  borrowingCost,
  breachApprovalCost,
  debtRatio,
  regionalSwing,
  rulesInBreach,
  stepPublicFinance,
} from './systems/publicFinance.ts';
import {
  applyChannelPush,
  availableVolunteerPushes,
  conductPoll,
  decayReach,
  persuasionBySegment,
  trueNationalShares,
  turnoutBySegment,
  computeSwing,
  exitPoll,
  recountCandidates,
  type PollQuality,
} from './systems/media.ts';
import { channelTemplate, type ChannelKey } from './content/channels.ts';
import { REFERENDUM_TEMPLATES } from './content/referendums.ts';
import {
  committeeReport,
  isMoneyBill,
  renewSenate,
  senateVerdict,
  senateVote,
  chamberPolarisation,
} from './systems/parliament.ts';
import {
  authorityTarget,
  cohesionTarget,
  driftAuthority,
  driftCohesion,
  driftMembers,
  facesLeadershipChallenge,
  leadershipChallengeSupport,
  membershipTarget,
  partyFinanceTick,
  rebellionRisks,
  resolveRebellions,
  surviveChallenge,
} from './systems/partyInternals.ts';
import {
  billPcCost,
  computePassChance,
  resolveBillVote,
} from './systems/legislature.ts';

/* ------------------------------------------------------------------ *
 * Intents
 * ------------------------------------------------------------------ */

export type Intent =
  | { type: 'advance_phase' }
  | { type: 'resolve_event'; eventId: string; choiceIndex: number }
  | { type: 'propose_bill'; billId: string; whipSteps: number }
  /**
   * A bill the player wrote, drafted by a model and priced by the engine.
   *
   * The payload is DATA, not a decision: `draft` is whatever the model
   * returned, relayed through a client, and `readDraft` re-reads every
   * field of it against the engine's own vocabulary and envelope before
   * anything reaches the chamber. A forged draft can only produce a legal
   * bill somebody could have written by hand, which is why this intent is
   * safe to accept from a client at all.
   */
  | { type: 'draft_bill'; description: string; draft: RawDraft }
  /**
   * Put something a persona said on the record.
   *
   * Prose in, prose out. Nothing in the engine ever reads a remark back as
   * a number — what a persona THINKS is `standing`, which game code moves
   * from the week's record and a model never touches. This stores only the
   * words, so that the next time somebody writes in that person's voice
   * they can be held to what they said before.
   *
   * Capped hard, because the text arrives from a client.
   */
  | { type: 'record_remark'; personaId: string; about: string; text: string }
  | { type: 'set_language_policy'; level: number }
  | { type: 'answer_movement'; movement: string; response: MovementResponse }
  | { type: 'set_mobilisation'; model: ManpowerModel }
  | { type: 'dismiss_commander'; commander: string }
  | { type: 'commit_formations'; formations: string[]; committed: boolean }
  | { type: 'set_sector_posture'; theatre: string; sector: string; posture: SectorPosture }
  | { type: 'garrison_sector'; theatre: string; sector: string; formations: string[] }
  | { type: 'set_reconnaissance'; theatre: string; effort: number }
  | { type: 'station_fleet'; zone: SeaZone; hulls: number }
  | { type: 'order_ship'; shipClass: ShipClass }
  | { type: 'set_air_effort'; effort: Partial<Record<AirCampaign, number>> }
  | { type: 'order_squadron'; aircraft: AircraftKind }
  | { type: 'set_war_footing'; footing: WarFooting }
  | { type: 'set_war_finance'; finance: WarFinance }
  | { type: 'set_doctrine_belief'; doctrine: WarDoctrine }
  | { type: 'force_doctrine' }
  | { type: 'start_research'; field: ResearchField }
  | { type: 'cancel_research'; id: string }
  | { type: 'open_talks'; war: string; mediator: Mediator }
  | { type: 'break_off_talks'; war: string }
  | { type: 'accept_terms'; war: string; offer: string }
  | { type: 'refuse_terms'; war: string; offer: string }
  | { type: 'revise_war_aim'; war: string }
  | { type: 'withdraw_bill'; billId: string }
  | { type: 'public_address' }
  | { type: 'coalition_concession'; partyId: string }
  | { type: 'reshuffle_cabinet'; partyId: string }
  | { type: 'appoint_minister'; ministry: MinistryKey; basis: AppointmentBasis }
  | { type: 'full_reshuffle' }
  | { type: 'set_machine_posture'; posture: MachinePosture }
  | { type: 'set_sentencing'; policy: SentencingPolicy }
  | { type: 'set_judicial_stance'; stance: JudicialStance }
  | { type: 'set_enforcement_posture'; posture: EnforcementPosture }
  | { type: 'drive_anti_corruption' }
  | { type: 'set_transparency'; regime: TransparencyRegime }
  | { type: 'set_anticorruption_posture'; posture: AnticorruptionPosture }
  | { type: 'launch_audit' }
  | { type: 'simplify_law' }
  | { type: 'declare_emergency'; level: EmergencyLevel }
  | { type: 'stand_down_emergency' }
  | { type: 'invest_readiness' }
  | { type: 'set_press_posture'; posture: PressPosture }
  | { type: 'pressure_outlet' }
  | { type: 'consolidate_ownership'; target: Exclude<OwnerType, 'independent'> }
  | { type: 'break_up_ownership' }
  | { type: 'launch_media_literacy' }
  | { type: 'set_comms_strategy'; strategy: CommsStrategy }
  | { type: 'release_information' }
  | { type: 'respond_scandal'; scandalId: string; response: ScandalResponse }
  | { type: 'set_embassy_tier'; nation: NationKey; tier: EmbassyTier }
  | { type: 'recall_ambassador'; nation: NationKey }
  | { type: 'sweeten_offer'; nation: NationKey }
  | { type: 'invest_soft_power' }
  | { type: 'emergency_budget' }
  | { type: 'set_funding'; sector: SectorKey; amount: number }
  | { type: 'diplomatic_act'; nation: NationKey; act: DiplomaticAct }
  | { type: 'propose_treaty'; nation: NationKey; kind: TreatyKind }
  | { type: 'withdraw_treaty'; treatyId: string }
  | { type: 'join_organisation'; organisation: OrganisationKey }
  | { type: 'leave_organisation'; organisation: OrganisationKey }
  | { type: 'propose_resolution'; kind: ResolutionKind; target?: NationKey | null }
  | { type: 'set_tariff'; nation: NationKey; points: number }
  | { type: 'file_trade_complaint'; nation: NationKey }
  | { type: 'set_doctrine'; doctrine: DoctrineKey }
  | { type: 'start_programme'; programme: string }
  | { type: 'cancel_programme'; id: string }
  | { type: 'deploy_force'; nation: NationKey; kind: Deployment['kind']; scale: number }
  | { type: 'withdraw_force'; id: string }
  | { type: 'escalate_crisis'; crisisId: string }
  | { type: 'de_escalate_crisis'; crisisId: string }
  | { type: 'settle_crisis'; crisisId: string }
  | { type: 'commission_assessment'; subject: AssessmentSubject; nation: NationKey }
  | { type: 'launch_operation'; operation: OperationKey; nation: NationKey }
  | { type: 'set_collection'; human: number; signals: number; analysis: number }
  | { type: 'set_surveillance'; level: number }
  | { type: 'set_oversight'; level: number }
  | { type: 'respond_globally'; event: string }
  | { type: 'set_budget_line'; service: ServiceKey; amount: number }
  | { type: 'set_capital_share'; service: ServiceKey; share: number }
  | { type: 'present_budget' }
  | { type: 'secure_supply'; partyId: string }
  | { type: 'set_maintenance'; level: number }
  | { type: 'start_project'; asset: InfrastructureKey; units: number }
  | { type: 'cancel_project'; projectId: string }
  | { type: 'set_tax_rate'; tax: TaxKey; rate: number }
  | { type: 'set_tax_dial'; dial: 'progressivity' | 'deductions' | 'credits'; value: number }
  | { type: 'adopt_fiscal_rule'; kind: FiscalRuleKind; threshold: number }
  | { type: 'repeal_fiscal_rule'; kind: FiscalRuleKind }
  | { type: 'set_reserve_contribution'; amount: number }
  | { type: 'draw_emergency_fund'; amount: number }
  | { type: 'call_early_election' }
  | { type: 'retire' }
  | { type: 'campaign_stop'; regionId: string }
  | { type: 'ad_buy'; regionId: string }
  | { type: 'answer_debate'; debateId: string; choiceIndex: number }
  | { type: 'redraw_boundaries'; regionId: string }
  | { type: 'rally_party' }
  | { type: 'fundraising_drive' }
  | { type: 'appoint_deputy'; factionId: string }
  | { type: 'discipline_rebels'; factionId: string }
  | { type: 'invest_headquarters' }
  | { type: 'rename_party'; name: string }
  | { type: 'send_to_committee'; billId: string }
  | { type: 'amend_bill'; billId: string; towardFactionId?: string; towardPartyId?: string }
  | { type: 'crossbench_deal'; billId: string }
  | { type: 'close_debate'; billId: string }
  | { type: 'question_time' }
  | { type: 'repeal_bill'; billId: string }
  | { type: 'renew_sunset'; billId: string }
  | { type: 'executive_order'; billId: string }
  | { type: 'call_referendum'; questionId: string }
  | { type: 'set_manifesto'; billKeys: string[] }
  | { type: 'campaign_push'; channel: ChannelKey }
  | { type: 'commission_poll'; quality: PollQuality }
  | { type: 'hold_rally'; regionId: string }
  | { type: 'town_hall'; regionId: string }
  | { type: 'press_conference' }
  | { type: 'negotiation_accept'; partyId: string }
  | { type: 'negotiation_counter'; partyId: string }
  | { type: 'negotiation_remove'; partyId: string }
  | { type: 'negotiation_form_government' }
  | { type: 'negotiation_abandon' }
  | { type: 'acknowledge_election' };

export interface IntentResult {
  state: GameState;
  /** Present when the intent was rejected. State is returned unchanged. */
  error?: string;
}

const ok = (state: GameState): IntentResult => ({ state });
const reject = (state: GameState, error: string): IntentResult => ({ state, error });

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function log(entries: LogEntry[], entry: LogEntry): void {
  entries.push(entry);
}

/**
 * This week's page of the journal.
 *
 * Keyed on the absolute week rather than the turn number, because the turn
 * number resets at every election: without this, the second term's first
 * week appended to the first term's, and the error compounded every term
 * for the whole run.
 *
 * And trimmed, because every intent deep-clones the entire state. A run
 * that kept every week's entries would clone twenty thousand objects on
 * every click by the final term, which is a game that gets slower the
 * longer it is played. Nothing reads further back than a few weeks.
 */
function currentLog(state: GameState): LogEntry[] {
  const week = absoluteWeek(state);
  let existing = state.logs.find((l) => l.week === week);
  if (!existing) {
    existing = { turnNumber: state.turnNumber, week, entries: [] };
    state.logs.push(existing);
    if (state.logs.length > LOG_HISTORY_WEEKS) {
      state.logs.splice(0, state.logs.length - LOG_HISTORY_WEEKS);
    }
  }
  return existing.entries;
}


/**
 * Weeks since the run began, which is not the same as the turn number.
 *
 * The turn number resets at every election, because a term is the unit
 * everything political is measured in. Anything that OUTLIVES a term needs
 * a clock that does not reset — and procurement is the archetype, since a
 * programme finished by a successor is the entire point of modelling one.
 */
export function absoluteWeek(state: GameState): number {
  return (state.termNumber - 1) * TURNS_PER_TERM + state.turnNumber;
}

/** What actually happened, which is never the thing being argued about. */
function crisisCause(name: string): string {
  const causes = [
    `A ${name} patrol crossed a line both governments have described differently for years.`,
    `A vessel was stopped, searched and released, and ${name} says it was none of those things.`,
    `Airspace was entered. ${name} calls it navigation; nobody else does.`,
    `A ${name} broadcast named Verdanan officials and said what should happen to them.`,
  ];
  return causes[Math.abs(name.length * 7) % causes.length]!;
}

/**
 * ₡bn a year the fighting is costing, across every live war.
 *
 * Carried to national money, like every other price. Unscaled, the flat
 * term was written for a ₡3,680bn economy and charged in full to a
 * ₡253bn one — a war costing seventy per cent of output every year, which
 * is not a hard war, it is an arithmetic error.
 */
export function warCost(
  crises: readonly GameState['crises'][number][],
  moneyScale: number,
): number {
  return crises
    .filter((c) => c.stage === 'war')
    .reduce((sum, c) => sum + (180 + c.casualties * 1.4) * moneyScale, 0);
}

/**
 * The partners the country has an agreement with.
 *
 * A trade treaty or a partnership removes the national tariff for that
 * country, which is what a trade agreement actually is and why it is worth
 * more than a warm relationship.
 */
function tradeAgreementsWith(
  world: GameState['world'],
  organisations: readonly import('./types.ts').OrganisationState[],
): Set<NationKey> {
  const keys = new Set<NationKey>();
  for (const treaty of world.treaties) {
    if (treaty.kind !== 'trade' && treaty.kind !== 'partnership') continue;
    for (const party of treaty.parties) keys.add(party);
  }
  /* Membership in an actual common market does what a bilateral treaty
     does, without one having been signed — that is what the membership is. */
  for (const nation of tradeBlocPartners(organisations)) keys.add(nation);
  return keys;
}

/**
 * The weeks in which a budget can be written.
 *
 * A financial year is fifty-two weeks and the budget for the next one is
 * argued over in the first thirteen. Outside that window the lines are
 * fixed, because a government that could rewrite its spending in any week
 * would never have to live with a decision.
 */
export function isBudgetSeason(turnNumber: number): boolean {
  return ((turnNumber - 1) % TURNS_PER_YEAR) < BUDGET_TURN_INTERVAL;
}

/** The last week a budget can be put to the chamber before it rolls over. */
export function budgetDeadline(turnNumber: number): number {
  const yearStart = turnNumber - ((turnNumber - 1) % TURNS_PER_YEAR);
  return yearStart + BUDGET_TURN_INTERVAL - 1;
}

/**
 * Has the year turned over without a budget?
 *
 * True on exactly one turn: the first week after the deadline, when nothing
 * was enacted during the season that just closed. Checking the enacted turn
 * rather than the stage is what makes a government that simply never opened
 * the document face the same consequence as one that lost the vote.
 */
/**
 * Keep the five sector figures honest.
 *
 * The sectors are a summary of the twenty lines, not a separate account, and
 * every other system reads them — the treasury prices spending off them and
 * the electorate judges them. So whenever the lines move without a vote,
 * which is what an entitlement does, the summary has to follow immediately.
 * If it did not, a pension bill that rose by ₡15bn would cost the treasury
 * nothing, which is the most expensive kind of nothing there is.
 */
function syncSectorsToBudget(state: GameState): void {
  const summary = sectorsFromBudget(state.budget);
  for (const sector of state.sectors) sector.funding = summary[sector.key];
}

function budgetHasLapsed(state: GameState): boolean {
  const seasonEnd = budgetDeadline(state.turnNumber);
  if (state.turnNumber !== seasonEnd + 1) return false;
  return !budgetSettled(state);
}

/**
 * Has THIS year's budget been carried?
 *
 * Not the same as whether a budget exists. One always does: last year's, or
 * the previous government's, and it stays in force until somebody replaces
 * it. That distinction is the whole reason the deadline bites, and it is
 * also what stops a government passing the same budget twice.
 */
export function budgetSettled(state: GameState): boolean {
  return state.budget.enactedTurn > budgetDeadline(state.turnNumber) - BUDGET_TURN_INTERVAL;
}

export function isBudgetTurn(turnNumber: number): boolean {
  return turnNumber % BUDGET_TURN_INTERVAL === 1;
}

export function isCampaignTurn(turnNumber: number): boolean {
  return turnNumber >= CAMPAIGN_START_TURN;
}

/**
 * Is the document open?
 *
 * During the season, because that is when a budget is written. Outside it,
 * only after an emergency budget has been bought — and what that buys is a
 * supplementary estimate, which takes effect immediately rather than
 * waiting for a vote nobody has scheduled.
 */
export function canEditBudget(state: GameState): boolean {
  return isBudgetSeason(state.turnNumber) || state.budgetUnlocked;
}

function spendPc(state: GameState, amount: number): boolean {
  if (state.politicalCapital < amount) return false;
  state.politicalCapital = clampPc(state.politicalCapital - amount);
  return true;
}

/**
 * Apply a bundle of effects, itemising every component into the turn log.
 * This is the single place mechanical consequences land, which is what keeps
 * the End of Turn Report complete by construction.
 */
export function applyEffects(
  state: GameState,
  effects: Effects,
  cause: string,
  entries: LogEntry[],
): void {
  if (effects.approval) {
    state.approval = clampApproval(state.approval + effects.approval);
    log(entries, {
      kind: 'approval',
      label: 'Approval',
      delta: effects.approval,
      cause,
      unit: 'pts',
    });
  }

  /*
   * A macroeconomic shock, and any relief the chosen course bought.
   *
   * This is what makes a choice at the desk a decision about the economy
   * rather than about the treasury balance. A bank rescue does not mainly
   * cost money — it costs money AND prevents six months of contraction, and
   * the second half is the part worth arguing about.
   */
  if (effects.economicShock) {
    const spec = effects.economicShock;
    const relief = effects.shockRelief ?? 1;
    state.economy = applyShock(state.economy, {
      id: spec.id,
      label: spec.label,
      kind: spec.kind,
      growthImpulse: spec.growthImpulse * relief,
      inflationImpulse: spec.inflationImpulse * relief,
      confidenceImpulse: spec.confidenceImpulse * relief,
      remaining: spec.turns,
      duration: spec.turns,
      startedTurn: state.turnNumber,
    });
    log(entries, {
      kind: 'economy',
      label: spec.label,
      delta: 0,
      cause:
        `${cause}. ` +
        (relief < 1
          ? `Softened to ${(relief * 100).toFixed(0)}% of what it would have been, `
          : '') +
        `${spec.turns} weeks of it, worst in the first.`,
      unit: '',
    });
  }

  if (effects.industryDeltas) {
    for (const [key, delta] of Object.entries(effects.industryDeltas)) {
      const industry = state.industries.find((i) => i.key === key);
      if (!industry || !delta) continue;
      industry.health = Math.max(10, Math.min(190, industry.health + delta));
      log(entries, {
        kind: 'economy',
        label: findIndustry(industry.key).name,
        delta,
        cause,
        unit: 'pts',
      });
    }
  }

  if (effects.assetDamage) {
    for (const [key, delta] of Object.entries(effects.assetDamage)) {
      const asset = state.infrastructure.assets.find((a) => a.key === key);
      if (!asset || !delta) continue;
      asset.condition = Math.max(0, Math.min(100, asset.condition + delta));
      log(entries, {
        kind: 'note',
        label: findInfrastructure(asset.key).name,
        delta,
        cause,
        unit: 'pts',
      });
    }
  }

  if (effects.politicalCapital) {
    state.politicalCapital = clampPc(state.politicalCapital + effects.politicalCapital);
    log(entries, {
      kind: 'political_capital',
      label: 'Political capital',
      delta: effects.politicalCapital,
      cause,
      unit: 'PC',
    });
  }

  /*
   * Every figure below is written in the currency of a country the size of
   * the one the engine is calibrated at. A bill that costs ₡18bn is
   * costing half a per cent of output there, and it has to cost half a per
   * cent of output everywhere — otherwise the same school-building
   * programme is a rounding error in one country and a sixth of national
   * income in another, which is how a run of a small country used to end
   * in a boom nobody legislated for.
   */
  const money = state.moneyScale;

  if (effects.treasury) {
    const delta = effects.treasury * money;
    state.treasury += delta;
    log(entries, {
      kind: 'treasury',
      label: 'Treasury',
      delta,
      cause,
      unit: '₡bn',
    });
  }

  if (effects.debt) {
    const delta = effects.debt * money;
    state.debt = Math.max(0, state.debt + delta);
    log(entries, { kind: 'debt', label: 'Debt', delta, cause, unit: '₡bn' });
  }

  if (effects.revenueDelta) {
    const delta = effects.revenueDelta * money;
    state.revenueModifier += delta;
    log(entries, {
      kind: 'treasury',
      label: 'Recurring revenue',
      delta,
      cause,
      unit: '₡bn/turn',
      /* A change to a per-turn rate, not cash moving this month. */
      informational: true,
    });
  }

  for (const [key, delta] of Object.entries(effects.sectorDeltas ?? {})) {
    if (!delta) continue;
    const sector = findSector(state.sectors, key as SectorKey);
    sector.health = clamp01to100(sector.health + delta);
    log(entries, {
      kind: 'sector',
      label: SECTOR_LABELS[key as SectorKey],
      delta,
      cause,
      unit: 'pts',
    });
  }

  for (const [key, raw] of Object.entries(effects.fundingDeltas ?? {})) {
    if (!raw) continue;
    const delta = raw * money;
    const sector = findSector(state.sectors, key as SectorKey);
    sector.funding = Math.max(0, sector.funding + delta);
    log(entries, {
      kind: 'sector',
      label: `${SECTOR_LABELS[key as SectorKey]} funding`,
      delta,
      cause,
      unit: '₡bn/turn',
    });
  }

  if (effects.coalitionMood) {
    for (const partner of coalitionPartners(state.parties)) {
      partner.coalitionMood = clampMood((partner.coalitionMood ?? MOOD_START) + effects.coalitionMood);
    }
    if (coalitionPartners(state.parties).length > 0) {
      log(entries, {
        kind: 'coalition',
        label: 'Coalition mood',
        delta: effects.coalitionMood,
        cause: `${cause} (all partners)`,
        unit: 'pts',
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Turn lifecycle
 * ------------------------------------------------------------------ */

/**
 * Open a turn: bank political capital, draw this turn's events, and set the
 * briefing. Called on entering every turn, including the first of a term.
 */
export function beginTurn(state: GameState): GameState {
  const next = clone(state);
  const rng = new Rng(next.rngState);
  const entries = currentLog(next);

  const regen = computePcRegen(next.approval);
  next.politicalCapital = clampPc(next.politicalCapital + regen);
  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: regen,
    cause: `Weekly regeneration at ${Math.round(next.approval)}% approval`,
    unit: 'PC',
  });

  next.budgetUnlocked = false;

  /*
   * The financial year opens and the law presents its bill first. Pensions,
   * welfare and disability are re-priced off the population before anybody
   * writes a line, because they are a rate in law times a headcount rather
   * than a decision. Whatever they have taken is no longer available.
   */
  if ((next.turnNumber - 1) % TURNS_PER_YEAR === 0) {
    const indexed = indexEntitlements(next.budget, next.demography, next.economy, costScaleOf(state));
    next.budget = indexed.budget;
    syncSectorsToBudget(next);
    const moved = indexed.changes.reduce((sum, c) => sum + (c.to - c.from), 0);
    if (Math.abs(moved) >= 0.5) {
      log(entries, {
        kind: 'note',
        label: 'Entitlements re-priced',
        delta: moved,
        cause:
          `${indexed.changes.map((c) => findService(c.service).name).join(', ')} ` +
          `${moved > 0 ? 'rose' : 'fell'} by ₡${Math.abs(moved).toFixed(0)}bn because the number of ` +
          'people entitled changed. Nobody voted for this and nobody can vote against it.',
        unit: '₡bn',
        informational: true,
      });
    }
  }

  /*
   * The deadline falls. A government that has not put a budget to the
   * chamber by the end of the first quarter does not get an extension: the
   * state carries on at last year's cash figures while the demands on it
   * grow, which is a cut nobody voted for and the worst way to make one.
   */
  if (budgetHasLapsed(next)) {
    next.budget = lapseBudget(next.budget, next.turnNumber);
    syncSectorsToBudget(next);
    next.approval = clampApproval(next.approval + BUDGET_DEFEAT_APPROVAL);
    for (const partner of coalitionPartners(next.parties)) {
      partner.coalitionMood = clampMood((partner.coalitionMood ?? 50) + BUDGET_DEFEAT_MOOD);
    }
    log(entries, {
      kind: 'legislature',
      label: 'No budget for the year',
      delta: BUDGET_DEFEAT_APPROVAL,
      cause:
        `The financial year opened with no appropriation. Departments carry on at ` +
        `₡${enactedTotal(next.budget).toFixed(0)}bn, which is what they had last year and ` +
        'less than they need this year. Nobody in the chamber had to vote for that.',
      unit: 'pts',
    });
    if (next.budget.defeats >= 2) next.confidenceCrisis = true;
  }

  /* Campaigning fades. A push in month nine is worth little by month twelve. */
  if (next.campaign) {
    next.campaign.reach = decayReach(next.campaign.reach);
  }

  const recentKeys = next.logs
    .slice(-3)
    .flatMap((l) => l.entries.filter((e) => e.kind === 'event').map((e) => e.label));

  const ctx = buildWeightContext(
    next.sectors,
    next.approval,
    next.debt,
    next.treasury,
    next.turnNumber,
    next.parties,
    /* So a banking crisis is something the government spent four years
       making more likely, rather than a die roll against it. */
    {
      economy: next.economy,
      industries: next.industries,
      infrastructure: next.infrastructure,
      demography: next.demography,
    },
  );
  next.events = drawEvents(rng, ctx, next.difficulty, next.turnNumber, recentKeys);

  if (isCampaignTurn(next.turnNumber) && !next.campaign) {
    next.campaign = {
      stopsMade: 0,
      adBuys: 0,
      debates: [],
      debateSwing: 0,
      reach: {},
      channelPushes: {},
      volunteerPushesUsed: 0,
      polls: [],
      rallies: 0,
      townHalls: 0,
    };
  }
  if (isCampaignTurn(next.turnNumber) && next.campaign) {
    next.campaign.debates.push(buildDebate(next, rng));
  }

  next.phase = 'briefing';
  next.rngState = rng.state;
  next.updatedAt = new Date().toISOString();
  return next;
}

function buildDebate(state: GameState, rng: Rng): DebateExchange {
  const opponents = state.parties.filter((p) => !p.isPlayer && p.seats > 0);
  const opponent = rng.pickWeighted(opponents, (p) => p.seats);
  return {
    id: `debate-${state.turnNumber}-${opponent.id}`,
    opponentPartyId: opponent.id,
    attack: fallbackDebateAttack(opponent.name, state.approval),
    responses: [
      {
        label: 'Answer on the record — cite what was delivered',
        style: 'neutral',
        quality: state.career.billsPassed >= 4 ? 1 : 0.35,
      },
      {
        label: 'Answer on values — restate what the party is for',
        style: 'social',
        quality: 0.7,
      },
      {
        label: 'Answer on cost — attack their arithmetic',
        style: 'economic',
        quality: state.debt < 220 ? 0.95 : 0.3,
      },
      {
        label: 'Decline the framing and pivot to the future',
        style: 'neutral',
        quality: 0.5,
      },
    ],
    chosenIndex: null,
    swing: null,
  };
}

/**
 * Phases 5–7: count the votes, apply the month, and write the report.
 *
 * This is the authoritative step. It never reads a number the client supplied;
 * it recomputes pass chances from state at the moment of the division.
 */
/**
 * What a cost per head is worth here.
 *
 * Money over people. A country with a third of the income per head has
 * public services that cost a third as much per head, because that is what
 * a doctor, a school place and a kilometre of track cost in a country with
 * that income — not because anything has been discounted.
 */
function costScaleOf(state: GameState): number {
  return state.moneyScale / Math.max(0.0001, state.peopleScale);
}

export function resolveTurn(state: GameState): GameState {
  const next = clone(state);
  const rng = new Rng(next.rngState);
  const entries = currentLog(next);

  /* ---------------- phase 5: legislature ---------------- */
  next.phase = 'legislature';
  const tabled = next.bills.filter((b) => b.status === 'proposed');

  const player = playerParty(next.parties);

  /* Bills come back from committee before anything else is counted. */
  for (const bill of next.bills) {
    if (bill.status !== 'in_committee') continue;
    if (bill.committeeReturnsOn !== null && bill.committeeReturnsOn > next.turnNumber) continue;

    const report = committeeReport(bill, rng);
    bill.status = 'proposed';
    bill.committeeBonus = report.chanceBonus;
    bill.committeeReturnsOn = null;
    /* Scrutiny sands the edges off: better drafted, less distinctive. */
    bill.ideology = {
      economic: bill.ideology.economic * (1 - report.moderation),
      social: bill.ideology.social * (1 - report.moderation),
      environmental: bill.ideology.environmental * (1 - report.moderation),
    };
    tabled.push(bill);

    log(entries, {
      kind: 'legislature',
      label: `${bill.title} returns from committee`,
      delta: report.chanceBonus * 100,
      cause: report.findings,
      unit: '%',
    });
  }

  for (const bill of tabled) {
    /*
     * Roll the party's own benches first. A wing that refuses takes its seats
     * out of the government's side before the chamber is counted at all.
     */
    const risks = rebellionRisks(
      next.partyInternals,
      player.seats,
      bill.ideology,
      bill.whipSteps,
    );
    const rebellion = resolveRebellions(rng, risks);

    if (rebellion.rebelled.length > 0) {
      next.partyInternals.rebellionsThisTerm += rebellion.rebelled.length;
      next.partyInternals.cohesion = Math.max(
        0,
        next.partyInternals.cohesion + rebellion.cohesionCost,
      );
      for (const rebel of rebellion.rebelled) {
        const faction = next.partyInternals.factions.find((f) => f.id === rebel.factionId);
        if (faction) {
          faction.rebelling = true;
          faction.loyalty = Math.max(0, faction.loyalty - 5);
        }
        log(entries, {
          kind: 'legislature',
          label: `${rebel.factionName} rebels`,
          delta: -rebel.seats,
          cause: `${rebel.seats} of your own MPs refused to back ${bill.title}. It sits too far from where that wing stands.`,
          unit: 'seats',
        });
      }
    }

    const breakdown = computePassChance(
      bill,
      next.parties,
      next.sectors,
      bill.whipSteps,
      next.partyInternals,
      rebellion.seatsLost,
    );
    bill.passChance = breakdown.chance;
    const chance = Math.min(0.97, breakdown.chance + bill.committeeBonus);
    bill.passChance = chance;
    const carriedInHouse = resolveBillVote(rng, chance);

    /*
     * Clearing the lower house is not the end of it. The Senate is renewed by
     * halves, so half of it was elected by a previous electorate — a
     * government with a fresh mandate can still be stopped by the last one.
     * Money bills are the exception, by convention.
     */
    let passed = carriedInHouse;
    let senateBlocked = false;

    if (carriedInHouse) {
      const verdict = senateVerdict(bill, next.senate, next.parties);
      const senateChance = Math.min(
        0.98,
        verdict.chance + bill.crossbenchDeals * CROSSBENCH_SENATE_BONUS,
      );
      const clearedSenate = senateVote(rng, { ...verdict, chance: senateChance });

      if (!clearedSenate) {
        passed = false;
        senateBlocked = true;
        bill.blockedBySenate = true;
        log(entries, {
          kind: 'legislature',
          label: `${bill.title} blocked by the Senate`,
          delta: null,
          cause: `Carried in the lower house and stopped in the upper, where the government holds ${verdict.supportingSeats} of ${verdict.size} seats.`,
        });
      } else if (!verdict.bypassed) {
        log(entries, {
          kind: 'legislature',
          label: `${bill.title} clears the Senate`,
          delta: null,
          cause: `The upper house assented at ${(senateChance * 100).toFixed(0)}% projected.`,
        });
      }
    }

    bill.status = passed ? 'passed' : 'failed';
    bill.turnResolved = next.turnNumber;

    if (senateBlocked) {
      next.career.billsFailed += 1;
    } else if (passed) {
      next.career.billsPassed += 1;
      log(entries, {
        kind: 'legislature',
        label: bill.title,
        delta: null,
        cause: `Division passed at ${(chance * 100).toFixed(0)}% projected — ${breakdown.supportingSeats} of ${breakdown.totalSeats} seats behind it.`,
      });
      /*
       * Nothing arrives the month it passes. The effects are scheduled, and
       * land later — which is the quiet tragedy of a twelve-month term: the
       * things worth doing take effect after the election that decides
       * whether you were right to do them.
       */
      const delay = implementationDelay(bill);
      bill.takesEffectOn = next.turnNumber + delay;
      bill.inEffect = false;
      bill.lapsesOn = sunsetTurn(bill, next.turnNumber);

      log(entries, {
        kind: 'legislature',
        label: `${bill.title} — implementation`,
        delta: delay,
        cause: `Enacted. It will begin to be felt in ${delay} week${delay === 1 ? '' : 's'}.${bill.lapsesOn ? ` Lapses in week ${bill.lapsesOn} unless renewed.` : ''}`,
        unit: 'weeks',
      });

      /* Crossing a red line carries: the bill stands, the partner is furious. */
      for (const breach of breakdown.breaches) {
        const partner = next.parties.find((p) => p.id === breach.party.id);
        if (!partner) continue;
        partner.coalitionMood = clampMood(
          (partner.coalitionMood ?? MOOD_START) + MOOD_RED_LINE_VIOLATION,
        );
        log(entries, {
          kind: 'coalition',
          label: `${partner.name} mood`,
          delta: MOOD_RED_LINE_VIOLATION,
          cause: `${bill.title} crossed a stated red line: ${breach.redLine.description}`,
          unit: 'pts',
        });
      }
    } else if (!senateBlocked) {
      next.career.billsFailed += 1;
      log(entries, {
        kind: 'legislature',
        label: bill.title,
        delta: null,
        cause: `Division failed at ${(chance * 100).toFixed(0)}% projected — ${breakdown.supportingSeats} of ${breakdown.totalSeats} seats behind it${breakdown.defectingSeats > 0 ? `, with ${breakdown.defectingSeats} partner seats withheld over a red line` : ''}.`,
      });
    }
  }

  /* ---------------- phase 6: resolution ---------------- */
  next.phase = 'resolution';

  /* Laws passed earlier now begin to bite. */
  for (const bill of next.bills) {
    if (bill.status !== 'passed' || bill.inEffect) continue;
    if (bill.takesEffectOn !== null && (bill.takesEffectOn ?? 0) > next.turnNumber) continue;
    bill.inEffect = true;
    applyEffects(
      next,
      bill.effects,
      `${bill.title} takes effect${bill.turnResolved !== null ? ` (enacted in week ${bill.turnResolved})` : ''}`,
      entries,
    );
  }

  /* Laws with a sunset clause lapse unless they were renewed. */
  for (const bill of next.bills) {
    if (bill.status !== 'passed' || !bill.inEffect) continue;
    if (bill.lapsesOn === null || bill.lapsesOn === undefined) continue;
    if (bill.lapsesOn > next.turnNumber) continue;

    bill.status = 'available';
    bill.inEffect = false;
    bill.lapsesOn = null;
    bill.takesEffectOn = null;
    applyEffects(
      next,
      reverseEffects(bill.effects),
      `${bill.title} lapsed under its sunset clause and was not renewed`,
      entries,
    );
  }

  /*
   * Sector drift toward the equilibrium implied by funding — plus whatever
   * the tax code is doing to it. A carbon price that raises almost no money
   * because nobody is emitting any more is not a failed tax; it is a tax
   * that worked, and this is where that shows up.
   */
  const fromTax = taxEffects(next.taxes).sectors;
  /*
   * Read off LAST month's assets and services, because both are stepped
   * further down this function. A one-month lag between a hospital closing
   * and the health service getting worse is not a compromise — it is about
   * right, and making it zero would mean stepping everything twice.
   */
  const fromAssets = sectorEffects(next.infrastructure, next.demography.population);
  const fromServices = sectorHealthEffects(next.services);
  for (const sector of next.sectors) {
    const before = sector.health;
    const nudge =
      (fromTax[sector.key] ?? 0) +
      (fromAssets[sector.key] ?? 0) +
      (fromServices[sector.key] ?? 0);
    sector.health = driftSectorHealth(
      sector.key,
      sector.health,
      sector.funding,
      next.difficulty,
      nudge,
      next.moneyScale,
    );
    const delta = sector.health - before;
    if (Math.abs(delta) >= 0.05) {
      log(entries, {
        kind: 'sector',
        label: SECTOR_LABELS[sector.key],
        delta,
        cause: `Drift toward the level ₡${sector.funding.toFixed(0)}bn a year sustains`,
        unit: 'pts',
      });
    }
  }

  /*
   * Public finances, priced off the economy as it stands this month —
   * and off how much of what is owed actually arrives.
   *
   * Tax that is owed is not tax that is collected, and the gap between
   * them is trust rather than enforcement. A government operating at low
   * institutional trust raises materially less from identical rates, and
   * cannot close the gap by raising them: the part that depends on people
   * deciding to comply is exactly the part that has stopped.
   */
  const compliance = complianceFactor(next.opinion);
  const fiscal = resolveFiscalTurn(
    next.sectors,
    next.economy,
    next.revenueModifier,
    next.debt,
    next.finance.bonds,
    next.taxes,
    /* Keeping what exists, building what does not, and the subscriptions
       to every room the country has a seat in. All three are spending, and
       all three are the kind nobody notices until they stop. */
    infrastructureSpend(next.infrastructure, next.moneyScale) +
      duesTotal(next.world.organisations, next.economy.gdp) +
      deploymentCost(next.military) +
      doctrineCost(next.military, next.moneyScale) +
      programmeSpend(next.military) +
      warCost(next.crises, next.moneyScale),
    compliance,
  );
  next.treasury += fiscal.treasuryDelta;
  next.debt = Math.max(0, next.debt + fiscal.debtDelta);

  log(entries, {
    kind: 'treasury',
    label: 'Revenue',
    delta: fiscal.revenue,
    cause:
      `Every instrument at its current rate, on ₡${Math.round(next.economy.gdp)}bn of output`,
    unit: '₡bn',
    informational: true,
  });
  log(entries, {
    kind: 'treasury',
    label: 'Programme spending',
    delta: -fiscal.spending,
    cause: 'Total allocated across five sectors',
    unit: '₡bn',
    informational: true,
  });
  log(entries, {
    kind: 'debt',
    label: 'Debt service',
    delta: -fiscal.debtService,
    cause:
      `Coupons on ₡${Math.round(next.debt)}bn of paper, averaging ` +
      `${averageCoupon(next.finance.bonds).toFixed(2)}%`,
    unit: '₡bn',
    informational: true,
  });
  if (Math.abs(fiscal.treasuryDelta) >= 0.05) {
    log(entries, {
      kind: 'treasury',
      label: 'Treasury',
      delta: fiscal.treasuryDelta,
      cause:
        fiscal.balance >= 0
          ? 'Surplus remaining after debt repayment, banked as cash'
          : 'Net cash movement for the week',
      unit: '₡bn',
    });
  }
  if (fiscal.debtDelta > 0) {
    log(entries, {
      kind: 'debt',
      label: 'Debt',
      delta: fiscal.debtDelta,
      cause: 'Deficit financed by new borrowing',
      unit: '₡bn',
    });
  } else if (fiscal.debtDelta < 0) {
    log(entries, {
      kind: 'debt',
      label: 'Debt',
      delta: fiscal.debtDelta,
      cause: 'Surplus applied to outstanding principal',
      unit: '₡bn',
    });
  }

  /*
   * A negative treasury is not a free line of credit: cash shortfalls are
   * financed on the market like any other borrowing. Without this, one-off
   * spending from bills and events accumulates as invisible debt that never
   * accrues interest and never shows up in the approval calculation.
   */
  if (next.treasury < 0) {
    const overdraft = -next.treasury;
    next.debt += overdraft;
    next.treasury = 0;
    log(entries, {
      kind: 'debt',
      label: 'Debt',
      delta: overdraft,
      cause: 'Cash shortfall carried into borrowing',
      unit: '₡bn',
    });
    /*
     * Both halves of the transfer are logged. Recording only the debt side
     * would leave the report's treasury total short by exactly the overdraft,
     * and a player tracing the number would find the wrong answer.
     */
    log(entries, {
      kind: 'treasury',
      label: 'Treasury',
      delta: overdraft,
      cause: 'Cash shortfall covered by borrowing, returning the balance to zero',
      unit: '₡bn',
    });
  }

  /*
   * The world.
   *
   * Stepped first among the Engine 3 systems, because every other thing out
   * there — trade, alliances, whether somebody else's war is yours — reads
   * off the relationships. Nothing here moves fast: a relationship is a
   * decade-long object, and a government that wants one changed has to spend
   * capital on it repeatedly rather than once.
   */
  {
    const tick = stepWorld(next.world, {
      playerIdeology: player.ideology,
      industries: next.industries,
      gdp: next.economy.gdp,
      turn: next.turnNumber,
    });
    next.world = tick.world;
    for (const shift of tick.shifted) {
      const template = findNation(shift.key);
      log(entries, {
        kind: 'note',
        label: `${template.name} — now ${shift.to}`,
        delta: 0,
        cause:
          shift.to === 'hostile'
            ? `A relationship that was merely strained is now a problem. ${template.blurb}`
            : shift.to === 'allied' || shift.to === 'friendly'
              ? `${template.name} is counted a friend again.`
              : `The relationship with ${template.name} has moved.`,
        unit: '',
      });
    }

    /*
     * Dues are already inside programme spending — they are a bill like any
     * other. They are reported separately because they are the least
     * glamorous and most accurate thing that can be said about
     * multilateralism: it is billed whether or not the room was used.
     */
    if (tick.dues > 0) {
      log(entries, {
        kind: 'treasury',
        label: 'Dues to international bodies',
        delta: -tick.dues,
        cause:
          `${next.world.organisations.filter((o) => o.member).length} memberships, billed ` +
          'whether or not the government used the room.',
        unit: '₡bn',
        informational: true,
      });
    }
  }

  /*
   * The world, running on its own.
   *
   * Stepped first, before anything the player has any say in, because
   * that is the relationship: this country reacts to the world rather than
   * the other way round. Most of what happens here has nothing to do with
   * Verdana, and the player's job is to notice which parts reach them.
   */
  const simTick = stepWorldSim(
    next.world.pairs,
    next.world.wars,
    next.world.globalEvents,
    {
      turn: absoluteWeek(next),
      rng,
      tension: next.world.tension,
      nations: next.world.nations,
    },
  );
  next.world = {
    ...next.world,
    pairs: simTick.pairs,
    wars: simTick.wars,
    globalEvents: simTick.events,
    tension: clamp01to100(next.world.tension + simTick.tension),
    /*
     * Countries rise, fall, and occasionally become something else
     * overnight. Both are applied here because the nations live in the
     * world state, and both are the reason the map in term four is not the
     * map in term one.
     */
    nations: next.world.nations.map((nation) => {
      const drifted = driftPower(nation.power, findNation(nation.key).power, rng);
      if (simTick.upheaval && simTick.upheaval.nation === nation.key) {
        return { ...nation, power: drifted, posture: simTick.upheaval.to };
      }
      return { ...nation, power: drifted };
    }),
  };
  for (const report of simTick.reports) {
    log(entries, {
      kind: 'event',
      label: report.label,
      delta: report.tension,
      cause: report.cause,
      unit: report.tension === 0 ? '' : 'pts',
    });
  }

  /*
   * The cheque being presented.
   *
   * A mutual defence treaty is the one agreement in this engine that can
   * commit the country to a war it did not choose. Until now the panel said
   * so and nothing ever happened — the obligation was priced, displayed,
   * and never called. It is called here: when a war starts between two
   * other countries and one of them is a country Verdana has promised to
   * defend, the quarrel becomes this country's, whatever the government
   * thinks of it and whoever signed the paper.
   */
  for (const war of simTick.wars) {
    if (war.ended || war.since !== absoluteWeek(next)) continue;
    const ally = boundToDefend(next.world, war.a)
      ? war.a
      : boundToDefend(next.world, war.b)
        ? war.b
        : null;
    if (!ally) continue;

    const aggressor = ally === war.a ? war.b : war.a;
    if (liveCrises(next.crises).some((c) => c.nation === aggressor)) continue;

    const crisis = openCrisis(
      aggressor,
      `${findNation(ally).name} has been attacked, and Verdana is bound by treaty to defend it.`,
      next.turnNumber,
      next.world,
    );
    /* It does not start at the bottom of the ladder. An obligation called is
       already a standoff, because the choice to honour it or not has been
       made in public the moment the war began. */
    next.crises = [...next.crises, { ...crisis, stage: 'standoff', escalation: 45 }];

    log(entries, {
      kind: 'event',
      label: `The treaty with ${findNation(ally).name} has been invoked`,
      delta: 0,
      cause:
        `A previous government promised to defend them and this one is being asked to. ` +
        `Whatever is decided in the next few weeks about ${findNation(aggressor).name} will be ` +
        'read by every country Verdana has ever signed anything with.',
      unit: '',
    });
  }

  /* Everything the world is currently doing to this country, summed once. */
  const global = globalEffects(next.world.globalEvents);

  /*
   * The infrastructure.
   *
   * Stepped first, because the condition of the hospitals is part of what
   * the health sector's health MEANS, and the capacity of the roads is part
   * of what the logistics industry can do. Everything downstream reads it.
   */
  const infraTick = stepInfrastructure(next.infrastructure);
  next.infrastructure = infraTick.infrastructure;
  for (const project of infraTick.opened) {
    const template = findInfrastructure(project.key);
    log(entries, {
      kind: 'note',
      label: `${template.name} — opened`,
      delta: 0,
      cause:
        `Commissioned in term ${project.startedTerm}, ${Math.round(
          (next.turnNumber - project.startedTurn) / 12,
        )} years ago. ${project.units} units of capacity in service.`,
      unit: '',
    });
  }
  for (const key of infraTick.newlyFailing) {
    log(entries, {
      kind: 'note',
      label: `${findInfrastructure(key).name} — failing`,
      delta: 0,
      cause:
        'Condition has fallen past the point where people notice. The work owed on it ' +
        'costs more now than it would have cost to keep up with.',
      unit: '',
    });
  }
  if (infraTick.backlogAdded > 0.05) {
    log(entries, {
      kind: 'treasury',
      label: 'Maintenance deferred',
      delta: 0,
      cause:
        `₡${infraTick.backlogAdded.toFixed(1)}bn of work not done, added to a backlog now at ` +
        `₡${totalBacklog(next.infrastructure).toFixed(0)}bn. It compounds.`,
      unit: '',
      informational: true,
    });
  }

  /*
   * The people.
   *
   * Stepped first, because the workforce it produces is the economy's speed
   * limit and the skills it produces are what several industries stand on.
   * Nothing here moves fast enough for this government to see the result of
   * its own decisions about it, which is the honest shape of the thing.
   */
  const demographyBefore = next.demography;
  {
    const services = averageSectorHealth(next.sectors);
    next.demography = stepDemography(next.demography, {
      unemployment: next.economy.unemployment,
      healthQuality: findSector(next.sectors, 'health').health,
      educationQuality: findSector(next.sectors, 'education').health,
      serviceQuality: services,
      regionalJobs: regionalEmployment(next.industries),
      /*
       * What the world is doing to the flow, as a LEVEL for as long as the
       * event runs. It used to be ADDED to the stored figure every week,
       * which turned a refugee movement worth six per thousand into two
       * hundred and forty over a forty-week event — and from there into a
       * workforce, a growth rate and an economy that had all run away.
       */
      migrationShock: global.migration,
      turn: next.turnNumber,
    });

    /*
     * Apportionment. Once a term the seats follow the people, so a
     * government that presided over Estmoor emptying into Ternhill fights
     * the next election on a map it did not draw and may not like.
     */
    if (isApportionmentDue(next.demography, next.turnNumber)) {
      const moves = apportionSeats(next.regions, next.demography.regional);
      next.demography.lastApportionment = next.turnNumber;
      const changed = moves.filter((m) => m.after !== m.before);
      for (const move of moves) {
        const region = next.regions.find((r) => r.id === move.regionId);
        if (region) region.seats = move.after;
      }
      if (changed.length > 0) {
        log(entries, {
          kind: 'note',
          label: 'Seats redistributed',
          delta: 0,
          cause: changed
            .map((m) => {
              const name = next.regions.find((r) => r.id === m.regionId)?.name ?? m.regionId;
              return `${name} ${m.after > m.before ? '+' : '−'}${Math.abs(m.after - m.before)}`;
            })
            .join(', ') + '. The boundary commission has caught up with where people now live.',
          unit: '',
        });
      }
    }
  }

  /*
   * The services.
   *
   * Stepped after the population, because the population is what they are
   * demanded by. Nobody sets demand: it is recomputed from the country every
   * month, and the budget that met it last year does not meet it this one.
   */
  /*
   * What the world is doing to the people here. A refugee movement is a
   * migration figure and a pandemic is a health figure, and both belong in
   * the systems that already model those rather than in a modifier.
   */
  if (global.health < 0) {
    const health = findSector(next.sectors, 'health');
    health.health = clamp01to100(health.health + global.health / TURNS_PER_YEAR);
  }

  const servicesTick = stepServices(
    next.services,
    next.sectors,
    next.demography,
    next.economy,
    /* Straight off the budget's line items. The player set these one by one. */
    serviceFunding(next.budget),
    costScaleOf(next),
  );
  next.services = servicesTick.services;

  /*
   * And what all of that did to households.
   *
   * The distribution is stepped here, after the services and before the
   * macroeconomy reads the week, because everything it needs has just been
   * settled: what the budget funded, what housing is short by, what the
   * energy industry is charging. It is the join between the budget screen
   * and the polling — the point at which "a two-point rise in the sales
   * tax" stops being a number and becomes a household with less to spend.
   */
  {
    const housingAsset = next.infrastructure.assets.find((a) => a.key === 'housing');
    const energy = next.industries.find((i) => i.key === 'energy');
    const transfers =
      next.services
        .filter((x) => x.key === 'pensions' || x.key === 'welfare')
        .reduce((sum, x) => sum + x.funding, 0) / Math.max(1, next.economy.gdp);

    const societyTick = stepSociety(next.society, {
      economy: next.economy,
      taxes: next.taxes,
      /* Demand against capacity. A country that stopped building houses
         twenty years ago is where a housing crisis actually comes from. */
      housingPressure: housingAsset
        ? Math.max(0.6, Math.min(2.2, utilisation(housingAsset, next.demography.population)))
        : 1,
      educationQuality: findSector(next.sectors, 'education').health,
      housingQuality: next.services.find((x) => x.key === 'housing_assistance')?.quality ?? 60,
      /* An industry in trouble charges more for the thing it sells, and
         this is the one whose price every household pays. */
      energyPrices: energy ? Math.max(0.7, Math.min(2.4, 1 + (70 - energy.health) / 90)) : 1,
      transferShare: transfers * 100,
      populationGrowth: populationGrowth(demographyBefore, next.demography),
      turn: absoluteWeek(next),
    });
    next.society = societyTick.society;

    for (const key of societyTick.squeezed) {
      const band = next.society.bands.find((b) => b.key === key)!;
      log(entries, {
        kind: 'sector',
        label: `${findClass(key).label} — falling behind`,
        delta: band.disposableIndex - 100,
        cause:
          `What this band has left after tax, housing and energy is ` +
          `${band.disposableIndex.toFixed(0)} against 100 when you took office, and it is ` +
          `falling faster than the country. Nobody legislated for this; it is what the ` +
          `prices did to a household that spends ` +
          `${Math.round(findClass(key).essentialsShare * 100)}% of its money on essentials.`,
        unit: 'idx',
      });
    }
    /*
     * And what all of it is like to live in.
     *
     * Access rather than quality: a health service can be excellent and
     * unreachable, and the difference between those two is most of what a
     * government is actually judged on. Stepped here because every input
     * — the services, the assets, the distribution — has just settled.
     */
    const livingTick = stepLiving(next.living, {
      society: next.society,
      serviceQuality: Object.fromEntries(next.services.map((x) => [x.key, x.quality])),
      serviceWait: Object.fromEntries(next.services.map((x) => [x.key, x.waitMonths])),
      assetCondition: Object.fromEntries(next.infrastructure.assets.map((a) => [a.key, a.condition])),
      assetPressure: Object.fromEntries(
        next.infrastructure.assets.map((a) => [
          a.key,
          utilisation(a, next.demography.population),
        ]),
      ),
      unemployment: next.economy.unemployment,
      environmentHealth: findSector(next.sectors, 'environment').health,
      /* Measured, off the social register. */
      crimeRate: problemOf(next.problems, 'crime') * 0.45,
      urbanisation: next.demography.urbanisation,
      regional: next.demography.regional.map((r) => ({
        regionId: r.regionId,
        population: r.population,
        netFlow: r.netFlow,
        urban: r.urban,
      })),
      turn: absoluteWeek(next),
    });
    next.living = livingTick.living;

    /*
     * And what the country is, as distinct from what it has.
     *
     * The broadcasting-and-culture line pays for the institutions; the
     * distribution, the regional gap and how the politics is conducted
     * decide whether a shared story is still tellable. All of it moves
     * too slowly for the government doing the damage to see it.
     */
    const cultureLine = next.services.find((x) => x.key === 'broadcasting');
    const cultureTick = stepCulture(next.culture, {
      culturalSpend: cultureLine?.funding ?? 0,
      culturalDemand: cultureLine?.demand ?? 1,
      broadcasting: cultureLine?.quality ?? 60,
      education: findSector(next.sectors, 'education').health,
      incomeGini: next.society.incomeGini,
      ruralGap: next.living.ruralGap,
      /* How far apart the benches actually are, measured rather than
         asserted: the spread of the chamber's own positions. */
      polarisation: chamberPolarisation(next.parties),
      corruption: next.integrity.corruptionIndex,
      growth: next.economy.growth,
      unemployment: next.economy.unemployment,
      standing: next.world.reputation,
      youthShare: next.demography.youthShare,
      turn: absoluteWeek(next),
    });
    next.culture = cultureTick.culture;

    /*
     * What all of that is doing to people.
     *
     * Sixteen problems, each derived from conditions the player set and
     * from each other, and each slower to reverse than it was to cause.
     * Stepped before opinion, because the crime rate it produces is what
     * trust in the police is judged on.
     */
    const problemsTick = stepProblems(next.problems, {
      unemployment: next.economy.unemployment,
      youthShare: next.demography.youthShare,
      povertyRate: next.society.povertyRate,
      lowerDisposable: next.society.bands[0]!.disposableIndex,
      incomeGini: next.society.incomeGini,
      housingCostBurden: next.society.housingCostBurden,
      homeownership: homeownership(next.society.bands),
      access: Object.fromEntries(next.living.access.map((a) => [a.key, a.level])),
      gradient: Object.fromEntries(next.living.access.map((a) => [a.key, a.gradient])),
      serviceQuality: {
        ...Object.fromEntries(next.services.map((x) => [x.key, x.quality])),
        /*
         * Crime's police/courts terms read what the justice system
         * actually produces — clearance-driven deterrence, not raw
         * funding — rather than the generic service quality figure.
         */
        police: policingQuality(next.justice),
        courts: courtsQuality(next.justice),
      },
      ruralGap: next.living.ruralGap,
      regionalInequality: next.living.regionalInequality,
      efficacy: next.opinion.efficacy,
      institutionalTrust: institutionalTrust(next.opinion),
      happiness: next.living.happiness,
      retiredShare: next.demography.retiredShare,
      turn: absoluteWeek(next),
    });
    next.problems = problemsTick.problems;

    /*
     * And what anybody is organising about.
     *
     * A movement needs a grievance, a constituency and the belief that
     * acting works, all three. Stepped after opinion, because the last of
     * those comes from there — and the government's own answers feed back
     * into it, which is the whole decision.
     */
    const movementsTick = stepMovements(next.movements, {
      severity: (key) => severity(next.problems, key as never),
      mobilisation: mobilisation(next.opinion),
      frustration: next.opinion.frustration,
      efficacy: next.opinion.efficacy,
      norms: next.culture.politicalCulture,
      excludedShare: excludedShare(next.culture),
      institutionalTrust: institutionalTrust(next.opinion),
      turn: absoluteWeek(next),
    });
    next.movements = movementsTick.movements;

    /* What the government's own answers have done to the belief that
       organising works. Slow, and it decides what forms next year. */
    if (Math.abs(next.movements.efficacyPressure) > 0.01) {
      next.opinion = {
        ...next.opinion,
        efficacy: clamp01to100(
          next.opinion.efficacy + next.movements.efficacyPressure * 0.02,
        ),
      };
    }

    for (const key of movementsTick.formed) {
      const template = findMovement(key);
      log(entries, {
        kind: 'note',
        label: `${template.label} forms`,
        delta: 0,
        cause: `${template.about} They are asking for ${template.demand}.`,
        unit: '',
      });
    }
    for (const { key, to } of movementsTick.escalated) {
      const template = findMovement(key);
      log(entries, {
        kind: 'note',
        label: `${template.label}: ${TACTIC_LABELS[to].toLowerCase()}`,
        delta: 0,
        cause:
          `Nobody answered, so they have reached for the next thing. What they do now costs ` +
          `the country more than the concession would have.`,
        unit: '',
      });
    }
    for (const { key, outcome } of movementsTick.ended) {
      const template = findMovement(key);
      log(entries, {
        kind: 'note',
        label: `${template.label} ends`,
        delta: 0,
        cause:
          outcome === 'won'
            ? 'They got what they asked for. The country has learned that organising works, which is true and which is the bill.'
            : outcome === 'suppressed'
              ? 'Cleared out. That is not the same as settled, and it is remembered for a long time.'
              : outcome === 'absorbed'
                ? 'The grievance went away and so did they.'
                : 'They ran out of people. Nothing was conceded and nothing changed, which is how most of them end.',
        unit: '',
      });
    }

    /*
     * And the electorate replacing itself underneath all of it.
     *
     * Nobody changes their mind here. The oldest cohort leaves and the
     * youngest arrives, at about one and a quarter per cent a year, and
     * the country's centre of gravity moves with them — so a government
     * perfectly positioned in its first term can be mispositioned in its
     * third having changed nothing. The cohort being formed right now is
     * being formed by conditions this government is responsible for.
     */
    const generationsTick = stepGenerations(next.generations, {
      housingCostBurden: next.society.housingCostBurden,
      homeownership: homeownership(next.society.bands),
      lowerDisposable: next.society.bands[0]!.disposableIndex,
      incomeGini: next.society.incomeGini,
      institutionalTrust: institutionalTrust(next.opinion),
      efficacy: next.opinion.efficacy,
      environmentHealth: findSector(next.sectors, 'environment').health,
      youthUnemployment: problemOf(next.problems, 'youth_unemployment'),
      turn: absoluteWeek(next),
    });
    next.generations = generationsTick.generations;

    if (generationsTick.cohortArrived) {
      log(entries, {
        kind: 'note',
        label: 'A generation takes its place',
        delta: generationGap(next.generations),
        cause:
          `A cohort formed by the country as it has been under this government and its ` +
          `predecessors is now voting. Nobody in it will change their mind about what it ` +
          `learned, and it will still be voting in sixty years.`,
        unit: 'pts',
      });
    }
    if (generationsTick.driftedAway) {
      log(entries, {
        kind: 'note',
        label: 'The ground has moved',
        delta: 0,
        cause: describeGenerations(next.generations),
        unit: '',
      });
    }

    for (const key of problemsTick.worsened) {
      const template = findProblem(key);
      log(entries, {
        kind: 'sector',
        label: `${template.label} — now serious`,
        delta: problemOf(next.problems, key),
        cause:
          `${problemOf(next.problems, key).toFixed(1)} ${template.unit} against an ordinary ` +
          `${template.opening}. ${template.blurb} It will come back ` +
          `${template.stickiness.toFixed(1)} times more slowly than it arrived.`,
        unit: template.unit,
      });
    }
    if (problemsTick.boiling) {
      log(entries, {
        kind: 'note',
        label: 'Unrest',
        delta: problemOf(next.problems, 'unrest'),
        cause:
          `Several things are going wrong at once and they are compounding. ` +
          `${describeProblems(next.problems)}`,
        unit: 'idx',
      });
    }

    /*
     * And what the country thinks of the arrangements it is being
     * governed under, which is the thing underneath approval and matters
     * a great deal more. Stepped last, because it reads every other
     * system's output — including what the culture engine has just said
     * about the norms.
     */
    const opinionTick = stepOpinion(next.opinion, {
      approval: next.approval,
      growth: next.economy.growth,
      unemployment: next.economy.unemployment,
      lowerDisposable: next.society.bands[0]!.disposableIndex,
      costOfLivingChange:
        next.society.history.length > 52
          ? ((next.society.costOfLiving -
              next.society.history[next.society.history.length - 52]!.costOfLiving) /
              Math.max(1, next.society.costOfLiving)) *
            100
          : 0,
      qualityOfLife: next.living.qualityOfLife,
      happiness: next.living.happiness,
      polarisation: chamberPolarisation(next.parties),
      norms: next.culture.politicalCulture,
      corruption: next.integrity.corruptionIndex,
      courtsQuality: courtsQuality(next.justice),
      policeQuality: policingQuality(next.justice),
      adminQuality: next.services.find((x) => x.key === 'administration')?.quality ?? 60,
      crimeRate: problemOf(next.problems, 'crime') * 0.45,
      mediaConcentration: next.press.concentration,
      disinformation: next.press.disinformation,
      incomeGini: next.society.incomeGini,
      legislativeSuccess:
        next.career.billsPassed + next.career.billsFailed > 0
          ? next.career.billsPassed / (next.career.billsPassed + next.career.billsFailed)
          : 0.5,
      externalTension: next.world.tension,
      turn: absoluteWeek(next),
    });
    next.opinion = opinionTick.opinion;

    for (const key of opinionTick.collapsed) {
      const template = findTrust(key);
      log(entries, {
        kind: 'note',
        label: `Trust in ${template.label.toLowerCase()} has gone`,
        delta: trustOf(next.opinion, key),
        cause:
          `${template.blurb} Distrust spreads between institutions and confidence does not, ` +
          `so this is not where it stops.`,
        unit: 'idx',
      });
    }
    if (opinionTick.withdrawn) {
      log(entries, {
        kind: 'note',
        label: 'The country has stopped bothering',
        delta: next.opinion.efficacy,
        cause:
          `Frustration is at ${next.opinion.frustration.toFixed(0)} and the belief that ` +
          `participating changes anything has fallen to ${next.opinion.efficacy.toFixed(0)}. ` +
          `The marches will stop and the petitions will dry up. That is not the anger going ` +
          `away, and it is considerably harder to come back from than the anger was.`,
        unit: 'idx',
      });
    }

    for (const key of cultureTick.hollowed) {
      const template = findCulturalInstitution(key);
      log(entries, {
        kind: 'sector',
        label: `${template.label} — hollowed out`,
        delta: institutionOf(next.culture, key).vitality,
        cause:
          `${template.blurb} It has fallen below the point it recovers from. Nothing has ` +
          `closed and nothing will be missed this year, which is what makes this line the ` +
          `easiest saving in the budget and the hardest to reverse.`,
        unit: 'idx',
      });
    }
    if (cultureTick.comingApart) {
      const weakest = leastIncluded(next.culture);
      log(entries, {
        kind: 'note',
        label: 'A community that does not feel part of it',
        delta: -belongingGap(next.culture),
        cause:
          `${weakest.label} reads ${weakest.belonging.toFixed(0)} on belonging against ` +
          `${(weakest.belonging + belongingGap(next.culture)).toFixed(0)} at the top. A country ` +
          `holds together at its weakest attachment rather than its average, and the average ` +
          `here is fine.`,
        unit: 'pts',
      });
    }

    for (const key of livingTick.failing) {
      const template = findAccess(key);
      log(entries, {
        kind: 'sector',
        label: `${template.label} — out of reach`,
        delta: accessOf(next.living, key).level,
        cause:
          `${template.blurb} Access has fallen below the point households notice it, and it ` +
          `is ${accessOf(next.living, key).gradient.toFixed(0)} points worse at the bottom of ` +
          `the distribution than the top. The service figures will not show this; they measure ` +
          `what it is like for the people who get it.`,
        unit: 'idx',
      });
    }

    if (societyTick.povertyAlarm) {
      log(entries, {
        kind: 'sector',
        label: 'A fifth of the country below the line',
        delta: next.society.povertyRate,
        cause:
          'Relative poverty has passed twenty per cent. It is measured against the middle ' +
          'rather than against a basket, so it did not rise because prices rose — it rose ' +
          'because the bottom fell further behind the median than it was.',
        unit: '%',
      });
    }
  }
  for (const key of servicesTick.newlyStrained) {
    const template = findService(key);
    const service = next.services.find((s) => s.key === key)!;
    log(entries, {
      kind: 'sector',
      label: `${template.name} — under strain`,
      delta: 0,
      cause:
        `Demand has grown to ₡${service.demand.toFixed(1)}bn a year against ` +
        `₡${service.funding.toFixed(1)}bn allocated. Nobody cut it; it is being asked for more.` +
        (service.waitMonths > 0
          ? ` People are waiting ${service.waitMonths.toFixed(1)} months.`
          : ''),
      unit: '',
    });
  }

  /*
   * The industries.
   *
   * Stepped before the finances and the economy, because what the industries
   * are doing is what the economy is: the aggregate below is a correction to
   * output, not a second opinion about it. They move slowly, so most of what
   * happens here is the consequence of a decision taken several months ago —
   * often by somebody else.
   */
  {
    const before = next.industries;
    const drag = skillsDrag(next.demography);
    const assets = industryEffects(next.infrastructure, next.demography.population);
    next.industries = stepIndustries(
      next.industries,
      next.economy,
      next.taxes,
      next.sectors,
      drag,
      assets,
      next.moneyScale,
    );

    for (const industry of next.industries) {
      const was = before.find((i) => i.key === industry.key);
      if (!was) continue;
      const delta = industry.health - was.health;
      /* Only report a move worth a line. Twenty industries drifting by a
         tenth of a point each would bury everything else in the report. */
      if (Math.abs(delta) < 0.35) continue;
      const pressure = industryPressure(
        was,
        next.economy,
        next.taxes,
        next.sectors,
        drag,
        assets[industry.key],
        next.moneyScale,
      );
      const leading = pressure.reasons[0];
      log(entries, {
        kind: 'economy',
        label: findIndustry(industry.key).name,
        delta,
        cause: leading
          ? `${leading.label} ${leading.value >= 0 ? 'helping' : 'hurting'} it most`
          : 'Drifting toward its normal level',
        unit: 'pts',
      });
    }
  }

  /*
   * The public finances.
   *
   * Stepped before the economy, because the market prices this government's
   * paper off the month it has just had, and the rating it lands on is what
   * the next tranche is issued at. What falls due this month is refinanced
   * at today's price, whether or not today's price is one anybody planned
   * for — which is the entire reason maturities are tracked rather than
   * collapsed into a single debt figure.
   */
  {
    const tick = stepPublicFinance(next.finance, {
      debtTolerance: next.debtTolerance,
      debt: next.debt,
      economy: next.economy,
      turnBalance: fiscal.balance,
      spending: fiscal.spending,
      regions: next.regions,
      /* Annual, like every other budget figure the regions read. */
      nationalRevenue: fiscal.revenue * TURNS_PER_YEAR,
      newBorrowing: Math.max(0, fiscal.debtDelta),
      /* The treasury funds at five years by default: dearer than short
         paper, and it does not hand the next crisis a refinancing cliff. */
      tenor: 60,
      turn: next.turnNumber,
    });
    const beforeRating = next.finance.rating.grade;
    next.finance = tick.finance;

    /*
     * The one fiscal consequence that is not a matter of degree.
     *
     * Every other one is a wider spread, a worse grade, a bigger interest
     * line. This is nobody lending at all — so the deficit has to be closed
     * this week rather than over a parliament, which is what a sovereign
     * debt crisis actually is and why it ends governments rather than
     * embarrassing them.
     */
    if (tick.lostMarketAccess) {
      log(entries, {
        kind: 'event',
        label: 'The market has stopped lending',
        delta: 0,
        cause:
          `Debt is ${(debtRatio(next.debt, next.economy.gdp) * 100).toFixed(0)}% of output and ` +
          'still ' +
          'rising, and this week an auction did not clear. The deficit now has to be closed out ' +
          'of receipts, immediately, whatever the chamber thinks of that.',
        unit: '',
      });
    }
    if (tick.regainedMarketAccess) {
      log(entries, {
        kind: 'event',
        label: 'The auctions are clearing again',
        delta: 0,
        cause:
          'Somebody bid. Nothing about the debt has become sustainable; the direction of travel ' +
          'has changed, and that is what was being asked about all along.',
        unit: '',
      });
    }
    if (!next.finance.marketAccess) {
      next.approval = clampApproval(next.approval + SHUTOUT_APPROVAL);

      /*
       * And the part that is not a number on a page. With nobody lending,
       * the shortfall is closed by cutting what can be cut — which is the
       * discretionary lines, pro rata, because there is no time to choose
       * and the statutory ones are law. Quarterly rather than weekly, so
       * it reads as a decision taken under duress rather than as a grind.
       */
      if (fiscal.balance < 0 && absoluteWeek(next) % months(3) === 0) {
        const shortfall = -fiscal.balance * TURNS_PER_YEAR;
        const room = discretionaryTotal(next.budget);
        if (room > 0) {
          const cut = Math.min(shortfall, room * EMERGENCY_CUT_MAX);
          const scale = (room - cut) / room;
          next.budget = {
            ...next.budget,
            lines: next.budget.lines.map((line) =>
              isStatutory(line.service)
                ? line
                : { ...line, enacted: line.enacted * scale, proposed: line.proposed * scale },
            ),
          };
          syncSectorsToBudget(next);
          log(entries, {
            kind: 'treasury',
            label: 'Emergency reductions',
            delta: -cut,
            cause:
              `₡${cut.toFixed(0)}bn taken out of every department that is not protected by ` +
              'statute, pro rata, because there was no time to choose and no money to argue ' +
              'with. Nobody voted for this and nobody will defend it.',
            unit: '₡bn',
          });
        }
      }
      if (next.finance.weeksShutOut >= SHUTOUT_WEEKS_FATAL) {
        return endRun(
          next,
          true,
          `Two years without access to the markets. Departments have been paid out of receipts ` +
            'and nothing else, the chamber has stopped pretending this is a policy, and the ' +
            'government has been replaced by one that will accept the terms.',
        );
      }
    }

    if (tick.ratingMoved) {
      const worse =
        CREDIT_RATINGS.findIndex((r) => r.grade === tick.finance.rating.grade) >
        CREDIT_RATINGS.findIndex((r) => r.grade === beforeRating);
      log(entries, {
        kind: 'debt',
        label: worse ? 'Downgraded' : 'Upgraded',
        delta: 0,
        cause:
          `${beforeRating} → ${tick.finance.rating.grade}. ` +
          `${tick.finance.rating.reasons.join('. ')}. ` +
          `Every tranche issued from here carries ${tick.finance.spread.toFixed(2)} points more.`,
        unit: '',
      });
    } else if (
      next.finance.rating.pending !== next.finance.rating.grade &&
      next.finance.rating.reviewTurns > 0
    ) {
      log(entries, {
        kind: 'debt',
        label: 'On review',
        delta: 0,
        cause:
          `The agencies are ${next.finance.rating.reviewTurns} of ` +
          `${RATING_REVIEW_TURNS} weeks into a review that would take you to ` +
          `${next.finance.rating.pending}. ${next.finance.rating.reasons.join('. ')}.`,
        unit: '',
      });
    }

    if (tick.matured > 0) {
      log(entries, {
        kind: 'debt',
        label: 'Refinanced',
        delta: 0,
        cause:
          `₡${Math.round(tick.matured)}bn of paper matured and was reissued at ` +
          `${borrowingCost(next.economy.policyRate, next.finance.spread, 60).toFixed(2)}%`,
        unit: '',
        informational: true,
      });
    }

    for (const kind of tick.newBreaches) {
      log(entries, {
        kind: 'note',
        label: `${FISCAL_RULE_LABELS[kind]} breached`,
        delta: 0,
        cause:
          'Your own rule, broken by your own budget. It costs approval every week it stands, ' +
          'and the credibility it bought with lenders is gone until it is kept again.',
        unit: '',
      });
    }

    /* Breaking your own fiscal rule is a political cost, not a fiscal one. */
    const breachCost = breachApprovalCost(next.finance.rules);
    if (breachCost > 0) {
      next.approval = Math.max(0, next.approval - breachCost);
      log(entries, {
        kind: 'approval',
        label: 'Fiscal rules',
        delta: -breachCost,
        cause: rulesInBreach(next.finance.rules)
          .map((r) => `${FISCAL_RULE_LABELS[r.kind]} in breach for ${r.breachTurns} weeks`)
          .join('; '),
        unit: 'pts',
      });
    }

    if (tick.reserveContributed > 0 || tick.reserveReturn > 0.05) {
      log(entries, {
        kind: 'treasury',
        label: 'Reserve fund',
        delta: 0,
        cause:
          `₡${Math.round(next.finance.reserveFund)}bn held` +
          (tick.reserveReturn > 0.05 ? `, earning ₡${tick.reserveReturn.toFixed(1)}bn` : '') +
          (tick.reserveContributed > 0
            ? `, paid ₡${tick.reserveContributed.toFixed(0)}bn in`
            : ''),
        unit: '',
        informational: true,
      });
    }
  }

  /*
   * The economy.
   *
   * Stepped after the fiscal result, because the deficit the government just
   * ran is the fiscal impulse the economy feels. Growth, jobs, prices and the
   * policy rate all move here, and none of them are the government's to set
   * — which is why the entries below are recorded as things that happened
   * rather than as things that were decided.
   */
  /* Voters stop being angry about a rate long before the treasury stops
     collecting it, so the memory of a change is aged out each month. */
  next.taxes = forgetOldChanges(next.taxes, next.turnNumber);

  /*
   * Trade, stepped before the economy reads it.
   *
   * Flows move slowly — a supply chain is a physical object with contracts
   * attached and does not re-route because a minister said something — but
   * retaliation arrives all at once, on its own clock, weeks after the
   * decision that caused it. That gap is the entire political economy of
   * protection and it is why this is stepped as a system rather than
   * computed as a modifier.
   */
  const tradeAgreements = tradeAgreementsWith(next.world, next.world.organisations);
  const tradeTick = stepTrade(next.trade, {
    world: next.world,
    economy: next.economy,
    nationalRate: next.taxes.rates.import_tariff,
    agreements: tradeAgreements,
    /* A closed strait or a foreign war is a multiplier on every flow, and
       it belongs here rather than as a separate subtraction downstream. */
    globalMultiplier: global.trade,
    turn: next.turnNumber,
  });
  next.trade = tradeTick.trade;

  for (const answer of tradeTick.retaliated) {
    const template = findNation(answer.nation);
    log(entries, {
      kind: 'note',
      label: `${template.name} answers`,
      delta: answer.to,
      cause:
        `${template.demonym} tariffs on Verdanan goods go to ${answer.to.toFixed(0)}%. ` +
        'The announcement here was six weeks ago; the bill arrives now, and it is paid by ' +
        'whoever exports to them.',
      unit: 'pts',
    });
  }
  for (const key of tradeTick.disputed) {
    const template = findNation(key);
    log(entries, {
      kind: 'note',
      label: `${template.name} files a complaint`,
      delta: 0,
      cause:
        `Rather than answer in kind, ${template.name} has taken it to the Commercial ` +
        'Convention. Slower than a tariff, and worse for a government that cares what the ' +
        'world thinks of it.',
      unit: '',
    });
  }

  /*
   * The forces, and the quarrels.
   *
   * Stepped before the economy because a war is an economic shock and the
   * fighting costs money that the fiscal result has already been computed
   * against — the cost lands next week, which is also how it works.
   */
  const defenceLine = lineFor(next.budget, 'defence');
  const defenceService = next.services.find((s) => s.key === 'defence');
  const militaryTick = stepMilitary(next.military, {
    funding:
      defenceLine.enacted -
      deploymentCost(next.military) -
      doctrineCost(next.military, next.moneyScale),
    required: defenceService?.demand ?? defenceLine.enacted,
    demography: next.demography,
    unemployment: next.economy.unemployment,
    turn: next.turnNumber,
    /* Procurement runs on a clock that does not reset at an election, which
       is what makes "a successor collects it" mean anything. */
    week: absoluteWeek(next),
    rng,
    atWar: atWar(next.crises),
    moneyScale: next.moneyScale,
  });
  next.military = militaryTick.military;

  for (const programme of militaryTick.delivered) {
    const template = findProgramme(programme.key);
    log(entries, {
      kind: 'note',
      label: `${template.name} delivered`,
      delta: template.strength,
      cause:
        `${Math.round(((programme.slippedTo - programme.dueTurn) / TURNS_PER_YEAR) * 10) / 10} years ` +
        `late and ₡${(programme.cost - programmeCost(template, next.moneyScale)).toFixed(0)}bn over. It was started ` +
        `${Math.round((absoluteWeek(next) - programme.startedTurn) / TURNS_PER_YEAR)} years ago, ` +
        'and whoever started it is not necessarily the government collecting it.',
      unit: 'pts',
    });
  }
  for (const slip of militaryTick.slipped) {
    const template = findProgramme(slip.programme.key);
    log(entries, {
      kind: 'note',
      label: `${template.name} slips again`,
      delta: -slip.weeks,
      cause:
        `Another ${slip.weeks} weeks and ₡${(slip.programme.cost * PROCUREMENT_OVERRUN).toFixed(0)}bn. ` +
        'Nobody involved is surprised, which is itself the problem.',
      unit: 'weeks',
      informational: true,
    });
  }

  /*
   * A crisis arrives.
   *
   * Not started by the player, because the decision a government actually
   * faces is never whether to have one. The chance is set by how dangerous
   * the world is and by the worst relationship the country has — and it
   * falls when the forces are strong enough that nobody wants to find out,
   * which is what a deterrent IS and the only place it shows up.
   */
  if (liveCrises(next.crises).length < 2) {
    const worst = [...next.world.nations]
      .filter((n) => n.recognised)
      .sort((a, b) => a.relations - b.relations)[0];
    if (worst && worst.relations < -15) {
      const risk =
        (next.world.tension / 100) *
        ((-worst.relations - 15) / 85) *
        CRISIS_BASE_RISK *
        /* A deterrent halves it. Not to nothing: the whole point is that a
           country can do everything right and still have a bad year. */
        (combatPower(next.military) > 55 ? 0.5 : 1);
      if (rng.chance(risk)) {
        const template = findNation(worst.key);
        const crisis = openCrisis(worst.key, crisisCause(template.name), next.turnNumber, next.world);
        next.crises = [...next.crises, crisis];
        log(entries, {
          kind: 'event',
          label: `An incident with ${template.name}`,
          delta: 0,
          cause: `${crisis.cause} Nothing has to happen next. Something usually does.`,
          unit: '',
        });
      }
    }
  }

  /*
   * The agencies.
   *
   * Stepped before the crises, because what the player believes about the
   * other side is an input to what they do about it — and because an
   * operation that surfaces this week is a crisis all by itself.
   */
  const intelTick = stepIntelligence(next.intelligence, {
    cover: (lineFor(next.budget, 'agencies').enacted) /
      Math.max(1, next.services.find((sv) => sv.key === 'agencies')?.demand ?? 1),
    world: next.world,
    military: next.military,
    crises: next.crises,
    turn: absoluteWeek(next),
    rng,
  });
  next.intelligence = intelTick.intelligence;

  for (const { operation, template } of intelTick.concluded) {
    const them = findNation(operation.nation);
    if (operation.status === 'exposed') {
      /*
       * It surfaced. The cost is diplomatic and domestic at once, and it
       * is very often presented to a government that did not order it.
       */
      next.approval = clampApproval(next.approval + template.scandal.approval);
      next.world = {
        ...next.world,
        reputation: clamp01to100(next.world.reputation + template.scandal.reputation),
        nations: next.world.nations.map((n) =>
          n.key === operation.nation
            ? { ...n, relations: clampRelations(n.relations + template.scandal.relations) }
            : n,
        ),
      };
      log(entries, {
        kind: 'event',
        label: `${template.name} in ${them.name} — exposed`,
        delta: template.scandal.approval,
        cause:
          `It was authorised ${Math.round((absoluteWeek(next) - operation.startedTurn) / 4.33)} ` +
          'months ago and it is on every front page now. Deniable was always a description of ' +
          'a period of time rather than of the operation.',
        unit: 'pts',
      });
    } else if (operation.status === 'succeeded') {
      if (template.effect.relations) {
        next.world = {
          ...next.world,
          nations: next.world.nations.map((n) =>
            n.key === operation.nation
              ? { ...n, relations: clampRelations(n.relations + template.effect.relations!) }
              : n,
          ),
        };
      }
      if (template.effect.tension) {
        next.world = {
          ...next.world,
          tension: clamp01to100(next.world.tension + template.effect.tension),
        };
      }
      log(entries, {
        kind: 'note',
        label: `${template.name} in ${them.name}`,
        delta: template.effect.capability ?? 0,
        cause: `${template.purpose} Nobody outside the building will ever know it happened.`,
        unit: 'pts',
        informational: true,
      });
    } else {
      log(entries, {
        kind: 'note',
        label: `${template.name} in ${them.name} — failed`,
        delta: 0,
        cause:
          'It did not work and it did not surface, which is the second-best outcome and the ' +
          'one nobody is told about.',
        unit: '',
        informational: true,
      });
    }
  }

  /*
   * And the cost of winning the oversight argument: an agency nobody is
   * watching, doing something nobody asked for.
   */
  if (rng.chance(scandalRisk(next.intelligence))) {
    next.approval = clampApproval(next.approval + AGENCY_SCANDAL_APPROVAL);
    next.intelligence = {
      ...next.intelligence,
      oversight: clamp01to100(next.intelligence.oversight + 12),
    };
    log(entries, {
      kind: 'event',
      label: 'The agencies did something nobody asked for',
      delta: AGENCY_SCANDAL_APPROVAL,
      cause:
        'Nobody in the building thought they were doing anything unusual, which is the part ' +
        'the inquiry will find hardest to explain. Oversight has been tightened, in public, ' +
        'by a government that argued against tightening it.',
      unit: 'pts',
    });
  }

  /* What each quarrel had cost before this week was added to it. The
     manpower engine needs the week's own figure, not the running total. */
  const casualtiesBefore = new Map(next.crises.map((c) => [c.id, c.casualties]));

  const conflictTick = stepConflicts(next.crises, {
    military: next.military,
    world: next.world,
    /* The army's real headcount, so that a war costs a share of the
       people in it rather than a flat figure decided before the manpower
       engine existed. */
    forceThousands: (underArms(next.manpower) * ARMY_SHARE) / 1000,
    turn: next.turnNumber,
    rng,
  });
  next.crises = conflictTick.crises;
  if (Math.abs(conflictTick.approval) > 0.005) {
    next.approval = clampApproval(next.approval + conflictTick.approval);
    log(entries, {
      kind: 'approval',
      label: conflictTick.approval > 0 ? 'The flag' : 'The crisis, still running',
      delta: conflictTick.approval,
      cause:
        conflictTick.approval > 0
          ? 'A country rallies to a government in a crisis. It is the most reliable finding ' +
            'in the subject and the shortest-lived.'
          : 'An unresolved crisis stops being a flag to rally round and becomes a thing the ' +
            'government has failed to finish.',
      unit: 'pts',
    });
  }
  for (const event of conflictTick.events) {
    log(entries, {
      kind: 'event',
      label: event.label,
      delta: 0,
      cause: event.cause,
      unit: '',
    });
  }

  /*
   * The army as a flow of people, and the army as a structure.
   *
   * Stepped here because both read the week the military engine has just
   * settled — what the defence line funded, how ready the arms are — and
   * because both are the join between a decision taken at this desk and
   * the thing that eventually happens because of it. Manpower is the lag
   * measured in months of training; the order of battle is the lag
   * measured in headquarters. A government feels the second one first and
   * the first one for much longer.
   */
  {
    const fighting = next.crises.filter((c) => c.stage === 'war');
    const warIntensity = fighting.length
      ? Math.min(100, fighting.reduce((sum, c) => sum + c.escalation, 0))
      : 0;
    const casualtiesThisWeek = fighting.reduce(
      (sum, c) => sum + Math.max(0, c.casualties - (casualtiesBefore.get(c.id) ?? c.casualties)),
      0,
    );
    const army = next.military.arms.find((a) => a.key === 'army');
    const defence = next.services.find((x) => x.key === 'defence');
    const telecoms = next.infrastructure.assets.find((a) => a.key === 'telecoms');

    const manpowerTick = stepManpower(next.manpower, {
      workforce: next.demography.workforce,
      unemployment: next.economy.unemployment,
      /* A staffing ratio, not a sum. What the defence line is funding
         against what meeting the demand would take. */
      trainingFunding: defence?.staffing ?? 1,
      casualties: casualtiesThisWeek,
      atWar: fighting.length > 0,
      warIntensity,
      /* Nobody volunteers for a war the country does not support, and the
         approval rating is the only honest read on that available. */
      publicSupport: next.approval,
      norms: next.culture.politicalCulture,
      /*
       * A peacetime army is fed. Supply is a wartime question, and
       * readiness is the best proxy the engine has for whether the
       * logistics will hold when it is asked — until Engine 7F models
       * them, at which point this term has somewhere better to come from.
       *
       * It reads 100 at peace deliberately: readiness is an index that
       * ordinarily sits near fifty, and wiring it straight in would have
       * every country's army quietly losing morale for eight years
       * because of a number that was never about food.
       */
      supply: fighting.length
        ? clamp01to100(40 + (army?.readiness ?? 50) * 0.6)
        : 100,
      turn: absoluteWeek(next),
    });
    next.manpower = manpowerTick.manpower;

    if (manpowerTick.pipelineBound) {
      log(entries, {
        kind: 'note',
        label: 'The training establishment is the constraint',
        delta: next.manpower.trainingCapacity,
        cause:
          `More people are coming forward than there is anywhere to train them. The pool is ` +
          `not the force: what stands between them is fourteen weeks and a building, and the ` +
          `building takes years. Nothing said at this desk shortens either.`,
        unit: 'people',
        informational: true,
      });
    }
    if (manpowerTick.reserveExhausted) {
      log(entries, {
        kind: 'note',
        label: 'The reserve is gone',
        delta: next.manpower.reserves,
        cause:
          `Up to now the country has been calling up soldiers. From here it is training ` +
          `civilians, and the first of them is fourteen weeks from being any use. This is the ` +
          `week a war changes character, and it does it quietly.`,
        unit: 'people',
      });
    }
    if (manpowerTick.desertionAlarm) {
      log(entries, {
        kind: 'note',
        label: 'People are leaving',
        delta: -next.manpower.desertion,
        cause:
          `Morale is at ${next.manpower.morale.toFixed(0)} and the army is losing people who ` +
          `have not been anywhere near a battle. An army does not usually stop existing by ` +
          `losing one; it stops existing like this, and the returns arrive late.`,
        unit: 'people',
      });
    }

    /*
     * How many of the replacements the army asked for it can actually
     * have. This is the whole join between the two systems: a formation
     * ground down in March is still at two-thirds strength in September
     * because the bodies to rebuild it are fourteen weeks from being
     * soldiers, and everybody's fourteen weeks started at the same time.
     */
    const wanted = Math.max(1, replacementDemand(next.orbat));
    const orbatTick = stepOrbat(next.orbat, {
      atWar: fighting.length > 0,
      warIntensity,
      /* Positive when the crises are going the country's way. */
      battlefield: fighting.length
        ? Math.max(
            -1,
            Math.min(
              1,
              fighting.reduce((sum, c) => sum + (c.ourResolve - c.theirResolve), 0) /
                (fighting.length * 100),
            ),
          )
        : 0,
      communications: telecoms ? clamp01to100(telecoms.condition) / 100 : 0.5,
      supply: fighting.length ? clamp01to100(40 + (army?.readiness ?? 50) * 0.6) : 100,
      /* Net of ordinary replacement: what the procurement programmes are
         delivering above what peacetime use wears out. */
      equipmentDelta: militaryTick.delivered.length * 0.35,
      replacements: Math.max(0, Math.min(1.4, manpowerTick.arrivals / wanted)),
      normsStanding: next.culture.politicalCulture,
      turn: absoluteWeek(next),
    });
    next.orbat = orbatTick.orbat;

    if (orbatTick.unreliable) {
      log(entries, {
        kind: 'note',
        label: 'The army is no longer certain',
        delta: unreliableShare(next.orbat) * 100,
        cause:
          `${(unreliableShare(next.orbat) * 100).toFixed(0)}% of the force is now under ` +
          `officers who would not necessarily carry out an order they disagreed with. That is ` +
          `not a coup and there is nothing to arrest. It is the thing a government finds out ` +
          `about late, and it followed the norms rather than anything the army did.`,
        unit: 'pct',
      });
    }
    for (const id of orbatTick.failing) {
      const commander = next.orbat.commanders.find((c) => c.id === id);
      if (!commander) continue;
      log(entries, {
        kind: 'note',
        label: `${commander.name} is being blamed`,
        delta: commander.standing,
        cause:
          `Standing has collapsed. Whether any of it was theirs to control is a separate ` +
          `question from whether they will be removed, and the second question is the one ` +
          `that gets answered.`,
        unit: 'idx',
        informational: true,
      });
    }
  }

  /*
   * The ground.
   *
   * A map appears when a crisis becomes a war and stays until it stops
   * being one. It is stepped after the fighting is scored, because what
   * the sectors do this week is what the casualties were made of — and
   * before the report is written, because the report is written from the
   * BELIEF rather than from the ground, and the difference between those
   * two is the whole point of having a map at all.
   */
  {
    const fightingNow = next.crises.filter((c) => c.stage === 'war');

    /* A war on land gets a theatre. It gets exactly one. */
    for (const crisis of fightingNow) {
      if (next.theatres.some((t) => t.warId === crisis.id)) continue;
      const nation = findNation(crisis.nation);
      next.theatres = [
        ...next.theatres,
        buildTheatre(crisis.id, `the ${nation.name} front`, false, rng),
      ];
      log(entries, {
        kind: 'event',
        label: `A front has opened against ${nation.name}`,
        delta: 0,
        cause:
          'There is now ground being fought over, and a map of it. The map is drawn from ' +
          'what has been reported rather than from what is there, and nothing on it marks ' +
          'which parts are which.',
        unit: '',
      });
    }

    /* And loses it when the shooting stops. The devastation does not go
       with it; that belongs to the country it happened in. */
    next.theatres = next.theatres.filter((t) => fightingNow.some((c) => c.id === t.warId));

    const army = next.military.arms.find((a) => a.key === 'army');
    next.theatres = next.theatres.map((theatre) => {
      const crisis = fightingNow.find((c) => c.id === theatre.warId)!;
      const tick = stepTheatre(theatre, {
        orbat: next.orbat,
        /*
         * What is in front of us, scaled to what they are. Until Engine
         * 7J models their order of battle, their combat power against
         * ours is the honest available read.
         */
        enemyStrength:
          forceValue(next.orbat, 'defence') *
          Math.max(0.3, Math.min(2.2, 0.4 + (crisis.theirResolve / 100) * 1.2)),
        intensity: crisis.escalation,
        /* Engine 7F will run the logistics. Until then, readiness. */
        logistics: Math.max(0.3, Math.min(1.2, (army?.readiness ?? 55) / 70)),
        theyAttack: rng.chance(0.3),
        turn: absoluteWeek(next),
        rng,
      });

      for (const id of tick.culminating) {
        const sector = tick.theatre.sectors.find((x) => x.id === id);
        if (!sector) continue;
        log(entries, {
          kind: 'note',
          label: `The attack on ${sector.name} has outrun its supply`,
          delta: -sector.supply,
          cause:
            'Every mile forward is a mile further from the railheads and a mile nearer ' +
            'theirs, so it has been getting weaker at exactly the rate they have been ' +
            'getting stronger. It will be reported as progress for a while yet, because ' +
            'from the despatches it still looks like one.',
          unit: 'idx',
        });
      }
      for (const id of tick.encircled) {
        const sector = tick.theatre.sectors.find((x) => x.id === id);
        if (!sector) continue;
        log(entries, {
          kind: 'note',
          label: `${sector.name} is cut off`,
          delta: -1,
          cause:
            'That is not a sector under pressure. It is a sector with a deadline, and the ' +
            'deadline is measured in weeks.',
          unit: '',
        });
      }
      if (tick.stagnant) {
        log(entries, {
          kind: 'note',
          label: 'The line has stopped going anywhere',
          delta: tick.theatre.stagnantWeeks,
          cause:
            `${tick.theatre.stagnantWeeks} weeks without the front moving. It is still ` +
            'costing what it cost in the first week, which is the part that decides this ' +
            'rather than anything either army does.',
          unit: 'weeks',
        });
      }
      if (tick.civilianCasualties > 0.5) {
        log(entries, {
          kind: 'note',
          label: 'Civilian casualties',
          delta: -tick.civilianCasualties,
          cause:
            'A sector is a place people live. Nobody asked them, and they are counted ' +
            'separately because they are.',
          unit: 'k',
          informational: true,
        });
      }

      /* What the ground cost, charged to the crisis that produced it. */
      crisis.casualties += tick.casualties + tick.enemyCasualties;
      return tick.theatre;
    });
  }

  /*
   * The fleet and the air force.
   *
   * Stepped after the ground, because both feed it and neither is
   * decided by it. What they have in common is that the figure a
   * government is briefed — hulls, squadrons — is not the figure that
   * matters, and the gap between them opens quietly over years of
   * ordinary budgets rather than suddenly in a war.
   */
  {
    const fightingNow = next.crises.filter((c) => c.stage === 'war');
    const atWar = fightingNow.length > 0;
    const intensity = atWar
      ? Math.min(100, fightingNow.reduce((sum, c) => sum + c.escalation, 0))
      : 0;
    const opposition = atWar
      ? Math.max(
          0.3,
          Math.min(2.5, fightingNow.reduce((s, c) => s + c.theirResolve, 0) / (fightingNow.length * 55)),
        )
      : 1;
    const defence = next.services.find((x) => x.key === 'defence');
    const funding = defence?.staffing ?? 1;

    const navyTick = stepNavy(next.navy, {
      funding,
      atWar,
      intensity,
      opposition,
      turn: absoluteWeek(next),
      rng,
      moneyScale: next.moneyScale,
    });
    next.navy = navyTick.navy;

    for (const ship of navyTick.lost) {
      const template = findShip(ship.shipClass);
      log(entries, {
        kind: 'event',
        label: `${ship.name} has been lost`,
        delta: -template.prestige,
        cause:
          `${template.buildYears} years to build and there is no replacing it inside this war. ` +
          `An order placed today would commission under a government two elections from here, ` +
          `which everybody involved knew when the order to sail was given.`,
        unit: 'pts',
      });
      next.approval = clampApproval(next.approval - template.prestige * 0.12);
    }
    for (const ship of navyTick.commissioned) {
      log(entries, {
        kind: 'note',
        label: `${ship.name} commissioned`,
        delta: findShip(ship.shipClass).presence,
        cause:
          'Ordered by a government that is not this one, and the best thing in the fleet by a ' +
          'distance until something else is.',
        unit: 'idx',
        informational: true,
      });
    }
    if (navyTick.hollow) {
      log(entries, {
        kind: 'note',
        label: 'The fleet list has stopped meaning what it says',
        delta: seaworthy(next.navy).length - afloat(next.navy).length,
        cause:
          `${afloat(next.navy).length} ships on the list and ${seaworthy(next.navy).length} that ` +
          `could sail. That is not damage — it is a refit backlog and a part that is not made ` +
          `any more, and the number this desk is briefed is the first one.`,
        unit: 'hulls',
      });
    }

    const airTick = stepAir(next.airForce, {
      funding,
      atWar,
      intensity,
      opposition,
      trainingFunding: funding,
      turn: absoluteWeek(next),
    });
    next.airForce = airTick.air;

    if (airTick.hollow) {
      log(entries, {
        kind: 'note',
        label: 'A third of the air force is off the line',
        delta: -(1 - readyShare(next.airForce)) * 100,
        cause:
          'Not losses. Wear, cannibalisation and a part that is three months out, which take ' +
          'a third of any air force off the line within six months of a war and appear in no ' +
          'figure anybody has been briefed.',
        unit: 'pct',
      });
    }
    if (airTick.aircrewBound) {
      log(entries, {
        kind: 'note',
        label: 'The aircrew are the constraint now, not the aircraft',
        delta: aircrewQuality(next.airForce),
        cause:
          'Two years to make one, and the experienced ones cannot be replaced at all inside ' +
          'this war. The country can lose its air force twice over and rebuild it; it cannot ' +
          'get these people back.',
        unit: 'idx',
      });
    }
    if (airTick.bombingHardening > 0.02) {
      /*
       * The finding every government is told beforehand and none has yet
       * acted on. It is logged as a cost rather than a diminishing
       * return, because a diminishing return would still be a return.
       */
      log(entries, {
        kind: 'note',
        label: 'The bombing is hardening them',
        delta: -airTick.bombingHardening,
        cause:
          `It has destroyed a great deal — that part is real and measurable, which is most of ` +
          `why it is on the desk. It has not separated anybody from their government, and the ` +
          `harder it is pressed the less it does.`,
        unit: 'pts',
        informational: true,
      });
      for (const crisis of fightingNow) crisis.theirResolve = clamp01to100(crisis.theirResolve + airTick.bombingHardening);
    }
  }

  /*
   * The depots, and what the country is making.
   *
   * Stepped last of the war systems because everything else has already
   * said what it burned this week. The two numbers that come out of here
   * — weeks of ammunition, and what reaches the front — are the ones
   * that decide whether any of the rest of it was possible, and they are
   * both knowable on the first afternoon of a war by anybody who asks.
   */
  {
    const fightingNow = next.crises.filter((c) => c.stage === 'war');
    const atWar = fightingNow.length > 0;
    const intensity = atWar
      ? Math.min(100, fightingNow.reduce((sum, c) => sum + c.escalation, 0))
      : 0;
    const roads = next.infrastructure.assets.find((a) => a.key === 'roads');
    const rail = next.infrastructure.assets.find((a) => a.key === 'railways');
    const transport =
      ((roads ? clamp01to100(roads.condition) : 60) +
        (rail ? clamp01to100(rail.condition) : 60)) /
      200;

    const force = underArms(next.manpower);
    const committedPeople = next.orbat.formations
      .filter((f) => f.committed)
      .reduce((sum, f) => sum + f.personnel, 0);
    const deepest = next.theatres.reduce(
      (deepest_, t) =>
        Math.max(deepest_, ...t.sectors.filter((x) => x.garrison.length > 0).map((x) => x.depth), 0),
      0,
    );

    const economyTick = stepWarEconomy(next.warEconomy, {
      gdp: next.economy.gdp,
      warCost: atWar ? warCost(next.crises, next.moneyScale) / TURNS_PER_YEAR : 0,
      atWar,
      turn: absoluteWeek(next),
      moneyScale: next.moneyScale,
    });
    next.warEconomy = economyTick.economy;

    if (economyTick.borrowed > 0) next.debt += economyTick.borrowed;
    if (economyTick.inflation > 0) {
      next.economy = {
        ...next.economy,
        inflation: next.economy.inflation + economyTick.inflation,
      };
    }
    if (Math.abs(economyTick.approval) > 0.002) {
      next.approval = clampApproval(next.approval + economyTick.approval);
    }
    if (economyTick.converted) {
      log(entries, {
        kind: 'note',
        label: `${findFooting(next.warEconomy.footing).label} — converted`,
        delta: militaryOutput(next.warEconomy),
        cause:
          `Ordered ${Math.round((absoluteWeek(next) - next.warEconomy.orderedTurn) / 4)} months ` +
          `ago, and producing something from this week. Whoever ordered it paid for all of ` +
          `that and collected none of it, which is what ordering it is.`,
        unit: '\u00d7',
      });
    }

    const logisticsTick = stepLogistics(next.logistics, {
      committed: committedPeople,
      force: Math.max(1, force * ARMY_SHARE),
      depth: deepest,
      atWar,
      intensity,
      output: militaryOutput(next.warEconomy),
      funding: next.services.find((x) => x.key === 'defence')?.staffing ?? 1,
      transport,
      /*
       * What the network was built for. A force larger than this is not
       * better supplied by being larger — it is worse supplied, and so
       * is everybody already there.
       */
      capacity: Math.max(1, transport * 260_000 * next.peopleScale),
      turn: absoluteWeek(next),
    });
    next.logistics = logisticsTick.logistics;

    for (const key of logisticsTick.warning) {
      const template = findSupply(key);
      const left = weeksRemaining(stockOf(next.logistics, key));
      log(entries, {
        kind: 'note',
        label: `${template.label}: ${Number.isFinite(left) ? left.toFixed(0) : 'many'} weeks left`,
        delta: -stockOf(next.logistics, key).weeks,
        cause:
          `${template.outcome} Raising production takes ${template.leadMonths} months, which ` +
          `is longer than the stock lasts — and was longer than the stock lasted on the first ` +
          `day of this too.`,
        unit: 'weeks',
      });
    }
    for (const key of logisticsTick.critical) {
      const template = findSupply(key);
      log(entries, {
        kind: 'event',
        label: `${template.label} is running out`,
        delta: -1,
        cause: template.outcome,
        unit: '',
      });
    }
    if (logisticsTick.diminishing) {
      log(entries, {
        kind: 'note',
        label: 'The tail has started eating the teeth',
        delta: next.logistics.tail,
        cause:
          `${next.logistics.tail.toFixed(1)} people behind the front for every one at it. Past ` +
          `this point sending more formations forward reduces what can be brought to bear, ` +
          `because what they consume exceeds what they add. Nothing about that is intuitive ` +
          `and it does not stop being true for that reason.`,
        unit: 'ratio',
      });
    }
  }

  /*
   * What the army believes, and what a previous government bought.
   *
   * Both run on clocks longer than a term. A doctrine ordered this week
   * arrives under a successor and a programme started this week arrives
   * under the one after that, which is why this is the part of defence
   * policy that no electoral cycle has ever been able to hold.
   */
  {
    const fightingNow = next.crises.filter((c) => c.stage === 'war');
    const atWar = fightingNow.length > 0;
    /*
     * Officer turnover is what actually moves a doctrine, so it is
     * measured rather than assumed: the share of the officer corps that
     * has changed since last week.
     */
    const serving_ = serving(next.orbat);
    const turnover =
      serving_.length > 0
        ? serving_.filter((c) => absoluteWeek(next) - c.appointedTurn < 2).length /
          serving_.length
        : 0;

    const doctrineTick = stepDoctrine(next.doctrine, {
      orbat: next.orbat,
      turnover,
      atWar,
      battlefield: atWar
        ? Math.max(
            -1,
            Math.min(
              1,
              fightingNow.reduce((s, c) => s + (c.ourResolve - c.theirResolve), 0) /
                (fightingNow.length * 100),
            ),
          )
        : 0,
      /* Until Engine 7J reads their order of battle, the doctrine of
         whoever is winning is the honest available guess at what the
         army is being taught by. */
      opposing: atWar ? 'attrition' : null,
      funding: next.services.find((x) => x.key === 'defence')?.staffing ?? 1,
      turn: absoluteWeek(next),
    });
    next.doctrine = doctrineTick.doctrine;

    if (doctrineTick.adopted) {
      const template = findWarDoctrine(next.doctrine.current);
      log(entries, {
        kind: 'note',
        label: `The army now does ${template.label.toLowerCase()}`,
        delta: 0,
        cause:
          `Ordered ${Math.round((absoluteWeek(next) - next.doctrine.orderedTurn) / TURNS_PER_YEAR)} ` +
          `years ago. It did not arrive because it was restated; it arrived because the ` +
          `officers who believed the other one retired.`,
        unit: '',
      });
    }
    if (doctrineTick.learned && next.doctrine.lastWarLesson) {
      const lesson = findWarDoctrine(next.doctrine.lastWarLesson);
      log(entries, {
        kind: 'note',
        label: `The army has concluded something about ${lesson.label.toLowerCase()}`,
        delta: 0,
        cause:
          next.doctrine.lastWarLesson === next.doctrine.current
            ? `It is winning with it, which is the strongest argument any doctrine ever has ` +
              `and is drawn from one war.`
            : `It is being beaten by it. Armies adopt the doctrine of whoever beat them, and ` +
              `nobody has ever adopted the doctrine of an army they beat.`,
        unit: '',
      });
    }
    for (const { programme, dated } of doctrineTick.delivered) {
      const template = findResearchField(programme.field);
      log(entries, {
        kind: 'note',
        label: `${template.label} — delivered`,
        delta: programme.realised ?? 0,
        cause: dated
          ? `Started ${Math.round((absoluteWeek(next) - programme.startedTurn) / TURNS_PER_YEAR)} ` +
            `years ago and specified against a doctrine the army no longer holds. It arrived ` +
            `on time and is worth a fraction of what was promised for it, which is what ` +
            `buying for a decade means.`
          : `Started ${Math.round((absoluteWeek(next) - programme.startedTurn) / TURNS_PER_YEAR)} ` +
            `years ago by a government that is not this one, and worth exactly what was ` +
            `promised — which happens when the decade turns out as specified.`,
        unit: 'idx',
      });
    }

    /* The research bill, which is paid every year and shows nothing. */
    const bill = researchCost(next.doctrine, next.moneyScale) / TURNS_PER_YEAR;
    if (bill > 0) next.debt += bill;
  }

  /*
   * The table, and the building behind it.
   *
   * Stepped weekly rather than tied to any single decision, because
   * capture, loyalty and cohesion are all things that happen to a
   * cabinet over time rather than things a government does to it. The
   * delivery figure this reads is legislative success, which is the
   * only honest proxy the engine has for "is the government good at
   * governing" until Engine 5C/5D gives departments their own record.
   */
  {
    const legislativeSuccess =
      next.career.billsPassed + next.career.billsFailed > 0
        ? next.career.billsPassed / (next.career.billsPassed + next.career.billsFailed)
        : 0.5;
    const inCrisis = liveCrises(next.crises).length > 0;

    const cabinetTick = stepCabinet(next.cabinet, {
      approval: next.approval,
      /* No separate polling figure exists yet, so approval stands in for
         both — a government's own standing is the best available guess
         at whether it is going to win, and it is what a minister
         actually watches. */
      polling: next.approval,
      delivery: legislativeSuccess,
      crisis: inCrisis,
      turn: absoluteWeek(next),
    });
    next.cabinet = cabinetTick.cabinet;

    for (const id of cabinetTick.captured) {
      const minister = next.cabinet.ministers.find((m) => m.id === id);
      if (!minister) continue;
      log(entries, {
        kind: 'note',
        label: `${minister.name} now argues for ${findMinistry(minister.ministry).name.toLowerCase()}`,
        delta: 0,
        cause:
          'Not disloyalty. Eighteen months in, and they now know things the rest of the ' +
          'table does not, because the officials there are extremely good at their jobs.',
        unit: '',
        informational: true,
      });
    }
    if (cabinetTick.brokeDown) {
      log(entries, {
        kind: 'note',
        label: 'Collective responsibility has broken down',
        delta: -next.cabinet.cohesion,
        cause:
          'The government\'s position on anything is now whatever the last minister to be ' +
          'asked said it was, and every unattributable quote in the weekend papers comes ' +
          'from one of these offices.',
        unit: 'idx',
      });
    }
    for (const id of cabinetTick.plotters) {
      const minister = next.cabinet.ministers.find((m) => m.id === id);
      if (!minister) continue;
      log(entries, {
        kind: 'note',
        label: `${minister.name} is counting`,
        delta: -minister.loyalty,
        cause:
          'Able, ambitious, and no longer certain this government is going to win. That is ' +
          'arithmetic rather than disloyalty, and it is being done carefully.',
        unit: 'idx',
        informational: true,
      });
    }

    const machineTick = stepCivilService(next.civilService, {
      funding: next.services.find((x) => x.key === 'administration')?.staffing ?? 1,
      demands: 1 + (inCrisis ? 0.4 : 0),
      turn: absoluteWeek(next),
    });
    next.civilService = machineTick.machine;

    if (machineTick.hollowed) {
      log(entries, {
        kind: 'note',
        label: 'The machine can no longer do what it is told',
        delta: -(MACHINE_CAPABILITY - next.civilService.capability),
        cause:
          'Capability built over decades and lost in a term. Compliance is still ' +
          `${(next.civilService.compliance * 100).toFixed(0)}%, and what is being complied ` +
          'with is being done by people who cannot do it well any more.',
        unit: 'idx',
      });
    }
    if (machineTick.forgot) {
      log(entries, {
        kind: 'note',
        label: 'The building has forgotten',
        delta: -next.civilService.memory,
        cause:
          'Which things have been tried, why they failed, and who to ring. That went with ' +
          'the people who left, it was never written down, and hiring more does not bring ' +
          'it back.',
        unit: 'idx',
      });
    }
  }

  /* The bench, and the force that feeds it cases. */
  {
    const justiceTick = stepJustice(next.justice, {
      courtFunding: next.services.find((x) => x.key === 'courts')?.staffing ?? 1,
      policeFunding: next.services.find((x) => x.key === 'police')?.staffing ?? 1,
      turn: absoluteWeek(next),
    });
    next.justice = justiceTick.justice;

    if (justiceTick.benchCaptured) {
      log(entries, {
        kind: 'note',
        label: 'The bench answers to the government now',
        delta: -next.justice.courts.independence,
        cause:
          'Independence spent rather than held. It buys favourable rulings this term and ' +
          'the fall will take far longer to climb back from than it took to reach.',
        unit: 'idx',
      });
    }
    if (justiceTick.scandal) {
      log(entries, {
        kind: 'note',
        label: 'A corruption scandal breaks in the police',
        delta: -next.justice.policing.corruption,
        cause:
          'What had been quiet for years is quiet no longer. Cooperation, already the ' +
          'harder half of the clearance rate to hold, is what a story like this costs first.',
        unit: 'idx',
      });
    }
  }

  /* The body of law, and the well corruption draws from beyond policing. */
  {
    const sitting = sittingMinisters(next.cabinet);
    const patronageShare =
      sitting.length > 0 ? sitting.filter((m) => m.owes != null).length / sitting.length : 0;
    const integrityTick = stepIntegrity(next.integrity, {
      patronageShare,
      judicialIndependence: next.justice.courts.independence,
      policingCorruption: next.justice.policing.corruption,
      billsPassed: next.career.billsPassed,
      turn: absoluteWeek(next),
    });
    next.integrity = integrityTick.integrity;

    if (integrityTick.endemic) {
      log(entries, {
        kind: 'note',
        label: 'Corruption has become the ordinary cost of doing business here',
        delta: -next.integrity.corruptionIndex,
        cause:
          'Not one scandal. A settled expectation, in every ministry a contract passes ' +
          'through, of what getting to the front of the queue costs.',
        unit: 'idx',
      });
    }
  }

  /* How far the state actually reaches, and what any emergency is costing to hold. */
  {
    const infraAssets = next.infrastructure.assets;
    const infrastructureHealth =
      infraAssets.length > 0
        ? infraAssets.reduce((sum, a) => sum + a.condition, 0) / infraAssets.length
        : 60;
    const capacityTick = stepStateCapacity(next.stateCapacity, {
      civilServiceCapability: next.civilService.capability,
      infrastructureHealth,
      regulatoryQuality: regulatoryQuality(next.integrity),
      turn: absoluteWeek(next),
    });
    next.stateCapacity = capacityTick.capacity;

    if (capacityTick.normalised) {
      log(entries, {
        kind: 'note',
        label: 'The emergency has quietly become the government',
        delta: -standDownCost(next.stateCapacity),
        cause:
          'A year in force. What was unusual on the day it was declared is now simply how ' +
          'the country is run, and standing it down costs more with every week that passes.',
        unit: 'idx',
      });
    }
  }

  /* Who owns the feed, and what that is doing to what circulates. */
  {
    const pressTick = stepPress(next.press, {
      polarisation: chamberPolarisation(next.parties),
      turn: absoluteWeek(next),
    });
    next.press = pressTick.press;
  }

  /* What the government says on purpose, and what gets found instead. */
  {
    const rng = new Rng(next.rngState);
    const commsTick = stepCommunications(
      next.communications,
      {
        plotters: plotting(next.cabinet).length,
        civilServiceMorale: next.civilService.morale,
        pressFreedom: next.press.freedomIndex,
        turn: absoluteWeek(next),
      },
      rng,
    );
    next.rngState = rng.state;
    next.communications = commsTick.communications;

    if (commsTick.leaked) {
      applyEffects(next, { approval: -commsTick.leakApprovalCost }, 'Leak', entries);
      log(entries, {
        kind: 'note',
        label: 'A leak',
        delta: -commsTick.leakApprovalCost,
        cause:
          'Not announced. Found — which costs more than the same fact would have cost said out loud, ' +
          `on a week nobody in this government chose. ${next.communications.leaksThisRun} this run.`,
        unit: 'idx',
      });
      next.scandals = [
        ...next.scandals,
        spawnScandal('leak', severityFromLeak(commsTick.leakApprovalCost), absoluteWeek(next), rng),
      ];
      next.rngState = rng.state;
    }
  }

  /* What is currently being asked about, and what the government has said. */
  {
    if (
      next.integrity.corruptionIndex > CORRUPTION_SCANDAL_THRESHOLD &&
      !next.scandals.some((s) => s.cause === 'corruption')
    ) {
      const rng = new Rng(next.rngState);
      next.scandals = [
        ...next.scandals,
        spawnScandal('corruption', CORRUPTION_SCANDAL_SEVERITY, absoluteWeek(next), rng),
      ];
      next.rngState = rng.state;
    }

    const rng = new Rng(next.rngState);
    const scandalTick = stepScandals(next.scandals, rng);
    next.rngState = rng.state;
    next.scandals = scandalTick.scandals;

    if (scandalTick.approvalCost > 0) {
      applyEffects(next, { approval: -scandalTick.approvalCost }, 'Scandal', entries);
    }
    for (const id of scandalTick.confirmed) {
      log(entries, {
        kind: 'note',
        label: 'A denial is found out',
        delta: -CONFIRMED_APPROVAL_COST,
        cause: `What was denied has been found. The story now is the denial, not the original fact. (${id})`,
        unit: 'idx',
      });
    }
  }

  /*
   * What the country thinks they have, and whether it can stop.
   *
   * A file is opened the day a war starts rather than the day talks do,
   * because the trap is set on the first day. What a government says in
   * week one about what it will never accept — said on the strength of a
   * rally, before anybody knows whether it is achievable — is the
   * sentence that will not let it sign in week a hundred.
   */
  {
    const fightingNow = next.crises.filter((c) => c.stage === 'war');

    for (const crisis of fightingNow) {
      if (next.negotiations.some((n) => n.warId === crisis.id)) continue;
      const nation = findNation(crisis.nation);
      /*
       * How firmly it was said is set by the rally. The bigger the
       * rally, the firmer the language, and the firmer the language the
       * tighter the trap — which is the whole mechanism: the thing that
       * makes a war popular on day one is the thing that makes it
       * impossible to end on day seven hundred.
       */
      const firmness = clamp01to100(35 + crisis.rally * 2.2);
      next.negotiations = [
        ...next.negotiations,
        buildWarTalks(
          crisis.id,
          `nothing less than a settlement with ${nation.name} on our terms`,
          firmness,
          combatPower(next.military) * 1.1,
          crisis.theirResolve,
          /* Which way the papers lean is drawn once, at the start, and
             nobody in the chain is lying afterwards. */
          rng.chance(0.4) ? 'threat_inflation' : rng.chance(0.4) ? 'wishful' : 'mirror',
        ),
      ];
    }
    next.negotiations = next.negotiations.filter((n) =>
      fightingNow.some((c) => c.id === n.warId),
    );

    next.negotiations = next.negotiations.map((negotiation) => {
      const crisis = fightingNow.find((c) => c.id === negotiation.warId)!;
      const theatre = next.theatres.find((t) => t.warId === negotiation.warId);
      const tick = stepPeace(negotiation, {
        theirStrength: combatPower(next.military) * 1.1,
        theirResolve: crisis.theirResolve,
        reconnaissance: theatre?.reconnaissance ?? 0.2,
        inContact: (theatre?.sectors ?? []).some((s) => s.garrison.length > 0),
        battlefield: Math.max(-1, Math.min(1, (crisis.ourResolve - crisis.theirResolve) / 100)),
        ourExhaustion: clamp01to100(100 - crisis.ourResolve),
        theirExhaustion: clamp01to100(100 - crisis.theirResolve),
        ourSpent: clamp01to100(crisis.casualties * 1.4 + (absoluteWeek(next) - crisis.startedTurn) * 0.22),
        theirSpent: clamp01to100(crisis.casualties * 1.1 + (absoluteWeek(next) - crisis.startedTurn) * 0.18),
        turn: absoluteWeek(next),
        rng,
      });

      if (tick.offered) {
        log(entries, {
          kind: 'event',
          label: tick.offered.blockedByAim
            ? 'Terms this government cannot sign'
            : 'Terms have been offered',
          delta: offerValue(tick.offered),
          cause: tick.offered.blockedByAim
            ? `They are offering a settlement. It is on the table, it is better than the one ` +
              `that will be there in six months, and this government cannot sign it because ` +
              `of what it said in week one about what it would never accept. That sentence ` +
              `was worth a rally at the time.`
            : `We would give up ${tick.offered.weConcede.map((t: PeaceTerm) => findTerm(t).label.toLowerCase()).join(' and ')}; ` +
              `they would give up ${tick.offered.theyConcede.map((t: PeaceTerm) => findTerm(t).label.toLowerCase()).join(' and ')}. ` +
              `It stays on the table for ${OFFER_LIFE} weeks and the next one will be worse.`,
          unit: 'pts',
        });
      }
      for (const gone of tick.lapsed) {
        log(entries, {
          kind: 'note',
          label: 'Terms withdrawn',
          delta: -offerValue(gone),
          cause:
            'They have taken it off the table. For whoever is losing, the terms available are ' +
            'worst at the end — which means the months spent refusing were months spent ' +
            'establishing that the first offer was the good one.',
          unit: 'pts',
          informational: true,
        });
      }
      if (tick.discredited) {
        const bias = findBias(tick.negotiation.estimate.bias);
        log(entries, {
          kind: 'note',
          label: 'The estimate of their strength was wrong',
          delta: tick.negotiation.estimate.estimated - tick.negotiation.estimate.actual,
          cause:
            `${bias.blurb} Nobody was lying — it serves ${bias.serves} — and every decision ` +
            `that rested on it has already been taken.`,
          unit: 'idx',
        });
      }
      if (tick.settlement) {
        log(entries, {
          kind: 'event',
          label: 'A settlement',
          delta: offerValue(tick.settlement),
          cause:
            `Signed after ${Math.round((absoluteWeek(next) - crisis.startedTurn) / TURNS_PER_YEAR * 10) / 10} ` +
            `years. Whether it is better than the terms refused earlier is a question this ` +
            `government will be asked for the rest of its time and will answer differently ` +
            `each time.`,
          unit: 'pts',
        });
        crisis.stage = 'settled';
        crisis.settlement =
          offerValue(tick.settlement) > 8
            ? 'favourable'
            : offerValue(tick.settlement) < -8
              ? 'unfavourable'
              : 'even';
      }
      return tick.negotiation;
    });
  }

  /*
   * WAR TOUCHES EVERYTHING.
   *
   * The five chains, applied in one place. A war is not a subsystem; it
   * is a pressure on every other subsystem, and the reason governments
   * lose elections over wars they are winning is that the winning
   * happens in one place and the pressure arrives everywhere else. The
   * whole shape is in `warPressure` so it can be read at once rather
   * than hunted for as thirty separate adjustments.
   */
  {
    const fightingNow = next.crises.filter((c) => c.stage === 'war');
    const weekCasualties = fightingNow.reduce(
      (sum, c) => sum + Math.max(0, c.casualties - (casualtiesBefore.get(c.id) ?? c.casualties)),
      0,
    );
    const pressure = warPressure({
      wars: next.crises,
      theatres: next.theatres,
      /* A crisis this country escalated to war is one it started, in the
         eyes of everybody who was not asked. */
      weStarted: fightingNow.some((c) => c.ourResolve > c.theirResolve + 10),
      population: next.demography.population,
      casualties: weekCasualties,
      turn: absoluteWeek(next),
    });

    if (pressure.intensity > 0) {
      /* ---- WAR → ECONOMY ---- */
      next.economy = {
        ...next.economy,
        growth: next.economy.growth - pressure.growthDrag,
      };

      /* ---- WAR → SOCIETY ---- */
      /*
       * Bereavement is a social fact before it is a political one, and
       * it lands on the belief that anything anybody does makes a
       * difference — at exactly the moment the country most wants that
       * to be true.
       */
      next.opinion = {
        ...next.opinion,
        efficacy: clamp01to100(next.opinion.efficacy - pressure.efficacyDrain),
        frustration: clamp01to100(next.opinion.frustration + pressure.bereaved * 0.35),
      };
      if (pressure.displaced > 0.5) {
        next.demography = {
          ...next.demography,
          population: Math.max(0.1, next.demography.population - pressure.displaced / 1000),
        };
      }

      /* ---- WAR → POLITICS ---- */
      next.opinion = {
        ...next.opinion,
        trust: next.opinion.trust.map((t) =>
          t.key === 'government' || t.key === 'parliament'
            ? { ...t, level: clamp01to100(t.level - pressure.trustDrain) }
            : t,
        ),
      };
      next.culture = {
        ...next.culture,
        politicalCulture: clamp01to100(next.culture.politicalCulture - pressure.normsDrain),
      };

      /* ---- WAR → GEOPOLITICS ---- */
      if (pressure.reputationDrain > 0) {
        next.world = {
          ...next.world,
          reputation: clamp01to100(next.world.reputation - pressure.reputationDrain),
        };
      }

      /* ---- WAR → THE ARMY AS A CONSTITUENCY ---- */
      /*
       * Veterans arrive years after the war, vote reliably, and remember
       * exactly what they were told it was for. The longest-lived thing
       * any war produces, and the one no government plans for.
       */
      next.military = {
        ...next.military,
        veterans: next.military.veterans + pressure.veterans,
      };

      if (pressure.generational && !next.timeline.entries.some((e) => e.kind === 'war' && e.endYear === null && e.weight > 70)) {
        log(entries, {
          kind: 'note',
          label: 'This has become a generational event',
          delta: pressure.intensity,
          cause:
            'Past this point the war is not something the country is doing; it is something ' +
            'the country is. The people formed by it will vote on it for forty years, and ' +
            'none of that is available to be decided at this desk any more.',
          unit: 'idx',
        });
      }
    }

    /* ---- What the country will remember ---- */
    const year = yearOf(next.timeline, absoluteWeek(next));
    for (const crisis of fightingNow) {
      if (openEntryFor(next.timeline, crisis.id)) continue;
      const nation = findNation(crisis.nation);
      next.timeline = recordEntry(next.timeline, {
        kind: 'war',
        startYear: year,
        endYear: null,
        title: `${year} \u2014 the war with ${nation.name}`,
        summary: crisis.cause,
        consequences: [],
        weight: weightOf('war'),
        warId: crisis.id,
      });
    }

    /*
     * And closing it, which is the part that matters. A war that ends is
     * not over — it becomes the thing a country carries, and this is
     * where it starts being carried.
     */
    for (const entry of next.timeline.entries.filter((e) => e.kind === 'war' && e.endYear === null)) {
      const crisis = next.crises.find((c) => c.id === entry.warId);
      if (crisis && crisis.stage === 'war') continue;
      const record: WarRecord = {
        id: entry.warId ?? entry.id,
        name: entry.title.split('\u2014 ')[1] ?? entry.title,
        kind: 'limited',
        against: crisis ? findNation(crisis.nation).name : 'a state',
        aim: 'compel_settlement',
        outcome:
          crisis?.settlement === 'favourable'
            ? 'favourable_settlement'
            : crisis?.settlement === 'unfavourable'
              ? 'unfavourable_settlement'
              : 'status_quo',
        startedTurn: (entry.startYear - next.timeline.firstYear) * TURNS_PER_YEAR,
        endedTurn: absoluteWeek(next),
        casualties: crisis?.casualties ?? 0,
        peakIntensity: crisis?.escalation ?? 0,
        casus: entry.summary,
        governmentsFallen: 0,
        peakDebt: next.debt,
        deepestRecession: Math.min(0, next.economy.growth),
        territoryChanged: 0,
        alliesInvolved: crisis?.allies.length ?? 0,
      };
      const written = warSummary(
        { ...record, outcome: WAR_OUTCOME_LABELS[record.outcome] },
        next.timeline.firstYear,
      );
      next.timeline = {
        ...closeEntry(next.timeline, entry.id, year, written.consequences),
        wars: [...next.timeline.wars, record],
      };
      log(entries, {
        kind: 'event',
        label: written.title,
        delta: -record.casualties,
        cause: `${written.summary} ${written.consequences.join('. ')}.`,
        unit: 'k',
      });
    }
  }

  const economyBefore = next.economy;
  next.economy = stepEconomy(next.economy, {
    fiscalImpulse: fiscalImpulse(fiscal),
    approval: next.approval,
    productivityTarget:
      productivityTarget(
        findSector(next.sectors, 'education').health,
        findSector(next.sectors, 'infrastructure').health,
      ) + global.productivity,
    turn: next.turnNumber,
    /* What the shape of the tax code does, as distinct from its size. */
    taxEffects: taxEffects(next.taxes),
    /*
     * What the industries are doing to the jobs. Okun's law works off the
     * output gap alone, which cannot tell a downturn concentrated in retail
     * — a ninth of the jobs — from the same downturn in mining, which is a
     * sixtieth of them. This is that difference.
     */
    employmentGap: employmentGap(next.industries),
    /*
     * More people of working age is more the country can produce. This is
     * the second half of the speed limit, alongside productivity, and it is
     * the one no government can move inside a term.
     */
    workforceGrowth: workforceGrowth(demographyBefore, next.demography),
    /*
     * This month's weather, off the run's own seeded RNG, so a replayed turn
     * produces the identical month and the server can check it. The Treasury
     * forecast runs the same step with these set to zero, which is why the
     * forecast is always a little wrong in a way nobody could have told the
     * player in advance.
     */
    noise: { demand: rng.range(-1, 1), supply: rng.range(-1, 1) },
    /*
     * NX, and the price of a tariff. Both are the trade book arriving in
     * the macroeconomy: the first is a demand term nobody voted for, the
     * second a supply shock the government chose.
     */
    tradeImpulse:
      tradeImpulse(next.trade, next.economy.gdp) +
      conflictTick.economicShock * TURNS_PER_YEAR +
      /* Whatever the world is doing to demand this week. It arrives in the
         same term as a trade war, because that is what it is. */
      global.growth / IS_TRADE_WEIGHT,
    importPrices:
      importPriceEffect(
        next.trade,
        next.taxes.rates.import_tariff,
        tradeAgreements,
        next.economy.gdp,
      ) + global.inflation,
  });

  /*
   * The economy sector's health is no longer a dial that its own funding
   * settles: it is what the macroeconomy is actually doing. Economic
   * programme spending still matters, but through the fiscal impulse above,
   * which is a slower and more honest channel than a funding slider that
   * moved its own score.
   */
  const economySector = findSector(next.sectors, 'economy');
  economySector.health = economyIssueScore(next.economy);

  {
    const e = next.economy;
    const b = economyBefore;
    const move = (
      label: string,
      before: number,
      after: number,
      unit: string,
      cause: string,
      threshold = 0.05,
    ) => {
      if (Math.abs(after - before) < threshold) return;
      log(entries, { kind: 'economy', label, delta: after - before, cause, unit });
    };

    move('Growth', b.growth, e.growth, '%', describeCycle(e), 0.02);
    move(
      'Unemployment',
      b.unemployment,
      e.unemployment,
      'pts',
      `${e.employment.toFixed(1)}% of the workforce in work`,
      0.02,
    );
    move(
      'Inflation',
      b.inflation,
      e.inflation,
      '%',
      e.inflation > INFLATION_TARGET + 1
        ? 'Above target, and the bank will act on it'
        : e.inflation < 0
          ? 'Prices are falling'
          : 'Near target',
      0.02,
    );
    move(
      'Policy rate',
      b.policyRate,
      e.policyRate,
      '%',
      e.policyRate > b.policyRate
        ? 'The central bank tightened — your debt service rises with it'
        : 'The central bank eased',
      0.01,
    );
    if (b.phase !== e.phase && e.phase === 'recession') {
      log(entries, {
        kind: 'economy',
        label: 'Recession',
        delta: 0,
        cause: `${e.contractionRun} consecutive weeks of contraction. It is now called what it is.`,
        unit: '',
      });
    }
  }

  /* Approval eases toward the standing the country's condition implies. */
  const served = turnsServed(next.termNumber, next.turnNumber);
  const target = computeApprovalTarget(
    next.sectors,
    next.debt,
    served,
    next.difficulty,
    next.economy.gdp,
    next.debtTolerance,
  );
  const beforeApproval = next.approval;
  next.approval = driftApproval(next.approval, target.target);
  const approvalDelta = next.approval - beforeApproval;
  /*
   * Logged whenever it moves at all, with no threshold. Every other figure
   * in the report suppresses movement too small to show, because a list of
   * ±0.01 entries is not a report. Approval is the exception: it is the
   * number the whole run is scored on, it is the only one every other system
   * feeds into, and a week where it slid a fortieth of a point unexplained
   * is exactly the week a player goes looking. The sum of the approval lines
   * is the change in approval, always.
   */
  if (approvalDelta !== 0) {
    log(entries, {
      kind: 'approval',
      label: 'Approval',
      delta: approvalDelta,
      cause: `Drift toward standing of ${target.target.toFixed(0)}% implied by services, economy and debt`,
      unit: 'pts',
    });
  }

  /* Coalition mood drift. */
  for (const partner of coalitionPartners(next.parties)) {
    const moodTarget = computeMoodTarget(
      partner,
      player,
      next.approval,
      next.sectors,
      next.difficulty,
    );
    const beforeMood = partner.coalitionMood ?? MOOD_START;
    partner.coalitionMood = driftMood(beforeMood, moodTarget.target);
    const moodDelta = partner.coalitionMood - beforeMood;
    if (Math.abs(moodDelta) >= 0.05) {
      log(entries, {
        kind: 'coalition',
        label: `${partner.name} mood`,
        delta: moodDelta,
        cause: `Drift toward ${Math.round(moodTarget.target)}/100 given budget commitments, cabinet weight and government standing`,
        unit: 'pts',
      });
    }
  }

  /*
   * And the cast reads the papers.
   *
   * Everybody who has a view of this government moves toward what the
   * week's record justifies, at a rate their own temperament sets. No
   * randomness and no model: the same record always moves the same people
   * the same distance, which is what makes a hostile columnist's grudging
   * half-point a week worth earning.
   */
  {
    const passedThisWeek = next.bills.filter(
      (b) => b.status === 'passed' && b.turnResolved === next.turnNumber,
    ).length;
    const failedThisWeek = next.bills.filter(
      (b) => b.status === 'failed' && b.turnResolved === next.turnNumber,
    ).length;

    next.cast = stepCast(next.cast, {
      approvalDelta,
      billsPassed: passedThisWeek,
      billsFailed: failedThisWeek,
      sectorHealth: averageSectorHealth(next.sectors),
      debtRatio: next.economy.gdp > 0 ? next.debt / next.economy.gdp : 0,
      recession: next.economy.phase === 'recession',
    });
  }

  /* Partners at zero walk out. */
  const walkedOut = partnersWalkingOut(next.parties);
  for (const partner of walkedOut) {
    partner.inCoalition = false;
    partner.coalitionMood = null;
    partner.cabinetPosts = 0;
    partner.redLines = [];
    log(entries, {
      kind: 'coalition',
      label: `${partner.name} leaves the government`,
      delta: -partner.seats,
      cause: 'Mood reached zero. The party has withdrawn from the coalition agreement.',
      unit: 'seats',
    });
  }

  next.approvalHistory.push({
    turn: (next.termNumber - 1) * TURNS_PER_TERM + next.turnNumber,
    approval: next.approval,
  });

  /* ---- the party's own affairs ---- */
  const internals = next.partyInternals;

  const finance = partyFinanceTick(internals, next.approval);
  internals.funds = Math.max(0, internals.funds + finance.net);
  log(entries, {
    kind: 'note',
    label: 'Party funds',
    delta: finance.net,
    cause: `Subscriptions ₡${finance.subscriptions.toFixed(1)}m and donations ₡${finance.donations.toFixed(1)}m against ₡${finance.overheads.toFixed(1)}m of running costs`,
    unit: '₡m',
  });

  const beforeMembers = internals.members;
  internals.members = driftMembers(
    internals.members,
    membershipTarget(next.approval, internals.cohesion),
  );
  const memberDelta = internals.members - beforeMembers;
  if (Math.abs(memberDelta) >= 0.5) {
    log(entries, {
      kind: 'note',
      label: 'Party membership',
      delta: memberDelta,
      cause:
        memberDelta > 0
          ? 'People are joining while the party is doing well'
          : 'Members are letting their subscriptions lapse',
      unit: 'k',
    });
  }

  const beforeCohesion = internals.cohesion;
  internals.cohesion = driftCohesion(internals.cohesion, cohesionTarget(internals));
  const cohesionDelta = internals.cohesion - beforeCohesion;
  if (Math.abs(cohesionDelta) >= 0.5) {
    log(entries, {
      kind: 'note',
      label: 'Party discipline',
      delta: cohesionDelta,
      cause: `Drift toward the level your authority and the factions' loyalty sustain`,
      unit: 'pts',
    });
  }

  const beforeAuthority = internals.authority;
  internals.authority = driftAuthority(
    internals.authority,
    authorityTarget(
      next.approval,
      internals.rebellionsThisTerm,
      player.seats - (next.elections.at(-1)?.playerSeatsBefore ?? player.seats),
    ),
  );
  const authorityDelta = internals.authority - beforeAuthority;
  if (Math.abs(authorityDelta) >= 0.5) {
    log(entries, {
      kind: 'note',
      label: 'Your authority in the party',
      delta: authorityDelta,
      cause:
        internals.rebellionsThisTerm > 0
          ? `${internals.rebellionsThisTerm} rebellion${internals.rebellionsThisTerm === 1 ? '' : 's'} this term have made the next one easier to organise`
          : 'Drift toward the level your standing in the country sustains',
      unit: 'pts',
    });
  }

  /*
   * A leader who has lost their own party is challenged for the job. The
   * country does not get a vote; the factions do.
   */
  if (facesLeadershipChallenge(internals, next.turnNumber)) {
    const support = leadershipChallengeSupport(internals);
    if (support >= 50) {
      next.partyInternals = surviveChallenge(internals, next.turnNumber);
      log(entries, {
        kind: 'note',
        label: 'Leadership challenge survived',
        delta: support,
        cause: `A challenge was mounted and beaten with ${support.toFixed(0)}% of the party behind you. The benches have rallied — for now.`,
        unit: '%',
      });
    } else {
      internals.lastChallengeTurn = next.turnNumber;
      next.status = 'collapsed';
      next.phase = 'career_summary';
      log(entries, {
        kind: 'note',
        label: 'Removed as leader',
        delta: support,
        cause: `The party voted you out with only ${support.toFixed(0)}% behind you. A government can survive the country turning on it; it cannot survive its own side doing so.`,
        unit: '%',
      });
    }
  }

  next.career.peakApproval = Math.max(next.career.peakApproval, next.approval);
  next.career.lowestApproval = Math.min(next.career.lowestApproval, next.approval);

  /* Coverage of this turn, shown in next turn's briefing. */
  next.news = generateNews(
    entries,
    {
      turnNumber: next.turnNumber,
      countryName: next.countryName,
      approval: next.approval,
      debt: next.debt,
      playerPartyName: player.name,
    },
    rng,
  );

  /* ---------------- phase 7: report ---------------- */
  next.phase = 'report';
  next.rngState = rng.state;
  next.updatedAt = new Date().toISOString();

  /* A walkout that costs the majority is a confidence crisis. */
  next.confidenceCrisis = noConfidenceTriggered(next.parties, walkedOut);
  if (next.confidenceCrisis) {
    log(entries, {
      kind: 'note',
      label: 'Confidence in question',
      delta: null,
      cause:
        'The government no longer commands a majority. A new agreement must be negotiated.',
    });
  }

  return next;
}

/**
 * Phase 8: advance. Increments the turn, or hands off to an election.
 */
export function advanceTurn(state: GameState): GameState {
  let next = clone(state);

  /*
   * A confidence crisis takes precedence over the calendar — but only a real
   * one. Governing in a minority the player assembled deliberately is a
   * legitimate position and must not reopen negotiations every turn.
   */
  if (next.confidenceCrisis) {
    next.confidenceCrisis = false;
    next.negotiation = buildNegotiation(next.parties, 1, true);
    next.phase = 'coalition';
    return next;
  }

  if (next.turnNumber >= TURNS_PER_TERM) {
    return runElection(next);
  }

  next.turnNumber += 1;
  next = beginTurn(next);
  return next;
}

/** Hold a general election and present the result. */
export function runElection(state: GameState): GameState {
  const next = clone(state);
  const rng = new Rng(next.rngState);

  const result = simulateElection({
    parties: next.parties,
    regions: next.regions,
    districts: next.districts,
    system: next.electoralSystem,
    approval: next.approval,
    campaign: next.campaign,
    termNumber: next.termNumber,
    rng,
    /* Channels only move the people they actually reached. */
    segmentPersuasion: next.campaign ? persuasionBySegment(next.campaign.reach) : undefined,
    segmentTurnout: next.campaign ? turnoutBySegment(next.campaign.reach) : undefined,
    /* The electorate judges the record directly, so pass it the record. */
    sectors: next.sectors,
    debt: next.debt,
    revenueModifier: next.revenueModifier,
    economy: next.economy,
    /*
     * Regional services AND regional jobs reach the ballot in the regions
     * they failed in — not as a national issue score, where they would be
     * averaged away, but as a swing in exactly those places. This is the
     * end of the chain that starts at a rate the central bank set: rates →
     * construction → Estmoor → seats.
     */
    regionalSwing: Object.fromEntries(
      next.regions.map((region) => {
        const budget = next.finance.regional.find((b) => b.regionId === region.id);
        const jobs = regionalEmployment(next.industries)[region.id] ?? 0;
        return [
          region.id,
          (budget ? regionalSwing(budget) : 0) + jobs * REGIONAL_JOBS_WEIGHT,
        ];
      }),
    ),
  });

  for (const party of next.parties) {
    party.seats = result.seatsByParty[party.id] ?? 0;
    party.inCoalition = party.isPlayer;
    party.coalitionMood = null;
    party.cabinetPosts = 0;
    party.redLines = [];
  }

  /*
   * Election-night reporting: an exit poll published before counting begins,
   * the seats close enough to turn on a recount, and the swing — the number
   * that actually explains a result, because it says who moved rather than
   * who won.
   */
  result.exitPoll = (() => {
    const sample = exitPoll(result.voteShareByParty, rng);
    return { shares: sample.shares, marginOfError: sample.marginOfError };
  })();
  result.recounts = recountCandidates(result.districtOutcomes ?? []);
  const previous = next.elections[next.elections.length - 1];
  if (previous) result.swing = computeSwing(previous.voteShareByParty, result.voteShareByParty);

  /*
   * Half the Senate faces the voters; the other half carries on. This is what
   * makes divided government normal rather than exceptional.
   */
  next.senate = renewSenate(next.senate, result.voteShareByParty);

  /* The manifesto falls due. */
  const verdict = judgePromises(next.promises, next.bills, next.termNumber);
  next.promises = verdict.updated;
  if (verdict.kept + verdict.broken > 0) {
    const entries = currentLog(next);
    applyEffects(
      next,
      { approval: verdict.approvalDelta },
      `Manifesto judged: ${verdict.kept} commitment${verdict.kept === 1 ? '' : 's'} kept, ${verdict.broken} broken`,
      entries,
    );
  }
  next.executiveOrdersThisTerm = 0;

  next.elections.push(result);
  next.career.termsServed += 1;

  const playerSeats = result.playerSeatsAfter;
  const largest = Math.max(...Object.values(result.seatsByParty));
  if (playerSeats >= largest) next.career.electionsWon += 1;

  /*
   * And the country remembers it. An election is a smaller thing than a
   * war and it is still the thing a later history uses to date
   * everything else — which is the whole function of a timeline: not to
   * list what happened, but to give a reader something to hang the rest
   * on fifty years later.
   */
  {
    const year = yearOf(next.timeline, absoluteWeek(next));
    const held = playerSeats >= largest;
    next.timeline = recordEntry(next.timeline, {
      kind: 'election',
      startYear: year,
      endYear: year,
      title: `${year} \u2014 general election`,
      summary: held
        ? 'The government was returned.'
        : 'The government lost its majority and left office.',
      consequences: [
        `${playerSeats} seats, against ${largest} for the largest party`,
        `Turnout and the manifesto both judged: ${verdict.kept} kept, ${verdict.broken} broken`,
      ],
      weight: weightOf(held ? 'election' : 'government', 0, held ? 0 : 1),
    });
  }

  next.campaign = null;
  for (const region of next.regions) region.campaignInvestment = 0;

  next.phase = 'election_night';
  next.rngState = rng.state;
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Leave the election night screen and take up (or fail to take up) office. */
function acknowledgeElection(state: GameState): GameState {
  const next = clone(state);
  next.termNumber += 1;
  next.turnNumber = 1;
  next.addressesThisTerm = 0;

  /* Bills that were never enacted return to the order paper for the new term. */
  for (const bill of next.bills) {
    if (bill.status === 'failed' || bill.status === 'proposed') {
      bill.status = 'available';
      bill.whipSteps = 0;
      bill.pcSpent = 0;
      bill.passChance = null;
      bill.turnProposed = null;
      bill.turnResolved = null;
    }
  }

  if (hasMajority(next.parties)) {
    return beginTurn(next);
  }

  next.negotiation = buildNegotiation(next.parties, 1);
  next.phase = 'coalition';
  return next;
}


/**
 * End the run. A government that falls mid-term has collapsed; a party that
 * cannot form one after an election has been defeated and goes into
 * opposition. Both land on the career summary.
 */
function endRun(state: GameState, crisis: boolean, reason: string): GameState {
  const next = clone(state);
  const entries = currentLog(next);
  next.status = crisis ? 'collapsed' : 'defeated';
  next.phase = 'career_summary';
  next.negotiation = null;
  log(entries, {
    kind: 'note',
    label: crisis ? 'The government has fallen' : 'Out of office',
    delta: null,
    cause: reason,
  });
  return next;
}

/* ------------------------------------------------------------------ *
 * Intent handling
 * ------------------------------------------------------------------ */

export function applyIntent(state: GameState, intent: Intent): IntentResult {
  if (state.status !== 'active' && intent.type !== 'advance_phase') {
    return reject(state, 'This run has ended.');
  }

  switch (intent.type) {
    case 'advance_phase':
      return handleAdvancePhase(state);
    case 'resolve_event':
      return handleResolveEvent(state, intent.eventId, intent.choiceIndex);
    case 'propose_bill':
      return handleProposeBill(state, intent.billId, intent.whipSteps);
    case 'draft_bill':
      return handleDraftBill(state, intent.description, intent.draft);
    case 'record_remark':
      return handleRecordRemark(state, intent.personaId, intent.about, intent.text);
    case 'set_language_policy':
      return handleLanguagePolicy(state, intent.level);
    case 'answer_movement':
      return handleAnswerMovement(state, intent.movement, intent.response);
    case 'set_mobilisation':
      return handleMobilisation(state, intent.model);
    case 'dismiss_commander':
      return handleDismissCommander(state, intent.commander);
    case 'commit_formations':
      return handleCommitFormations(state, intent.formations, intent.committed);
    case 'set_sector_posture':
      return handleSectorPosture(state, intent.theatre, intent.sector, intent.posture);
    case 'garrison_sector':
      return handleGarrison(state, intent.theatre, intent.sector, intent.formations);
    case 'set_reconnaissance':
      return handleReconnaissance(state, intent.theatre, intent.effort);
    case 'station_fleet':
      return handleStationFleet(state, intent.zone, intent.hulls);
    case 'order_ship':
      return handleOrderShip(state, intent.shipClass);
    case 'set_air_effort':
      return handleAirEffort(state, intent.effort);
    case 'order_squadron':
      return handleOrderSquadron(state, intent.aircraft);
    case 'set_war_footing':
      return handleWarFooting(state, intent.footing);
    case 'set_war_finance':
      return handleWarFinance(state, intent.finance);
    case 'set_doctrine_belief':
      return handleDoctrineBelief(state, intent.doctrine);
    case 'force_doctrine':
      return handleForceDoctrine(state);
    case 'start_research':
      return handleStartResearch(state, intent.field);
    case 'cancel_research':
      return handleCancelResearch(state, intent.id);
    case 'open_talks':
      return handleOpenTalks(state, intent.war, intent.mediator);
    case 'break_off_talks':
      return handleBreakOffTalks(state, intent.war);
    case 'accept_terms':
      return handleAcceptTerms(state, intent.war, intent.offer);
    case 'refuse_terms':
      return handleRefuseTerms(state, intent.war, intent.offer);
    case 'revise_war_aim':
      return handleReviseWarAim(state, intent.war);
    case 'withdraw_bill':
      return handleWithdrawBill(state, intent.billId);
    case 'public_address':
      return handlePublicAddress(state);
    case 'coalition_concession':
      return handleConcession(state, intent.partyId);
    case 'reshuffle_cabinet':
      return handleReshuffle(state, intent.partyId);
    case 'appoint_minister':
      return handleAppointMinister(state, intent.ministry, intent.basis);
    case 'full_reshuffle':
      return handleFullReshuffle(state);
    case 'set_machine_posture':
      return handleMachinePosture(state, intent.posture);
    case 'set_sentencing':
      return handleSetSentencing(state, intent.policy);
    case 'set_judicial_stance':
      return handleSetJudicialStance(state, intent.stance);
    case 'set_enforcement_posture':
      return handleSetEnforcementPosture(state, intent.posture);
    case 'drive_anti_corruption':
      return handleAntiCorruptionDrive(state);
    case 'set_transparency':
      return handleSetTransparency(state, intent.regime);
    case 'set_anticorruption_posture':
      return handleSetAnticorruption(state, intent.posture);
    case 'launch_audit':
      return handleLaunchAudit(state);
    case 'simplify_law':
      return handleSimplifyLaw(state);
    case 'declare_emergency':
      return handleDeclareEmergency(state, intent.level);
    case 'stand_down_emergency':
      return handleStandDownEmergency(state);
    case 'invest_readiness':
      return handleInvestReadiness(state);
    case 'set_press_posture':
      return handleSetPressPosture(state, intent.posture);
    case 'pressure_outlet':
      return handlePressureOutlet(state);
    case 'consolidate_ownership':
      return handleConsolidateOwnership(state, intent.target);
    case 'break_up_ownership':
      return handleBreakUpOwnership(state);
    case 'launch_media_literacy':
      return handleLaunchMediaLiteracy(state);
    case 'set_comms_strategy':
      return handleSetCommsStrategy(state, intent.strategy);
    case 'release_information':
      return handleReleaseInformation(state);
    case 'respond_scandal':
      return handleRespondScandal(state, intent.scandalId, intent.response);
    case 'set_embassy_tier':
      return handleSetEmbassyTier(state, intent.nation, intent.tier);
    case 'recall_ambassador':
      return handleRecallAmbassador(state, intent.nation);
    case 'sweeten_offer':
      return handleSweetenOffer(state, intent.nation);
    case 'invest_soft_power':
      return handleInvestSoftPower(state);
    case 'emergency_budget':
      return handleEmergencyBudget(state);
    case 'set_funding':
      return handleSetFunding(state, intent.sector, intent.amount);
    case 'diplomatic_act':
      return handleDiplomaticAct(state, intent.nation, intent.act);
    case 'propose_treaty':
      return handleProposeTreaty(state, intent.nation, intent.kind);
    case 'withdraw_treaty':
      return handleWithdrawTreaty(state, intent.treatyId);
    case 'join_organisation':
      return handleJoinOrganisation(state, intent.organisation);
    case 'leave_organisation':
      return handleLeaveOrganisation(state, intent.organisation);
    case 'propose_resolution':
      return handleProposeResolution(state, intent.kind, intent.target ?? null);
    case 'set_tariff':
      return handleSetTariff(state, intent.nation, intent.points);
    case 'file_trade_complaint':
      return handleFileTradeComplaint(state, intent.nation);
    case 'set_doctrine':
      return handleSetDoctrine(state, intent.doctrine);
    case 'start_programme':
      return handleStartProgramme(state, intent.programme);
    case 'cancel_programme':
      return handleCancelProgramme(state, intent.id);
    case 'deploy_force':
      return handleDeployForce(state, intent.nation, intent.kind, intent.scale);
    case 'withdraw_force':
      return handleWithdrawForce(state, intent.id);
    case 'escalate_crisis':
      return handleEscalateCrisis(state, intent.crisisId);
    case 'de_escalate_crisis':
      return handleDeEscalateCrisis(state, intent.crisisId);
    case 'settle_crisis':
      return handleSettleCrisis(state, intent.crisisId);
    case 'commission_assessment':
      return handleCommissionAssessment(state, intent.subject, intent.nation);
    case 'launch_operation':
      return handleLaunchOperation(state, intent.operation, intent.nation);
    case 'set_collection':
      return handleSetCollection(state, intent.human, intent.signals, intent.analysis);
    case 'set_surveillance':
      return handleSetSurveillance(state, intent.level);
    case 'set_oversight':
      return handleSetOversight(state, intent.level);
    case 'respond_globally':
      return handleRespondGlobally(state, intent.event);
    case 'set_budget_line':
      return handleSetBudgetLine(state, intent.service, intent.amount);
    case 'set_capital_share':
      return handleSetCapitalShare(state, intent.service, intent.share);
    case 'present_budget':
      return handlePresentBudget(state);
    case 'secure_supply':
      return handleSecureSupply(state, intent.partyId);
    case 'set_maintenance':
      return handleSetMaintenance(state, intent.level);
    case 'start_project':
      return handleStartProject(state, intent.asset, intent.units);
    case 'cancel_project':
      return handleCancelProject(state, intent.projectId);
    case 'set_tax_rate':
      return handleSetTaxRate(state, intent.tax, intent.rate);
    case 'set_tax_dial':
      return handleSetTaxDial(state, intent.dial, intent.value);
    case 'adopt_fiscal_rule':
      return handleAdoptFiscalRule(state, intent.kind, intent.threshold);
    case 'repeal_fiscal_rule':
      return handleRepealFiscalRule(state, intent.kind);
    case 'set_reserve_contribution':
      return handleReserveContribution(state, intent.amount);
    case 'draw_emergency_fund':
      return handleDrawEmergencyFund(state, intent.amount);
    case 'call_early_election':
      return handleEarlyElection(state);
    case 'retire':
      return handleRetire(state);
    case 'campaign_stop':
      return handleCampaignStop(state, intent.regionId);
    case 'ad_buy':
      return handleAdBuy(state, intent.regionId);
    case 'answer_debate':
      return handleDebate(state, intent.debateId, intent.choiceIndex);
    case 'redraw_boundaries':
      return handleRedraw(state, intent.regionId);
    case 'rally_party':
      return handleRallyParty(state);
    case 'fundraising_drive':
      return handleFundraising(state);
    case 'appoint_deputy':
      return handleAppointDeputy(state, intent.factionId);
    case 'discipline_rebels':
      return handleDiscipline(state, intent.factionId);
    case 'invest_headquarters':
      return handleHeadquarters(state);
    case 'rename_party':
      return handleRenameParty(state, intent.name);
    case 'send_to_committee':
      return handleSendToCommittee(state, intent.billId);
    case 'amend_bill':
      return handleAmendBill(state, intent.billId, intent.towardFactionId, intent.towardPartyId);
    case 'crossbench_deal':
      return handleCrossbenchDeal(state, intent.billId);
    case 'close_debate':
      return handleCloseDebate(state, intent.billId);
    case 'question_time':
      return handleQuestionTime(state);
    case 'repeal_bill':
      return handleRepeal(state, intent.billId);
    case 'renew_sunset':
      return handleRenewSunset(state, intent.billId);
    case 'executive_order':
      return handleExecutiveOrder(state, intent.billId);
    case 'call_referendum':
      return handleReferendum(state, intent.questionId);
    case 'set_manifesto':
      return handleManifesto(state, intent.billKeys);
    case 'campaign_push':
      return handleChannelPush(state, intent.channel);
    case 'commission_poll':
      return handlePoll(state, intent.quality);
    case 'hold_rally':
      return handleRally(state, intent.regionId);
    case 'town_hall':
      return handleTownHall(state, intent.regionId);
    case 'press_conference':
      return handlePressConference(state);
    case 'negotiation_accept':
      return handleNegotiationAccept(state, intent.partyId);
    case 'negotiation_counter':
      return handleNegotiationCounter(state, intent.partyId);
    case 'negotiation_remove':
      return handleNegotiationRemove(state, intent.partyId);
    case 'negotiation_form_government':
      return handleFormGovernment(state);
    case 'negotiation_abandon':
      return handleAbandonNegotiation(state);
    case 'acknowledge_election':
      return ok(acknowledgeElection(state));
    default:
      return reject(state, 'Unrecognised action.');
  }
}

/** Apply a list of intents in order, stopping at the first rejection. */
export function applyIntents(state: GameState, intents: Intent[]): IntentResult {
  let current = state;
  for (const intent of intents) {
    const result = applyIntent(current, intent);
    if (result.error) return result;
    current = result.state;
  }
  return ok(current);
}

function handleAdvancePhase(state: GameState): IntentResult {
  switch (state.phase) {
    case 'briefing': {
      const next = clone(state);
      next.phase = 'events';
      return ok(next);
    }
    case 'events': {
      if (state.events.some((e) => !e.resolved)) {
        return reject(state, 'Every event must be resolved before the agenda.');
      }
      const next = clone(state);
      next.phase = 'agenda';
      return ok(next);
    }
    case 'agenda': {
      const next = clone(state);
      next.phase = 'budget';
      return ok(next);
    }
    case 'budget':
      return ok(resolveTurn(state));
    case 'report':
      return ok(advanceTurn(state));
    case 'election_night':
      return ok(acknowledgeElection(state));
    default:
      return reject(state, `Cannot advance from the ${state.phase} phase.`);
  }
}

function handleResolveEvent(
  state: GameState,
  eventId: string,
  choiceIndex: number,
): IntentResult {
  if (state.phase !== 'events') return reject(state, 'Events can only be resolved in the events phase.');
  const target = state.events.find((e) => e.id === eventId);
  if (!target) return reject(state, 'No such event.');
  if (target.resolved) return reject(state, 'That event is already resolved.');

  const choice = target.choices[choiceIndex];
  if (!choice) return reject(state, 'No such choice.');
  if (state.politicalCapital < choice.pcCost) {
    return reject(state, 'Not enough political capital for that response.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  const event = next.events.find((e) => e.id === eventId) as GameEvent;

  if (choice.pcCost > 0) {
    spendPc(next, choice.pcCost);
    log(entries, {
      kind: 'political_capital',
      label: 'Political capital',
      delta: -choice.pcCost,
      cause: `${event.title} — ${choice.label}`,
      unit: 'PC',
    });
  }

  applyEffects(next, choice.effects, `${event.title} — ${choice.label}`, entries);

  log(entries, {
    kind: 'event',
    label: event.title,
    delta: null,
    cause: `${choice.label}. ${choice.tradeoff}`,
  });

  event.chosenIndex = choiceIndex;
  event.resolved = true;
  next.career.eventsResolved += 1;
  return ok(next);
}

/** Strip anything that is not prose, and hold it to a length. */
function asRemark(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/**
 * Record something a persona said.
 *
 * Costs nothing and changes nothing anybody can measure: what a persona
 * thinks is `standing`, which this does not touch. It exists so that the
 * next time somebody writes in that person's voice, the person is the same
 * person — which is the whole of what separates a persona from a style.
 */
function handleRecordRemark(
  state: GameState,
  personaId: string,
  about: string,
  text: string,
): IntentResult {
  const words = asRemark(text, REMARK_LIMIT);
  if (words.length < 8) return reject(state, 'Nothing was said.');
  if (!findPersona(state.cast, personaId)) return reject(state, 'No such person.');

  const next = clone(state);
  next.cast = remember(next.cast, personaId, {
    week: absoluteWeek(next),
    about: asRemark(about, 80) || 'the record',
    text: words,
  });
  return ok(next);
}

/**
 * Put a bill of the government's own on the order paper.
 *
 * The model wrote the words and proposed the mechanism; everything from
 * here is the engine. `readDraft` re-reads every field against the
 * vocabulary, clamps every figure to the envelope a bill of that size is
 * allowed, drops anything it does not recognise, and cuts a bill that asks
 * for more than it gives up. Then it is an ordinary bill: it has to be
 * tabled, whipped, argued over and voted on like any other, and the
 * chamber does not care who wrote it.
 *
 * Everything the engine changed is attached to the bill and shown, because
 * a drafting feature that quietly rewrote what somebody typed would be
 * worse than one that refused.
 */
function handleDraftBill(
  state: GameState,
  description: string,
  draft: RawDraft,
): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Bills are drafted during the agenda.');

  const asked = typeof description === 'string' ? description.trim() : '';
  if (asked.length < 12) {
    return reject(state, 'Say what the bill should do — a sentence at least.');
  }

  const own = state.bills.filter(
    (b) => b.drafted && (b.status === 'available' || b.status === 'proposed'),
  );
  if (own.length >= DRAFT_BILL_LIMIT) {
    return reject(
      state,
      `There are already ${DRAFT_BILL_LIMIT} bills of this government's own on the paper.`,
    );
  }

  if (state.politicalCapital < DRAFT_BILL_PC_COST) {
    return reject(state, 'Not enough political capital to have a bill drafted.');
  }

  const next = clone(state);
  spendPc(next, DRAFT_BILL_PC_COST);

  const { bill } = readDraft(draft ?? {}, `drafted-${absoluteWeek(next)}-${own.length + 1}`, asked);
  next.bills = [...next.bills, bill];

  const entries = currentLog(next);
  log(entries, {
    kind: 'note',
    label: `Drafted — ${bill.title}`,
    delta: -DRAFT_BILL_PC_COST,
    cause:
      `${bill.summary} ${bill.tradeoff}` +
      (bill.draftNotes && bill.draftNotes.length > 0
        ? ` Counsel made ${bill.draftNotes.length} change${bill.draftNotes.length > 1 ? 's' : ''} on the way in.`
        : ''),
    unit: 'PC',
  });

  return ok(next);
}

function handleProposeBill(
  state: GameState,
  billId: string,
  whipSteps: number,
): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Bills are tabled during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return reject(state, 'No such bill.');
  if (bill.status !== 'available') return reject(state, 'That bill is not available to table.');

  const steps = Math.max(0, Math.min(WHIP_MAX_STEPS, Math.floor(whipSteps)));
  const cost = billPcCost(bill, steps);
  if (state.politicalCapital < cost) {
    return reject(state, 'Not enough political capital to table that bill.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  const target = next.bills.find((b) => b.id === billId) as Bill;

  spendPc(next, cost);
  target.status = 'proposed';
  target.whipSteps = steps;
  target.pcSpent = cost;
  target.turnProposed = next.turnNumber;
  target.passChance = computePassChance(
    target,
    next.parties,
    next.sectors,
    steps,
    next.partyInternals,
  ).chance;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -cost,
    cause: `Tabled ${target.title}${steps > 0 ? ` with ${steps} whip step${steps === 1 ? '' : 's'}` : ''}`,
    unit: 'PC',
  });

  return ok(next);
}

function handleWithdrawBill(state: GameState, billId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Bills can only be withdrawn during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'proposed') return reject(state, 'That bill is not on the order paper.');

  const next = clone(state);
  const entries = currentLog(next);
  const target = next.bills.find((b) => b.id === billId) as Bill;

  /* Half the capital is recoverable; the rest is spent persuading people. */
  const refund = Math.floor(target.pcSpent / 2);
  next.politicalCapital = clampPc(next.politicalCapital + refund);
  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: refund,
    cause: `Withdrew ${target.title} — half the capital spent is recovered`,
    unit: 'PC',
  });

  target.status = 'available';
  target.whipSteps = 0;
  target.pcSpent = 0;
  target.passChance = null;
  target.turnProposed = null;
  return ok(next);
}

function handlePublicAddress(state: GameState): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Addresses are made during the agenda.');
  if (state.politicalCapital < PC_COSTS.publicAddress) {
    return reject(state, 'Not enough political capital for an address.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.publicAddress);

  const effect =
    PUBLIC_ADDRESS_APPROVAL *
    Math.pow(PUBLIC_ADDRESS_DIMINISH, next.addressesThisTerm) *
    addressEffectMultiplier(next.communications);
  next.addressesThisTerm += 1;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.publicAddress,
    cause: 'Public address',
    unit: 'PC',
  });
  applyEffects(
    next,
    { approval: effect },
    next.addressesThisTerm > 1
      ? `Public address (${next.addressesThisTerm} this term — the country is tiring of them)`
      : 'Public address',
    entries,
  );
  return ok(next);
}

function handleConcession(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Concessions are made during the agenda.');
  const partner = state.parties.find((p) => p.id === partyId && p.inCoalition && !p.isPlayer);
  if (!partner) return reject(state, 'That party is not a coalition partner.');
  if (state.politicalCapital < PC_COSTS.coalitionConcession) {
    return reject(state, 'Not enough political capital for a concession.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.coalitionConcession);
  const target = next.parties.find((p) => p.id === partyId) as Party;
  target.coalitionMood = clampMood((target.coalitionMood ?? MOOD_START) + MOOD_CONCESSION_GAIN);

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.coalitionConcession,
    cause: `Concession to ${target.name}`,
    unit: 'PC',
  });
  log(entries, {
    kind: 'coalition',
    label: `${target.name} mood`,
    delta: MOOD_CONCESSION_GAIN,
    cause: 'Policy concession granted at the coalition committee',
    unit: 'pts',
  });
  return ok(next);
}

function handleReshuffle(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Reshuffles happen during the agenda.');
  const partner = state.parties.find((p) => p.id === partyId && p.inCoalition && !p.isPlayer);
  if (!partner) return reject(state, 'That party is not a coalition partner.');
  if (state.politicalCapital < PC_COSTS.reshuffleCabinet) {
    return reject(state, 'Not enough political capital to reshuffle.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.reshuffleCabinet);
  const target = next.parties.find((p) => p.id === partyId) as Party;
  target.cabinetPosts += 1;
  target.coalitionMood = clampMood((target.coalitionMood ?? MOOD_START) + MOOD_RESHUFFLE_GAIN);

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.reshuffleCabinet,
    cause: `Cabinet reshuffle favouring ${target.name}`,
    unit: 'PC',
  });
  log(entries, {
    kind: 'coalition',
    label: `${target.name} mood`,
    delta: MOOD_RESHUFFLE_GAIN,
    cause: `Given an additional cabinet post (now holds ${target.cabinetPosts})`,
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Put somebody in a department, on whatever basis is chosen.
 *
 * The appointment is a payment, and if there is already somebody there
 * the appointment is also a withdrawal — the removal cost is computed
 * from the minister being replaced, which is the honest price, not a
 * fixed one.
 */
function handleAppointMinister(
  state: GameState,
  ministry: MinistryKey,
  basis: AppointmentBasis,
): IntentResult {
  const going = ministerFor(state.cabinet, ministry);
  const removal = going ? removalCost(going) : 0;
  const total = APPOINT_MINISTER_PC + removal;
  if (state.politicalCapital < total) {
    return reject(
      state,
      going
        ? `Replacing ${going.name} costs ${total.toFixed(0)} PC. The appointment was a payment to whoever they represent, and this is the withdrawal.`
        : `Filling this department costs ${total.toFixed(0)} PC.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  const rng = new Rng(next.rngState);
  spendPc(next, total);

  const result = appointMinister(
    next.cabinet,
    ministry,
    basis,
    next.country,
    rng,
    new Set(next.cabinet.ministers.map((m) => m.name)),
    absoluteWeek(next),
  );
  next.cabinet = result.cabinet;
  next.rngState = rng.state;

  log(entries, {
    kind: 'note',
    label: `${result.minister.name} — ${findMinistry(ministry).title}`,
    delta: -total,
    cause: going
      ? `${going.name} is out. ${findBasis(basis).blurb} Whoever ${going.owes ?? 'they'} represented has just watched a payment withdrawn.`
      : findBasis(basis).blurb,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Move everybody at once.
 *
 * Worth less every time. The first is a government taking charge; a
 * third inside one term is a government saying, in public, on the front
 * pages, that it cannot make its ministers work.
 */
function handleFullReshuffle(state: GameState): IntentResult {
  if (state.politicalCapital < RESHUFFLE_PC) {
    return reject(state, `A full reshuffle costs ${RESHUFFLE_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  const rng = new Rng(next.rngState);
  spendPc(next, RESHUFFLE_PC);

  const result = fullReshuffle(
    next.cabinet,
    next.country,
    rng,
    new Set(next.cabinet.ministers.map((m) => m.name)),
    absoluteWeek(next),
  );
  next.cabinet = result.cabinet;
  next.rngState = rng.state;

  log(entries, {
    kind: 'note',
    label: `Cabinet reshuffle — ${result.moved} moved`,
    delta: -RESHUFFLE_PC,
    cause:
      result.value >= 0.99
        ? 'The first of this government\'s reshuffles: taking charge, and reported as one.'
        : `Worth about ${Math.round(result.value * 100)}% of the first. This is not new authority being asserted; it is a government that has run out of other ways to be seen doing something.`,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Decide how the government treats the people who will still be here
 * after it is not.
 *
 * There is no correct answer, which is why it costs nothing to try and
 * takes months to show what it did.
 */
function handleMachinePosture(state: GameState, posture: MachinePosture): IntentResult {
  if (state.civilService.posture === posture) {
    return reject(state, 'That is the posture already.');
  }
  if (state.politicalCapital < MACHINE_POSTURE_PC) {
    return reject(state, `Changing how the machine is treated costs ${MACHINE_POSTURE_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, MACHINE_POSTURE_PC);
  next.civilService = setMachinePosture(next.civilService, posture);

  const template = MACHINE_POSTURES.find((p) => p.key === posture)!;
  log(entries, {
    kind: 'note',
    label: template.label,
    delta: -MACHINE_POSTURE_PC,
    cause: `${template.blurb} None of what this does shows up this week.`,
    unit: 'PC',
  });
  return ok(next);
}

function handleSetSentencing(state: GameState, policy: SentencingPolicy): IntentResult {
  if (state.justice.courts.sentencing === policy) {
    return reject(state, 'That is the sentencing policy already.');
  }
  if (state.politicalCapital < SET_SENTENCING_PC) {
    return reject(state, `Changing sentencing policy costs ${SET_SENTENCING_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SET_SENTENCING_PC);
  next.justice = setSentencing(next.justice, policy);

  const template = findSentencing(policy);
  log(entries, {
    kind: 'note',
    label: `Sentencing: ${template.label}`,
    delta: -SET_SENTENCING_PC,
    cause: `${template.blurb} Custody population and reoffending move first; the crime figures move on the clearance rate, not on this.`,
    unit: 'PC',
  });
  return ok(next);
}

function handleSetJudicialStance(state: GameState, stance: JudicialStance): IntentResult {
  if (state.justice.courts.stance === stance) {
    return reject(state, 'That is the stance already.');
  }
  if (state.politicalCapital < SET_JUDICIAL_STANCE_PC) {
    return reject(state, `Changing how the courts are treated costs ${SET_JUDICIAL_STANCE_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SET_JUDICIAL_STANCE_PC);
  next.justice = setJudicialStance(next.justice, stance);

  const template = findStance(stance);
  log(entries, {
    kind: 'note',
    label: `Judicial stance: ${template.label}`,
    delta: -SET_JUDICIAL_STANCE_PC,
    cause: `${template.blurb} Independence moves toward this over months, not this week.`,
    unit: 'PC',
  });
  return ok(next);
}

function handleSetEnforcementPosture(state: GameState, posture: EnforcementPosture): IntentResult {
  if (state.justice.policing.posture === posture) {
    return reject(state, 'That is the posture already.');
  }
  if (state.politicalCapital < SET_ENFORCEMENT_POSTURE_PC) {
    return reject(state, `Changing enforcement posture costs ${SET_ENFORCEMENT_POSTURE_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SET_ENFORCEMENT_POSTURE_PC);
  next.justice = setEnforcementPosture(next.justice, posture);

  const template = findEnforcementPosture(posture);
  log(entries, {
    kind: 'note',
    label: `Enforcement posture: ${template.label}`,
    delta: -SET_ENFORCEMENT_POSTURE_PC,
    cause: `${template.blurb}`,
    unit: 'PC',
  });
  return ok(next);
}

function handleAntiCorruptionDrive(state: GameState): IntentResult {
  if (state.politicalCapital < ANTI_CORRUPTION_DRIVE_PC) {
    return reject(state, `An anti-corruption drive costs ${ANTI_CORRUPTION_DRIVE_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, ANTI_CORRUPTION_DRIVE_PC);
  next.justice = driveAntiCorruption(next.justice, ANTI_CORRUPTION_DRIVE_EFFECT);

  log(entries, {
    kind: 'note',
    label: 'Anti-corruption drive',
    delta: -ANTI_CORRUPTION_DRIVE_PC,
    cause:
      'A visible push against it, worth less each time it is used on a force that keeps ' +
      'breeding it back under the same posture and the same funding.',
    unit: 'PC',
  });
  return ok(next);
}

function handleSetTransparency(state: GameState, regime: TransparencyRegime): IntentResult {
  if (state.integrity.transparency === regime) {
    return reject(state, 'That is the disclosure regime already.');
  }
  if (state.politicalCapital < SET_TRANSPARENCY_PC) {
    return reject(state, `Changing the disclosure regime costs ${SET_TRANSPARENCY_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SET_TRANSPARENCY_PC);
  next.integrity = setTransparency(next.integrity, regime);

  const template = TRANSPARENCY_REGIMES.find((t) => t.key === regime)!;
  log(entries, {
    kind: 'note',
    label: `Disclosure: ${template.label}`,
    delta: -SET_TRANSPARENCY_PC,
    cause: `${template.blurb}`,
    unit: 'PC',
  });
  return ok(next);
}

function handleSetAnticorruption(state: GameState, posture: AnticorruptionPosture): IntentResult {
  if (state.integrity.anticorruption === posture) {
    return reject(state, 'That is the anti-corruption posture already.');
  }
  if (state.politicalCapital < SET_ANTICORRUPTION_PC) {
    return reject(state, `Changing the anti-corruption posture costs ${SET_ANTICORRUPTION_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SET_ANTICORRUPTION_PC);
  next.integrity = setAnticorruption(next.integrity, posture);

  const template = ANTICORRUPTION_POSTURES.find((t) => t.key === posture)!;
  log(entries, {
    kind: 'note',
    label: `Anti-corruption machinery: ${template.label}`,
    delta: -SET_ANTICORRUPTION_PC,
    cause: `${template.blurb}`,
    unit: 'PC',
  });
  return ok(next);
}

function handleLaunchAudit(state: GameState): IntentResult {
  if (state.politicalCapital < LAUNCH_AUDIT_PC) {
    return reject(state, `Launching an audit costs ${LAUNCH_AUDIT_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, LAUNCH_AUDIT_PC);
  const worth = auditValue(next.integrity);
  next.integrity = launchAudit(next.integrity);

  log(entries, {
    kind: 'note',
    label: 'An audit is launched',
    delta: -LAUNCH_AUDIT_PC,
    cause: `Worth ${worth.toFixed(1)} points against the corruption index this time — less than the last one, and less again next time.`,
    unit: 'PC',
  });
  return ok(next);
}

function handleSimplifyLaw(state: GameState): IntentResult {
  if (state.politicalCapital < SIMPLIFY_LAW_PC) {
    return reject(state, `Simplifying the statute book costs ${SIMPLIFY_LAW_PC} PC.`);
  }
  if (state.integrity.regulatoryStock <= REGULATORY_STOCK_START) {
    return reject(state, 'There is nothing left to simplify.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SIMPLIFY_LAW_PC);
  next.integrity = simplifyLaw(next.integrity, SIMPLIFY_LAW_EFFECT);

  log(entries, {
    kind: 'note',
    label: 'A deregulation push',
    delta: -SIMPLIFY_LAW_PC,
    cause:
      'The statute book only shrinks when someone deliberately goes back through it. This ' +
      'is that, once.',
    unit: 'PC',
  });
  return ok(next);
}

function handleDeclareEmergency(state: GameState, level: EmergencyLevel): IntentResult {
  if (level === 'normal') return reject(state, 'That is not a declaration.');
  if (state.stateCapacity.level === level) {
    return reject(state, 'That is already in force.');
  }
  const cost = level === 'martial_law' ? DECLARE_MARTIAL_LAW_PC : DECLARE_EMERGENCY_PC;
  if (state.politicalCapital < cost) {
    return reject(state, `Declaring this costs ${cost} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, cost);
  const wasNormal = next.stateCapacity.level === 'normal';
  next.stateCapacity = declareEmergency(next.stateCapacity, level);

  const template = EMERGENCY_LEVELS.find((e) => e.key === level)!;
  log(entries, {
    kind: 'note',
    label: template.label,
    delta: -cost,
    cause: wasNormal
      ? `${template.blurb} The clock making it harder to stand down starts now.`
      : `${template.blurb} Escalated without ever returning to ordinary rule in between.`,
    unit: 'PC',
  });
  return ok(next);
}

function handleStandDownEmergency(state: GameState): IntentResult {
  if (state.stateCapacity.level === 'normal') {
    return reject(state, 'There is nothing in force to stand down.');
  }
  const cost = standDownCost(state.stateCapacity);
  if (state.politicalCapital < cost) {
    return reject(state, `Standing this down costs ${cost.toFixed(0)} PC now — it only rises from here.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, cost);
  const weeks = next.stateCapacity.weeksInEmergency;
  next.stateCapacity = standDown(next.stateCapacity);

  log(entries, {
    kind: 'note',
    label: 'Return to ordinary rule',
    delta: -cost,
    cause: `${weeks} weeks in force. Whatever organised itself around the powers in that time does not go away with the declaration.`,
    unit: 'PC',
  });
  return ok(next);
}

function handleInvestReadiness(state: GameState): IntentResult {
  if (state.politicalCapital < INVEST_READINESS_PC) {
    return reject(state, `Investing in disaster readiness costs ${INVEST_READINESS_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, INVEST_READINESS_PC);
  next.stateCapacity = investReadiness(next.stateCapacity);

  log(entries, {
    kind: 'note',
    label: 'Disaster readiness investment',
    delta: -INVEST_READINESS_PC,
    cause: 'Stockpile and standing arrangements, built before they are needed rather than after.',
    unit: 'PC',
  });
  return ok(next);
}

function handleSetPressPosture(state: GameState, posture: PressPosture): IntentResult {
  if (state.press.posture === posture) return reject(state, 'That is the posture already.');
  if (state.politicalCapital < SET_PRESS_POSTURE_PC) {
    return reject(state, `Changing how the press is treated costs ${SET_PRESS_POSTURE_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SET_PRESS_POSTURE_PC);
  next.press = setPressPosture(next.press, posture);

  const template = PRESS_POSTURES.find((p) => p.key === posture)!;
  log(entries, {
    kind: 'note',
    label: `Press posture: ${template.label}`,
    delta: -SET_PRESS_POSTURE_PC,
    cause: `${template.blurb}`,
    unit: 'PC',
  });
  return ok(next);
}

function handlePressureOutlet(state: GameState): IntentResult {
  if (state.politicalCapital < PRESSURE_OUTLET_PC) {
    return reject(state, `A pressure campaign costs ${PRESSURE_OUTLET_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PRESSURE_OUTLET_PC);
  next.press = pressureOutlet(next.press);

  log(entries, {
    kind: 'note',
    label: 'A pressure campaign against a critical outlet',
    delta: -PRESSURE_OUTLET_PC,
    cause: 'Fast, and everyone can see exactly what happened and why. That is the whole cost of this route.',
    unit: 'PC',
  });
  return ok(next);
}

function handleConsolidateOwnership(
  state: GameState,
  target: Exclude<OwnerType, 'independent'>,
): IntentResult {
  if (state.politicalCapital < CONSOLIDATE_OWNERSHIP_PC) {
    return reject(state, `Arranging this costs ${CONSOLIDATE_OWNERSHIP_PC} PC.`);
  }
  if (state.press.ownership.independent <= 0.01) {
    return reject(state, 'There is no more independent ownership left to move.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, CONSOLIDATE_OWNERSHIP_PC);
  next.press = consolidateOwnership(next.press, target);

  log(entries, {
    kind: 'note',
    label: 'A quiet ownership transfer',
    delta: -CONSOLIDATE_OWNERSHIP_PC,
    cause: 'Barely moves anything today. Nobody writes the story about a single week of this.',
    unit: 'PC',
  });
  return ok(next);
}

function handleBreakUpOwnership(state: GameState): IntentResult {
  if (state.politicalCapital < BREAK_UP_OWNERSHIP_PC) {
    return reject(state, `Antitrust action against the press costs ${BREAK_UP_OWNERSHIP_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, BREAK_UP_OWNERSHIP_PC);
  next.press = breakUpOwnership(next.press);

  log(entries, {
    kind: 'note',
    label: 'Ownership broken up',
    delta: -BREAK_UP_OWNERSHIP_PC,
    cause: 'Expensive, and worth less per point than the consolidation it is reversing cost to build.',
    unit: 'PC',
  });
  return ok(next);
}

function handleLaunchMediaLiteracy(state: GameState): IntentResult {
  if (state.politicalCapital < LAUNCH_MEDIA_LITERACY_PC) {
    return reject(state, `A media-literacy programme costs ${LAUNCH_MEDIA_LITERACY_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, LAUNCH_MEDIA_LITERACY_PC);
  next.press = launchMediaLiteracy(next.press);

  log(entries, {
    kind: 'note',
    label: 'Media-literacy programme',
    delta: -LAUNCH_MEDIA_LITERACY_PC,
    cause: 'A stock that decays. Worth relaunching rather than a single fix.',
    unit: 'PC',
  });
  return ok(next);
}

function handleSetCommsStrategy(state: GameState, strategy: CommsStrategy): IntentResult {
  if (state.communications.strategy === strategy) {
    return reject(state, 'That is the strategy already.');
  }
  if (state.politicalCapital < SET_COMMS_STRATEGY_PC) {
    return reject(state, `Changing communications strategy costs ${SET_COMMS_STRATEGY_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SET_COMMS_STRATEGY_PC);
  next.communications = setCommsStrategy(next.communications, strategy);

  const template = COMMS_STRATEGIES.find((s) => s.key === strategy)!;
  log(entries, {
    kind: 'note',
    label: `Communications strategy: ${template.label}`,
    delta: -SET_COMMS_STRATEGY_PC,
    cause: `${template.blurb}`,
    unit: 'PC',
  });
  return ok(next);
}

function handleReleaseInformation(state: GameState): IntentResult {
  if (state.communications.pendingDisclosures <= 0.01) {
    return reject(state, 'There is nothing pending to release.');
  }
  if (state.politicalCapital < RELEASE_INFORMATION_PC) {
    return reject(state, `Releasing this costs ${RELEASE_INFORMATION_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, RELEASE_INFORMATION_PC);
  const result = releaseInformation(next.communications);
  next.communications = result.communications;

  applyEffects(next, { approval: -result.approvalCost }, 'Information released on purpose', entries);
  log(entries, {
    kind: 'note',
    label: 'Getting ahead of it',
    delta: -RELEASE_INFORMATION_PC,
    cause: 'Announced on a week this government chose, which is worth less to a reporter than a week it did not.',
    unit: 'PC',
  });
  return ok(next);
}

function handleRespondScandal(
  state: GameState,
  scandalId: string,
  response: ScandalResponse,
): IntentResult {
  const scandal = state.scandals.find((s) => s.id === scandalId);
  if (!scandal) return reject(state, 'There is no such scandal open.');
  if (scandal.response !== null) return reject(state, 'The government has already responded to this.');

  const next = clone(state);
  const entries = currentLog(next);
  const result = respondToScandal(next.scandals, scandalId, response);
  next.scandals = result.scandals;

  if (result.immediateCost > 0) {
    applyEffects(next, { approval: -result.immediateCost }, 'Scandal response', entries);
  }

  const template = SCANDAL_RESPONSES.find((r) => r.key === response)!;
  log(entries, {
    kind: 'note',
    label: template.label,
    delta: -result.immediateCost,
    cause: `${template.blurb}`,
    unit: 'idx',
  });
  return ok(next);
}

function handleSetEmbassyTier(state: GameState, key: NationKey, tier: EmbassyTier): IntentResult {
  const nation = state.world.nations.find((n) => n.key === key);
  if (!nation) return reject(state, 'No such country.');
  if (!nation.embassy) return reject(state, 'There is no mission there to change the tier of.');
  if (nation.embassyTier === tier) return reject(state, 'That is the tier already.');
  if (state.politicalCapital < SET_EMBASSY_TIER_PC) {
    return reject(state, `Changing the mission's tier costs ${SET_EMBASSY_TIER_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SET_EMBASSY_TIER_PC);
  next.world = {
    ...next.world,
    nations: next.world.nations.map((n) => (n.key === key ? { ...n, embassyTier: tier } : n)),
  };

  const template = EMBASSY_TIERS.find((t) => t.key === tier)!;
  log(entries, {
    kind: 'note',
    label: `Mission tier: ${template.label}`,
    delta: -SET_EMBASSY_TIER_PC,
    cause: `${template.blurb}`,
    unit: 'PC',
  });
  return ok(next);
}

function handleRecallAmbassador(state: GameState, key: NationKey): IntentResult {
  const nation = state.world.nations.find((n) => n.key === key);
  if (!nation) return reject(state, 'No such country.');
  if (!nation.ambassador) return reject(state, 'There is no named ambassador there to recall.');
  if (state.politicalCapital < RECALL_AMBASSADOR_PC) {
    return reject(state, `Recalling the ambassador costs ${RECALL_AMBASSADOR_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, RECALL_AMBASSADOR_PC);
  const name = nation.ambassador.name;
  next.world = {
    ...next.world,
    nations: next.world.nations.map((n) => (n.key === key ? { ...n, ambassador: null } : n)),
  };

  log(entries, {
    kind: 'note',
    label: `${name} recalled`,
    delta: -RECALL_AMBASSADOR_PC,
    cause: 'The posting stays settled — what leaves is the second dividend a named appointee was worth.',
    unit: 'PC',
  });
  return ok(next);
}

function handleSweetenOffer(state: GameState, key: NationKey): IntentResult {
  const nation = state.world.nations.find((n) => n.key === key);
  if (!nation) return reject(state, 'No such country.');
  if (state.politicalCapital < SWEETEN_OFFER_PC) {
    return reject(state, `Sweetening the offer costs ${SWEETEN_OFFER_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SWEETEN_OFFER_PC);
  const worth = sweetenValue(nation.sweetenedThisRun);
  const result = sweetenOffer(nation.negotiationGoodwill, nation.sweetenedThisRun);
  next.world = {
    ...next.world,
    nations: next.world.nations.map((n) =>
      n.key === key
        ? { ...n, negotiationGoodwill: result.goodwill, sweetenedThisRun: result.sweetenedThisRun }
        : n,
    ),
  };

  log(entries, {
    kind: 'note',
    label: `Offer sweetened for ${findNation(key).name}`,
    delta: -SWEETEN_OFFER_PC,
    cause: `Worth ${worth.toFixed(1)} points of goodwill this time, and less again next time. It fades fast — use it soon.`,
    unit: 'PC',
  });
  return ok(next);
}

function handleInvestSoftPower(state: GameState): IntentResult {
  if (state.politicalCapital < SOFT_POWER_INVEST_PC) {
    return reject(state, `A soft-power programme costs ${SOFT_POWER_INVEST_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SOFT_POWER_INVEST_PC);
  next.world = { ...next.world, softPower: investSoftPower(next.world.softPower) };

  log(entries, {
    kind: 'note',
    label: 'Soft-power programme',
    delta: -SOFT_POWER_INVEST_PC,
    cause: 'Moves every relationship a little rather than any one of them a lot. Nobody can point to the week it worked.',
    unit: 'PC',
  });
  return ok(next);
}

function handleEmergencyBudget(state: GameState): IntentResult {
  if (canEditBudget(state)) return reject(state, 'The budget is already open this turn.');
  if (state.politicalCapital < PC_COSTS.emergencyBudget) {
    return reject(state, 'Not enough political capital for an emergency budget.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.emergencyBudget);
  next.budgetUnlocked = true;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.emergencyBudget,
    cause: 'Emergency budget called outside the normal cycle',
    unit: 'PC',
  });
  return ok(next);
}

function handleSetFunding(
  state: GameState,
  sectorKey: SectorKey,
  amount: number,
): IntentResult {
  if (state.phase !== 'budget') return reject(state, 'Funding is set in the budget phase.');
  if (!canEditBudget(state)) {
    return reject(state, 'The budget is fixed this turn. Call an emergency budget to reopen it.');
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 1200) {
    return reject(state, 'Funding must be between ₡0bn and ₡1,200bn a year.');
  }

  /*
   * In season this is a proposal like any other line and waits for the
   * chamber. Out of season it is a supplementary estimate, which takes
   * effect at once — and that immediacy is what the emergency budget's
   * political capital actually bought.
   */
  const supplementary = !isBudgetSeason(state.turnNumber);

  const next = clone(state);
  /*
   * Write through to the lines. The five figures are a summary of the
   * twenty, so setting one has to move what it summarises — otherwise the
   * next time the document is read the sector would snap back to whatever
   * the lines say, and the player would have been lied to.
   */
  next.budget = setSectorFunding(
    next.budget,
    sectorKey,
    Math.round(amount * 10) / 10,
    supplementary ? 'enacted' : 'proposed',
  );
  if (supplementary) syncSectorsToBudget(next);
  return ok(next);
}

/**
 * The instruments of ordinary diplomacy.
 *
 * Every one of them is scaled by the other country's power, which is the
 * whole asymmetry: a protest to Astrun is a diplomatic event and a protest
 * to Holm is a letter. A government that wants to be heard by the powerful
 * has to accept that being heard is expensive, and one that wants to be
 * principled cheaply will find that only the small countries are cheap.
 */
export type DiplomaticAct =
  | 'open_embassy'
  | 'close_embassy'
  | 'appoint_ambassador'
  | 'meeting'
  | 'state_visit'
  | 'summit'
  | 'protest'
  | 'expel_diplomats'
  | 'recognise'
  | 'sanction'
  | 'lift_sanction';

function handleDiplomaticAct(
  state: GameState,
  key: NationKey,
  act: DiplomaticAct,
): IntentResult {
  if (state.phase !== 'agenda' && state.phase !== 'briefing') {
    return reject(state, 'Foreign business is conducted at the desk, not at the budget.');
  }
  const nation = state.world.nations.find((n) => n.key === key);
  if (!nation) return reject(state, 'No such country.');
  const template = findNation(key);

  const cost = {
    open_embassy: DIPLOMACY_PC_COSTS.openEmbassy,
    close_embassy: DIPLOMACY_PC_COSTS.closeEmbassy,
    appoint_ambassador: DIPLOMACY_PC_COSTS.appointAmbassador,
    meeting: DIPLOMACY_PC_COSTS.meeting,
    state_visit: DIPLOMACY_PC_COSTS.stateVisit,
    summit: DIPLOMACY_PC_COSTS.summit,
    protest: DIPLOMACY_PC_COSTS.protest,
    expel_diplomats: DIPLOMACY_PC_COSTS.expelDiplomats,
    recognise: DIPLOMACY_PC_COSTS.recogniseState,
    sanction: DIPLOMACY_PC_COSTS.sanction,
    lift_sanction: DIPLOMACY_PC_COSTS.liftSanction,
  }[act];

  if (state.politicalCapital < cost) {
    return reject(state, 'Not enough political capital for that.');
  }

  /* Things that simply cannot be done. */
  if (act === 'open_embassy' && nation.embassy) {
    return reject(state, `There is already a mission in ${template.name}.`);
  }
  if (act === 'close_embassy' && !nation.embassy) {
    return reject(state, `There is no mission in ${template.name} to close.`);
  }
  if (act === 'appoint_ambassador' && !nation.embassy) {
    return reject(state, 'An ambassador needs an embassy to sit in.');
  }
  if (act === 'summit' && !canSummit(nation, state.turnNumber)) {
    return reject(state, `${template.name} will not sit down again this soon.`);
  }
  if (act === 'sanction' && nation.sanctioned) {
    return reject(state, `${template.name} is already under sanction.`);
  }
  if (act === 'lift_sanction' && !nation.sanctioned) {
    return reject(state, `${template.name} is not under sanction.`);
  }

  const next = clone(state);
  spendPc(next, cost);
  const entries = currentLog(next);
  const rng = new Rng(next.rngState);
  const index = next.world.nations.findIndex((n) => n.key === key);
  let updated = next.world.nations[index]!;

  const effect = {
    open_embassy: DIPLOMACY_EFFECTS.embassy,
    close_embassy: -DIPLOMACY_EFFECTS.embassy,
    appoint_ambassador: DIPLOMACY_EFFECTS.ambassador,
    meeting: DIPLOMACY_EFFECTS.meeting,
    state_visit: DIPLOMACY_EFFECTS.stateVisit,
    summit: DIPLOMACY_EFFECTS.summit,
    protest: DIPLOMACY_EFFECTS.protest,
    expel_diplomats: DIPLOMACY_EFFECTS.expelDiplomats,
    recognise: DIPLOMACY_EFFECTS.recognition,
    sanction: DIPLOMACY_EFFECTS.sanction,
    lift_sanction: DIPLOMACY_EFFECTS.sanctionLifted,
  }[act];

  updated = applyDiplomaticAct(updated, effect, template);

  switch (act) {
    case 'open_embassy':
      updated = { ...updated, embassy: true };
      break;
    case 'close_embassy':
      /* Cheap, popular, and it removes the only channel through which the
         next crisis could have been defused. */
      updated = { ...updated, embassy: false, ambassadorMonths: null, ambassador: null };
      break;
    case 'appoint_ambassador': {
      const used = new Set(
        next.world.nations.map((n) => n.ambassador?.name).filter((n): n is string => n != null),
      );
      const ambassador = buildAmbassador(next.country, rng, used, absoluteWeek(next));
      updated = { ...updated, ambassadorMonths: 0, ambassador };
      break;
    }
    case 'summit':
      updated = { ...updated, lastSummitTurn: next.turnNumber };
      next.approval = clampApproval(next.approval + SUMMIT_APPROVAL);
      break;
    case 'state_visit':
      next.approval = clampApproval(
        next.approval + (updated.relations > 0 ? STATE_VISIT_APPROVAL : -STATE_VISIT_APPROVAL),
      );
      break;
    case 'expel_diplomats':
      updated = {
        ...updated,
        ambassadorMonths: null,
        ambassador: null,
        grievance: addGrievance(updated.grievance, 'diplomats_expelled'),
      };
      break;
    case 'recognise':
      updated = { ...updated, recognised: true };
      break;
    case 'sanction':
      updated = {
        ...updated,
        sanctioned: true,
        sanctionedSince: next.turnNumber,
        grievance: addGrievance(updated.grievance, 'sanctioned'),
      };
      break;
    case 'lift_sanction':
      updated = { ...updated, sanctioned: false, sanctionedSince: null };
      break;
    default:
      break;
  }

  next.world = {
    ...next.world,
    nations: next.world.nations.map((n, i) => (i === index ? updated : n)),
  };
  next.rngState = rng.state;

  log(entries, {
    kind: 'note',
    label:
      act === 'appoint_ambassador' && updated.ambassador
        ? `${updated.ambassador.name} to ${template.name}`
        : template.name,
    delta: updated.relations - nation.relations,
    cause: DIPLOMATIC_ACT_LABELS[act],
    unit: 'pts',
  });
  return ok(next);
}

const DIPLOMATIC_ACT_LABELS: Record<DiplomaticAct, string> = {
  open_embassy: 'A mission opened. It will not make them like you; it will stop things sliding.',
  close_embassy: 'The mission closed. Cheap, popular, and one fewer way to talk.',
  appoint_ambassador: 'An ambassador appointed. They will be worth something in a few months.',
  meeting: 'A meeting held at official level.',
  state_visit: 'A state visit. Photographs, a banquet, and a communiqué nobody will read.',
  summit: 'A summit convened. Expensive, slow, and the only setting where anything large moves.',
  protest: 'A formal protest lodged. Noted, and resented.',
  expel_diplomats: 'Diplomats expelled. A serious step, and one that is hard to walk back.',
  recognise: 'Formal recognition extended.',
  sanction: 'Sanctions imposed. They will hurt whichever of you depends on the other more.',
  lift_sanction: 'Sanctions lifted.',
};

/**
 * Propose an agreement.
 *
 * A treaty is a commitment rather than a bonus: a defence pact means
 * somebody else's security problem is on your agenda, and a mutual defence
 * treaty means somebody else's war is potentially yours. The other side has
 * to want it, which depends on relations AND on whether this government has
 * a record of keeping its word.
 */
function handleProposeTreaty(
  state: GameState,
  key: NationKey,
  kind: TreatyKind,
): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Treaties are laid before the chamber.');
  const nation = state.world.nations.find((n) => n.key === key);
  if (!nation) return reject(state, 'No such country.');
  const template = findNation(key);

  if (state.world.treaties.length >= MAX_TREATIES) {
    return reject(state, 'The country is party to as many agreements as it can honour.');
  }
  if (state.world.treaties.some((t) => t.kind === kind && t.parties.includes(key))) {
    return reject(state, `Such an agreement with ${template.name} is already in force.`);
  }
  if (state.politicalCapital < DIPLOMACY_PC_COSTS.proposeTreaty) {
    return reject(state, 'Not enough political capital to negotiate a treaty.');
  }
  if (!willSign(nation, kind, state.world.reputation)) {
    return reject(
      state,
      `${template.name} will not sign that. Relations stand at ${nation.relations.toFixed(0)}` +
        (state.world.reputation < 55
          ? ', and this government\u2019s word is not what it was.'
          : '.'),
    );
  }

  const next = clone(state);
  spendPc(next, DIPLOMACY_PC_COSTS.proposeTreaty);
  const entries = currentLog(next);

  next.world = {
    ...next.world,
    treaties: [
      ...next.world.treaties,
      {
        id: `${kind}-${key}-${next.turnNumber}`,
        kind,
        parties: [key],
        signedTurn: next.turnNumber,
        signedTerm: next.termNumber,
        obligation: obligationOf(kind, template.name),
        dividend: kind === 'mutual_defence' ? 0.5 : 0.3,
      },
    ],
    nations: next.world.nations.map((n) =>
      n.key === key ? applyDiplomaticAct(n, DIPLOMACY_EFFECTS.treatySigned, template) : n,
    ),
  };

  log(entries, {
    kind: 'note',
    label: `${TREATY_LABELS[kind]} with ${template.name}`,
    delta: 0,
    cause: obligationOf(kind, template.name),
    unit: '',
  });

  /* An alliance is never just with one country. Whoever that country's
     own rivals are reads it as aimed at them too, whether or not
     anyone here said so — the balance-of-power reflex, read straight
     off the third-party web rather than asserted. */
  if (kind === 'defence' || kind === 'mutual_defence') {
    const targets = allianceRippleTargets(
      next.world.pairs,
      key,
      next.world.nations.map((n) => n.key),
    );
    if (targets.length > 0) {
      next.world = {
        ...next.world,
        nations: next.world.nations.map((n) => {
          const target = targets.find((t) => t.nation === n.key);
          return target ? { ...n, relations: clampRelations(n.relations - target.relationsCost) } : n;
        }),
      };
      log(entries, {
        kind: 'note',
        label: 'Read as a choice of sides',
        delta: -targets.reduce((sum, t) => sum + t.relationsCost, 0),
        cause: `${targets.map((t) => findNation(t.nation).name).join(', ')} watched a defence pact with ${template.name} land, and drew the obvious conclusion about who it was aimed at.`,
        unit: 'pts',
      });
    }
  }

  return ok(next);
}

/**
 * Walk away from an agreement.
 *
 * The cost is not paid to the other signatory. It is paid to every country
 * watching, which is all of them, and it is paid in a reputation that takes
 * years to rebuild. This is the only mechanic in the game where the
 * punishment is administered by parties who were not involved.
 */
function handleWithdrawTreaty(state: GameState, treatyId: string): IntentResult {
  const treaty = state.world.treaties.find((t) => t.id === treatyId);
  if (!treaty) return reject(state, 'No such agreement.');
  if (state.politicalCapital < DIPLOMACY_PC_COSTS.withdrawTreaty) {
    return reject(state, 'Not enough political capital to withdraw from a treaty.');
  }

  const next = clone(state);
  spendPc(next, DIPLOMACY_PC_COSTS.withdrawTreaty);
  const entries = currentLog(next);

  const penalty = treaty.kind === 'mutual_defence' ? 16 : treaty.kind === 'defence' ? 12 : 8;
  next.world = breakAgreement(
    { ...next.world, treaties: next.world.treaties.filter((t) => t.id !== treatyId) },
    penalty,
  );
  /* And the other signatory takes it personally, on top — and remembers
     it long after the relations figure itself has recovered. */
  next.world = {
    ...next.world,
    nations: next.world.nations.map((n) =>
      treaty.parties.includes(n.key)
        ? {
            ...applyDiplomaticAct(n, DIPLOMACY_EFFECTS.treatyWithdrawn, findNation(n.key)),
            grievance: addGrievance(n.grievance, 'treaty_withdrawn'),
          }
        : n,
    ),
  };

  log(entries, {
    kind: 'note',
    label: `Withdrew from ${TREATY_LABELS[treaty.kind].toLowerCase()}`,
    delta: -penalty,
    cause:
      'Every other government has noted it. Reputation is read by countries that were not ' +
      'party to the agreement, and it takes years to rebuild.',
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Move a single line of the budget.
 *
 * Bounded, because nobody halves a department in a year: staff are on
 * contracts, buildings are leased, and a minister told to find forty per
 * cent resigns. A government that wants to change the shape of the state has
 * to win twice.
 */
function handleSetBudgetLine(
  state: GameState,
  service: ServiceKey,
  amount: number,
): IntentResult {
  if (!isBudgetSeason(state.turnNumber)) {
    return reject(state, 'The budget is written in the first thirteen weeks of the year.');
  }
  if (state.budget.stage === 'presented') {
    return reject(state, 'The budget is before the chamber. It cannot be rewritten now.');
  }

  const line = lineFor(state.budget, service);
  const bounds = lineBounds(line);
  if (!Number.isFinite(amount) || amount < 0) return reject(state, 'That is not a figure.');
  if (isStatutory(service)) {
    return reject(
      state,
      `${findService(service).name} is not an appropriation. It is a rate set in law paid to ` +
        'everyone who qualifies, so the figure is a headcount. Change it with a bill, ' +
        'not with a budget.',
    );
  }
  if (amount < bounds.min - 1e-6) {
    const ministry = ministryFor(service);
    return reject(
      state,
      `${findService(service).name} cannot fall below ₡${bounds.min.toFixed(0)}bn in one year.` +
        (line.committedYears > 0
          ? ` ${ministry.name} has it contracted for another ${line.committedYears} years.`
          : ' Staff are on contracts and buildings are leased.'),
    );
  }
  if (amount > bounds.max + 1e-6) {
    return reject(
      state,
      `${findService(service).name} cannot rise above ₡${bounds.max.toFixed(0)}bn in one year. ` +
        'A department cannot absorb money faster than it can hire.',
    );
  }
  if (state.politicalCapital < BUDGET_LINE_PC_COST) {
    return reject(state, 'Not enough political capital to move a line.');
  }

  const next = clone(state);
  spendPc(next, BUDGET_LINE_PC_COST);
  next.budget = {
    ...next.budget,
    stage: 'drafting',
    lines: next.budget.lines.map((l) =>
      l.service === service ? { ...l, proposed: Math.round(amount * 10) / 10 } : l,
    ),
  };
  return ok(next);
}

/**
 * Shift a line between running costs and investment.
 *
 * Capital spending is the only line in the budget that leaves something
 * behind. It is also the first thing cut, because what it leaves behind is
 * not finished until somebody else is in office — and once committed it
 * binds the next three budgets, which is how a government that wants to tie
 * its successors' hands actually does it.
 */
function handleSetCapitalShare(
  state: GameState,
  service: ServiceKey,
  share: number,
): IntentResult {
  if (!isBudgetSeason(state.turnNumber)) {
    return reject(state, 'The budget is written in the first thirteen weeks of the year.');
  }
  if (!Number.isFinite(share) || share < 0 || share > 0.8) {
    return reject(state, 'A line can be up to four-fifths capital, and no more.');
  }
  if (state.politicalCapital < BUDGET_LINE_PC_COST) {
    return reject(state, 'Not enough political capital to move a line.');
  }

  const next = clone(state);
  spendPc(next, BUDGET_LINE_PC_COST);
  next.budget = {
    ...next.budget,
    stage: 'drafting',
    lines: next.budget.lines.map((l) =>
      l.service === service ? { ...l, capitalShare: Math.round(share * 100) / 100 } : l,
    ),
  };
  return ok(next);
}

/**
 * Put the budget to the chamber.
 *
 * The most important vote a government takes and the one it cannot avoid.
 * Note what cannot be done here: there is no whipping. A budget is a
 * confidence matter and everybody already knows how they are voting. What
 * decides it is what was done to the departments in the weeks before, which
 * is the entire point of writing it line by line.
 */
function handlePresentBudget(state: GameState): IntentResult {
  if (!isBudgetSeason(state.turnNumber)) {
    return reject(state, 'A budget is put to the chamber in the first quarter of the year.');
  }
  if (state.budget.stage === 'presented') {
    return reject(state, 'It is already before the chamber.');
  }
  if (budgetSettled(state)) {
    return reject(
      state,
      'The chamber has already voted the year\u2019s appropriation. The next budget is ' +
        'written next spring, and what you want before then is a supplementary estimate.',
    );
  }
  if (state.politicalCapital < BUDGET_PRESENT_PC_COST) {
    return reject(state, 'Not enough political capital to take a budget to the floor.');
  }

  const next = clone(state);
  spendPc(next, BUDGET_PRESENT_PC_COST);
  const entries = currentLog(next);

  /*
   * The cabinet reacts to the document before the chamber divides on it,
   * and the reaction is the same either way: a minister who has been cut is
   * a minister who has been cut, whether or not the budget carries. This is
   * where writing a line in somebody else's department comes back.
   */
  const reactions = cabinetReaction(next.budget, next.parties);
  for (const reaction of reactions) {
    if (!reaction.heldBy || Math.abs(reaction.mood) < 0.5) continue;
    const party = next.parties.find((p) => p.id === reaction.heldBy);
    if (!party || party.coalitionMood === null) continue;
    party.coalitionMood = clampMood(party.coalitionMood + reaction.mood);
  }

  const loudest = [...reactions].sort((a, b) => a.change - b.change)[0];
  if (loudest && loudest.change < -0.01) {
    log(entries, {
      kind: 'coalition',
      label: 'The cabinet reads it',
      delta: null,
      cause: loudest.line,
    });
  }

  const rng = new Rng(next.rngState);
  const division = divideOnBudget(next.budget, next.parties, TOTAL_SEATS, rng);
  next.rngState = rng.state;
  next.budget = { ...next.budget, division };

  if (division.passed) {
    next.budget = enactBudget(next.budget, next.turnNumber);
    /* The five sector figures are a summary of the twenty lines now. */
    const summary = sectorsFromBudget(next.budget);
    for (const sector of next.sectors) sector.funding = summary[sector.key];

    log(entries, {
      kind: 'legislature',
      label: `Budget for year ${next.budget.year} carried`,
      delta: 0,
      cause:
        `${division.for} to ${division.against}. ` +
        `₡${proposedTotal(next.budget).toFixed(0)}bn appropriated.` +
        (division.rebels.length > 0
          ? ` ${division.rebels.reduce((s, r) => s + r.seats, 0)} of the government's own seats voted against it.`
          : ''),
      unit: '',
    });
  } else {
    next.budget = rejectBudget(next.budget);
    next.approval = clampApproval(next.approval + BUDGET_DEFEAT_APPROVAL);
    spendPc(next, Math.min(next.politicalCapital, BUDGET_DEFEAT_PC));
    for (const partner of coalitionPartners(next.parties)) {
      partner.coalitionMood = clampMood((partner.coalitionMood ?? 50) + BUDGET_DEFEAT_MOOD);
    }

    if (next.budget.defeats >= 2) next.confidenceCrisis = true;

    log(entries, {
      kind: 'legislature',
      label: 'Budget defeated',
      delta: BUDGET_DEFEAT_APPROVAL,
      cause:
        `${division.against} to ${division.for}. Last year's ₡${enactedTotal(next.budget).toFixed(0)}bn ` +
        'rolls on, which after a year of inflation is a cut nobody voted for. A government that ' +
        'cannot pass a budget is not having a difficult week.',
      unit: 'pts',
    });
  }

  return ok(next);
}

/**
 * Buy a budget through a chamber you do not control.
 *
 * Confidence and supply: an opposition party agrees to walk out of the
 * division rather than vote in it, for one budget, in return for capital
 * spent and a good deal of explaining. It is the only route a minority
 * government has, which is what makes being in a minority a hard position
 * rather than a lost one.
 *
 * The cost is their seats and their distance from you. The other cost is
 * paid to your own side, because nothing annoys a backbench like watching
 * the other lot get paid for doing nothing.
 */
function handleSecureSupply(state: GameState, partyId: string): IntentResult {
  if (!isBudgetSeason(state.turnNumber)) {
    return reject(state, 'Supply is negotiated while the budget is being written.');
  }
  if (state.budget.stage === 'presented') {
    return reject(state, 'The budget is before the chamber. It is too late to deal.');
  }

  const party = state.parties.find((p) => p.id === partyId);
  if (!party) return reject(state, 'No such party.');
  if (party.isPlayer || party.inCoalition) {
    return reject(state, 'They are already in the government. Their votes are not for sale.');
  }
  if (state.budget.supply.includes(partyId)) {
    return reject(state, `${party.shortName} has already agreed to stand aside.`);
  }

  const cost = supplyCost(party, playerParty(state.parties));
  if (state.politicalCapital < cost) {
    return reject(state, `${party.shortName} wants ${cost} PC to stay out of the division.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, cost);
  next.budget = { ...next.budget, supply: [...next.budget.supply, partyId] };
  next.partyInternals.cohesion = clampMood(next.partyInternals.cohesion + SUPPLY_COHESION_COST);

  log(entries, {
    kind: 'coalition',
    label: `Supply agreed with ${party.shortName}`,
    delta: -cost,
    cause:
      `${party.name} will leave the chamber rather than vote on the budget. They have not ` +
      'joined the government, they have not endorsed a word of it, and they will say so ' +
      'at length. Your own benches have noticed what it cost.',
    unit: 'PC',
  });
  return ok(next);
}


/* ------------------------------------------------------------------ *
 * The rooms where nobody is in charge
 * ------------------------------------------------------------------ */

/**
 * Apply to join a body.
 *
 * Admission is by consent of the members, so the test is the worst
 * relationship in the room rather than the average one. A government that
 * has been warm to eleven countries and cold to the twelfth has not earned
 * a seat; it has earned eleven votes and a closed door, which is how
 * accession actually works.
 */
function handleJoinOrganisation(state: GameState, key: OrganisationKey): IntentResult {
  const template = findOrganisation(key);
  const membership = findMembership(state.world.organisations, key);
  if (membership.member) return reject(state, `Verdana is already in the ${template.name}.`);
  if (state.politicalCapital < template.applicationCost) {
    return reject(state, `An application costs ${template.applicationCost} PC.`);
  }

  const check = admissionCheck(template, state.world);
  if (!check.admissible) {
    const blocker = check.blocker ? findNation(check.blocker).name : 'a member';
    return reject(
      state,
      `${blocker} will not have it. Admission needs every member at ${template.entryRelations} ` +
        `relations or better, and they are at ${check.worst.toFixed(0)}.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, template.applicationCost);
  next.world = {
    ...next.world,
    organisations: next.world.organisations.map((o) =>
      o.key === key
        ? { ...o, member: true, joinedTurn: next.turnNumber, suspended: false, standing: 45 }
        : o,
    ),
  };

  log(entries, {
    kind: 'note',
    label: `Acceded to the ${template.name}`,
    delta: -duesOf(template.key, state.economy.gdp),
    cause:
      `${template.obligation} Dues are ₡${duesOf(template.key, state.economy.gdp).toFixed(1)}bn ` +
      'a year from now on.',
    unit: '₡bn',
  });
  return ok(next);
}

/**
 * Walk out.
 *
 * Free, immediate, and read by every government in the world as a statement
 * about what this one's commitments are worth. The dues stop; the
 * reputation does not come back for years.
 */
function handleLeaveOrganisation(state: GameState, key: OrganisationKey): IntentResult {
  const template = findOrganisation(key);
  const membership = findMembership(state.world.organisations, key);
  if (!membership.member) return reject(state, `Verdana is not in the ${template.name}.`);

  const next = clone(state);
  const entries = currentLog(next);
  next.world = {
    ...next.world,
    reputation: clamp01to100(next.world.reputation + WITHDRAWAL_REPUTATION),
    organisations: next.world.organisations.map((o) =>
      o.key === key ? { ...o, member: false, joinedTurn: null, standing: 0 } : o,
    ),
    /* Every member takes it personally, in proportion to how much the body
       mattered to them. Leaving a room is done to the people in it. */
    nations: next.world.nations.map((nation) =>
      template.members.includes(nation.key)
        ? { ...nation, relations: clampRelations(nation.relations + WITHDRAWAL_RELATIONS) }
        : nation,
    ),
  };

  log(entries, {
    kind: 'note',
    label: `Withdrew from the ${template.name}`,
    delta: WITHDRAWAL_REPUTATION,
    cause:
      `₡${duesOf(template.key, state.economy.gdp).toFixed(1)}bn a year saved, and ` +
      `${template.members.length} governments ` +
      'now know what this one\u2019s commitments are worth. That part does not come back for years.',
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Put a resolution.
 *
 * The one action in this engine whose outcome the player cannot influence
 * on the day. Every member votes its own interests; the count was decided
 * over the preceding years, in embassies and summits and agreements kept.
 * A government can be entirely right and lose, which is not the engine
 * being unfair — it is the engine being about diplomacy.
 */
function handleProposeResolution(
  state: GameState,
  kind: ResolutionKind,
  target: NationKey | null,
): IntentResult {
  const template = RESOLUTION_TEMPLATES.find((r) => r.kind === kind);
  if (!template) return reject(state, 'No such resolution.');

  const organisation = findOrganisation(template.organisation);
  if (!isMember(state.world.organisations, template.organisation)) {
    return reject(
      state,
      `Verdana has no seat in the ${organisation.name}. A country cannot put a resolution to a ` +
        'room it is not in.',
    );
  }
  if (state.politicalCapital < template.proposeCost) {
    return reject(state, `Putting this costs ${template.proposeCost} PC.`);
  }
  if (target && !state.world.nations.some((n) => n.key === target && n.recognised)) {
    return reject(state, 'A resolution cannot name a state this country does not recognise.');
  }
  if (template.needsTarget && !target) {
    return reject(
      state,
      `${template.title} has to name a state. A condemnation of nobody in particular is not a ` +
        'resolution, it is a press release.',
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, template.proposeCost);

  const rng = new Rng(next.rngState);
  const outcome = voteOnResolution(template, next.world, target, rng);
  next.rngState = rng.state;

  const resolution: Resolution = {
    id: `res-${kind}-${next.turnNumber}`,
    kind,
    organisation: template.organisation,
    title: template.title,
    target,
    turn: next.turnNumber,
    for: outcome.for,
    against: outcome.against,
    abstain: outcome.abstain,
    passed: outcome.passed,
    vetoedBy: outcome.vetoedBy,
    threshold: outcome.threshold,
    quorum: outcome.quorum,
    votes: outcome.votes,
  };
  next.world = {
    ...next.world,
    resolutions: [...next.world.resolutions, resolution],
  };

  if (outcome.passed) {
    next.world = {
      ...next.world,
      reputation: clamp01to100(next.world.reputation + (template.effects.reputation ?? 0)),
      influence: clamp01to100(next.world.influence + (template.effects.influence ?? 0)),
      tension: clamp01to100(next.world.tension + (template.effects.tension ?? 0)),
    };
    if (template.effects.approval) {
      next.approval = clampApproval(next.approval + template.effects.approval);
    }
    /* What it does costs money, every year, from now on. */
    if (template.cost > 0) next.revenueModifier -= template.cost;

    /* The state it names does not forget who put it. */
    if (target) {
      next.world = {
        ...next.world,
        nations: next.world.nations.map((n) =>
          n.key === target
            ? { ...n, relations: clampRelations(n.relations + RESOLUTION_TARGET_RELATIONS) }
            : n,
        ),
      };
    }
  } else {
    /* Putting a resolution and losing it is worse than not putting it. The
       room has now formally declined, and that is a fact about this
       government that everybody can cite. */
    next.world = {
      ...next.world,
      influence: clamp01to100(next.world.influence + RESOLUTION_DEFEAT_INFLUENCE),
    };
  }

  log(entries, {
    kind: 'note',
    label: `${template.title}${target ? ` \u2014 ${findNation(target).name}` : ''}`,
    delta: outcome.passed ? (template.effects.reputation ?? 0) : RESOLUTION_DEFEAT_INFLUENCE,
    cause: `${organisation.name}. ${describeOutcome(outcome)}`,
    unit: 'pts',
  });
  return ok(next);
}


/* ------------------------------------------------------------------ *
 * Trade
 * ------------------------------------------------------------------ */

/**
 * Put a tariff on one country's goods, or take one off.
 *
 * The most politically attractive and economically expensive decision
 * available, and the engine is built to let the player find that out in
 * that order. The sheltered industry says thank you this week. The partner
 * answers in six. The till says nothing at all, for months, and then the
 * inflation figure does.
 */
function handleSetTariff(state: GameState, key: NationKey, points: number): IntentResult {
  const template = findNation(key);
  if (!state.world.nations.some((n) => n.key === key)) return reject(state, 'No such country.');
  if (!Number.isFinite(points) || points < 0 || points > SURCHARGE_MAX) {
    return reject(state, `A surcharge runs from nothing to ${SURCHARGE_MAX} points.`);
  }

  const flow = findFlow(state.trade, key);
  if (Math.abs(flow.surcharge - points) < 0.5) {
    return reject(state, 'That is what they are already charged.');
  }
  if (state.politicalCapital < TARIFF_PC_COST) {
    return reject(state, 'Not enough political capital to change a tariff schedule.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, TARIFF_PC_COST);
  const rising = points > flow.surcharge;
  next.trade = setSurcharge(next.trade, key, points);

  log(entries, {
    kind: 'note',
    label: `Tariffs on ${template.name} ${rising ? 'raised' : 'lowered'}`,
    delta: points - flow.surcharge,
    cause: rising
      ? `${points.toFixed(0)} points over the national rate. The industries this shelters will ` +
        `say so loudly. ${template.name} will answer in about six weeks, and whoever exports ` +
        'to them will pay for it.'
      : `Down to ${points.toFixed(0)} points. Cheaper goods, and an industry that was being ` +
        'protected is now not.',
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Take a trade dispute to the Convention.
 *
 * The institutional answer to a tariff: slower than retaliating, cheaper
 * than a trade war, and available only to a country that is actually in the
 * room. It is also the one move here that a government can make while
 * telling its own side it is doing something.
 */
function handleFileTradeComplaint(state: GameState, key: NationKey): IntentResult {
  const template = findNation(key);
  if (!state.world.nations.some((n) => n.key === key)) return reject(state, 'No such country.');
  if (!isMember(state.world.organisations, 'wto')) {
    return reject(
      state,
      'The country is not in the World Trade Organization. A complaint has to be filed somewhere.',
    );
  }

  const flow = findFlow(state.trade, key);
  if (flow.theirTariff < 1) {
    return reject(state, `${template.name} charges nothing worth complaining about.`);
  }
  if (flow.dispute === 'ours') {
    return reject(state, 'That complaint is already before the Convention.');
  }
  if (state.politicalCapital < TRADE_COMPLAINT_PC_COST) {
    return reject(state, 'Not enough political capital to take a case.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, TRADE_COMPLAINT_PC_COST);
  next.trade = setDispute(next.trade, key, 'ours');

  /*
   * A country that uses the institutions rather than retaliating is a
   * country the institutions think better of. That is the entire return on
   * this action and it is not nothing.
   */
  next.world = {
    ...next.world,
    reputation: clamp01to100(next.world.reputation + COMPLAINT_REPUTATION),
    nations: next.world.nations.map((n) =>
      n.key === key
        ? { ...n, relations: clampRelations(n.relations + COMPLAINT_RELATIONS) }
        : n,
    ),
  };

  log(entries, {
    kind: 'note',
    label: `Complaint filed against ${template.name}`,
    delta: COMPLAINT_REPUTATION,
    cause:
      `Their ${flow.theirTariff.toFixed(0)}-point tariff goes to the Convention rather than ` +
      'being answered in kind. Slower, cheaper, and read by every other government as a ' +
      'statement about how this one settles arguments.',
    unit: 'pts',
  });
  return ok(next);
}


/* ------------------------------------------------------------------ *
 * The forces
 * ------------------------------------------------------------------ */

/**
 * Change how the country raises and uses its forces.
 *
 * None of the four is better. Conscription puts far more people under arms
 * and makes every family with a teenager an opponent; a territorial posture
 * makes the country genuinely hard to invade and useless to an ally; an
 * expeditionary one is a statement about the country rather than about the
 * forces. The player is choosing what kind of state this is.
 */
/* ------------------------------------------------------------------ *
 * Engine 7 — who fights, and who commands them
 * ------------------------------------------------------------------ */

/**
 * Change how the country fills an army.
 *
 * The ratchet lives here. Going up is an afternoon's decision and costs
 * standing immediately; coming down is not a decision at all for years,
 * because the people are still in uniform, the factories are still built
 * for it, and the constituency that formed around the arrangement is
 * still there. A government that conscripts to win a war hands its
 * successor a conscripting country, and that is the part nobody argues
 * about on the day.
 */

/* ------------------------------------------------------------------ *
 * Engine 7 — the ground
 * ------------------------------------------------------------------ */

/**
 * Tell a sector what to do.
 *
 * The order is free and arrives late, and what it costs is decided by
 * ground the government did not choose. Ordering an attack past the
 * culminating point is not a bolder decision than ordering one short of
 * it; it is the same decision made without the supply figure, and the
 * despatches will report progress for several weeks either way.
 */

/* ------------------------------------------------------------------ *
 * Engine 7 — the fleet and the air force
 * ------------------------------------------------------------------ */

/**
 * Promise to be somewhere.
 *
 * Which is what stationing the fleet is: not a voyage but a standing
 * commitment, kept by rotation. About a third of the hulls committed are
 * ever on station, because the others are working up or in refit, so
 * every water a government says it cares about costs three times what
 * the fleet list suggests — and every one is a subtraction from all the
 * others. The whole of naval strategy is which waters to be absent from,
 * and no government has ever announced one.
 */

/**
 * Turn the country over to it.
 *
 * The decision is entirely about WHEN. A government ordering a war
 * economy gets nothing for the better part of two years, pays for all of
 * it in the meantime, and hands the capacity to a successor — who will
 * also inherit a country whose defence industry now has towns around it
 * and members who represent them. Nothing here can be undone inside a
 * term, which is the point rather than a limitation.
 */

/* ------------------------------------------------------------------ *
 * Engine 7 — what the army believes
 * ------------------------------------------------------------------ */

/**
 * Tell the army how wars are won.
 *
 * It will not listen, for about seven years. The people who would have
 * to make the change are the people who hold the old belief and were
 * promoted for holding it, and no amount of restating the order moves
 * that. What moves it is retirement.
 *
 * And ordering a doctrine the last war appeared to refute is not brave;
 * it is betting against the only data anybody has, in public, against
 * everybody with a record. It is right about one time in three.
 */

/* ------------------------------------------------------------------ *
 * Engine 7 — the table
 * ------------------------------------------------------------------ */

const talksFor = (state: GameState, war: string) =>
  state.negotiations.find((n) => n.warId === war);

/**
 * Agree to talk, which is itself a concession and is reported as one.
 *
 * What a mediator provides is not fairness. It is somebody else to blame
 * for the terms, which is why the choice of mediator is argued about
 * more than the terms are.
 */
function handleOpenTalks(state: GameState, war: string, mediator: Mediator): IntentResult {
  const talks = talksFor(state, war);
  if (!talks) return reject(state, 'There is no war to talk about.');
  if (talks.talking && talks.mediator === mediator) {
    return reject(state, 'Those talks are already running.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  next.negotiations = next.negotiations.map((n) =>
    n.warId === war ? openTalks(n, mediator) : n,
  );
  /* Sitting down is read at home as a sign the war is not going well,
     and is read that way whether or not it is true. */
  next.approval = clampApproval(next.approval - 1.5);

  const template = findMediator(mediator);
  log(entries, {
    kind: 'note',
    label: `Talks — ${template.label.toLowerCase()}`,
    delta: -1.5,
    cause: `${template.blurb} Agreeing to sit down is itself reported as a concession, and will be.`,
    unit: 'pts',
  });
  return ok(next);
}

/** Walk out. Costs nothing today. */
function handleBreakOffTalks(state: GameState, war: string): IntentResult {
  const talks = talksFor(state, war);
  if (!talks?.talking) return reject(state, 'Nobody is talking.');

  const next = clone(state);
  const entries = currentLog(next);
  next.negotiations = next.negotiations.map((n) => (n.warId === war ? breakOffTalks(n) : n));
  log(entries, {
    kind: 'note',
    label: 'Talks broken off',
    delta: 0,
    cause:
      'Free today. What it costs is that the terms on the table went with them, and the next ' +
      'set will be worse for whoever is losing.',
    unit: '',
  });
  return ok(next);
}

/**
 * Sign it.
 *
 * What it costs at home is what was conceded, less whatever cover the
 * mediator provides — and it cannot be signed at all if it crosses what
 * this government said in week one.
 */
function handleAcceptTerms(state: GameState, war: string, offerId: string): IntentResult {
  const talks = talksFor(state, war);
  const offer = talks?.offers.find((o) => o.id === offerId);
  if (!talks || !offer) return reject(state, 'There is nothing on the table by that name.');
  if (blockedByAim(offer, talks)) {
    return reject(
      state,
      `This government cannot sign that. It said in week one what it would never accept, on the strength of a rally, and the sentence is on the record. Taking it back is possible and is its own decision.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  next.negotiations = next.negotiations.map((n) => (n.warId === war ? accept(n, offerId) : n));

  const cost = domesticCost(offer) * (1 - findMediator(offer.mediator).cover);
  next.approval = clampApproval(next.approval - cost * 0.4);

  const crisis = next.crises.find((c) => c.id === war);
  if (crisis) {
    crisis.stage = 'settled';
    crisis.settlement =
      offerValue(offer) > 8 ? 'favourable' : offerValue(offer) < -8 ? 'unfavourable' : 'even';
  }

  log(entries, {
    kind: 'event',
    label: 'Terms accepted',
    delta: -cost * 0.4,
    cause:
      `The country gives up ${offer.weConcede.map((t: PeaceTerm) => findTerm(t).label.toLowerCase()).join(' and ')}. ` +
      `That will be remembered for ${Math.max(...offer.weConcede.map((t: PeaceTerm) => findTerm(t).memoryYears), 10)} ` +
      `years, which is longer than anybody involved will be in office.`,
    unit: 'pts',
  });
  return ok(next);
}

/** Refuse it. It stays on the record and the next one is worse. */
function handleRefuseTerms(state: GameState, war: string, offerId: string): IntentResult {
  const talks = talksFor(state, war);
  const offer = talks?.offers.find((o) => o.id === offerId);
  if (!talks || !offer) return reject(state, 'There is nothing on the table by that name.');

  const next = clone(state);
  const entries = currentLog(next);
  next.negotiations = next.negotiations.map((n) => (n.warId === war ? refuse(n, offerId) : n));

  log(entries, {
    kind: 'note',
    label: 'Terms refused',
    delta: offerValue(offer),
    cause:
      'It stays on the record. If this war is being lost, the terms available are worst at ' +
      'the end, and this was better than what will be offered next.',
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Take back what was said in week one.
 *
 * The only way out of the trap, and it costs exactly what it looks like:
 * the government says in public that the thing it told the country it
 * would never accept is a thing it is now willing to accept. Nobody has
 * ever done it cheaply and several have not survived it.
 */
function handleReviseWarAim(state: GameState, war: string): IntentResult {
  const talks = talksFor(state, war);
  if (!talks) return reject(state, 'There is no war to revise an aim for.');
  if (talks.declaredFirmness < 30) {
    return reject(state, 'Nothing was said firmly enough to need taking back.');
  }
  if (state.politicalCapital < REVISE_AIM_PC) {
    return reject(
      state,
      `Taking back a war aim costs ${REVISE_AIM_PC} PC, and most of that is standing up and saying it.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, REVISE_AIM_PC);
  next.negotiations = next.negotiations.map((n) =>
    n.warId === war ? revisAim(n, Math.max(0, n.declaredFirmness - 45)) : n,
  );
  next.approval = clampApproval(next.approval - REVISE_AIM_APPROVAL);

  log(entries, {
    kind: 'event',
    label: 'The war aim has been revised',
    delta: -REVISE_AIM_APPROVAL,
    cause:
      `This government has said in public that what it told the country it would never accept ` +
      `is something it is now prepared to accept. It is the only way out of the sentence and ` +
      `it costs what it looks like it costs. It also makes a settlement possible, which is ` +
      `the whole reason to do it.`,
    unit: 'pts',
  });
  return ok(next);
}

function handleDoctrineBelief(state: GameState, to: WarDoctrine): IntentResult {
  const change = doctrineChange(state.doctrine, to);
  if (!change.allowed) return reject(state, change.reason);
  if (state.politicalCapital < change.politicalCapital) {
    return reject(
      state,
      `Changing what the army believes costs ${change.politicalCapital} PC, and most of that is the argument with everybody who has a record.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, change.politicalCapital);
  next.doctrine = orderDoctrine(next.doctrine, to, absoluteWeek(next));
  if (change.approvalCost > 0) {
    next.approval = clampApproval(next.approval - change.approvalCost);
  }

  const template = findWarDoctrine(to);
  log(entries, {
    kind: 'note',
    label: `${template.label} ordered`,
    delta: -change.approvalCost,
    cause: change.vindicated
      ? `${template.blurb} The last war suggested this, which is the only reason an officer ` +
        `corps ever moves quickly: about ${change.years.toFixed(0)} years rather than a decade.`
      : `${template.blurb} It will take about ${change.years.toFixed(0)} years, because the ` +
        `people who would have to make the change are the people who were promoted for the ` +
        `other one. Until then the army is worse at both than it was at either.`,
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Force it through by replacing the people who disagree.
 *
 * It works, and it is the only thing that works quickly. What it costs
 * is every officer who knew what they were doing — and the officers who
 * remain have just watched what this government does to people who held
 * the previous view in good faith, which is a lesson they will apply to
 * the next thing they are asked about.
 */
function handleForceDoctrine(state: GameState): IntentResult {
  if (!state.doctrine.ordered) {
    return reject(state, 'Nothing has been ordered for the army to be refusing.');
  }
  if (state.politicalCapital < FORCE_DOCTRINE_PC) {
    return reject(state, `Replacing the officer corps costs ${FORCE_DOCTRINE_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, FORCE_DOCTRINE_PC);
  const result = forceDoctrine(next.doctrine, next.orbat);
  next.doctrine = result.doctrine;
  next.orbat = result.orbat;
  next.approval = clampApproval(next.approval - DOCTRINE_FORCE_APPROVAL);

  log(entries, {
    kind: 'note',
    label: 'The officer corps has been replaced',
    delta: -result.competenceLost,
    cause:
      `The army now does ${findWarDoctrine(next.doctrine.current).label.toLowerCase()}, from ` +
      `this week, which is the only way it was ever going to happen quickly. It has lost ` +
      `${result.competenceLost.toFixed(0)} points of competence doing it, and every officer ` +
      `still in post has watched what happens to people who held the previous view in good ` +
      `faith.`,
    unit: 'idx',
  });
  return ok(next);
}

/**
 * Buy something for 2041.
 *
 * The question on this desk is never what the country needs. It is what
 * the country will need in a decade, and how wrong the government is
 * willing to be — because the programme records the doctrine it was
 * specified against, and if the army has moved on by the time it lands
 * it will land anyway, on time, worth a fraction of what was promised.
 */
function handleStartResearch(state: GameState, field: ResearchField): IntentResult {
  const template = findResearchField(field);
  if (state.politicalCapital < RESEARCH_PC) {
    return reject(state, `Starting a development programme costs ${RESEARCH_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, RESEARCH_PC);
  const started = startResearch(next.doctrine, field, absoluteWeek(next));
  next.doctrine = started.doctrine;

  log(entries, {
    kind: 'note',
    label: `${template.label} — programme started`,
    delta: -template.annualCost * next.moneyScale,
    cause:
      `${template.blurb} \u20a1${(template.annualCost * next.moneyScale).toFixed(1)}bn a year for ` +
      `${template.leadYears} years, specified against ` +
      `${findWarDoctrine(next.doctrine.ordered ?? next.doctrine.current).label.toLowerCase()} — ` +
      `which is what the army believes today and may not be what it believes when this lands.`,
    unit: '\u20a1bn',
  });
  return ok(next);
}

/** Cancel one. The years already spent do not come back either. */
function handleCancelResearch(state: GameState, id: string): IntentResult {
  const programme = state.doctrine.programmes.find((p) => p.id === id && !p.delivered);
  if (!programme) return reject(state, 'No such programme.');

  const next = clone(state);
  const entries = currentLog(next);
  next.doctrine = cancelResearch(next.doctrine, id);

  log(entries, {
    kind: 'note',
    label: `${findResearchField(programme.field).label} — cancelled`,
    delta: 0,
    cause:
      `${Math.round((absoluteWeek(next) - programme.startedTurn) / TURNS_PER_YEAR)} years into ` +
      `it. The saving starts this week and the years do not come back, which is what makes ` +
      `cancelling one the easiest decision in any budget and the hardest to reverse.`,
    unit: '',
  });
  return ok(next);
}

function handleWarFooting(state: GameState, footing: WarFooting): IntentResult {
  const change = footingChange(state.warEconomy, footing, absoluteWeek(state));
  if (!change.allowed) return reject(state, change.reason);
  if (state.politicalCapital < change.politicalCapital) {
    return reject(
      state,
      `Directing industry costs ${change.politicalCapital} PC. It is an argument with every firm that is about to be told what to make, and with every constituency that has one.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, change.politicalCapital);
  next.warEconomy = setFooting(next.warEconomy, footing, absoluteWeek(next));
  if (change.approvalCost > 0) {
    next.approval = clampApproval(next.approval - change.approvalCost);
  }

  const template = findFooting(footing);
  log(entries, {
    kind: 'note',
    label: template.label,
    delta: -change.approvalCost,
    cause:
      change.months > 0
        ? `${template.blurb} Nothing is produced for ${change.months} months. The cost starts ` +
          `this week and the capacity arrives under a government that may not be this one, ` +
          `and cannot be wound back for ${template.unwindMonths} months after that.`
        : template.blurb,
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Decide who pays for the war.
 *
 * Not an economic choice. There are three ways, each has a different
 * group of people at the end of it, and what actually differs is the
 * delay before those people notice. The shortest delay is the one nobody
 * chooses, and nothing in this engine rewards choosing it — which is
 * exactly the situation being modelled.
 */
function handleWarFinance(state: GameState, finance: WarFinance): IntentResult {
  if (state.warEconomy.finance === finance) {
    return reject(state, 'That is how it is already being paid for.');
  }
  const next = clone(state);
  const entries = currentLog(next);
  next.warEconomy = setFinance(next.warEconomy, finance);

  const template = findFinance(finance);
  log(entries, {
    kind: 'note',
    label: template.label,
    delta: 0,
    cause: `${template.blurb} ${template.victim} They will notice in about ${Math.round(template.delayWeeks / 4)} months.`,
    unit: '',
  });
  return ok(next);
}

function handleStationFleet(state: GameState, zone: SeaZone, hulls: number): IntentResult {
  const available = seaworthy(state.navy).length;
  if (hulls > available) {
    return reject(
      state,
      `There are ${available} ships that could sail. The fleet list says ${afloat(state.navy).length}, and the difference is a refit backlog rather than a rounding.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  next.navy = station(next.navy, zone, Math.max(0, hulls));

  const template = findSeaZone(zone);
  const sustained = Math.round(hulls / ROTATION_RATIO);
  log(entries, {
    kind: 'note',
    label: `${SEA_ZONE_LABELS[zone]}: ${hulls} committed`,
    delta: sustained,
    cause:
      `${template.blurb} About ${sustained} of them will be there at any one time — one on ` +
      `station, one working up, one in refit. That is not a failing of this fleet; it is what ` +
      `a continuous presence is, and it is why every water the country says it cares about ` +
      `costs three times what the list suggests.`,
    unit: 'hulls',
  });
  return ok(next);
}

/**
 * Order a ship.
 *
 * The money goes now and the ship arrives under a government two
 * elections from here. Which is why the fleet a country has is always
 * the one some previous administration argued about, and why cancelling
 * one is the easiest saving in any budget and the one that shows up
 * latest.
 */
function handleOrderShip(state: GameState, shipClass: ShipClass): IntentResult {
  const template = findShip(shipClass);
  const cost = template.cost * state.moneyScale;
  if (state.politicalCapital < SHIP_ORDER_PC) {
    return reject(
      state,
      `Laying down a ship costs ${SHIP_ORDER_PC} PC. The argument is never about the ship; it is about the yard it is built in and the seats around it.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SHIP_ORDER_PC);
  const result = orderShip(next.navy, shipClass, absoluteWeek(next), next.moneyScale);
  next.navy = result.navy;
  next.debt += cost;

  log(entries, {
    kind: 'note',
    label: `${template.label} laid down`,
    delta: -cost,
    cause:
      `\u20a1${cost.toFixed(0)}bn, and it commissions in ${template.buildYears} years — under a ` +
      `government that will not be this one, and which will take the credit. ${template.blurb}`,
    unit: '\u20a1bn',
  });
  return ok(next);
}

/**
 * Decide what the air force is for.
 *
 * Effort is finite and every campaign is a subtraction from the others.
 * A government that orders all of them is ordering none of them, which
 * is the most common way air power is wasted and the least visible,
 * because every campaign will report activity either way.
 */
function handleAirEffort(
  state: GameState,
  effort: Partial<Record<AirCampaign, number>>,
): IntentResult {
  const next = clone(state);
  const entries = currentLog(next);
  next.airForce = setEffort(next.airForce, effort);

  const ordered = Object.entries(effort).filter(([, v]) => (v ?? 0) > 0);
  if (ordered.length > 2) {
    log(entries, {
      kind: 'note',
      label: 'The air force has been given four jobs',
      delta: ordered.length,
      cause:
        'Each of them will report activity and none of them will be decisive. Effort is ' +
        'finite; ordering everything is the most common way air power is wasted and the ' +
        'hardest to see afterwards, because the sortie figures look excellent.',
      unit: 'campaigns',
    });
  } else if (ordered.some(([k]) => k === 'strategic')) {
    const campaign = findCampaign('strategic');
    log(entries, {
      kind: 'note',
      label: 'A strategic bombing campaign',
      delta: 0,
      cause: campaign.honest,
      unit: '',
    });
  }
  return ok(next);
}

/** Order aircraft. Quicker than a ship, and still not quick. */
function handleOrderSquadron(state: GameState, aircraft: AircraftKind): IntentResult {
  const template = findAircraft(aircraft);
  const cost = template.cost * state.moneyScale;
  if (state.politicalCapital < SQUADRON_ORDER_PC) {
    return reject(state, `Ordering a squadron costs ${SQUADRON_ORDER_PC} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SQUADRON_ORDER_PC);
  next.airForce = orderSquadron(next.airForce, aircraft, absoluteWeek(next), next.moneyScale).air;
  next.debt += cost;

  log(entries, {
    kind: 'note',
    label: `${template.label} ordered`,
    delta: -cost,
    cause: `\u20a1${cost.toFixed(0)}bn, delivered in ${template.buildYears} years. ${template.blurb}`,
    unit: '\u20a1bn',
  });
  return ok(next);
}

function handleSectorPosture(
  state: GameState,
  theatreId: string,
  sectorId: string,
  posture: SectorPosture,
): IntentResult {
  const theatre = state.theatres.find((t) => t.warId === theatreId);
  if (!theatre) return reject(state, 'There is no front there.');
  const sector = theatre.sectors.find((s) => s.id === sectorId);
  if (!sector) return reject(state, 'No such sector.');
  if (posture === 'attacking' && sector.garrison.length === 0) {
    return reject(
      state,
      'There is nobody there to attack with. An order to advance issued to an empty sector is still an order, and it is still reported as one.',
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  next.theatres = next.theatres.map((t) =>
    t.warId === theatreId ? setPosture(t, sectorId, posture) : t,
  );

  /*
   * The one thing worth saying out loud, because the supply figure is on
   * the same screen and nobody reads it: this attack cannot be fed.
   */
  if (posture === 'attacking' && sector.supply < ATTACK_SUPPLY_FLOOR) {
    log(entries, {
      kind: 'note',
      label: `${sector.name}: the attack cannot be supplied`,
      delta: sector.supply,
      cause:
        `Supply there is ${sector.supply.toFixed(0)} against a floor of ${ATTACK_SUPPLY_FLOOR}. ` +
        'The order stands and the attack will not go. It will cost what an attack costs.',
      unit: 'idx',
    });
  } else {
    log(entries, {
      kind: 'note',
      label: `${sector.name}: ${SECTOR_POSTURE_LABELS[posture].toLowerCase()}`,
      delta: 0,
      cause: `The order will reach them in ${orderLag(next.orbat, 0.5).toFixed(1)} weeks.`,
      unit: '',
      informational: true,
    });
  }
  return ok(next);
}

/** Move weight onto a piece of ground, and off whatever it was on. */
function handleGarrison(
  state: GameState,
  theatreId: string,
  sectorId: string,
  formations: string[],
): IntentResult {
  const theatre = state.theatres.find((t) => t.warId === theatreId);
  if (!theatre) return reject(state, 'There is no front there.');
  if (!theatre.sectors.some((s) => s.id === sectorId)) return reject(state, 'No such sector.');
  const known = formations.filter((id) => state.orbat.formations.some((f) => f.id === id));

  const next = clone(state);
  next.theatres = next.theatres.map((t) =>
    t.warId === theatreId ? garrison(t, sectorId, known) : t,
  );
  /* Anything sent to the ground is in the fight, whatever the paperwork
     at home says about it. */
  next.orbat = setCommitment(next.orbat, known, true);
  return ok(next);
}

/**
 * Decide how much of the army spends its week finding out what is there.
 *
 * Reconnaissance is not free and it is not glamorous, and what it buys
 * is the difference between the map and the ground. A government that
 * spends nothing on it is not fighting with less information; it is
 * fighting from a map that stopped being updated, briefed in the present
 * tense, with nothing marking which parts those are.
 */
function handleReconnaissance(
  state: GameState,
  theatreId: string,
  effort: number,
): IntentResult {
  if (!state.theatres.some((t) => t.warId === theatreId)) {
    return reject(state, 'There is no front there.');
  }
  const next = clone(state);
  next.theatres = next.theatres.map((t) =>
    t.warId === theatreId ? setReconnaissance(t, effort) : t,
  );
  return ok(next);
}

function handleMobilisation(state: GameState, model: ManpowerModel): IntentResult {
  const template = findManpowerModel(model);
  const change = mobilisationChange(state.manpower, model, absoluteWeek(state));
  if (!change.allowed) return reject(state, change.reason);
  if (state.politicalCapital < change.politicalCapital) {
    return reject(
      state,
      `Putting ${template.label.toLowerCase()} through costs ${change.politicalCapital} PC. This is a law about who can be made to fight, not a departmental decision.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, change.politicalCapital);
  next.manpower = applyMobilisation(next.manpower, model, absoluteWeek(next));

  if (change.approvalCost !== 0) {
    next.approval = clampApproval(next.approval - change.approvalCost);
  }
  if (change.normsCost > 0) {
    /* Compelling people to fight is a constitutional act as much as a
       military one, and a state that does it against the grain of its
       own population spends something it does not get back. */
    next.culture = {
      ...next.culture,
      politicalCulture: clamp01to100(next.culture.politicalCulture - change.normsCost),
    };
  }

  const locked = findManpowerModel(model).demobilisationWeeks;
  log(entries, {
    kind: 'note',
    label: template.label,
    delta: -change.approvalCost,
    cause:
      `${template.blurb} It cannot be wound back down for ${Math.round(locked / 52)} years — ` +
      `not because of a rule, but because by then the people will be in uniform, the ` +
      `factories will be built for it, and there will be a constituency that formed around ` +
      `the arrangement and would like it kept.`,
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Sack a general.
 *
 * The obvious thing to do, free on the day, and watched very closely by
 * every officer who did not lose a battle this week. What it costs
 * depends entirely on whether the army had also given up on them, and
 * the government does not get to decide which of those it is doing.
 */
function handleDismissCommander(state: GameState, id: string): IntentResult {
  const commander = commanderOf(state.orbat, id);
  if (!commander) return reject(state, 'There is nobody by that name in post.');
  if (serving(state.orbat).length < 2) {
    return reject(
      state,
      'There is one commander and one army. Removing them leaves formations that answer to nobody, which is not a lesser problem than the one being solved.',
    );
  }
  if (state.politicalCapital < PC_COSTS.dismissCommander) {
    return reject(
      state,
      `Removing a serving commander costs ${PC_COSTS.dismissCommander} PC. It is never presented as a political act and it is always read as one.`,
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  const rng = new Rng(next.rngState);
  spendPc(next, PC_COSTS.dismissCommander);

  const result = dismissCommander(
    next.orbat,
    id,
    next.country,
    rng,
    new Set(next.orbat.commanders.map((c) => c.name)),
    absoluteWeek(next),
  );
  next.orbat = result.orbat;
  next.rngState = rng.state;

  log(entries, {
    kind: 'note',
    label: `${commander.name} has been relieved`,
    delta: -result.loyaltyCost,
    cause:
      result.loyaltyCost > 2
        ? `The army thought they were doing well. ${result.replacement?.name ?? 'A successor'} takes over, ` +
          `drawn from the same list everybody else was drawn from — the government has not chosen a ` +
          `better commander, it has chosen again. Every officer who has been handed a difficult ` +
          `sector has now watched what happens to people who are handed difficult sectors.`
        : `The army had reached the same conclusion some time ago. ${result.replacement?.name ?? 'A successor'} ` +
          `takes over and nobody has to be told why.`,
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Put formations into the fight, or take them out of it.
 *
 * Free of political capital and not free of anything else: a committed
 * formation learns, wears out its equipment several times faster than any
 * peacetime budget replaces it, and can only be rebuilt as fast as the
 * training pipeline produces people. The decision is cheap and the
 * consequence arrives fourteen weeks later.
 */
function handleCommitFormations(
  state: GameState,
  ids: string[],
  committed: boolean,
): IntentResult {
  const known = ids.filter((id) => state.orbat.formations.some((f) => f.id === id));
  if (known.length === 0) return reject(state, 'No such formation.');

  const next = clone(state);
  const entries = currentLog(next);
  next.orbat = setCommitment(next.orbat, known, committed);

  log(entries, {
    kind: 'note',
    label: committed ? `${known.length} formations committed` : `${known.length} formations withdrawn`,
    delta: known.length,
    cause: committed
      ? `The order has been given. It reaches the people who carry it out in ` +
        `${orderLag(next.orbat, 0.5).toFixed(1)} weeks, on a battlefield that will have moved by then.`
      : `Coming out of the line is not the same as being rebuilt. The equipment is gone and the ` +
        `replacements are fourteen weeks from being soldiers.`,
    unit: 'units',
    informational: !committed,
  });
  return ok(next);
}

function handleSetDoctrine(state: GameState, doctrine: DoctrineKey): IntentResult {
  const template = findDoctrine(doctrine);
  if (state.military.doctrine === doctrine) {
    return reject(state, `The forces are already on ${template.name.toLowerCase()}.`);
  }
  if (state.politicalCapital < template.cost) {
    return reject(state, `Changing the whole posture of the forces costs ${template.cost} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, template.cost);
  next.military = { ...next.military, doctrine };
  if (template.approval !== 0) {
    next.approval = clampApproval(next.approval + template.approval);
  }

  log(entries, {
    kind: 'note',
    label: template.name,
    delta: template.approval,
    cause:
      `${template.blurb} It changes the defence line by ` +
      `₡${Math.abs(template.surcharge).toFixed(0)}bn a year, ${template.surcharge >= 0 ? 'upward' : 'downward'}.`,
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Start something a successor will finish.
 *
 * Already late on the day it is announced, because the announced date was
 * never the expected one. The interesting question is not which to buy; it
 * is whether to begin something that will be collected by somebody else, in
 * a region whose jobs will make it impossible to cancel.
 */
function handleStartProgramme(state: GameState, key: string): IntentResult {
  let template;
  try {
    template = findProgramme(key);
  } catch {
    return reject(state, 'No such programme.');
  }

  if (state.military.programmes.some((p) => p.key === key && !p.cancelled && !p.delivered)) {
    return reject(state, `${template.name} is already under way.`);
  }
  if (state.politicalCapital < PROGRAMME_PC_COST) {
    return reject(state, 'Not enough political capital to commit to a programme.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PROGRAMME_PC_COST);
  next.military = startProgramme(next.military, key, absoluteWeek(next), next.moneyScale);

  const started = next.military.programmes[next.military.programmes.length - 1]!;
  log(entries, {
    kind: 'note',
    label: `${template.name} begun`,
    delta: -programmeCost(template, next.moneyScale),
    cause:
      `₡${programmeCost(template, next.moneyScale).toFixed(0)}bn over ${template.years} years, and the internal estimate ` +
      `already says ${Math.round((started.slippedTo - started.dueTurn) / TURNS_PER_YEAR * 10) / 10} ` +
      `years longer than that. The work is in ${template.regions.join(' and ')}, which is why ` +
      'cancelling it later will not be a financial decision.',
    unit: '₡bn',
  });
  return ok(next);
}

/**
 * Stop one.
 *
 * The money already spent is gone either way, which makes this the cheapest
 * decision on the page and the hardest one — the jobs are in somebody's
 * seat, and that somebody is usually on the government benches.
 */
function handleCancelProgramme(state: GameState, id: string): IntentResult {
  const programme = state.military.programmes.find((p) => p.id === id);
  if (!programme) return reject(state, 'No such programme.');
  if (programme.cancelled || programme.delivered) {
    return reject(state, 'That programme is no longer running.');
  }

  const template = findProgramme(programme.key);
  const next = clone(state);
  const entries = currentLog(next);
  next.military = cancelProgramme(next.military, id);

  /* The regions where the work was pay for it, in seats. */
  for (const regionId of template.regions) {
    const region = next.regions.find((r) => r.id === regionId);
    if (region) region.campaignInvestment = Math.max(0, region.campaignInvestment - 12);
  }
  next.approval = clampApproval(next.approval - 2.5);

  log(entries, {
    kind: 'approval',
    label: `${template.name} cancelled`,
    delta: -2.5,
    cause:
      `₡${programme.spent.toFixed(0)}bn spent and nothing to show for it, which is the honest ` +
      `figure and not the one that will be used. ${template.regions.join(' and ')} will be ` +
      'hearing about this at the next election.',
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Send forces somewhere.
 *
 * What is committed abroad is not available at home, wears out faster than
 * any budget repairs it, and produces veterans — who are a constituency
 * rather than a statistic and who remember which government sent them.
 */
function handleDeployForce(
  state: GameState,
  key: NationKey,
  kind: Deployment['kind'],
  scale: number,
): IntentResult {
  const template = findNation(key);
  if (!state.world.nations.some((n) => n.key === key)) return reject(state, 'No such country.');
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1.6) {
    return reject(state, 'A deployment is sized between nothing and everything available.');
  }
  if (state.politicalCapital < DEPLOY_PC_COST) {
    return reject(state, 'Not enough political capital to send anybody anywhere.');
  }

  const terms = deploymentTerms(kind, scale, state.moneyScale);
  if (committedShare(state.military) + terms.commitment > 0.75) {
    return reject(
      state,
      'There is not enough force left uncommitted. Something has to come home first.',
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, DEPLOY_PC_COST);
  next.military = deploy(
    next.military,
    {
      nation: key,
      kind,
      commitment: terms.commitment,
      cost: terms.cost,
      startedTurn: next.turnNumber,
      mandate: mandateFor(kind, template.name),
    },
    next.turnNumber,
  );

  log(entries, {
    kind: 'note',
    label: `Forces to ${template.name}`,
    delta: -terms.cost,
    cause:
      `${mandateFor(kind, template.name)} ₡${terms.cost.toFixed(0)}bn a year, and ` +
      `${Math.round(terms.commitment * 100)}% of the force is now somewhere it cannot be used ` +
      'for anything else.',
    unit: '₡bn',
  });
  return ok(next);
}

/**
 * How far the state conducts itself in more than one language.
 *
 * Signage, forms, schooling, courts, broadcast hours. It is among the
 * cheapest things on the whole desk and among the slowest to be felt:
 * recognition moves toward this figure over years, and belonging follows
 * recognition. A government that raises it will hand the benefit to a
 * successor, and one that lowers it will hand on the bill.
 *
 * Deliberately not free in political capital. In a country where one
 * community's arrangements simply are the national arrangements, changing
 * them is not an administrative act.
 */
function handleLanguagePolicy(state: GameState, level: number): IntentResult {
  if (!Number.isFinite(level) || level < 0 || level > 100) {
    return reject(state, 'Language policy runs from nothing to everything.');
  }
  const move = Math.abs(level - state.culture.languagePolicy);
  if (move < 1) return reject(state, 'That is where it already stands.');

  const cost = Math.min(20, Math.round(4 + move * 0.16));
  if (state.politicalCapital < cost) {
    return reject(state, 'Not enough political capital to reopen the language settlement.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, cost);
  const before = next.culture.languagePolicy;
  next.culture.languagePolicy = level;

  log(entries, {
    kind: 'note',
    label: level > before ? 'The state widens its languages' : 'The state narrows its languages',
    delta: level - before,
    cause:
      `Signage, forms, schooling and the courts. Nothing changes this week: recognition ` +
      `follows this figure over years and belonging follows recognition, so whoever is ` +
      `sitting here in two terms gets the result.`,
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Answer a movement, or decide not to.
 *
 * The four answers are the decision this engine exists for and none of
 * them is free. Conceding costs money and raises the belief that
 * organising works, which produces the next movement. Negotiating buys
 * time without addressing anything. Ignoring is free this week and
 * expensive next. Suppressing works briefly and costs the norms, the
 * police's standing, and the sympathy of everybody who was watching —
 * and it converts a movement about housing into a movement about the
 * government, which is one no concession ends.
 *
 * There is no correct answer. That is why it is on the desk rather than
 * resolved by the engine.
 */
function handleAnswerMovement(
  state: GameState,
  key: string,
  response: MovementResponse,
): IntentResult {
  const movement = state.movements.active.find((m) => m.key === key);
  if (!movement) return reject(state, 'Nobody is organised about that.');
  if (movement.lastResponse) return reject(state, 'You have already answered them this week.');

  const effects = responseEffects(movement, response, state.economy.gdp);
  if (state.politicalCapital < effects.politicalCapital) {
    return reject(state, 'Not enough political capital to answer them at all.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, effects.politicalCapital);

  /* A concession is a standing commitment, not a one-off payment: it goes
     on the revenue line as an annual cost somebody has to keep paying. */
  if (effects.money > 0) next.revenueModifier -= effects.money;

  if (effects.norms !== 0) {
    next.culture = {
      ...next.culture,
      politicalCulture: clamp01to100(next.culture.politicalCulture + effects.norms),
    };
  }
  if (effects.policeTrust !== 0) {
    next.opinion = {
      ...next.opinion,
      trust: next.opinion.trust.map((t) =>
        t.key === 'police' ? { ...t, level: clamp01to100(t.level + effects.policeTrust) } : t,
      ),
    };
  }
  if (effects.frustration !== 0) {
    next.opinion = {
      ...next.opinion,
      frustration: clamp01to100(next.opinion.frustration + effects.frustration),
    };
  }

  next.movements = {
    ...next.movements,
    active: next.movements.active.map((m) =>
      m.key === key ? { ...m, lastResponse: response } : m,
    ),
  };

  const template = findMovement(movement.key);
  log(entries, {
    kind: 'note',
    label: `${template.label}: ${response}`,
    delta: -effects.money,
    cause: effects.summary,
    unit: effects.money > 0 ? '\u20a1bn/yr' : '',
  });
  return ok(next);
}

function mandateFor(kind: Deployment['kind'], name: string): string {
  switch (kind) {
    case 'peacekeeping':
      return `Standing between two parties in ${name} who have agreed to let somebody.`;
    case 'alliance':
      return `Meeting an obligation to ${name} that a previous government signed.`;
    case 'combat':
      return `Fighting in ${name}, which is the word that will be avoided in every statement.`;
    default:
      return `Training ${name}'s forces, which is the cheapest thing a country can be seen doing.`;
  }
}

/** Bring them home. */
function handleWithdrawForce(state: GameState, id: string): IntentResult {
  const deployment = state.military.deployments.find((d) => d.id === id);
  if (!deployment) return reject(state, 'There is nothing deployed there.');

  const next = clone(state);
  const entries = currentLog(next);
  next.military = withdraw(next.military, id);

  const years = (next.turnNumber - deployment.startedTurn) / TURNS_PER_YEAR;
  log(entries, {
    kind: 'note',
    label: `Withdrawal from ${findNation(deployment.nation).name}`,
    delta: deployment.cost,
    cause:
      `${years.toFixed(1)} years. What it achieved is a question for somebody else; what it ` +
      'cost is on this page, and the people who went are now a constituency.',
    unit: '₡bn',
  });
  return ok(next);
}

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

/**
 * Go up a rung.
 *
 * Cheap, popular and fast, which is the entire problem with it. The rally
 * refreshes, their resolve hardens, and the country is one rung closer to
 * the place where none of this is a decision any more.
 */
function handleEscalateCrisis(state: GameState, id: string): IntentResult {
  const crisis = state.crises.find((c) => c.id === id);
  if (!crisis) return reject(state, 'There is no such crisis.');
  if (crisis.stage === 'settled') return reject(state, 'That one is over.');
  if (crisis.stage === 'war') {
    return reject(state, 'There are no rungs above this one. There is only how it ends.');
  }
  if (state.politicalCapital < ESCALATE_PC_COST) {
    return reject(state, 'Not enough political capital.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, ESCALATE_PC_COST);
  const after = escalateCrisis(crisis, next.turnNumber);
  next.crises = next.crises.map((c) => (c.id === id ? after : c));
  next.approval = clampApproval(next.approval + ESCALATION_APPROVAL);

  log(entries, {
    kind: 'approval',
    label: `${findNation(crisis.nation).name}: ${STAGE_LABELS[after.stage].toLowerCase()}`,
    delta: ESCALATION_APPROVAL,
    cause:
      'Standing firm is popular the week it happens. Their resolve has hardened too, and ' +
      'nobody will report that part until it matters.',
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Come down a rung.
 *
 * Expensive, unpopular and slow. It costs approval immediately and in
 * public, and it is very often the right thing to do — which is the whole
 * shape of the decision and the reason so few governments take it.
 */
function handleDeEscalateCrisis(state: GameState, id: string): IntentResult {
  const crisis = state.crises.find((c) => c.id === id);
  if (!crisis) return reject(state, 'There is no such crisis.');
  if (crisis.stage === 'settled') return reject(state, 'That one is over.');
  if (state.politicalCapital < DEESCALATE_PC_COST) {
    return reject(state, 'Not enough political capital to back down in public.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, DEESCALATE_PC_COST);
  const heldNation = next.world.nations.find((n) => n.key === crisis.nation);
  const after = deEscalateCrisis(
    crisis,
    next.turnNumber,
    Boolean(heldNation?.embassy && heldNation.embassyTier === 'high_commission'),
  );
  next.crises = next.crises.map((c) => (c.id === id ? after : c));
  next.approval = clampApproval(next.approval + DEESCALATION_APPROVAL);

  log(entries, {
    kind: 'approval',
    label: `${findNation(crisis.nation).name}: stepping back`,
    delta: DEESCALATION_APPROVAL,
    cause:
      'The cost of backing down arrives immediately and in public, and the cost of not ' +
      'backing down arrives later and is paid by somebody else. That asymmetry is why this ' +
      'is rare rather than why it is wrong.',
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Settle it.
 *
 * The terms are not negotiated. They are what the balance of force and the
 * remaining resolve produce, and both of those were set by budgets passed
 * years ago. A government that wants better terms needed a better position,
 * and needed it before the crisis started.
 */
function handleSettleCrisis(state: GameState, id: string): IntentResult {
  const crisis = state.crises.find((c) => c.id === id);
  if (!crisis) return reject(state, 'There is no such crisis.');
  if (crisis.stage === 'settled') return reject(state, 'That one is over.');
  if (state.politicalCapital < SETTLE_PC_COST) {
    return reject(state, 'Not enough political capital to sign anything.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, SETTLE_PC_COST);

  const outcome = settleCrisis(crisis, next.military, next.world, next.turnNumber);
  next.crises = next.crises.map((c) => (c.id === id ? outcome.crisis : c));
  next.approval = clampApproval(next.approval + outcome.approval);
  next.world = {
    ...next.world,
    nations: next.world.nations.map((n) =>
      n.key === crisis.nation
        ? { ...n, relations: clampRelations(n.relations + (outcome.terms === 'even' ? 10 : 4)) }
        : n,
    ),
    tension: clamp01to100(next.world.tension - 8),
  };

  log(entries, {
    kind: 'approval',
    label: `Settlement with ${findNation(crisis.nation).name}`,
    delta: outcome.approval,
    cause:
      outcome.terms === 'favourable'
        ? 'Terms this government can live with, produced by a position it inherited or built ' +
          'rather than by anything said this week.'
        : outcome.terms === 'even'
          ? 'Nobody got what they wanted, which is what most settlements are and what almost ' +
            'none of them are described as.'
          : 'Worse terms than were available a year ago. The position was decided by budgets ' +
            'and this is the bill for them.',
    unit: 'pts',
  });
  return ok(next);
}


/* ------------------------------------------------------------------ *
 * The agencies
 * ------------------------------------------------------------------ */

/**
 * Ask a question nobody can fully answer.
 *
 * The estimate that comes back is the truth plus noise, and the confidence
 * on it is a judgement about the noise rather than about this particular
 * answer. Nobody is lying. The process worked. The number can still be
 * wrong, and there is nothing on the paper that says which case this is.
 */
function handleCommissionAssessment(
  state: GameState,
  subject: AssessmentSubject,
  nation: NationKey,
): IntentResult {
  const template = findSubject(subject);
  if (!state.world.nations.some((n) => n.key === nation)) return reject(state, 'No such country.');
  if (state.politicalCapital < template.cost) {
    return reject(state, `An assessment of that costs ${template.cost} PC.`);
  }

  const recent = state.intelligence.assessments.find(
    (a) => a.nation === nation && a.subject === subject && absoluteWeek(state) - a.turn < months(3),
  );
  if (recent) {
    return reject(
      state,
      'The agencies reported on that within the quarter. Asking again produces the same ' +
        'paper with a different date on it.',
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, template.cost);

  const rng = new Rng(next.rngState);
  const assessment = assess(
    subject,
    nation,
    next.intelligence,
    next.world,
    next.military,
    next.crises,
    absoluteWeek(next),
    rng,
  );
  next.rngState = rng.state;
  next.intelligence = {
    ...next.intelligence,
    assessments: [...next.intelligence.assessments, assessment],
  };

  log(entries, {
    kind: 'note',
    label: `${template.name}: ${findNation(nation).name}`,
    delta: assessment.estimate,
    cause:
      `${template.question} The assessment puts it at ${assessment.estimate.toFixed(0)} of 100, ` +
      `at ${assessment.confidence} confidence. What the confidence describes is the spread, ` +
      'not this answer.',
    unit: '',
  });
  return ok(next);
}

/**
 * Do something quietly.
 *
 * Deniable, which is a description of a period of time rather than of the
 * operation. The exposure risk is fixed at launch under this week's
 * conditions, so an operation authorised by a careless government surfaces
 * under a careful one — and it is the careful one that pays.
 */
function handleLaunchOperation(
  state: GameState,
  key: OperationKey,
  nation: NationKey,
): IntentResult {
  let template;
  try {
    template = findOperation(key);
  } catch {
    return reject(state, 'No such operation.');
  }
  if (!state.world.nations.some((n) => n.key === nation)) return reject(state, 'No such country.');
  if (state.politicalCapital < template.cost) {
    return reject(state, `That operation costs ${template.cost} PC to authorise.`);
  }
  if (
    state.intelligence.operations.some(
      (o) => o.kind === key && o.nation === nation && o.status === 'running',
    )
  ) {
    return reject(state, 'That is already running there.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, template.cost);
  next.intelligence = launch(next.intelligence, key, nation, absoluteWeek(next));

  const odds = operationOdds(key, next.intelligence);
  log(entries, {
    kind: 'note',
    label: `${template.name} authorised — ${findNation(nation).name}`,
    delta: 0,
    cause:
      `${template.purpose} About ${Math.round(odds.success * 100)}% to work and ` +
      `${Math.round(odds.exposure * 100)}% to surface, and the second of those is fixed now ` +
      'rather than when it lands.',
    unit: '',
    informational: true,
  });
  return ok(next);
}

/**
 * Point the collection somewhere.
 *
 * A country that spent a decade on signals and is now asked about
 * intentions has bought the wrong thing, and cannot fix it inside a term —
 * which is why this is a decision rather than a dial.
 */
function handleSetCollection(
  state: GameState,
  human: number,
  signals: number,
  analysis: number,
): IntentResult {
  const total = human + signals + analysis;
  if (![human, signals, analysis].every((x) => Number.isFinite(x) && x >= 0)) {
    return reject(state, 'A collection posture is three shares of one budget.');
  }
  if (Math.abs(total - 1) > 0.02) {
    return reject(state, 'The three shares have to add to the whole of it.');
  }
  if (state.politicalCapital < POSTURE_PC_COST) {
    return reject(state, 'Not enough political capital to reshape the agencies.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, POSTURE_PC_COST);
  next.intelligence = { ...next.intelligence, posture: { human, signals, analysis } };

  log(entries, {
    kind: 'note',
    label: 'Collection re-pointed',
    delta: 0,
    cause:
      `${Math.round(human * 100)}% on people, ${Math.round(signals * 100)}% on signals, ` +
      `${Math.round(analysis * 100)}% on working out what it means. The last of those is the ` +
      'one that gets cut and the one that decides whether any of the rest was worth having.',
    unit: '',
  });
  return ok(next);
}

/**
 * Move up or down the surveillance ladder.
 *
 * The only lever in this system with a constituency on both sides, which is
 * why it is the one that ends governments. It genuinely does reduce what
 * goes wrong at home — a model that pretended otherwise would be arguing
 * rather than simulating — and it genuinely does cost the country something
 * that is not measured here.
 */
function handleSetSurveillance(state: GameState, level: number): IntentResult {
  let template;
  try {
    template = findPower(level);
  } catch {
    return reject(state, 'No such powers.');
  }
  if (state.intelligence.powers === level) {
    return reject(state, 'Those are the powers already in force.');
  }

  const rising = level > state.intelligence.powers;
  const cost = rising ? template.cost : Math.round(template.cost * 0.4);
  if (state.politicalCapital < cost) {
    return reject(state, `Legislating that costs ${cost} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, cost);
  next.intelligence = { ...next.intelligence, powers: level };
  /* Repealing gives back most of what taking them cost, but not all: the
     argument was had in public and the public remembers having it. */
  const approval = rising
    ? template.approval
    : Math.abs(findPower(state.intelligence.powers).approval) * 0.7;
  next.approval = clampApproval(next.approval + approval);

  log(entries, {
    kind: 'approval',
    label: template.name,
    delta: approval,
    cause: rising
      ? `${template.blurb} It will reduce what goes wrong at home, measurably, and the ` +
        `objection from ${template.objectors.length} parts of the electorate does not go away ` +
        'because the government won the vote.'
      : 'Powers given back. Cheaper than taking them, and the argument was had in public.',
    unit: 'pts',
  });
  return ok(next);
}

/**
 * Decide how closely the agencies are watched.
 *
 * Both directions have a real argument. An agency nobody is watching is
 * harder to catch, which is genuinely useful; and it is also the one that
 * eventually does something nobody asked for, under a government that will
 * have to explain it.
 */
function handleSetOversight(state: GameState, level: number): IntentResult {
  if (!Number.isFinite(level) || level < 0 || level > 100) {
    return reject(state, 'Oversight runs from none to complete.');
  }
  if (Math.abs(state.intelligence.oversight - level) < 1) {
    return reject(state, 'That is the regime already in force.');
  }
  if (state.politicalCapital < OVERSIGHT_PC_COST) {
    return reject(state, 'Not enough political capital to change the oversight regime.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, OVERSIGHT_PC_COST);
  const tightening = level > next.intelligence.oversight;
  next.intelligence = { ...next.intelligence, oversight: level };

  log(entries, {
    kind: 'note',
    label: tightening ? 'Oversight tightened' : 'Oversight relaxed',
    delta: level - state.intelligence.oversight,
    cause: tightening
      ? 'Operations become easier to catch, and the thing that ends governments becomes less ' +
        'likely. Both halves of that are true at once.'
      : 'Operations become harder to catch, which is a real advantage, and the agencies ' +
        'become more likely to do something nobody asked for, which is a real cost. Nobody ' +
        'gets to have only one of those.',
    unit: 'pts',
  });
  return ok(next);
}


/**
 * Do something about a thing that started somewhere else.
 *
 * Most global events offer no response at all, deliberately: a government
 * that could act on everything would be governing a world that revolved
 * around it. Where a response exists it is partial — it takes about half of
 * the effect off and never all of it, because acting late on something that
 * started somewhere else rarely works twice.
 */
function handleRespondGlobally(state: GameState, key: string): IntentResult {
  let template;
  try {
    template = findGlobalEvent(key);
  } catch {
    return reject(state, 'Nothing by that name is happening.');
  }
  if (!template.response) {
    return reject(
      state,
      `There is nothing a government here can do about ${template.headline.toLowerCase()}. ` +
        'That is not a gap in the options; it is the position the country is in.',
    );
  }

  const event = state.world.globalEvents.find((e) => e.key === key && !e.ended);
  if (!event) return reject(state, 'That is over, or has not happened.');
  if (event.respondedTurn !== null) return reject(state, 'That has already been done.');

  const cost = template.response.cost || GLOBAL_RESPONSE_PC_DEFAULT;
  if (state.politicalCapital < cost) {
    return reject(state, `${template.response.label} costs ${cost} PC.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, cost);
  next.world = {
    ...next.world,
    globalEvents: next.world.globalEvents.map((e) =>
      e.key === key && !e.ended ? { ...e, respondedTurn: absoluteWeek(next) } : e,
    ),
  };

  log(entries, {
    kind: 'note',
    label: template.response.label,
    delta: -cost,
    cause: `${template.response.blurb} It takes about half of it off, and never all of it.`,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Set what share of full upkeep the country is paying.
 *
 * The most consequential dial in the game that nobody will ever thank a
 * government for setting correctly. Below one, money is freed for things
 * people can see, and the work not done is owed at more than it was avoided
 * for. It costs nothing for about four years.
 */
function handleSetMaintenance(state: GameState, level: number): IntentResult {
  if (state.phase !== 'budget') return reject(state, 'Maintenance is set at the budget.');
  if (!Number.isFinite(level) || level < 0 || level > MAINTENANCE_LEVEL_MAX) {
    return reject(state, `Maintenance runs from 0 to ${MAINTENANCE_LEVEL_MAX}× full upkeep.`);
  }
  const next = clone(state);
  next.infrastructure.maintenanceLevel = Math.round(level * 100) / 100;
  return ok(next);
}

/**
 * Commission something.
 *
 * Costs political capital to start and years to finish. Most of these open
 * under a government that did not commission them, which is the honest
 * reason so little gets built: the credit goes to whoever cuts the ribbon.
 */
function handleStartProject(
  state: GameState,
  asset: InfrastructureKey,
  units: number,
): IntentResult {
  if (state.phase !== 'budget') return reject(state, 'Projects are commissioned at the budget.');
  if (!canStartProject(state.infrastructure)) {
    return reject(state, `Only ${MAX_ACTIVE_PROJECTS} projects can be under way at once.`);
  }
  if (!Number.isFinite(units) || units < 1 || units > 40) {
    return reject(state, 'A project builds between 1 and 40 units of capacity.');
  }
  if (state.politicalCapital < PROJECT_PC_COST) {
    return reject(state, 'Not enough political capital to commission a project.');
  }

  const template = findInfrastructure(asset);
  const next = clone(state);
  spendPc(next, PROJECT_PC_COST);
  next.infrastructure.projects = [
    ...next.infrastructure.projects,
    commission(template, Math.round(units), next.turnNumber, next.termNumber, next.moneyScale),
  ];
  return ok(next);
}

/**
 * Stop building something.
 *
 * The money already spent is gone — that is what makes cancelling a capital
 * project such a bad decision and such a common one. Nothing is refunded and
 * no capacity arrives.
 */
function handleCancelProject(state: GameState, projectId: string): IntentResult {
  const project = state.infrastructure.projects.find((p) => p.id === projectId);
  if (!project) return reject(state, 'No such project.');

  const next = clone(state);
  next.infrastructure.projects = next.infrastructure.projects.filter((p) => p.id !== projectId);
  return ok(next);
}

/**
 * Change a rate.
 *
 * Costs political capital, because a rate change is legislation. The revenue
 * arrives immediately and the resentment decays over eighteen months, which
 * makes raising something unpopular at the start of a term and letting it
 * cool before the election a genuine strategy — a cynical one, and the game
 * permits it rather than pretending it does not work.
 */
function handleSetTaxRate(state: GameState, tax: TaxKey, rate: number): IntentResult {
  if (state.phase !== 'budget' && state.phase !== 'agenda') {
    return reject(state, 'Rates are set at the budget or legislated on the floor.');
  }
  const template = findTaxTemplate(tax);
  if (!Number.isFinite(rate) || rate < 0 || rate > template.maxRate) {
    return reject(
      state,
      `${template.name} must be between 0% and ${(template.maxRate * 100).toFixed(0)}%.`,
    );
  }

  const current = state.taxes.rates[tax];
  const next = clone(state);
  const rounded = Math.round(rate * 10000) / 10000;
  if (Math.abs(rounded - current) < 1e-9) return ok(next);

  if (next.politicalCapital < TAX_CHANGE_PC_COST) {
    return reject(state, 'Not enough political capital to legislate a rate change.');
  }
  spendPc(next, TAX_CHANGE_PC_COST);
  next.taxes = recordChange(
    { ...next.taxes, rates: { ...next.taxes.rates, [tax]: rounded } },
    tax,
    current,
    rounded,
    next.turnNumber,
  );
  return ok(next);
}

/**
 * Change who the income tax falls on, without changing how much it raises.
 *
 * Progressivity moves burden between the top and the bottom and collects the
 * same total either way. Deductions and credits do cost money — the first is
 * worth most to whoever has the most to deduct, the second is paid straight
 * back out to the people with the least. Keeping the three separate means a
 * government has to say which one it is doing.
 */
function handleSetTaxDial(
  state: GameState,
  dial: 'progressivity' | 'deductions' | 'credits',
  value: number,
): IntentResult {
  if (state.phase !== 'budget') return reject(state, 'The income tax is shaped at the budget.');
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return reject(state, 'That dial runs from 0 to 1.');
  }
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - state.taxes[dial]) < 1e-9) return ok(clone(state));
  if (state.politicalCapital < TAX_CHANGE_PC_COST) {
    return reject(state, 'Not enough political capital to reshape the income tax.');
  }

  const next = clone(state);
  spendPc(next, TAX_CHANGE_PC_COST);
  next.taxes = { ...next.taxes, [dial]: rounded };
  return ok(next);
}

/**
 * Bind your own hands.
 *
 * A fiscal rule costs political capital to adopt and buys a cheaper cost of
 * borrowing — but only after a year of actually keeping it, because the
 * market prices behaviour rather than announcements. It is the one lever in
 * the game whose entire payoff arrives after the election that could remove
 * the government that pulled it.
 */
function handleAdoptFiscalRule(
  state: GameState,
  kind: FiscalRuleKind,
  threshold: number,
): IntentResult {
  if (state.phase !== 'budget' && state.phase !== 'agenda') {
    return reject(state, 'A fiscal rule is adopted at the budget or on the floor.');
  }
  if (state.finance.rules.some((r) => r.kind === kind)) {
    return reject(state, `A ${FISCAL_RULE_LABELS[kind].toLowerCase()} is already in force.`);
  }
  if (state.politicalCapital < FISCAL_RULE_PC_COST) {
    return reject(state, 'Not enough political capital to legislate a fiscal rule.');
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return reject(state, 'A rule needs a number in it.');
  }

  const next = clone(state);
  spendPc(next, FISCAL_RULE_PC_COST);
  next.finance.rules = [
    ...next.finance.rules,
    { kind, threshold, adoptedTurn: next.turnNumber, breachTurns: 0, complianceTurns: 0 },
  ];
  return ok(next);
}

/**
 * Untie them again.
 *
 * Cheaper than adopting the rule was, which is the trap: the cheap way out
 * of a binding constraint is always to abolish it rather than to meet it.
 * What it costs instead is credibility — every month of compliance the rule
 * had banked with lenders goes with it, and the next rule starts from zero.
 */
function handleRepealFiscalRule(state: GameState, kind: FiscalRuleKind): IntentResult {
  if (state.phase !== 'budget' && state.phase !== 'agenda') {
    return reject(state, 'A fiscal rule is repealed at the budget or on the floor.');
  }
  if (!state.finance.rules.some((r) => r.kind === kind)) {
    return reject(state, 'No such rule is in force.');
  }
  if (state.politicalCapital < FISCAL_RULE_REPEAL_PC_COST) {
    return reject(state, 'Not enough political capital to repeal a fiscal rule.');
  }

  const next = clone(state);
  spendPc(next, FISCAL_RULE_REPEAL_PC_COST);
  next.finance.rules = next.finance.rules.filter((r) => r.kind !== kind);
  return ok(next);
}

/**
 * Set the standing payment into the sovereign fund.
 *
 * The fund returns more than the debt costs, so paying into it is correct on
 * a long horizon and wrong on a short one. A government that funds it is
 * handing a stronger position to whoever wins the election it may well lose
 * for having funded it.
 */
function handleReserveContribution(state: GameState, amount: number): IntentResult {
  if (state.phase !== 'budget') {
    return reject(state, 'The reserve contribution is set at the budget.');
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > RESERVE_CONTRIBUTION_MAX) {
    return reject(state, `The contribution must be between ₡0bn and ₡${RESERVE_CONTRIBUTION_MAX}bn.`);
  }
  if (
    amount !== state.finance.reserveContribution &&
    state.politicalCapital < RESERVE_CONTRIBUTION_PC_COST
  ) {
    return reject(state, 'Not enough political capital to change the contribution.');
  }

  const next = clone(state);
  if (amount !== next.finance.reserveContribution) spendPc(next, RESERVE_CONTRIBUTION_PC_COST);
  next.finance.reserveContribution = Math.round(amount * 10) / 10;
  return ok(next);
}

/**
 * Release money from the emergency fund.
 *
 * Free to draw and slow to refill — it tops up only out of surplus, and only
 * a sixth of one. The honest failure mode this is built around is arriving at
 * the second crisis with the fund emptied by the first.
 */
function handleDrawEmergencyFund(state: GameState, amount: number): IntentResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return reject(state, 'Nothing to draw.');
  }
  if (amount > state.finance.emergencyFund) {
    return reject(
      state,
      `The emergency fund holds ₡${state.finance.emergencyFund.toFixed(0)}bn.`,
    );
  }

  const next = clone(state);
  const drawn = Math.round(amount * 10) / 10;
  next.finance.emergencyFund -= drawn;
  next.treasury += drawn;
  return ok(next);
}

function handleEarlyElection(state: GameState): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'An election is called during the agenda.');
  if (state.politicalCapital < PC_COSTS.callEarlyElection) {
    return reject(state, 'Not enough political capital to call an election.');
  }
  const next = clone(state);
  spendPc(next, PC_COSTS.callEarlyElection);
  return ok(runElection(next));
}

function handleRetire(state: GameState): IntentResult {
  const next = clone(state);
  next.status = 'retired';
  next.phase = 'career_summary';
  return ok(next);
}

function handleCampaignStop(state: GameState, regionId: string): IntentResult {
  if (state.phase !== 'agenda' || !isCampaignTurn(state.turnNumber)) {
    return reject(state, 'Campaign stops are only available during the campaign.');
  }
  if (state.politicalCapital < PC_COSTS.campaignStop) {
    return reject(state, 'Not enough political capital for a campaign stop.');
  }
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.campaignStop);
  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += CAMPAIGN_STOP_INVESTMENT;
  if (next.campaign) next.campaign.stopsMade += 1;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.campaignStop,
    cause: `Campaign stop in ${target.name}`,
    unit: 'PC',
  });
  return ok(next);
}

function handleAdBuy(state: GameState, regionId: string): IntentResult {
  if (state.phase !== 'agenda' || !isCampaignTurn(state.turnNumber)) {
    return reject(state, 'Advertising is only available during the campaign.');
  }
  if (state.politicalCapital < PC_COSTS.adBuy) {
    return reject(state, 'Not enough political capital for an advertising push.');
  }
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');

  /*
   * Paid for out of PARTY funds, not the national treasury. A governing party
   * billing the state for its own election advertising would be a scandal,
   * not a strategy — and it is the reason the party needs money of its own.
   */
  if (state.partyInternals.funds < AD_BUY_PARTY_COST) {
    return reject(state, `The party has only ₡${state.partyInternals.funds.toFixed(1)}m left. Raise more before buying advertising.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.adBuy);
  next.partyInternals.funds -= AD_BUY_PARTY_COST;
  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += AD_BUY_INVESTMENT;
  if (next.campaign) next.campaign.adBuys += 1;

  log(entries, {
    kind: 'note',
    label: 'Party funds',
    delta: -AD_BUY_PARTY_COST,
    cause: `Advertising in ${target.name}, paid for by the party`,
    unit: '₡m',
  });
  return ok(next);
}

function handleDebate(
  state: GameState,
  debateId: string,
  choiceIndex: number,
): IntentResult {
  if (!state.campaign) return reject(state, 'There is no campaign under way.');
  const debate = state.campaign.debates.find((d) => d.id === debateId);
  if (!debate) return reject(state, 'No such debate.');
  if (debate.chosenIndex !== null) return reject(state, 'That exchange is already answered.');
  const response = debate.responses[choiceIndex];
  if (!response) return reject(state, 'No such response.');

  const next = clone(state);
  const entries = currentLog(next);
  const target = next.campaign!.debates.find((d) => d.id === debateId)!;

  /* Quality is derived from the state of the run, not from a die roll. */
  const swing = (response.quality - 0.5) * 2 * DEBATE_SWING_PER_WIN;
  target.chosenIndex = choiceIndex;
  target.swing = swing;
  next.campaign!.debateSwing += swing;

  log(entries, {
    kind: 'note',
    label: 'Debate exchange',
    delta: swing * 100,
    cause: `${response.label} — national support moved ${swing >= 0 ? 'up' : 'down'} ${Math.abs(swing * 100).toFixed(1)}%`,
    unit: '%',
  });
  return ok(next);
}


/**
 * Redraw a region's boundaries in your own favour.
 *
 * Legal in Verdana, and never free. The map gets more distorted each time, and
 * the approval penalty scales with total distortion — the first redraw is
 * barely noticed, the fourth is a scandal. Only meaningful under systems that
 * use single-member seats; proportional counting ignores boundaries entirely.
 */
function handleRedraw(state: GameState, regionId: string): IntentResult {
  if (state.phase !== 'agenda') {
    return reject(state, 'Boundary reviews are commissioned during the agenda.');
  }
  if (state.electoralSystem === 'proportional') {
    return reject(
      state,
      'Boundaries do not decide anything under proportional counting. There is nothing to gain.',
    );
  }
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');

  const inRegion = state.districts.filter((d) => d.regionId === regionId);
  if (inRegion.length < 2) {
    return reject(state, 'That region has too few seats for boundaries to matter.');
  }
  if (state.politicalCapital < PC_REDRAW_BOUNDARIES) {
    return reject(state, 'Not enough political capital to commission a boundary review.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_REDRAW_BOUNDARIES);

  const player = playerParty(next.parties);
  const target = next.districts.filter((d) => d.regionId === regionId);
  const result = redrawBoundaries(target, player.ideology, 0.6);

  next.districts = next.districts.map(
    (district) => result.districts.find((d) => d.id === district.id) ?? district,
  );

  /* The cost rises with how far the map has already been bent. */
  const distortion = meanDistortion(next.districts.filter((d) => d.regionId === regionId));
  const penalty = -REDRAW_APPROVAL_PENALTY * distortion;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_REDRAW_BOUNDARIES,
    cause: `Boundary review commissioned in ${region.name}`,
    unit: 'PC',
  });
  applyEffects(
    next,
    { approval: penalty },
    `Boundaries redrawn in ${region.name} — ${result.packed.length} seat conceded, ${result.cracked.length} made competitive. The map there is now ${(distortion * 100).toFixed(0)}% distorted.`,
    entries,
  );

  return ok(next);
}


/* ------------------------- the party itself ------------------------ */

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

function requireAgenda(state: GameState, what: string): string | null {
  return state.phase === 'agenda' ? null : `${what} happen during the agenda.`;
}

/**
 * Address your own members. Shores up the leadership at the cost of time you
 * could have spent on the country.
 */
function handleRallyParty(state: GameState): IntentResult {
  const wrong = requireAgenda(state, 'Party addresses');
  if (wrong) return reject(state, wrong);
  if (state.politicalCapital < PC_COSTS_PARTY.rallyParty) {
    return reject(state, 'Not enough political capital to address the party.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.rallyParty);

  next.partyInternals.authority = clamp100(next.partyInternals.authority + 7);
  next.partyInternals.factions = next.partyInternals.factions.map((faction) => ({
    ...faction,
    loyalty: clamp100(faction.loyalty + 5),
  }));

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PARTY.rallyParty,
    cause: 'Addressed the party membership',
    unit: 'PC',
  });
  log(entries, {
    kind: 'note',
    label: 'Your authority in the party',
    delta: 7,
    cause: 'A direct appeal to the membership over the heads of the factions',
    unit: 'pts',
  });
  return ok(next);
}

/** Raise money for the party. Not for the treasury — this is the party's own. */
function handleFundraising(state: GameState): IntentResult {
  const wrong = requireAgenda(state, 'Fundraising drives');
  if (wrong) return reject(state, wrong);
  if (state.politicalCapital < PC_COSTS_PARTY.fundraisingDrive) {
    return reject(state, 'Not enough political capital for a fundraising drive.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.fundraisingDrive);

  /* Donors give more to a party that looks like winning. */
  const yieldAmount = FUNDRAISING_DRIVE_YIELD * (0.6 + next.approval / 100);
  next.partyInternals.funds += yieldAmount;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PARTY.fundraisingDrive,
    cause: 'Fundraising drive',
    unit: 'PC',
  });
  log(entries, {
    kind: 'note',
    label: 'Party funds',
    delta: yieldAmount,
    cause: `Fundraising drive at ${Math.round(next.approval)}% approval — donors give more to a party that looks like winning`,
    unit: '₡m',
  });
  return ok(next);
}

/**
 * Give a faction the deputy leadership. Buys that wing's loyalty outright and
 * tells every other wing exactly where they stand.
 */
function handleAppointDeputy(state: GameState, factionId: string): IntentResult {
  const wrong = requireAgenda(state, 'Appointments');
  if (wrong) return reject(state, wrong);
  const faction = state.partyInternals.factions.find((f) => f.id === factionId);
  if (!faction) return reject(state, 'No such faction.');
  if (state.partyInternals.deputyFactionId === factionId) {
    return reject(state, 'They already hold the deputy leadership.');
  }
  if (state.politicalCapital < PC_COSTS_PARTY.appointDeputy) {
    return reject(state, 'Not enough political capital to reshape the leadership.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.appointDeputy);

  const previous = next.partyInternals.deputyFactionId;
  next.partyInternals.deputyFactionId = factionId;
  next.partyInternals.factions = next.partyInternals.factions.map((f) => {
    if (f.id === factionId) return { ...f, loyalty: clamp100(f.loyalty + 14) };
    /* Passing anyone over is noticed, and the outgoing deputy notices most. */
    const slight = f.id === previous ? 12 : 4;
    return { ...f, loyalty: clamp100(f.loyalty - slight) };
  });

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PARTY.appointDeputy,
    cause: `${faction.name} given the deputy leadership`,
    unit: 'PC',
  });
  log(entries, {
    kind: 'note',
    label: 'Deputy leadership',
    delta: null,
    cause: `${faction.name} take the deputy leadership. Every other wing has been passed over and knows it.`,
  });
  return ok(next);
}

/**
 * Discipline a rebellious wing. Restores order and earns their resentment —
 * exactly the trade a chief whip makes.
 */
function handleDiscipline(state: GameState, factionId: string): IntentResult {
  const wrong = requireAgenda(state, 'Disciplinary actions');
  if (wrong) return reject(state, wrong);
  const faction = state.partyInternals.factions.find((f) => f.id === factionId);
  if (!faction) return reject(state, 'No such faction.');
  if (state.politicalCapital < PC_COSTS_PARTY.disciplineRebels) {
    return reject(state, 'Not enough political capital to move against them.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.disciplineRebels);

  next.partyInternals.cohesion = clamp100(next.partyInternals.cohesion + 12);
  next.partyInternals.factions = next.partyInternals.factions.map((f) =>
    f.id === factionId
      ? { ...f, loyalty: clamp100(f.loyalty - 15), rebelling: false }
      : { ...f, loyalty: clamp100(f.loyalty + 2) },
  );

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PARTY.disciplineRebels,
    cause: `Whip withdrawn from ${faction.name}`,
    unit: 'PC',
  });
  log(entries, {
    kind: 'note',
    label: 'Party discipline',
    delta: 12,
    cause: `${faction.name} brought to heel. The rest of the party has taken the point; that wing has taken it differently.`,
    unit: 'pts',
  });
  return ok(next);
}

/** Invest party money in the machine that raises party money. */
function handleHeadquarters(state: GameState): IntentResult {
  const wrong = requireAgenda(state, 'Party investments');
  if (wrong) return reject(state, wrong);
  if (state.politicalCapital < PC_COSTS_PARTY.investHeadquarters) {
    return reject(state, 'Not enough political capital.');
  }
  if (state.partyInternals.funds < HEADQUARTERS_COST) {
    return reject(state, `The party cannot afford ₡${HEADQUARTERS_COST}m for that.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.investHeadquarters);
  next.partyInternals.funds -= HEADQUARTERS_COST;
  next.partyInternals.headquarters += 1;

  log(entries, {
    kind: 'note',
    label: 'Party funds',
    delta: -HEADQUARTERS_COST,
    cause: `Headquarters and staff expanded to level ${next.partyInternals.headquarters} — better fundraising, and higher running costs`,
    unit: '₡m',
  });
  return ok(next);
}

function handleRenameParty(state: GameState, name: string): IntentResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return reject(state, 'A party needs a name.');
  if (trimmed.length > 40) return reject(state, 'That name is too long.');

  const next = clone(state);
  const player = playerParty(next.parties);
  player.name = trimmed;
  player.shortName = trimmed.split(' ')[0] ?? trimmed;
  return ok(next);
}


/* --------------------------- procedure ---------------------------- */

/** A bill on the order paper this turn, or a rejection explaining why not. */
function tabledBill(state: GameState, billId: string): Bill | string {
  if (state.phase !== 'agenda') return 'Procedural motions are moved during the agenda.';
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return 'No such bill.';
  if (bill.status !== 'proposed') return 'That bill is not before the house.';
  return bill;
}

/**
 * Send a bill to committee. It misses this month's division and comes back
 * better drafted, less distinctive, and harder to vote against.
 */
function handleSendToCommittee(state: GameState, billId: string): IntentResult {
  const found = tabledBill(state, billId);
  if (typeof found === 'string') return reject(state, found);
  if (state.politicalCapital < PC_COSTS_PROCEDURE.sendToCommittee) {
    return reject(state, 'Not enough political capital to move the referral.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.sendToCommittee);

  const target = next.bills.find((b) => b.id === billId)!;
  target.status = 'in_committee';
  target.committeeReturnsOn = next.turnNumber + 1;

  log(entries, {
    kind: 'legislature',
    label: `${target.title} referred to committee`,
    delta: -PC_COSTS_PROCEDURE.sendToCommittee,
    cause: `It will miss this week's division and return better drafted and less contentious.`,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Amend a bill toward a wing of your own party or a coalition partner.
 *
 * Moves its position toward theirs, which buys their votes — and waters the
 * effects down, which is what an amendment costs. A bill amended three times
 * passes easily and barely does anything.
 */
function handleAmendBill(
  state: GameState,
  billId: string,
  towardFactionId?: string,
  towardPartyId?: string,
): IntentResult {
  const found = tabledBill(state, billId);
  if (typeof found === 'string') return reject(state, found);
  if (state.politicalCapital < PC_COSTS_PROCEDURE.amendBill) {
    return reject(state, 'Not enough political capital to move the amendment.');
  }

  const faction = towardFactionId
    ? state.partyInternals.factions.find((f) => f.id === towardFactionId)
    : undefined;
  const party = towardPartyId
    ? state.parties.find((p) => p.id === towardPartyId && !p.isPlayer)
    : undefined;

  const target = faction?.ideology ?? party?.ideology;
  const towardName = faction?.name ?? party?.name;
  if (!target || !towardName) {
    return reject(state, 'Name the faction or partner the amendment is meant to satisfy.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.amendBill);

  const bill = next.bills.find((b) => b.id === billId)!;
  bill.ideology = {
    economic: bill.ideology.economic + (target.economic - bill.ideology.economic) * AMENDMENT_STRENGTH,
    social: bill.ideology.social + (target.social - bill.ideology.social) * AMENDMENT_STRENGTH,
    environmental:
      bill.ideology.environmental +
      (target.environmental - bill.ideology.environmental) * AMENDMENT_STRENGTH,
  };

  /* Every concession takes something out of the bill. */
  const keep = 1 - AMENDMENT_DILUTION;
  const scale = (value?: number) => (value === undefined ? undefined : value * keep);
  bill.effects = {
    ...bill.effects,
    approval: scale(bill.effects.approval),
    treasury: scale(bill.effects.treasury),
    debt: scale(bill.effects.debt),
    revenueDelta: scale(bill.effects.revenueDelta),
    politicalCapital: scale(bill.effects.politicalCapital),
    sectorDeltas: bill.effects.sectorDeltas
      ? Object.fromEntries(
          Object.entries(bill.effects.sectorDeltas).map(([k, v]) => [k, (v ?? 0) * keep]),
        )
      : undefined,
    fundingDeltas: bill.effects.fundingDeltas
      ? Object.fromEntries(
          Object.entries(bill.effects.fundingDeltas).map(([k, v]) => [k, (v ?? 0) * keep]),
        )
      : undefined,
  };
  bill.amendments += 1;

  log(entries, {
    kind: 'legislature',
    label: `${bill.title} amended`,
    delta: -PC_COSTS_PROCEDURE.amendBill,
    cause: `Moved toward ${towardName} to secure their votes. The bill now does ${(Math.pow(keep, bill.amendments) * 100).toFixed(0)}% of what it originally would have.`,
    unit: 'PC',
  });
  return ok(next);
}

/** Buy a crossbench senator's vote on one bill. */
function handleCrossbenchDeal(state: GameState, billId: string): IntentResult {
  const found = tabledBill(state, billId);
  if (typeof found === 'string') return reject(state, found);
  if (isMoneyBill(found)) {
    return reject(state, 'A money bill does not go to the Senate. There is nothing to buy.');
  }
  if (state.politicalCapital < PC_COSTS_PROCEDURE.crossbenchDeal) {
    return reject(state, 'Not enough political capital for a crossbench arrangement.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.crossbenchDeal);

  const bill = next.bills.find((b) => b.id === billId)!;
  bill.crossbenchDeals += 1;

  log(entries, {
    kind: 'legislature',
    label: `Crossbench arrangement on ${bill.title}`,
    delta: -PC_COSTS_PROCEDURE.crossbenchDeal,
    cause: `Independent senators secured for the division — worth roughly ${(CROSSBENCH_SENATE_BONUS * 100).toFixed(0)}% on its chances in the upper house.`,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Close debate on a bill the opposition is talking out. Expensive, and it
 * costs you something with anyone who thinks the chamber should be allowed to
 * do its job.
 */
function handleCloseDebate(state: GameState, billId: string): IntentResult {
  const found = tabledBill(state, billId);
  if (typeof found === 'string') return reject(state, found);
  if (state.politicalCapital < PC_COSTS_PROCEDURE.closeDebate) {
    return reject(state, 'Not enough political capital to close debate.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.closeDebate);

  const bill = next.bills.find((b) => b.id === billId)!;
  bill.committeeBonus += 0.1;

  log(entries, {
    kind: 'legislature',
    label: `Debate closed on ${bill.title}`,
    delta: -PC_COSTS_PROCEDURE.closeDebate,
    cause: 'The guillotine was moved and carried. The bill reaches a vote; the opposition has its grievance.',
    unit: 'PC',
  });
  applyEffects(next, { approval: -1.2 }, `Closure motion on ${bill.title}`, entries);
  return ok(next);
}

/**
 * Face the chamber at question time.
 *
 * How it goes depends on the record you actually have. A government with
 * something to show for itself does well; one without is simply handing the
 * opposition a stage.
 */
function handleQuestionTime(state: GameState): IntentResult {
  if (state.phase !== 'agenda') {
    return reject(state, 'Question time is taken during the agenda.');
  }
  if (state.politicalCapital < PC_COSTS_PROCEDURE.questionTime) {
    return reject(state, 'Not enough political capital to prepare properly.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.questionTime);

  /* Preparation plus a record to point at. Neither alone is enough. */
  const record = Math.min(1, next.career.billsPassed / 8);
  const standing = next.approval / 100;
  const authority = next.partyInternals.authority / 100;
  const performance = record * 0.4 + standing * 0.35 + authority * 0.25;

  const approvalSwing = (performance - 0.45) * 5;
  const authoritySwing = (performance - 0.45) * 8;

  next.partyInternals.authority = Math.max(
    0,
    Math.min(100, next.partyInternals.authority + authoritySwing),
  );

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PROCEDURE.questionTime,
    cause: 'Question time',
    unit: 'PC',
  });
  applyEffects(
    next,
    { approval: approvalSwing },
    performance > 0.6
      ? 'Question time — you had a record to point at and pointed at it'
      : performance > 0.42
        ? 'Question time — a competent, forgettable performance'
        : 'Question time — the opposition had the better of it, because the figures were on their side',
    entries,
  );
  log(entries, {
    kind: 'note',
    label: 'Your authority in the party',
    delta: authoritySwing,
    cause: 'Your own benches watched how that went',
    unit: 'pts',
  });
  return ok(next);
}


/* ----------------------- the life of a law ------------------------ */

/**
 * Repeal a law already on the books.
 *
 * Unwinds the standing arrangements — funding lines and recurring revenue —
 * but not the one-off money already spent or the improvement a service
 * actually accumulated while it was funded. Repeal is cheaper than never
 * having passed it, and more expensive than it looks.
 */
function handleRepeal(state: GameState, billId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Repeals are moved during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'passed') return reject(state, 'That law is not on the books.');
  if (state.politicalCapital < PC_COSTS_POLICY.repealBill) {
    return reject(state, 'Not enough political capital to move a repeal.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_POLICY.repealBill);

  const target = next.bills.find((b) => b.id === billId)!;
  if (target.inEffect) {
    applyEffects(next, reverseEffects(target.effects), `${target.title} repealed`, entries);
  }
  target.status = 'available';
  target.inEffect = false;
  target.takesEffectOn = null;
  target.lapsesOn = null;
  target.amendments = 0;
  target.committeeBonus = 0;

  log(entries, {
    kind: 'legislature',
    label: `${target.title} repealed`,
    delta: -PC_COSTS_POLICY.repealBill,
    cause:
      'The standing arrangements are unwound. The money already spent stays spent, and so does the goodwill.',
    unit: 'PC',
  });
  return ok(next);
}

/** Renew a law about to lapse under its sunset clause. */
function handleRenewSunset(state: GameState, billId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Renewals are moved during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'passed' || !bill.lapsesOn) {
    return reject(state, 'That law has no sunset clause to renew.');
  }
  if (state.politicalCapital < PC_COSTS_POLICY.renewSunset) {
    return reject(state, 'Not enough political capital to move the renewal.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_POLICY.renewSunset);

  const target = next.bills.find((b) => b.id === billId)!;
  target.lapsesOn = next.turnNumber + SUNSET_DEFAULT_TURNS;

  log(entries, {
    kind: 'legislature',
    label: `${target.title} renewed`,
    delta: -PC_COSTS_POLICY.renewSunset,
    cause: `Extended to week ${target.lapsesOn}. It will need renewing again.`,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Govern by decree.
 *
 * Immediate, needs no vote, and cannot spend money — an order can direct, not
 * appropriate. It costs standing precisely because it is an admission that the
 * argument could not be won, and each one in a term costs more than the last.
 */
function handleExecutiveOrder(state: GameState, billId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Orders are issued during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'available') {
    return reject(state, 'There is nothing to enact by order.');
  }
  if (state.politicalCapital < PC_COSTS_POLICY.executiveOrder) {
    return reject(state, 'Not enough political capital to govern by decree.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_POLICY.executiveOrder);

  const target = next.bills.find((b) => b.id === billId)!;
  const cost = executiveOrderCost(next.executiveOrdersThisTerm);
  next.executiveOrdersThisTerm += 1;

  target.status = 'passed';
  target.inEffect = true;
  target.turnResolved = next.turnNumber;
  target.takesEffectOn = next.turnNumber;
  next.career.billsPassed += 1;

  applyEffects(next, decreeEffects(target.effects), `${target.title} enacted by order`, entries);
  applyEffects(
    next,
    { approval: cost },
    `Governing by decree (${next.executiveOrdersThisTerm} order${next.executiveOrdersThisTerm === 1 ? '' : 's'} this term) — a government that legislates without a vote is telling the country it cannot win the argument`,
    entries,
  );
  return ok(next);
}

/**
 * Put a question to the country.
 *
 * The electorate decides it, not the government. Losing a referendum you
 * called yourself is worse than never having asked.
 */
function handleReferendum(state: GameState, questionId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Referendums are called during the agenda.');
  const question = REFERENDUM_TEMPLATES.find((q) => q.id === questionId);
  if (!question) return reject(state, 'No such question.');
  if (state.referendums.some((r) => r.question === question.question)) {
    return reject(state, 'That question has already been put to the country.');
  }
  if (state.politicalCapital < PC_COSTS_POLICY.callReferendum) {
    return reject(state, 'Not enough political capital to call a referendum.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_POLICY.callReferendum);

  const scores = computeIssueScores(
    next.sectors,
    next.debt,
    next.revenueModifier,
    next.economy,
    next.taxes,
    next.debtTolerance,
  );
  const result = runReferendum(question, next.regions, scores);

  next.referendums.push({
    termNumber: next.termNumber,
    question: result.question,
    yesShare: result.yesShare,
    turnout: result.turnout,
    passed: result.passed,
  });

  log(entries, {
    kind: 'note',
    label: result.passed ? 'Referendum carried' : 'Referendum defeated',
    delta: result.yesShare * 100,
    cause: `"${result.question}" — Yes ${(result.yesShare * 100).toFixed(1)}% on a turnout of ${(result.turnout * 100).toFixed(0)}%.`,
    unit: '% yes',
  });

  if (result.passed) {
    applyEffects(next, question.effects, `Referendum carried: ${result.question}`, entries);
    applyEffects(next, { approval: 2.5 }, 'Winning a referendum you called', entries);
  } else {
    applyEffects(
      next,
      { approval: -6 },
      'Losing a referendum you called yourself — worse than never having asked',
      entries,
    );
    next.partyInternals.authority = Math.max(0, next.partyInternals.authority - 10);
  }

  return ok(next);
}

/**
 * Commit to a manifesto.
 *
 * A promise kept is worth something; a promise broken is worth more, in the
 * wrong direction. Promising less is often the stronger play.
 */
function handleManifesto(state: GameState, billKeys: string[]): IntentResult {
  if (state.promises.some((p) => p.status === 'outstanding' && p.termMade === state.termNumber)) {
    return reject(state, 'This term’s manifesto is already published.');
  }
  if (billKeys.length === 0) return reject(state, 'A manifesto needs at least one commitment.');
  if (billKeys.length > MANIFESTO_SIZE) {
    return reject(state, `A manifesto may carry at most ${MANIFESTO_SIZE} commitments.`);
  }

  const next = clone(state);
  const entries = currentLog(next);

  for (const key of billKeys) {
    const bill = next.bills.find((b) => b.templateKey === key);
    if (!bill) continue;
    next.promises.push({
      id: `promise-${next.termNumber}-${key}`,
      billKey: key,
      title: bill.title,
      termMade: next.termNumber,
      status: 'outstanding',
    });
  }

  log(entries, {
    kind: 'note',
    label: 'Manifesto published',
    delta: null,
    cause: `${billKeys.length} commitment${billKeys.length === 1 ? '' : 's'} for this term. Keeping them is worth something; breaking them is worth more, the other way.`,
  });
  return ok(next);
}


/* ------------------------- campaign media -------------------------- */

function requireCampaign(state: GameState): string | null {
  if (state.phase !== 'agenda') return 'Campaigning happens during the agenda.';
  if (!isCampaignTurn(state.turnNumber)) return 'The campaign has not begun yet.';
  if (!state.campaign) return 'There is no campaign under way.';
  return null;
}

/**
 * Buy a push on one channel.
 *
 * Channels reach different people, which is the whole reason to model them
 * separately: television lands with retirees and never reaches students,
 * social platforms do the reverse, and door knocking reaches the people least
 * likely to vote at all — but costs volunteers rather than money, so only a
 * party with members can run one.
 */
function handleChannelPush(state: GameState, channel: ChannelKey): IntentResult {
  const wrong = requireCampaign(state);
  if (wrong) return reject(state, wrong);

  const template = channelTemplate(channel);
  if (state.politicalCapital < template.pcCost) {
    return reject(state, 'Not enough political capital for that.');
  }
  if (state.partyInternals.funds < template.cost) {
    return reject(state, `The party cannot afford ₡${template.cost}m for ${template.label}.`);
  }

  if (template.requiresVolunteers) {
    const available = availableVolunteerPushes(
      state.partyInternals.members,
      state.campaign!.volunteerPushesUsed,
    );
    if (available <= 0) {
      return reject(
        state,
        'Your members are already out as far as they will go. Door knocking needs volunteers, and you have run out.',
      );
    }
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, template.pcCost);
  next.partyInternals.funds -= template.cost;

  const campaign = next.campaign!;
  campaign.reach = applyChannelPush(campaign.reach, channel);
  campaign.channelPushes[channel] = (campaign.channelPushes[channel] ?? 0) + 1;
  if (template.requiresVolunteers) campaign.volunteerPushesUsed += 1;

  const reached = Object.entries(template.reach)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([key]) => key.replace(/_/g, ' '))
    .join(', ');

  log(entries, {
    kind: 'note',
    label: `${template.label} campaign`,
    delta: -template.cost,
    cause: `Reaches ${reached} most of all. ${template.persuasion >= 1 ? 'Changes minds' : 'Mobilises more than it persuades'}.`,
    unit: '₡m',
  });
  return ok(next);
}

/**
 * Commission a poll.
 *
 * The player never sees the true figure. Each poll is a sample with a real
 * margin of error, so two polls the same week can disagree — which is what
 * polls actually do, and why running a campaign off them is treacherous.
 */
function handlePoll(state: GameState, quality: PollQuality): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Polls are commissioned during the agenda.');
  const cost =
    quality === 'large'
      ? PC_COSTS_MEDIA.pollLarge
      : quality === 'standard'
        ? PC_COSTS_MEDIA.pollStandard
        : PC_COSTS_MEDIA.pollSmall;
  if (state.politicalCapital < cost) return reject(state, 'Not enough political capital.');

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, cost);

  const rng = new Rng(next.rngState);
  const scores = computeIssueScores(
    next.sectors,
    next.debt,
    next.revenueModifier,
    next.economy,
    next.taxes,
    next.debtTolerance,
  );
  const player = playerParty(next.parties);
  const truth = trueNationalShares(next.regions, next.parties, {
    scores,
    incumbentId: player.id,
    segmentPersuasion: next.campaign
      ? persuasionBySegment(next.campaign.reach)
      : undefined,
  });
  const poll = conductPoll(truth, quality, rng);
  next.rngState = rng.state;

  if (next.campaign) {
    next.campaign.polls.push({
      turnNumber: next.turnNumber,
      quality,
      shares: poll.shares,
      marginOfError: poll.marginOfError,
    });
  }

  log(entries, {
    kind: 'note',
    label: `Poll commissioned (${quality})`,
    delta: (poll.shares[player.id] ?? 0) * 100,
    cause: `Sample of ${poll.sampleSize}, margin of error ±${poll.marginOfError.toFixed(1)} points. Your share is within that band of the truth, not on it.`,
    unit: '%',
  });
  return ok(next);
}

/** A rally: loud, regional, and better at turnout than at persuasion. */
function handleRally(state: GameState, regionId: string): IntentResult {
  const wrong = requireCampaign(state);
  if (wrong) return reject(state, wrong);
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');
  if (state.politicalCapital < PC_COSTS_MEDIA.rally) {
    return reject(state, 'Not enough political capital for a rally.');
  }
  if (state.partyInternals.funds < RALLY_COST) {
    return reject(state, `The party cannot afford ₡${RALLY_COST}m for a rally.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_MEDIA.rally);
  next.partyInternals.funds -= RALLY_COST;

  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += 1.6;
  next.campaign!.rallies += 1;
  /* Rallies fire up the people already with you. */
  next.partyInternals.cohesion = Math.min(100, next.partyInternals.cohesion + 3);

  log(entries, {
    kind: 'note',
    label: `Rally in ${target.name}`,
    delta: -RALLY_COST,
    cause: 'Turnout and enthusiasm among people already minded to vote for you. It persuades nobody new.',
    unit: '₡m',
  });
  return ok(next);
}

/** A town hall: small, awkward, and unusually good at moving the undecided. */
function handleTownHall(state: GameState, regionId: string): IntentResult {
  const wrong = requireCampaign(state);
  if (wrong) return reject(state, wrong);
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');
  if (state.politicalCapital < PC_COSTS_MEDIA.townHall) {
    return reject(state, 'Not enough political capital.');
  }
  if (state.partyInternals.funds < TOWN_HALL_COST) {
    return reject(state, 'The party cannot afford that.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_MEDIA.townHall);
  next.partyInternals.funds -= TOWN_HALL_COST;

  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += 0.9;
  next.campaign!.townHalls += 1;

  /* Facing hostile questions in public is worth something, if it goes well. */
  const performance = next.approval / 100 + next.partyInternals.authority / 200;
  applyEffects(
    next,
    { approval: (performance - 0.55) * 3 },
    `Town hall in ${target.name} — a small room, unscripted questions, and no way to avoid the difficult one`,
    entries,
  );
  return ok(next);
}

/**
 * A press conference. Cheap, immediate, and you do not choose the questions —
 * so it rewards a government with answers and punishes one without.
 */
function handlePressConference(state: GameState): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Press conferences are held during the agenda.');
  if (state.politicalCapital < PC_COSTS_MEDIA.pressConference) {
    return reject(state, 'Not enough political capital.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_MEDIA.pressConference);

  /* What the room asks about is whatever is going worst. */
  const scores = computeIssueScores(
    next.sectors,
    next.debt,
    next.revenueModifier,
    next.economy,
    next.taxes,
    next.debtTolerance,
  );
  const worst = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
  const defensible = (worst?.[1] ?? 50) > 42;

  applyEffects(
    next,
    { approval: defensible ? 1.4 : -1.8 },
    defensible
      ? `Press conference — the room led on ${worst?.[0].replace(/_/g, ' ')}, and you had an answer`
      : `Press conference — the room led on ${worst?.[0].replace(/_/g, ' ')}, and you did not have an answer`,
    entries,
  );
  return ok(next);
}

/* ---------------------- coalition negotiation --------------------- */

function handleNegotiationAccept(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }
  if (state.negotiation.accepted.includes(partyId)) {
    return reject(state, 'That party is already in the provisional agreement.');
  }
  const demand = state.negotiation.candidates.find((c) => c.partyId === partyId);
  if (!demand) return reject(state, 'That party is not at the table.');

  const next = clone(state);
  next.negotiation!.accepted.push(partyId);
  return ok(next);
}

function handleNegotiationRemove(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }
  const next = clone(state);
  next.negotiation!.accepted = next.negotiation!.accepted.filter((id) => id !== partyId);
  return ok(next);
}

function handleNegotiationCounter(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }
  if (state.politicalCapital < COUNTER_OFFER_PC_COST) {
    return reject(state, 'Not enough political capital to counter-offer.');
  }
  const index = state.negotiation.candidates.findIndex((c) => c.partyId === partyId);
  if (index < 0) return reject(state, 'That party is not at the table.');
  if (state.negotiation.candidates[index]!.concessionsWon >= 0.85) {
    return reject(state, 'They will not move any further.');
  }

  const next = clone(state);
  spendPc(next, COUNTER_OFFER_PC_COST);
  const candidate = next.negotiation!.candidates[index]!;
  const party = next.parties.find((p) => p.id === candidate.partyId);
  if (!party) return reject(state, 'No such party.');
  next.negotiation!.candidates[index] = applyCounterOffer(candidate, party);
  return ok(next);
}

function handleFormGovernment(state: GameState): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }

  /*
   * The largest party in a government leads it.
   *
   * Not a house rule — it is how parliamentary government works nearly
   * everywhere, and without it the engine would let a party with three
   * seats of a hundred and eighty take the premiership of a coalition of
   * ninety, which a measured run of France did. A player who has been
   * overtaken has lost; the way to say so is to refuse the government
   * rather than to hand them one nobody would let them have.
   */
  {
    const player = state.parties.find((p) => p.isPlayer);
    const bloc = state.parties.filter(
      (p) => p.isPlayer || state.negotiation!.accepted.includes(p.id),
    );
    const biggest = bloc.reduce((max, p) => (p.seats > max.seats ? p : max), bloc[0]!);
    if (player && biggest.id !== player.id) {
      return reject(
        state,
        `${biggest.name} holds more seats than you do. The largest party in a ` +
          'government leads it — either assemble one you are the largest party in, ' +
          'or let them try.',
      );
    }
  }

  const next = clone(state);
  const negotiation = next.negotiation!;
  const entries = currentLog(next);

  /* Bind the accepted partners into the government. */
  for (const partyId of negotiation.accepted) {
    const party = next.parties.find((p) => p.id === partyId);
    const demand = negotiation.candidates.find((c) => c.partyId === partyId);
    if (!party || !demand) continue;
    party.inCoalition = true;
    party.coalitionMood = MOOD_START;
    party.cabinetPosts = demand.cabinetPosts;
    party.cabinetDemand = demand.cabinetPosts;
    party.redLines = demand.redLines;

    /* Honouring the sector floor is a commitment, so fund it on day one —
       in the lines, which is where the money actually is. */
    const sector = findSector(next.sectors, demand.sectorFloor.sector);
    if (sector.funding < demand.sectorFloor.amount) {
      next.budget = setSectorFunding(
        next.budget,
        demand.sectorFloor.sector,
        demand.sectorFloor.amount,
        'enacted',
      );
      syncSectorsToBudget(next);
    }
  }

  if (!hasMajority(next.parties)) {
    /* The agreement does not command the chamber. */
    negotiation.attempt += 1;

    for (const partyId of negotiation.accepted) {
      const party = next.parties.find((p) => p.id === partyId);
      if (!party) continue;
      party.inCoalition = false;
      party.coalitionMood = null;
      party.cabinetPosts = 0;
      party.redLines = [];
    }

    if (negotiation.attempt > COALITION_MAX_ATTEMPTS) {
      /* Three failures force a fresh election, and the instability costs. */
      next.approval = clampApproval(next.approval + COALITION_FAILURE_APPROVAL_PENALTY);
      log(entries, {
        kind: 'approval',
        label: 'Approval',
        delta: COALITION_FAILURE_APPROVAL_PENALTY,
        cause: 'Three failed attempts to form a government. The country goes back to the polls.',
        unit: 'pts',
      });

      if (negotiation.failed) {
        /* A second consecutive failure ends the run. */
        return ok(
          endRun(
            next,
            negotiation.crisis,
            'No government could be formed after two general elections. Another party has been invited to try.',
          ),
        );
      }

      const afterElection = runElection(next);
      afterElection.negotiation = {
        ...buildNegotiation(afterElection.parties, 1, negotiation.crisis),
        failed: true,
      };
      return ok(afterElection);
    }

    negotiation.accepted = [];
    log(entries, {
      kind: 'coalition',
      label: `Attempt ${negotiation.attempt - 1} failed`,
      delta: null,
      cause:
        'The proposed agreement did not command a majority of the chamber. The parties return to the table.',
    });
    /*
     * Deliberately not an error: the attempt was legal and it consumed one of
     * the three the player gets. Returning it as a rejection would let a
     * well-behaved caller discard the incremented counter.
     */
    return ok(next);
  }

  next.negotiation = null;
  next.phase = 'briefing';
  handOutPortfolios(next, entries);
  return ok(beginTurn(next));
}

/**
 * Govern in a minority — but only if entitled to.
 *
 * Carrying on without a majority is legitimate for the largest party in the
 * chamber. It is not available to anyone else: if another party is larger,
 * they are invited to form a government and the player goes into opposition.
 * Without this the run could never be lost, because walking away from every
 * negotiation would always leave the player in office.
 */
function handleAbandonNegotiation(state: GameState): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }

  if (!playerIsLargestParty(state.parties)) {
    const largest = [...state.parties].sort((a, b) => b.seats - a.seats)[0];
    return ok(
      endRun(
        state,
        state.negotiation.crisis,
        `Without an agreement, ${largest?.name ?? 'the largest party'} commands more seats and has been invited to form a government.`,
      ),
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  next.negotiation = null;
  log(entries, {
    kind: 'note',
    label: 'Minority government',
    delta: null,
    cause:
      'No coalition agreement was signed. The government will have to find its majority vote by vote.',
  });
  handOutPortfolios(next, entries);
  return ok(beginTurn(next));
}

/**
 * Hand out the departments.
 *
 * The cabinet posts conceded at the negotiating table stop being a number
 * here and become eight named departments with budgets attached. A partner
 * who extracted three posts now runs three ministries, and every line the
 * player writes next spring is a line in somebody else's department.
 */
function handOutPortfolios(state: GameState, entries: LogEntry[]): void {
  state.budget = {
    ...state.budget,
    ministries: assignMinistries(state.budget.ministries, state.parties),
  };

  const byParty = new Map<string, string[]>();
  for (const ministry of state.budget.ministries) {
    if (!ministry.heldBy) continue;
    const list = byParty.get(ministry.heldBy) ?? [];
    list.push(findMinistry(ministry.key).title);
    byParty.set(ministry.heldBy, list);
  }
  if (byParty.size === 0) return;

  const shares = [...byParty.entries()].map(([partyId, titles]) => {
    const party = state.parties.find((p) => p.id === partyId);
    return `${party?.shortName ?? 'A partner'} takes ${formatList(titles)}`;
  });

  log(entries, {
    kind: 'coalition',
    label: 'Cabinet formed',
    delta: null,
    cause: `${shares.join('; ')}. Every remaining department answers to you.`,
  });
}

/** "a, b and c" — because a list of departments reads as a sentence. */
function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
