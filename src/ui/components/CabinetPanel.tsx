/**
 * CabinetPanel.tsx — the table, and the building behind it.
 *
 * Two things this panel puts in front of a government that no briefing
 * would.
 *
 * Beside every minister, WHO THEY OWE and WHAT REMOVING THEM COSTS —
 * because a government reading a list of ministers reads it as a list
 * of appointments, and it is a list of payments. The appointment cost is
 * cheap; what is expensive is what the removal takes from whoever they
 * represent, and that number is computed from the minister rather than
 * asserted.
 *
 * And beside the civil service, what each posture is actually trading —
 * because "direct them" and "replace them" both raise compliance on the
 * page this week, and only one of them is buying it with capability that
 * does not come back. The panel does not recommend a posture. There is
 * no correct one, which is why it is on the desk.
 */

import { useGame } from '../../state/store.ts';
import {
  APPOINTMENT_BASES,
  CAPTURE_WEEKS,
  LEADERSHIP_AMBITION,
  MACHINE_POSTURES,
  MINISTRY_TEMPLATES,
  arguesFor,
  describeCabinet,
  describeCivilService,
  removalCost,
  reshuffleValue,
  sittingMinisters,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function CabinetPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const cabinet = game.cabinet;
  const machine = game.civilService;
  const ministers = sittingMinisters(cabinet);
  const capturedCount = ministers.filter((m) => arguesFor(m) === 'department').length;
  const counting = ministers.filter((m) => m.ambition > LEADERSHIP_AMBITION && m.loyalty < 50);

  return (
    <div className="space-y-4">
      <Panel title="The table" aside={`cohesion ${cabinet.cohesion.toFixed(0)}`}>
        <Kicker>A coalition you have to keep, not a team you picked</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Cohesion"
            value={cabinet.cohesion.toFixed(0)}
            detail="collective responsibility, actually collective"
            tone={cabinet.cohesion < 38 ? 'loss' : cabinet.cohesion < 55 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Arguing for their department"
            value={`${capturedCount} / ${ministers.length}`}
            detail={`about ${Math.round(CAPTURE_WEEKS / 52)} years each, on arrival`}
            tone={capturedCount > ministers.length / 2 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Counting"
            value={`${counting.length}`}
            detail="able, ambitious, and no longer sure this leader wins"
            tone={counting.length > 1 ? 'loss' : counting.length === 1 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {describeCabinet(cabinet, game.turnNumber)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            disabled={game.politicalCapital < 15}
            onClick={() => void dispatch({ type: 'full_reshuffle' })}
          >
            Reshuffle everybody · 15 PC
          </Button>
          <span className="text-[0.7rem] text-ink-faint">
            Worth {Math.round(reshuffleValue(cabinet) * 100)}% of the first one
            {cabinet.reshuffles > 0 ? ` — this would be the ${cabinet.reshuffles + 1}${
              [undefined, undefined, 'nd', 'rd'][cabinet.reshuffles + 1] ?? 'th'
            }.` : '.'}
          </span>
        </div>
      </Panel>

      <Panel title="Who is round it" aside={`${ministers.length} departments`}>
        <Kicker>The appointment is a payment. Removing one is a withdrawal</Kicker>
        <div className="space-y-3">
          {MINISTRY_TEMPLATES.map((department) => {
            const minister = ministers.find((m) => m.ministry === department.key);
            if (!minister) return null;
            const captured = arguesFor(minister) === 'department';
            const cost = removalCost(minister);
            const isCounting = minister.ambition > LEADERSHIP_AMBITION && minister.loyalty < 50;
            return (
              <div key={department.key} className="border-t border-rule pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">
                    {minister.name} <span className="text-ink-faint">— {department.title}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    {captured && <Tag tone="warn">argues for the department</Tag>}
                    {isCounting && <Tag tone="loss">counting</Tag>}
                    {minister.owes && <Tag tone="neutral">owed to {minister.owes}</Tag>}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-[0.7rem] text-ink-faint tnum">
                  <span>competence {minister.competence.toFixed(0)}</span>
                  <span>loyalty {minister.loyalty.toFixed(0)}</span>
                  <span>ambition {minister.ambition.toFixed(0)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {APPOINTMENT_BASES.map((basis) => (
                    <Button
                      key={basis.key}
                      disabled={game.politicalCapital < 4 + cost}
                      onClick={() =>
                        void dispatch({
                          type: 'appoint_minister',
                          ministry: department.key,
                          basis: basis.key,
                        })
                      }
                    >
                      Replace with {basis.label.toLowerCase()}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-[0.7rem] text-ink-faint">
                  Removing {minister.name} costs {(4 + cost).toFixed(0)} PC — of which{' '}
                  {cost.toFixed(0)} is what whoever they represent notices.
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="The building" aside={machine.posture}>
        <Kicker>It outlasts you and knows it</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Capability"
            value={machine.capability.toFixed(0)}
            detail="built over decades, lost in a term"
            tone={machine.capability < 50 ? 'loss' : machine.capability < 66 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Compliance"
            value={`${(machine.compliance * 100).toFixed(0)}%`}
            detail="how much of a decision actually happens"
          />
          <Stat
            label="Memory"
            value={machine.memory.toFixed(0)}
            detail="what nobody wrote down, gone with the people"
            tone={machine.memory < 45 ? 'loss' : 'neutral'}
          />
        </div>
        <div className="mt-3">
          <Meter
            label="Morale"
            value={machine.morale}
            band={`${machine.morale.toFixed(0)}${
              machine.departures > 0 ? ` · ${machine.departures.toFixed(0)} have left quietly` : ''
            }`}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {describeCivilService(machine)}
        </p>
        <div className="mt-4 space-y-2">
          {MACHINE_POSTURES.map((posture) => (
            <div key={posture.key} className="border-t border-rule pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={machine.posture === posture.key || game.politicalCapital < 6}
                  onClick={() =>
                    void dispatch({ type: 'set_machine_posture', posture: posture.key })
                  }
                >
                  {posture.label}
                </Button>
                {machine.posture === posture.key && <Tag tone="accent">current</Tag>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{posture.blurb}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
