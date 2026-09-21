/**
 * peace.ts — what the country thinks they have, and whether it can stop.
 *
 * INTELLIGENCE ESTIMATES ARE BIASED, NOT NOISY. This is the distinction
 * the file turns on. Noise averages out and can be reduced by looking
 * harder; bias does not and cannot, because it is not produced by
 * carelessness. It is produced by ambiguous evidence being read, in good
 * faith, by people facing a particular direction: an armed forces
 * arguing for a budget finds a larger enemy, a government that has made
 * up its mind finds a smaller one, and nobody in either chain is lying.
 * The error is therefore in ONE direction, it does not shrink with
 * effort, and it is discovered by being wrong about something specific —
 * always after the decision that rested on it.
 *
 * THE WAR AIM YOU ANNOUNCED IS THE TRAP. A government that says it will
 * accept nothing less than X has made X a condition of its own survival.
 * It said it in week one, on the strength of a rally, before anybody
 * knew whether X was achievable, and every sentence is on the record.
 * `blockedByAim` is not a rule the engine imposes — it is the government
 * reading its own speech back.
 *
 * SUNK COSTS MAKE PEACE HARDER. The more a country has spent, the worse
 * any settlement looks, which is exactly backwards: what is spent is
 * gone either way. It is not stupidity. "We should stop, and everything
 * so far was for nothing" is not a speech anybody has survived giving.
 *
 * AND THE TERMS GET WORSE. A government that could have settled in month
 * six settles in month thirty on worse terms, having spent twenty-four
 * months establishing that the first offer was the good one.
 */

import {
  ESTIMATE_LEARNING,
  ESTIMATE_TOLERANCE,
  OFFER_LIFE,
  SETTLE_THRESHOLD,
  TERMS_DECAY,
} from '../balance.ts';
import {
  DECLARED_AIM_WEIGHT,
  SUNK_COST_WEIGHT,
  findBias,
  findMediator,
  findTerm,
  type EstimateBias,
  type Mediator,
  type PeaceTerm,
} from '../content/peace.ts';
import type { Rng } from '../rng.ts';
import type { EnemyEstimate, Negotiation, PeaceOffer } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

/**
 * Open a negotiation file the moment a war starts, because the trap is
 * set on the first day rather than at the first talks.
 *
 * `declaredAim` and `declaredFirmness` are recorded here, in week one,
 * while the rally is on and nobody knows anything, which is exactly when
 * governments say the things they cannot climb down from.
 */
