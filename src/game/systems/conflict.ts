/**
 * conflict.ts — the rally that curdles.
 *
 * The single most reliable finding about war and public opinion is that
 * approval jumps when a crisis begins and falls further than it rose if the
 * crisis does not end. Governments know this. They act on it anyway, because
 * the jump is this month and the fall is next year, and because backing down
 * has a cost that arrives immediately and in public.
 *
 * So the whole system is an escalation ladder with asymmetric politics on
 * every rung:
 *
 *   INCIDENT — something happened. Denying it is free. Responding is not.
 *   STANDOFF — both sides have said things they cannot easily unsay.
 *   CRISIS — forces are moving and somebody has a deadline.
 *   WAR — the ladder has no more rungs.
 *
 * Going up a rung is cheap, popular and fast. Coming down is expensive,
 * unpopular and slow, and the asymmetry is the mechanic rather than a
 * balance problem. A player who escalates because the polling improves is
 * doing exactly what the model is about.
 *
 * What the player never does is fight. There is no battle here to win. The
 * outcome of a war is decided by force ratios, alliances, distance and
 * resolve — all of which were set by decisions taken years before, which is
 * the argument the military system exists to make.
 */

import {
  CRISIS_RALLY,
  CRISIS_RALLY_HALFLIFE,
  PATIENCE_FLOOR,
  ESCALATION_STEP,
  RESOLVE_DECAY,
  WAR_ECONOMY_SHOCK,
  months,
  CASUALTY_SHARE_APPROVAL,
  WEEKLY_CASUALTY_RATE,
  HIGH_COMMISSION_ESCALATION_RELIEF,
  HIGH_COMMISSION_DEESCALATION_BOOST,
} from '../balance.ts';
import { findNation, type NationKey } from '../content/nations.ts';
import type { Rng } from '../rng.ts';
import type { Crisis, CrisisStage, Military, World } from '../types.ts';
import { combatPower, deterrence } from './military.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The rungs, in order. Going up is one step; coming down is one step. */
const LADDER: CrisisStage[] = ['incident', 'standoff', 'crisis', 'war'];

export function rungOf(stage: CrisisStage): number {
  const index = LADDER.indexOf(stage);
  return index < 0 ? 0 : index;
}

export const STAGE_LABELS: Record<CrisisStage, string> = {
  incident: 'An incident',
  standoff: 'A standoff',
  crisis: 'A crisis',
  war: 'War',
  settled: 'Settled',
};

/* ------------------------------------------------------------------ *
 * Opening one
 * ------------------------------------------------------------------ */

/**
 * Something happens.
 *
 * Crises are not started by the player. They arrive — from a border, a ship,
 * an airspace violation, an ally's quarrel — which is the correct shape,
 * because the decision a government actually faces is never whether to have
 * a crisis. It is what to do about the one it has.
 */
export function openCrisis(
  nation: NationKey,
  cause: string,
  turn: number,
  world: World,
): Crisis {
  const state = world.nations.find((n) => n.key === nation);
  return {
    id: `crisis-${nation}-${turn}`,
    nation,
    cause,
    stage: 'incident',
    startedTurn: turn,
    stageSince: turn,
    escalation: 18,
    /* The rally starts full and decays from the first week. */
    rally: CRISIS_RALLY,
    casualties: 0,
    /*
     * Resolve: how long each side will keep going. Ours starts high
     * because a government that has just been wronged always thinks it
     * will. Theirs is set by their disposition and what they think of us.
     */
    ourResolve: 78,
    theirResolve: theirStartingResolve(nation, state?.relations ?? 0),
    allies: [],
    settlement: null,
  };
}

function theirStartingResolve(nation: NationKey, relations: number): number {
  const template = findNation(nation);
  const byPosture: Record<string, number> = {
    assertive: 82,
    volatile: 88,
    guarded: 64,
    mercantile: 48,
    institutional: 45,
    aligned: 40,
  };
  /* A country that likes us is less willing to keep going. */
  return clamp((byPosture[template.posture] ?? 60) - relations / 4, 15, 95);
}

/* ------------------------------------------------------------------ *
 * Reading one
 * ------------------------------------------------------------------ */

/**
 * The balance of force in this particular quarrel.
 *
 * Above one means Verdana is stronger where it matters. Distance is most of
 * it: a neighbour is fought at home, where everything the country owns
 * counts, and everybody else is fought somewhere else, where almost nothing
 * does. This is why a middling country can be genuinely hard to invade and
 * completely unable to do anything about a quarrel two borders away.
 */
