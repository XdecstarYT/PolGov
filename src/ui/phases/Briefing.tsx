/**
 * Briefing.tsx — phase 1. Read-only.
 *
 * The morning brief: standing, money, the chamber, the state of the services,
 * and anything the coalition is unhappy about. Nothing here is actionable —
 * it exists so the decisions in the next three phases are informed ones.
 */

import { useGame } from '../../state/store.ts';
import {
  TURNS_PER_TERM,
  SECTOR_LABELS,
  computeApprovalTarget,
  coalitionPartners,
  BUDGET_TURN_INTERVAL,
  budgetDeadline,
  isBudgetSeason,
  isCampaignTurn,
  isThreateningExit,
  sectorEquilibrium,
  turnsServed,
} from '../../game/index.ts';
import {
  Button,
  Delta,
  Kicker,
  Meter,
  Panel,
  Tag,
  bandFor,
  money,
  pct,
} from '../components/Primitives.tsx';
import { ApprovalTrend, SeatChart } from '../components/ChartsLazy.tsx';
import { Dossier } from '../components/Dossier.tsx';
import { EconomyPanel } from '../components/EconomyPanel.tsx';
import { FinancePanel } from '../components/FinancePanel.tsx';
import { OrganisationsPanel } from '../components/OrganisationsPanel.tsx';
import { CrisisPanel } from '../components/CrisisPanel.tsx';
import { GlobalPanel } from '../components/GlobalPanel.tsx';
import { DefencePanel } from '../components/DefencePanel.tsx';
import { ForcesPanel } from '../components/ForcesPanel.tsx';
import { FleetPanel } from '../components/FleetPanel.tsx';
import { AirPanel } from '../components/AirPanel.tsx';
import { LogisticsPanel } from '../components/LogisticsPanel.tsx';
import { DoctrinePanel } from '../components/DoctrinePanel.tsx';
import { PeacePanel } from '../components/PeacePanel.tsx';
import { TimelinePanel } from '../components/TimelinePanel.tsx';
import { TheatrePanel } from '../components/TheatrePanel.tsx';
import { IntelligencePanel } from '../components/IntelligencePanel.tsx';
import { CastPanel } from '../components/CastPanel.tsx';
import { TradePanel } from '../components/TradePanel.tsx';
import { WorldPanel } from '../components/WorldPanel.tsx';
import { CabinetPanel } from '../components/CabinetPanel.tsx';
import { JusticePanel } from '../components/JusticePanel.tsx';
import { IntegrityPanel } from '../components/IntegrityPanel.tsx';
import { StateCapacityPanel } from '../components/StateCapacityPanel.tsx';
import { PressPanel } from '../components/PressPanel.tsx';
import { ServicesPanel } from '../components/ServicesPanel.tsx';
import { IndustryPanel } from '../components/IndustryPanel.tsx';
import { PopulationPanel } from '../components/PopulationPanel.tsx';
import { SocietyPanel } from '../components/SocietyPanel.tsx';
import { LivingPanel } from '../components/LivingPanel.tsx';
import { CulturePanel } from '../components/CulturePanel.tsx';
import { OpinionPanel } from '../components/OpinionPanel.tsx';
import { ProblemsPanel } from '../components/ProblemsPanel.tsx';
import { MovementsPanel } from '../components/MovementsPanel.tsx';
import { ElectoratePanel } from '../components/ElectoratePanel.tsx';

