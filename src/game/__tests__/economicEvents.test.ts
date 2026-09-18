/**
 * economicEvents.test.ts — crises the government made more likely.
 *
 * The design rule these protect: a crisis is not a die roll against the
 * player, it is a die roll the player has been loading for years. A banking
 * crisis needs a long boom and dear money. A supply-chain crisis needs ports
 * somebody stopped maintaining. If any of these fire at a uniform rate
 * regardless of what the government has done, the whole set becomes
 * punishment rather than consequence.
 */

import { describe, expect, it } from 'vitest';
import { ECONOMIC_EVENT_TEMPLATES } from '../content/economicEvents.ts';
import { buildWeightContext } from '../systems/eventEngine.ts';
import { buildEconomy } from '../systems/economy.ts';
import { buildIndustries } from '../systems/industry.ts';
import { buildInfrastructure } from '../systems/infrastructure.ts';
import { buildDemography } from '../systems/demography.ts';
import { buildRegions } from '../setup.ts';
import { SECTOR_BASELINE_FUNDING, SECTOR_KEYS } from '../balance.ts';
import type {
  Demography,
  Economy,
  IndustryState,
  Infrastructure,
  Sector,
} from '../types.ts';
import type { EventTemplate, EventWeightContext } from '../content/events.ts';

const sectors: Sector[] = SECTOR_KEYS.map((key) => ({
  key,
  health: 60,
  funding: SECTOR_BASELINE_FUNDING[key],
}));

function context(world: {
  economy?: Partial<Economy>;
  industries?: (i: IndustryState[]) => IndustryState[];
  infrastructure?: (i: Infrastructure) => Infrastructure;
  demography?: Partial<Demography>;
  debt?: number;
} = {}): EventWeightContext {
  const industries = world.industries
    ? world.industries(buildIndustries())
    : buildIndustries();
  const infrastructure = world.infrastructure
    ? world.infrastructure(buildInfrastructure())
    : buildInfrastructure();
  return buildWeightContext(sectors, 50, world.debt ?? 2020, 0, 12, [], {
    economy: { ...buildEconomy(), ...world.economy },
    industries,
    infrastructure,
    demography: { ...buildDemography(buildRegions()), ...world.demography },
  });
}

const find = (key: string): EventTemplate =>
  ECONOMIC_EVENT_TEMPLATES.find((t) => t.key === key)!;