export function buildWarTalks(
  warId: string,
  declaredAim: string,
  firmness: number,
  theirStrength: number,
  theirResolve: number,
  bias: EstimateBias = 'mirror',
): Negotiation {
  return {
    warId,
    declaredAim,
    declaredFirmness: clamp100(firmness),
    estimate: {
      actual: theirStrength,
      estimated: theirStrength * findBias(bias).factor,
      bias,
      /* Nobody has looked yet. The estimate is an assumption with a
         number attached, and it is briefed as an estimate. */
      confidence: 0.25,
      lastRevised: 0,
      estimatedResolve: theirResolve * (bias === 'wishful' ? 0.7 : bias === 'threat_inflation' ? 1.2 : 1),
      actualResolve: theirResolve,
    },
    offers: [],
    refused: [],
    talking: false,
    mediator: 'none',
    settled: null,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * What the country thinks they have
 * ------------------------------------------------------------------ */

/** How far the estimate is from the truth, as a share. */
export function estimateError(estimate: EnemyEstimate): number {
  return (estimate.estimated - estimate.actual) / Math.max(1, estimate.actual);
}

/**
 * Whether anybody has noticed the estimate is wrong.
 *
 * Being wrong is not noticed by comparing the estimate to the truth,
 * because nobody has the truth. It is noticed by being wrong about
 * something specific — an attack that fails against a force that was
 * supposed to be smaller — which is always after the decision that
 * rested on it.
 */
export function estimateDiscredited(estimate: EnemyEstimate): boolean {
  return Math.abs(estimateError(estimate)) > ESTIMATE_TOLERANCE && estimate.confidence > 0.6;
}

/* ------------------------------------------------------------------ *
 * Whether it can stop
 * ------------------------------------------------------------------ */

/** What a package of terms is worth, in the bargaining. */
export function offerValue(offer: PeaceOffer): number {
  const gained = offer.theyConcede.reduce((s, t) => s + findTerm(t).weight, 0);
  const given = offer.weConcede.reduce((s, t) => s + findTerm(t).weight, 0);
  return gained - given;
}

/** And what signing it costs at home, before any mediator's cover. */
export function domesticCost(offer: PeaceOffer): number {
  return offer.weConcede.reduce((s, t) => s + findTerm(t).domesticCost, 0);
}

/**
 * Whether the government can sign this at all.
 *
 * Not a rule the engine imposes. It is the government reading its own
 * week-one speech back, in a room with people who have it in front of
 * them, and discovering that the sentence it used to get the rally is
 * the sentence that will not let it stop.
 */
export function blockedByAim(offer: PeaceOffer, negotiation: Negotiation): boolean {
  const conceded = domesticCost(offer);
  return conceded * DECLARED_AIM_WEIGHT > 100 - negotiation.declaredFirmness;
}

/**
 * How willing a side is to sign, 0–100.
 *
 * Exhaustion pushes toward settling and everything already spent pushes
 * away from it, which is exactly backwards and is the only position a
 * government can hold in public. A mediator helps, and what it actually
 * provides is somebody else to blame for the terms.
 */
export function willingness(
  exhaustion: number,
  spent: number,
  offer: PeaceOffer | null,
  mediator: Mediator,
  side: 'us' | 'them' = 'us',
): number {
  const cover = findMediator(mediator);
  const tired = exhaustion;
  /* The sunk cost. What has been spent is gone whichever way this goes,
     and it makes every settlement look worse. */
  const invested = spent * SUNK_COST_WEIGHT;
  /*
   * And the terms, read from the side doing the reading. Every offer is
   * written from one side's point of view; the other side sees exactly
   * the same paper with the signs reversed, and for a while this engine
   * had them reading ours.
   */
  const value = offer ? (side === 'us' ? offerValue(offer) : -offerValue(offer)) : 0;
  const home = offer && side === 'us' ? domesticCost(offer) * (1 - cover.cover) : 0;
  const terms = value * 0.35 - home * 0.5;
  return clamp100(tired - invested + terms + cover.credit * 22);
}

/** Whether both sides will sign the same piece of paper this week. */
export function wouldSettle(
  offer: PeaceOffer,
  negotiation: Negotiation,
  ours: number,
  theirs: number,
): boolean {
  if (blockedByAim(offer, negotiation)) return false;
  return ours >= SETTLE_THRESHOLD && theirs >= SETTLE_THRESHOLD;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface PeaceInputs {
  /** What they actually have, which the government does not know. */
  theirStrength: number;
  theirResolve: number;
  /** How far the government has been able to look at them. */
  reconnaissance: number;
  /** Whether anybody is actually in contact with them. */
  inContact: boolean;
  /** How the war is going, -1 to 1, from our side. */
  battlefield: number;
  /** Both sides' exhaustion, which is what pushes toward settling. */
  ourExhaustion: number;
  theirExhaustion: number;
  /** And what has been spent, which pushes the other way. */
  ourSpent: number;
  theirSpent: number;
  turn: number;
  rng: Rng;
}

export interface PeaceTick {
  negotiation: Negotiation;
  /** A new offer arrived this week. */
  offered: PeaceOffer | null;
  /** An offer lapsed. The next one will be worse. */
  lapsed: PeaceOffer[];
  /** True the week the estimate is found to have been wrong all along. */
  discredited: boolean;
  /** True the week an offer arrives that the declared aim forbids. */
  trapped: boolean;
  /** Set when both sides would sign the same paper. */
  settlement: PeaceOffer | null;
}

export function stepPeace(negotiation: Negotiation, inputs: PeaceInputs): PeaceTick {
  const lapsed: PeaceOffer[] = [];
  let offered: PeaceOffer | null = null;
  let trapped = false;

  /* ---- 1. What the country thinks they have. ---- */
  /*
   * The bias does not shrink with effort — that is what makes it a bias
   * rather than noise. What shrinks is the share of the estimate that
   * rests on an assumption rather than on something somebody saw, and
   * the estimate converges on the truth only as far as the bias allows.
   */
  const looking = clamp(inputs.reconnaissance + (inputs.inContact ? 0.35 : 0), 0, 1);
  const confidence = clamp(
    negotiation.estimate.confidence + looking * ESTIMATE_LEARNING,
    0,
    0.95,
  );
  const anchor = inputs.theirStrength * findBias(negotiation.estimate.bias).factor;
  const estimated =
    negotiation.estimate.estimated +
    (anchor - negotiation.estimate.estimated) * ESTIMATE_LEARNING * (1 + looking);

  const estimate: EnemyEstimate = {
    ...negotiation.estimate,
    actual: inputs.theirStrength,
    estimated,
    confidence,
    lastRevised: looking > 0.2 ? inputs.turn : negotiation.estimate.lastRevised,
    estimatedResolve:
      negotiation.estimate.estimatedResolve +
      (inputs.theirResolve * findBias(negotiation.estimate.bias).factor -
        negotiation.estimate.estimatedResolve) *
        ESTIMATE_LEARNING,
    actualResolve: inputs.theirResolve,
  };

  const wasDiscredited = estimateDiscredited(negotiation.estimate);
  const discredited = estimateDiscredited(estimate) && !wasDiscredited;

  /* ---- 2. Offers on the table, and offers going off it. ---- */
  const offers = negotiation.offers.filter((offer) => {
    if (inputs.turn < offer.expiresTurn) return true;
    lapsed.push(offer);
    return false;
  });

  /*
   * And the terms decay. A government that could have settled in month
   * six settles in month thirty on worse terms, having spent the
   * intervening months establishing that the first offer was the good
   * one.
   */
  const losing = Math.max(0, -inputs.battlefield);
  if (losing > 0.1 && negotiation.talking && inputs.rng.chance(0.04 + losing * TERMS_DECAY * 50)) {
    const worse = makeOffer(
      'them',
      /* Each successive offer asks for more and gives less. */
      pickTerms(inputs.rng, 1 + Math.floor(losing * 3)),
      pickTerms(inputs.rng, Math.max(0, 2 - Math.floor(losing * 3))),
      negotiation.mediator,
      inputs.turn,
    );
    offered = { ...worse, blockedByAim: blockedByAim(worse, negotiation) };
    offers.push(offered);
    if (offered.blockedByAim) trapped = true;
  }

  /* ---- 3. Whether anybody signs. ---- */
  let settlement: PeaceOffer | null = null;
  const ourWillingness = willingness(
    inputs.ourExhaustion,
    inputs.ourSpent,
    offers[0] ?? null,
    negotiation.mediator,
  );
  const theirWillingness = willingness(
    inputs.theirExhaustion,
    inputs.theirSpent,
    offers[0] ?? null,
    negotiation.mediator,
    'them',
  );

  for (const offer of offers) {
    const mine = willingness(
      inputs.ourExhaustion,
      inputs.ourSpent,
      offer,
      negotiation.mediator,
    );
    const theirs = willingness(
      inputs.theirExhaustion,
      inputs.theirSpent,
      offer,
      negotiation.mediator,
      'them',
    );
    if (wouldSettle(offer, negotiation, mine, theirs)) {
      settlement = offer;
      break;
    }
  }

  const next: Negotiation = {
    ...negotiation,
    estimate,
    offers,
    refused: [...negotiation.refused, ...lapsed],
    settled: settlement ?? negotiation.settled,
    history: [
      ...negotiation.history,
      {
        turn: inputs.turn,
        onOffer: offers.length > 0 ? offerValue(offers[0]!) : 0,
        ourWillingness,
        theirWillingness,
      },
    ].slice(-208),
  };

  return { negotiation: next, offered, lapsed, discredited, trapped, settlement };
}

/* ------------------------------------------------------------------ *
 * Making and taking offers
 * ------------------------------------------------------------------ */

const NEGOTIABLE: PeaceTerm[] = [
  'territory',
  'reparations',
  'disarmament',
  'recognition',
  'withdrawal',
  'autonomy',
  'access',
  'amnesty',
  'guarantees',
];

function pickTerms(rng: Rng, count: number): PeaceTerm[] {
  const out: PeaceTerm[] = [];
  for (let i = 0; i < count; i += 1) {
    const pick = NEGOTIABLE[rng.int(0, NEGOTIABLE.length - 1)]!;
    if (!out.includes(pick)) out.push(pick);
  }
  return out.length > 0 ? out : ['nothing'];
}

/** Put something on the table. */
export function makeOffer(
  from: 'us' | 'them',
  weConcede: PeaceTerm[],
  theyConcede: PeaceTerm[],
  mediator: Mediator,
  turn: number,
): PeaceOffer {
  const offer: PeaceOffer = {
    id: `offer-${from}-${turn}`,
    from,
    weConcede,
    theyConcede,
    mediator,
    offeredTurn: turn,
    expiresTurn: turn + OFFER_LIFE,
    domesticCost: 0,
    blockedByAim: false,
  };
  return { ...offer, domesticCost: domesticCost(offer) };
}

/** Start talking, which is itself a concession and is reported as one. */
export function openTalks(negotiation: Negotiation, mediator: Mediator): Negotiation {
  return { ...negotiation, talking: true, mediator };
}

/** Stop talking. Costs nothing today. */
export function breakOffTalks(negotiation: Negotiation): Negotiation {
  return { ...negotiation, talking: false, offers: [] };
}

/**
 * Take back what was said in week one.
 *
 * The only way out of the trap, and it costs exactly what it looks like
 * it costs: the government has to say in public that the thing it told
 * the country it would never accept is a thing it is now accepting.
 * Nobody has ever done it cheaply and several have not survived it.
 */
export function revisAim(negotiation: Negotiation, firmness: number): Negotiation {
  return { ...negotiation, declaredFirmness: clamp100(firmness) };
}

/** Sign it. */
export function accept(negotiation: Negotiation, offerId: string): Negotiation {
  const offer = negotiation.offers.find((o) => o.id === offerId);
  if (!offer) return negotiation;
  return { ...negotiation, settled: offer, offers: [], talking: false };
}

/** Refuse it. It stays on the record and the next one is worse. */
export function refuse(negotiation: Negotiation, offerId: string): Negotiation {
  const offer = negotiation.offers.find((o) => o.id === offerId);
  if (!offer) return negotiation;
  return {
    ...negotiation,
    offers: negotiation.offers.filter((o) => o.id !== offerId),
    refused: [...negotiation.refused, offer],
  };
}

/* ------------------------------------------------------------------ *
 * Describing it
 * ------------------------------------------------------------------ */

/** One line on what is known and whether it can end. */
export function describeNegotiation(negotiation: Negotiation): string {
  const bias = findBias(negotiation.estimate.bias);
  const blocked = negotiation.offers.filter((o) => blockedByAim(o, negotiation));

  if (blocked.length > 0) {
    return `There is a settlement on the table that this government cannot sign, because of what it said in week one about what it would never accept. The sentence was worth a rally at the time. It is now a condition of the government's survival, and the war is the thing keeping it true.`;
  }
  if (negotiation.refused.length > 2) {
    return `${negotiation.refused.length} offers have been refused. Each was better than the one after it, which is how this goes for whoever is losing — the terms available are worst at the end, and the months in between were spent establishing that the first one was the good offer.`;
  }
  if (estimateDiscredited(negotiation.estimate)) {
    return `The estimate of what they have was wrong, and it was wrong in one direction: ${bias.label.toLowerCase()}. Nobody was lying. ${bias.blurb} The decisions that rested on it have already been taken.`;
  }
  if (negotiation.talking) {
    return `Talks are running under ${findMediator(negotiation.mediator).label.toLowerCase()}. ${findMediator(negotiation.mediator).blurb}`;
  }
  return `Nobody is talking. The government said in week one what it would accept, and everything since has been spent making that sentence more expensive to take back.`;
}