export function balanceOfForce(crisis: Crisis, military: Military, world: World): number {
  const template = findNation(crisis.nation);
  const state = world.nations.find((n) => n.key === crisis.nation);
  const away = !state?.neighbour;
  const ours = combatPower(military, away);

  /* Their strength scales off their power — the LIVE figure, because a
     country that has been rising for three terms is not the country the
     briefing described at the start of the first one. */
  const power = state?.power ?? template.power;
  const theirs = power * 40 * (away ? 1.25 : 0.85);

  /* Allies bound to defend us are in this whether they like it or not. */
  const bound = world.treaties.filter(
    (t) => t.kind === 'mutual_defence' && !t.parties.includes(crisis.nation),
  ).length;

  return (ours + bound * 22) / Math.max(1, theirs);
}

/** Would they think twice about going further? */
export function deterred(crisis: Crisis, military: Military, world: World): boolean {
  return deterrence(military, world) > 70 && balanceOfForce(crisis, military, world) > 1.15;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface ConflictInputs {
  military: Military;
  world: World;
  /**
   * How many people are actually under arms, in thousands.
   *
   * Added when the manpower engine gave the army a real headcount. Until
   * then this file produced a flat figure of up to six thousand
   * casualties a week against a force it had no number for — which was
   * defensible while the military was an index and became a quarter of a
   * million casualties a year for an army of sixty-five thousand the
   * moment it was not. Two engines with two casualty models is the
   * defect; this is where they are reconciled.
   */
  forceThousands: number;
  turn: number;
  rng: Rng;
}

export interface ConflictTick {
  crises: Crisis[];
  /** Approval this week, summed across every live crisis. */
  approval: number;
  /** Points of growth knocked off by a war. */
  economicShock: number;
  /** Things that happened, for the report. */
  events: { crisis: Crisis; label: string; cause: string }[];
}

/**
 * Advance every crisis by one week.
 *
 * The other side acts here, not the player. They escalate if they are not
 * deterred and their resolve holds; they come down if it does not. Nothing
 * in this function reads what the player wants.
 */
export function stepConflicts(crises: readonly Crisis[], inputs: ConflictInputs): ConflictTick {
  const events: ConflictTick['events'] = [];
  let approval = 0;
  let economicShock = 0;

  const next = crises.map((crisis) => {
    if (crisis.stage === 'settled') return crisis;

    const weeks = inputs.turn - crisis.startedTurn;
    const balance = balanceOfForce(crisis, inputs.military, inputs.world);

    /*
     * The rally, decaying. It is the reason governments escalate and the
     * reason they regret it: the jump is this month and the fall is next
     * year. Halved every quarter, and it goes NEGATIVE once the crisis has
     * outlived the country's patience, because an unresolved crisis stops
     * being a flag to rally round and becomes a thing the government has
     * failed to finish.
     */
    const decay = 0.5 ** (weeks / CRISIS_RALLY_HALFLIFE);
    /*
     * CRISIS_RALLY is the TOTAL the flag is worth, so it is converted to a
     * weekly rate whose integral over an exponential decay comes to exactly
     * that. Stating the total is the honest way round: "a crisis is worth
     * nine points" is a claim that can be checked against the literature,
     * and "0.48 points a week" is not.
     */
    const perWeek = (CRISIS_RALLY * Math.LN2) / CRISIS_RALLY_HALFLIFE;
    /*
     * And the other half of the finding: a crisis that does not end stops
     * being a flag to rally round and becomes a thing the government has
     * failed to finish. Capped, because this is a steady bleed rather than
     * a spiral — a spiral would make every long crisis fatal, and long
     * crises are usually survived.
     */
    const patience =
      weeks > months(9) ? -Math.min(PATIENCE_FLOOR, (weeks - months(9)) * 0.02) : 0;
    const rally = perWeek * decay * (rungOf(crisis.stage) / 2 + 0.5) + patience;
    approval += rally;

    /* Resolve erodes on both sides, and faster for whoever is losing. */
    const ourResolve = clamp(
      crisis.ourResolve - RESOLVE_DECAY * (balance < 1 ? 1.6 : 0.7),
      0,
      100,
    );
    const theirResolve = clamp(
      crisis.theirResolve - RESOLVE_DECAY * (balance > 1 ? 1.6 : 0.7),
      0,
      100,
    );

    let stage: CrisisStage = crisis.stage;
    let stageSince = crisis.stageSince;
    let escalation = crisis.escalation;
    let casualties = crisis.casualties;

    if (crisis.stage === 'war') {
      /*
       * A war. Nobody here chooses anything; the ratio does. Casualties
       * accrue every week and each one is a point of approval that does
       * not come back, which is the honest asymmetry: a war that is going
       * well costs a government almost as much as one that is not.
       */
      /*
       * A share of the people actually in it, rather than a flat figure.
       * A war going badly costs more of them, and a bigger army loses
       * more people for the same war — which is the arithmetic that
       * makes a large country's wars so much more expensive than a small
       * one's, and it only works if the army has a headcount.
       */
      const weekly = clamp(
        inputs.forceThousands * WEEKLY_CASUALTY_RATE * 0.55 / Math.max(0.4, balance),
        0.05,
        inputs.forceThousands * 0.035,
      );
      casualties += weekly;
      /*
       * Charged as a share of the army rather than as a count. Five
       * thousand dead is a national catastrophe in a country of five
       * million and a news item in one of a billion, and for a while
       * this charged both the same — which, once casualties were scaled
       * to the real force, made a war approval-POSITIVE, because the
       * rally outlived a cost that had quietly become a twelfth of what
       * it was.
       */
      approval += (weekly / Math.max(1, inputs.forceThousands)) * CASUALTY_SHARE_APPROVAL;
      economicShock += WAR_ECONOMY_SHOCK;

      /* It ends when one side has had enough. */
      if (theirResolve < 20 && balance > 1) {
        stage = 'settled';
        stageSince = inputs.turn;
        events.push({
          crisis,
          label: `${findNation(crisis.nation).name} sues for terms`,
          cause:
            'They have stopped. What that was worth is a question for whoever writes the ' +
            'history, and the casualty figure does not change either way.',
        });
      } else if (ourResolve < 20) {
        stage = 'settled';
        stageSince = inputs.turn;
        events.push({
          crisis,
          label: 'The country has had enough',
          cause:
            'The government is out of the thing wars actually run on, which is not money or ' +
            'ammunition. Terms will be worse than the ones available a year ago.',
        });
      }
    } else {
      /*
       * They escalate if they are not deterred, their resolve holds, and
       * the week rolls their way. Deterrence is what makes this not happen
       * — and deterrence was bought years ago or it was not.
       */
      /*
       * A high commission is a channel to talk through when things go
       * wrong, not a reason they went right — it cuts the chance a bad
       * week turns into a worse one, which is what a standing mission is
       * actually for. Never a certainty, and never on its own; it is a
       * brake on the ladder, not a floor under it.
       */
      const heldNation = inputs.world.nations.find((n) => n.key === crisis.nation);
      const escalationChance =
        (0.055 + escalation / 900) *
        (heldNation?.embassy && heldNation.embassyTier === 'high_commission'
          ? 1 - HIGH_COMMISSION_ESCALATION_RELIEF
          : 1);
      const theyPush =
        !deterred(crisis, inputs.military, inputs.world) &&
        theirResolve > 45 &&
        inputs.rng.chance(escalationChance);

      if (theyPush) {
        escalation = clamp(escalation + ESCALATION_STEP, 0, 100);
        if (escalation > 55 + rungOf(crisis.stage) * 15) {
          const up = LADDER[Math.min(LADDER.length - 1, rungOf(crisis.stage) + 1)]!;
          if (up !== crisis.stage) {
            stage = up;
            stageSince = inputs.turn;
            events.push({
              crisis,
              label: `${findNation(crisis.nation).name}: ${STAGE_LABELS[up].toLowerCase()}`,
              cause:
                up === 'war'
                  ? 'The ladder has no more rungs. Whatever was decided about the forces over ' +
                    'the last four years is now the only thing that matters.'
                  : 'They have gone further, and nothing this government did this week ' +
                    'prevented it. Deterrence is bought years before it is needed.',
            });
          }
        }
      } else if (theirResolve < 30) {
        /* It fades, which is how most crises actually end. */
        escalation = clamp(escalation - 2.5, 0, 100);
        if (escalation < 8) {
          stage = 'settled';
          stageSince = inputs.turn;
          events.push({
            crisis,
            label: `${findNation(crisis.nation).name}: it has gone quiet`,
            cause:
              'Nobody announced anything. Most crises end this way, and no government has ' +
              'ever been given credit for one.',
          });
        }
      }
    }

    return { ...crisis, stage, stageSince, escalation, casualties, rally, ourResolve, theirResolve };
  });

  return { crises: next, approval, economicShock, events };
}

/* ------------------------------------------------------------------ *
 * What the player can do about it
 * ------------------------------------------------------------------ */

/**
 * Go up a rung.
 *
 * Cheap, popular and fast, which is the entire problem with it. The rally
 * refreshes, their resolve hardens, and the country is one rung closer to
 * the place where none of this is a decision any more.
 */
export function escalate(crisis: Crisis, turn: number): Crisis {
  const up = LADDER[Math.min(LADDER.length - 1, rungOf(crisis.stage) + 1)]!;
  return {
    ...crisis,
    stage: up,
    stageSince: turn,
    escalation: clamp(crisis.escalation + ESCALATION_STEP * 2, 0, 100),
    /* Standing firm refreshes the rally, which is why it keeps happening. */
    rally: CRISIS_RALLY,
    ourResolve: clamp(crisis.ourResolve + 8, 0, 100),
    /* And hardens theirs, which is the part nobody announces. */
    theirResolve: clamp(crisis.theirResolve + 11, 0, 100),
  };
}

/**
 * Come down a rung.
 *
 * Expensive, unpopular and slow. It costs approval immediately and in
 * public, and it is very often the right thing to do — which is the whole
 * shape of the decision and the reason so few governments take it.
 */
export function deEscalate(
  crisis: Crisis,
  turn: number,
  hasHighCommission: boolean = false,
): Crisis {
  const down = LADDER[Math.max(0, rungOf(crisis.stage) - 1)]!;
  /* A standing high commission is a channel that was already open when
     the talking started, which is why it speeds this specifically —
     the step down, not the decision to take it. */
  const step = ESCALATION_STEP * 1.4 * (hasHighCommission ? HIGH_COMMISSION_DEESCALATION_BOOST : 1);
  return {
    ...crisis,
    stage: crisis.stage === 'war' ? 'crisis' : down,
    stageSince: turn,
    escalation: clamp(crisis.escalation - step, 0, 100),
    rally: 0,
    ourResolve: clamp(crisis.ourResolve - 14, 0, 100),
    theirResolve: clamp(crisis.theirResolve - 5, 0, 100),
  };
}

/**
 * Settle it.
 *
 * The terms are not negotiated; they are what the balance of force and the
 * remaining resolve produce. A government that wants better terms needed a
 * better position, and needed it years ago.
 */
export function settle(
  crisis: Crisis,
  military: Military,
  world: World,
  turn: number,
): { crisis: Crisis; terms: 'favourable' | 'even' | 'unfavourable'; approval: number } {
  const balance = balanceOfForce(crisis, military, world);
  const edge = balance * (crisis.ourResolve / Math.max(1, crisis.theirResolve));

  const terms = edge > 1.35 ? 'favourable' : edge > 0.8 ? 'even' : 'unfavourable';
  const approval = terms === 'favourable' ? 6 : terms === 'even' ? -1 : -11;

  return {
    crisis: { ...crisis, stage: 'settled', stageSince: turn, settlement: terms, rally: 0 },
    terms,
    approval,
  };
}

/** Crises that are still live. */
export function live(crises: readonly Crisis[]): Crisis[] {
  return crises.filter((c) => c.stage !== 'settled');
}

/** Is the country fighting anybody? */
export function atWar(crises: readonly Crisis[]): boolean {
  return crises.some((c) => c.stage === 'war');
}

/** A one-line account of where a crisis stands. */
export function describeCrisis(crisis: Crisis, military: Military, world: World): string {
  const them = findNation(crisis.nation);
  const balance = balanceOfForce(crisis, military, world);

  if (crisis.stage === 'settled') {
    return crisis.settlement
      ? `Settled on ${crisis.settlement} terms.`
      : 'Over. Nobody announced anything.';
  }
  if (crisis.stage === 'war') {
    return balance > 1.3
      ? `Going well, which is a sentence that costs approval every week it stays true. ${crisis.casualties.toFixed(0)} casualties so far.`
      : balance > 0.85
        ? `Neither side is winning and both are paying. ${crisis.casualties.toFixed(0)} casualties.`
        : `Going badly. ${crisis.casualties.toFixed(0)} casualties, and the forces available were decided four years ago.`;
  }
  if (deterred(crisis, military, world)) {
    return `${them.name} is not going further. That is what the defence budget was for, and nobody will ever thank a government for it.`;
  }
  return balance > 1.1
    ? `Verdana holds the stronger position, and ${them.name} has not yet accepted that.`
    : `${them.name} holds the stronger hand here, which was decided by budgets rather than by this week.`;
}
