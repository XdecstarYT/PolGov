/**
 * justice.ts — the courts, and the police who feed them.
 *
 * CERTAINTY DETERS. SEVERITY BARELY DOES. The best-replicated finding in
 * criminology is that the probability of being caught moves crime far
 * more than the length of the sentence at the end of it — and the
 * politics runs the other way, because "tougher sentences" is a promise
 * a minister can make on Tuesday and "better clearance rates" is a
 * capability that takes years of unglamorous casework to build. A
 * government that campaigns on sentencing and governs on clearance is
 * doing the boring thing that works; most do the reverse.
 *
 * INDEPENDENCE IS SPENT, NOT HELD. Political pressure on the courts buys
 * a favourable verdict this month and a slower, choppier erosion of
 * legitimacy for years afterwards — the same trade the civil service
 * makes under a government that fights it, on a longer clock and with a
 * harder floor to climb back from.
 *
 * ENFORCEMENT THEATRE IS A TRAP. Heavy-handed policing in a community
 * that already distrusts the police suppresses nothing; it suppresses
 * reporting and cooperation, so clearance rates fall even as arrest
 * counts rise, which is why the harder a government pushes in the
 * wrong place, the worse the numbers it publishes get.
 */

/** How the courts are being run. */
export type SentencingPolicy = 'restorative' | 'standard' | 'tough' | 'zealous';

export interface SentencingTemplate {
  key: SentencingPolicy;
  label: string;
  blurb: string;
  /** What it does to the prison population, relative to standard. */
  custodyRate: number;
  /** Deterrence bought per point of severity — real, but small next to clearance. */
  severityDeterrence: number;
  /** Reoffending among those it processes. Custody without purpose breeds it. */
  reoffending: number;
  /** What the public makes of it, independent of whether it works. */
  popularity: number;
  /** What it costs trust in the courts as a fair, even-handed institution. */
  legitimacyDrag: number;
}

export const SENTENCING_TEMPLATES: SentencingTemplate[] = [
  {
    key: 'restorative',
    label: 'Restorative',
    blurb:
      'Diversion, reparation and the lightest custody caseload will bear. Cuts reoffending, and reads as softness to anyone not looking at the numbers.',
    custodyRate: 0.55,
    severityDeterrence: 0.2,
    reoffending: 0.6,
    popularity: -14,
    legitimacyDrag: 0,
  },
  {
    key: 'standard',
    label: 'Standard',
    blurb: 'What the sentencing guidelines already say. Nobody campaigns on it and nobody campaigns against it.',
    custodyRate: 1,
    severityDeterrence: 0.5,
    reoffending: 1,
    popularity: 0,
    legitimacyDrag: 0,
  },
  {
    key: 'tough',
    label: 'Tough',
    blurb:
      'Longer terms, fewer suspended sentences. Popular, fills the prisons, and buys less deterrence than the clearance rate would for the same money.',
    custodyRate: 1.55,
    severityDeterrence: 0.75,
    reoffending: 1.25,
    popularity: 16,
    legitimacyDrag: 4,
  },
  {
    key: 'zealous',
    label: 'Zealous',
    blurb:
      'Maximum terms sought as a matter of course. Overcrowds custody, raises wrongful-conviction risk under the caseload it creates, and eventually reads as a system that is no longer trying to be fair.',
    custodyRate: 2.1,
    severityDeterrence: 0.85,
    reoffending: 1.55,
    popularity: 22,
    legitimacyDrag: 12,
  },
];

export function findSentencing(key: SentencingPolicy): SentencingTemplate {
  return SENTENCING_TEMPLATES.find((s) => s.key === key) ?? SENTENCING_TEMPLATES[1]!;
}

/** How the police are being asked to work. */
export type EnforcementPosture = 'community' | 'standard' | 'zero_tolerance' | 'militarised';

export interface PostureTemplate {
  key: EnforcementPosture;
  label: string;
  blurb: string;
  /** Direct effect on measured crime, independent of clearance. */
  suppression: number;
  /** What it does to willingness to report and to cooperate with an investigation. */
  cooperation: number;
  /** What it does to trust in the police, on top of clearance and corruption. */
  trustEffect: number;
  /** How exposed it is to a scandal — an aggressive posture supplies its own footage. */
  scandalRisk: number;
}

export const ENFORCEMENT_POSTURES: PostureTemplate[] = [
  {
    key: 'community',
    label: 'Community policing',
    blurb:
      'Beat officers who are known rather than feared. Slow to show in the crime figures and the only posture that reliably raises cooperation.',
    suppression: 0.2,
    cooperation: 14,
    trustEffect: 10,
    scandalRisk: 0.3,
  },
  {
    key: 'standard',
    label: 'Standard patrol',
    blurb: 'Ordinary policing, ordinarily resourced. What most of the force does most weeks.',
    suppression: 0.5,
    cooperation: 0,
    trustEffect: 0,
    scandalRisk: 1,
  },
  {
    key: 'zero_tolerance',
    label: 'Zero tolerance',
    blurb:
      'Stop, search and prosecute everything. Suppresses measured crime for a while and, wherever trust was already low, drives reporting down faster than arrests go up.',
    suppression: 0.85,
    cooperation: -16,
    trustEffect: -8,
    scandalRisk: 2,
  },
  {
    key: 'militarised',
    label: 'Militarised response',
    blurb:
      'Armoured units for ordinary calls. Looks decisive on the night it is deployed and is the single fastest way to destroy a community’s willingness to talk to a police officer at all.',
    suppression: 1.1,
    cooperation: -32,
    trustEffect: -20,
    scandalRisk: 4,
  },
];

export function findEnforcementPosture(key: EnforcementPosture): PostureTemplate {
  return ENFORCEMENT_POSTURES.find((p) => p.key === key) ?? ENFORCEMENT_POSTURES[1]!;
}

/** How politically insulated the bench is being kept. */
export type JudicialStance = 'insulated' | 'ordinary' | 'leaned_on';

export interface StanceTemplate {
  key: JudicialStance;
  label: string;
  blurb: string;
  /** Weekly pull on independence toward this stance's resting level. */
  independenceTarget: number;
  /** What it buys the government in favourable rulings, 0–1. */
  favour: number;
}

export const JUDICIAL_STANCES: StanceTemplate[] = [
  {
    key: 'insulated',
    label: 'Hands off',
    blurb: 'Appointments and rulings left entirely alone. Slow to build, and worth defending.',
    independenceTarget: 82,
    favour: 0.05,
  },
  {
    key: 'ordinary',
    label: 'Ordinary oversight',
    blurb: 'The usual appointments politics, and nothing beyond it.',
    independenceTarget: 60,
    favour: 0.15,
  },
  {
    key: 'leaned_on',
    label: 'Leaned on',
    blurb:
      'Appointments, budgets and public pressure used to shape rulings. Works this term. The bench remembers for several more.',
    independenceTarget: 28,
    favour: 0.45,
  },
];

export function findStance(key: JudicialStance): StanceTemplate {
  return JUDICIAL_STANCES.find((s) => s.key === key) ?? JUDICIAL_STANCES[1]!;
}