describe('the ten crises', () => {
  it('are all here', () => {
    expect(ECONOMIC_EVENT_TEMPLATES).toHaveLength(10);
    for (const key of [
      'banking-crisis',
      'market-crash',
      'housing-crash',
      'commodity-boom',
      'commodity-collapse',
      'drought',
      'natural-disaster',
      'energy-crisis',
      'supply-chain-crisis',
      'recovery',
    ]) {
      expect(find(key), key).toBeTruthy();
    }
  });

  it('always offer a real choice, with a stated cost on each', () => {
    for (const template of ECONOMIC_EVENT_TEMPLATES) {
      for (const severity of [template.minSeverity, template.maxSeverity]) {
        const choices = template.choices(severity);
        expect(choices.length, template.key).toBeGreaterThanOrEqual(2);
        for (const choice of choices) {
          expect(choice.label.length).toBeGreaterThan(0);
          expect(choice.tradeoff.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('deliver a real shock rather than a one-off nudge', () => {
    /* Every crisis — not the two opportunities — has at least one course
       that puts a decaying impulse into the macro model. */
    const crises = ECONOMIC_EVENT_TEMPLATES.filter((t) => t.category !== 'opportunity');
    for (const template of crises) {
      const shocks = template.choices(2).filter((c) => c.effects.economicShock);
      expect(shocks.length, template.key).toBeGreaterThan(0);
      for (const choice of shocks) {
        const shock = choice.effects.economicShock!;
        expect(shock.months).toBeGreaterThan(0);
        expect(shock.id.length).toBeGreaterThan(0);
      }
    }
  });

  it('scale with severity', () => {
    for (const template of ECONOMIC_EVENT_TEMPLATES) {
      if (template.minSeverity === template.maxSeverity) continue;
      const mild = template.choices(template.minSeverity);
      const severe = template.choices(template.maxSeverity);
      const weight = (choices: typeof mild) =>
        choices.reduce(
          (sum, c) => sum + Math.abs(c.effects.treasury ?? 0) + Math.abs(c.effects.approval ?? 0),
          0,
        );
      expect(weight(severe), template.key).toBeGreaterThan(weight(mild));
    }
  });
});

describe('a crisis is something you made more likely', () => {
  const weightOf = (key: string, ctx: EventWeightContext) => find(key).weight(ctx);

  it('puts a banking crisis at the end of a long boom with dear money', () => {
    const calm = weightOf('banking-crisis', context());
    const overheated = weightOf(
      'banking-crisis',
      context({ economy: { outputGap: 4, policyRate: 10 } }),
    );
    expect(overheated).toBeGreaterThan(calm * 3);
  });

  it('puts a housing crash where the market ran hot and the bank turned', () => {
    const calm = weightOf('housing-crash', context());
    const exposed = weightOf(
      'housing-crash',
      context({
        economy: { policyRate: 10 },
        industries: (list) =>
          list.map((i) => (i.key === 'real_estate' ? { ...i, health: 130 } : i)),
      }),
    );
    expect(exposed).toBeGreaterThan(calm * 3);
  });

  it('puts a supply-chain crisis where the ports were let go', () => {
    const maintained = weightOf('supply-chain-crisis', context());
    const neglected = weightOf(
      'supply-chain-crisis',
      context({
        infrastructure: (infra) => ({
          ...infra,
          assets: infra.assets.map((a) => (a.key === 'ports' ? { ...a, condition: 22 } : a)),
        }),
      }),
    );
    expect(neglected).toBeGreaterThan(maintained * 1.5);
  });

  it('puts a flood where the defences were let go', () => {
    const maintained = weightOf('natural-disaster', context());
    const neglected = weightOf(
      'natural-disaster',
      context({
        infrastructure: (infra) => ({
          ...infra,
          assets: infra.assets.map((a) =>
            a.key === 'water' ? { ...a, condition: 18, backlog: 90 } : a,
          ),
        }),
      }),
    );
    expect(neglected).toBeGreaterThan(maintained * 1.5);
  });

  it('puts a commodity collapse at the end of a commodity boom', () => {
    const steady = weightOf('commodity-collapse', context());
    const booming = weightOf(
      'commodity-collapse',
      context({
        industries: (list) => list.map((i) => (i.key === 'mining' ? { ...i, health: 150 } : i)),
      }),
    );
    expect(booming).toBeGreaterThan(steady * 2);
  });

  it('offers a recovery only to a country that needs one', () => {
    expect(weightOf('recovery', context())).toBe(0);
    expect(
      weightOf('recovery', context({ economy: { phase: 'recession', growth: -2 } })),
    ).toBeGreaterThan(0);
    expect(weightOf('recovery', context({ economy: { outputGap: -4 } }))).toBeGreaterThan(0);
  });

  it('never returns a negative weight, whatever the state of the country', () => {
    const extremes = [
      context(),
      context({ economy: { outputGap: -9, policyRate: 0, growth: -8, inflation: -4 } }),
      context({ economy: { outputGap: 9, policyRate: 25, growth: 9, inflation: 20 } }),
      context({ debt: 0 }),
      context({ debt: 90_000 }),
    ];
    for (const ctx of extremes) {
      for (const template of ECONOMIC_EVENT_TEMPLATES) {
        expect(template.weight(ctx), template.key).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(template.weight(ctx)), template.key).toBe(true);
      }
    }
  });

  it('survives a context built without any of the world in it', () => {
    /* A few tests build one by hand. A missing world should produce a
       plausible game rather than a crash. */
    const bare = buildWeightContext(sectors, 50, 200, 0, 5, []);
    for (const template of ECONOMIC_EVENT_TEMPLATES) {
      expect(Number.isFinite(template.weight(bare)), template.key).toBe(true);
      expect(template.weight(bare)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the choices are genuine', () => {
  it('lets a bank be rescued expensively or allowed to fail cheaply', () => {
    const choices = find('banking-crisis').choices(3);
    const rescue = choices[0]!;
    const fail = choices[1]!;
    /* The rescue costs far more money and far less economy. */
    expect(Math.abs(rescue.effects.treasury!)).toBeGreaterThan(Math.abs(fail.effects.treasury!));
    const rescueShock =
      rescue.effects.economicShock!.growthImpulse * (rescue.effects.shockRelief ?? 1);
    const failShock = fail.effects.economicShock!.growthImpulse * (fail.effects.shockRelief ?? 1);
    expect(rescueShock).toBeGreaterThan(failShock);
    /* And it is unpopular, which is the whole argument. */
    expect(rescue.effects.approval!).toBeLessThan(0);
  });

  it('makes the responsible course of a windfall the unpopular one', () => {
    const [bank, spend] = find('commodity-boom').choices(2);
    expect(bank!.effects.approval!).toBeLessThan(0);
    expect(spend!.effects.approval!).toBeGreaterThan(0);
    expect(bank!.effects.treasury!).toBeGreaterThan(spend!.effects.treasury!);
  });

  it('makes fixing the cause of a drought cost more than relieving it', () => {
    const [relief, build] = find('drought').choices(2);
    expect(Math.abs(build!.effects.treasury!)).toBeGreaterThan(
      Math.abs(relief!.effects.treasury!),
    );
    /* And it is less popular, because it helps nobody this year. */
    expect(build!.effects.approval!).toBeLessThan(relief!.effects.approval!);
  });
});