export function Briefing() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const target = computeApprovalTarget(
    game.sectors,
    game.debt,
    turnsServed(game.termNumber, game.turnNumber),
    game.difficulty,
    game.economy.gdp,
  );
  const unhappy = coalitionPartners(game.parties).filter(isThreateningExit);
  const budgetOpen = isBudgetSeason(game.turnNumber);
  const budgetDone = game.budget.enactedTurn > budgetDeadline(game.turnNumber) - BUDGET_TURN_INTERVAL;
  const campaign = isCampaignTurn(game.turnNumber);

  return (
    <div className="space-y-5">
      <Panel
        title="The morning brief"
        aside={`Term ${game.termNumber}, week ${game.turnNumber} of ${TURNS_PER_TERM}`}
      >
        <Kicker>Where you stand</Kicker>
        <p className="text-sm leading-relaxed text-ink-soft">
          Approval is <span className="text-ink tnum">{pct(game.approval, 1)}</span>, and the
          condition of the country implies a standing of{' '}
          <span className="text-ink tnum">{pct(target.target, 0)}</span> — so your support is
          currently drifting {target.target > game.approval ? 'upward' : 'downward'}. The treasury
          holds <span className="text-ink tnum">{money(game.treasury)}</span> against{' '}
          <span className="text-ink tnum">{money(game.debt)}</span> of debt.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {budgetOpen ? (
            budgetDone ? (
              <Tag tone="gain">Budget carried</Tag>
            ) : (
              <Tag tone="accent">
                Budget due in {budgetDeadline(game.turnNumber) - game.turnNumber + 1} week
                {budgetDeadline(game.turnNumber) - game.turnNumber === 0 ? '' : 's'}
              </Tag>
            )
          ) : (
            <Tag>Estimates settled for the year</Tag>
          )}
          {campaign && <Tag tone="warn">Campaign period</Tag>}
          {unhappy.length > 0 && (
            <Tag tone="loss">
              {unhappy.length} partner{unhappy.length === 1 ? '' : 's'} threatening to leave
            </Tag>
          )}
        </div>

        <div className="mt-4">
          <Button variant="primary" onClick={() => void dispatch({ type: 'advance_phase' })}>
            Open the red box →
          </Button>
        </div>
      </Panel>

      <div className="grid items-start gap-5 md:grid-cols-2">
        <Panel title="Public services">
          <ul className="space-y-3">
            {game.sectors.map((sector) => {
              const equilibrium = sectorEquilibrium(sector.key, sector.funding);
              const drifting = equilibrium - sector.health;
              return (
                <li key={sector.key}>
                  <Meter
                    label={SECTOR_LABELS[sector.key]}
                    value={sector.health}
                    band={bandFor(sector.health)}
                    hint={
                      <>
                        {money(sector.funding)} a year sustains{' '}
                        <span className="tnum">{equilibrium.toFixed(0)}</span> —{' '}
                        {Math.abs(drifting) < 0.5 ? (
                          'holding steady'
                        ) : (
                          <>
                            drifting <Delta value={drifting} />
                          </>
                        )}
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-5">
          <Panel title="The chamber">
            <SeatChart parties={game.parties} />
          </Panel>
          <Panel title="Standing over time">
            <ApprovalTrend history={game.approvalHistory} />
          </Panel>
        </div>
      </div>

      <Dossier
        sections={[
          {
            key: 'country',
            label: 'The country',
            blurb:
              'What the state actually does, what the economy is doing underneath it, and who is in it. None of these figures are yours to set directly; all of them are downstream of decisions you take in the next three phases.',
            content: (
              <>
                <CabinetPanel />
                <JusticePanel />
                <IntegrityPanel />
                <StateCapacityPanel />
                <PressPanel />
                <ServicesPanel />
                <EconomyPanel />
                <IndustryPanel />
                <PopulationPanel />
                <SocietyPanel />
                <LivingPanel />
                <CulturePanel />
                <OpinionPanel />
                <ProblemsPanel />
                <MovementsPanel />
                <FinancePanel />
                <ElectoratePanel />
              </>
            ),
          },
          {
            key: 'world',
            label: 'The world',
            blurb:
              'Most of what happens out here has nothing to do with this country. The job is not to prevent any of it — it is to notice which parts reach you, and how.',
            flag: game.world.globalEvents.filter((e) => !e.ended).length,
            content: (
              <>
                <GlobalPanel />
                <WorldPanel />
                <OrganisationsPanel />
                <TradePanel />
              </>
            ),
          },
          {
            key: 'people',
            label: 'The people',
            blurb:
              'Everybody in here is invented, and everybody in here has been in this run since the first week — with a temperament, a prior career, and a view of this government that has been moving on the record ever since. The opposition is not a number; it is a person who said something in term one and can be reminded of it in term four.',
            content: <CastPanel />,
          },
          {
            key: 'security',
            label: 'Security',
            blurb:
              'Every decision on these pages is slow and every consequence is late. A government that cuts readiness changes nothing anybody can see, and changes what is possible under a government that will not be this one.',
            flag: game.crises.filter((c) => c.stage !== 'settled').length,
            content: (
              <>
                <CrisisPanel />
                <DefencePanel />
                <ForcesPanel />
                <FleetPanel />
                <AirPanel />
                <LogisticsPanel />
                <DoctrinePanel />
                <PeacePanel />
                <TimelinePanel />
                <TheatrePanel />
                <IntelligencePanel />
              </>
            ),
          },
        ]}
      />

      <Panel title="How your standing is derived" aside="no black boxes">
        <p className="mb-3 text-sm text-ink-soft">
          Approval eases toward the figure these components sum to. Everything else that moves it —
          events, addresses, legislation — is itemised in the end-of-turn report.
        </p>
        <ul className="divide-y divide-rule text-sm">
          {target.components.map((component) => (
            <li key={component.label} className="flex items-baseline justify-between py-1.5">
              <span className="text-ink-soft">{component.label}</span>
              <Delta value={component.value} unit="pts" />
            </li>
          ))}
          <li className="flex items-baseline justify-between py-1.5 font-semibold">
            <span className="text-ink">Implied standing</span>
            <span className="tnum text-ink">{pct(target.target, 1)}</span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}
