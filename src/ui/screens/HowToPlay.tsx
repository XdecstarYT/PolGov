/**
 * HowToPlay.tsx — what the game is, before the game starts.
 *
 * Forty thousand lines of simulation behind five phases and a hundred
 * controls, and until now nothing that said what any of it was for. A
 * player who opens the desk cold sees eight panels of figures and no
 * indication of which of them they are supposed to do something about.
 *
 * What this page is trying to do, in order:
 *
 *   SAY WHAT THE LOOP IS. A week, five phases, END TURN. Everything else
 *   is detail, and detail is much easier to take once the shape is known.
 *
 *   SAY WHAT THE CURRENCY IS. Political capital is the one resource that
 *   gates every decision, and a player who does not know it regenerates
 *   with approval will hoard it and do nothing for four years.
 *
 *   SAY HOW YOU LOSE. Three ways, all of them foreseeable, none of them
 *   sudden. A game that surprises you with an ending has wasted the
 *   sixteen hours you spent not being warned.
 *
 *   SAY WHAT IS NOT A PUZZLE. The asymmetries in this game do not have
 *   solutions — a large country's opinion costs more to ignore than a
 *   small one's, and no amount of clever play changes that. Saying so
 *   here is kinder than letting somebody spend a term looking for the
 *   trick.
 *
 * What it deliberately is NOT is a tutorial that plays the first turn for
 * you. The game is legible enough to learn by doing; what it was missing
 * was somewhere to find out what "legible" was referring to.
 */

import { useGame } from '../../state/store.ts';
import {
  PC_START,
  TURNS_PER_TERM,
  TURNS_PER_YEAR,
  playableCountries,
} from '../../game/index.ts';
import { Button, Kicker, Panel, Rule } from '../components/Primitives.tsx';

interface Phase {
  name: string;
  what: string;
  detail: string;
}

const PHASES: Phase[] = [
  {
    name: 'Briefing',
    what: 'Read where you stand.',
    detail:
      'Approval, the public finances, the five services, and the dossier — the country, the world, the people, and security. Nothing here is a decision. It is the paperwork a decision has to be made from, and every figure on it says what moved it.',
  },
  {
    name: 'Events',
    what: 'Answer what has arrived.',
    detail:
      'Between one and three things a week, each with two or three responses and a stated cost. There is rarely a right answer and never a free one. Ignoring an event is a response, and it is scored as one.',
  },
  {
    name: 'Agenda',
    what: 'Spend political capital.',
    detail:
      'Table legislation and whip it. Address the country. Buy off a coalition partner before they walk. Draft a bill of your own in your own words. In the last eight weeks of a term, campaign.',
  },
  {
    name: 'Budget',
    what: 'Argue about money.',
    detail:
      'Twenty line items across eight departments, of which a third are statutory and cannot be cut. It must pass the chamber once a year, and a government that cannot pass one falls.',
  },
  {
    name: 'Report',
    what: 'Read what happened.',
    detail:
      'Every figure that moved, why it moved, and by how much. This is the page the whole engine exists to be able to write honestly, and it is worth reading even when the week went well.',
  },
];

interface Ending {
  title: string;
  how: string;
}

const ENDINGS: Ending[] = [
  {
    title: 'You lose the election',
    how: 'A term is four years. At the end of it the country votes, and a record of failed services, high debt and a weak economy costs about three quarters of your seats. This is the ordinary ending, and it is survivable: you can come back.',
  },
  {
    title: 'You lose the confidence of the chamber',
    how: 'A coalition partner whose red lines you crossed and whose mood you let fall to nothing walks out. If what remains cannot pass a budget, the government falls mid-term. Both halves of that are visible for months beforehand.',
  },
  {
    title: 'You stand down',
    how: 'Available at any time, from the agenda. A career that ends on your own terms is assessed the same way as one that did not, which is the point of assessing it at all.',
  },
];

export function HowToPlay() {
  const { setScreen, saves, game } = useGame();
  /* Reachable mid-run from the desk, so "back" has to mean the desk. A
     help page that dropped you at the title would be its own small bug. */
  const midRun = Boolean(game);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="border-b-2 border-ink pb-4">
        <Kicker>Before you start</Kicker>
        <h1 className="font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          How to play
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink-soft">
          You lead a political party in a parliamentary democracy. Win an election, form a
          government, hold it together, pass an agenda, and manage a budget that will not
          balance. The fantasy is the desk, not the battlefield.
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <Panel title="The loop">
          <p className="font-serif text-lg leading-relaxed text-ink">
            A turn is one week. A term is {TURNS_PER_TERM} of them — four years — and ends at a
            general election. Each week you read a briefing, make three to six consequential
            decisions, and press <span className="font-semibold">END TURN</span>.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            That is the whole shape of it. Everything below is detail, and detail is much
            easier to take once you know what it hangs off. A week is small enough that no
            single one matters and a term is long enough that all of them do.
          </p>

          <Rule />

          <ol className="space-y-3">
            {PHASES.map((phase, i) => (
              <li key={phase.name} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="tnum mt-0.5 shrink-0 text-sm font-semibold text-ink-faint"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <span className="font-serif text-sm font-semibold text-ink">{phase.name}</span>
                  <span className="ml-2 text-sm text-ink-soft">{phase.what}</span>
                  <p className="mt-1 text-xs leading-relaxed text-ink-faint">{phase.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Political capital">
          <p className="text-sm leading-relaxed text-ink-soft">
            The one resource that gates every decision. You start a term with {PC_START} and
            bank more each week <em>in proportion to your standing</em> — so a popular
            government can do more, and an unpopular one finds every door heavier.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            It does not accumulate usefully. Hoarding it for a term buys one large thing and
            costs you four years of small ones, and the small ones are what standing is made
            of. Spend it.
          </p>
        </Panel>

        <Panel title="The budget">
          <p className="text-sm leading-relaxed text-ink-soft">
            Once a year the government has to pass one, and a government that cannot pass a
            budget falls. It is twenty line items across eight departments — and roughly a
            third of it is statutory, which means it is set by law and indexed to demand, and
            you cannot cut it by deciding to.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Departments are held by whoever negotiated for them when the government formed.
            Every line you write in the spring is a line in somebody else&rsquo;s department,
            and they get a say.
          </p>
        </Panel>

        <Panel title="How a run ends">
          <ul className="space-y-3">
            {ENDINGS.map((ending) => (
              <li key={ending.title}>
                <span className="font-serif text-sm font-semibold text-ink">{ending.title}</span>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">{ending.how}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            None of the three is sudden. Each is visible for weeks or months beforehand, in
            figures the briefing shows you every turn. A game that surprised you with an
            ending would have wasted the time you spent not being warned about it.
          </p>
        </Panel>

        <Panel title="Three things that are not puzzles">
          <p className="text-sm leading-relaxed text-ink-soft">
            Some of what makes this hard has no clever answer, and it is kinder to say so than
            to let you spend a term looking for one.
          </p>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-soft">
            <li>
              <span className="text-ink">Size decides what your opinion is worth.</span> A
              protest to Washington is a diplomatic event; the same protest to Wellington is a
              letter. Nothing you can do opts out of that. It is the position a middling
              country is actually in.
            </li>
            <li>
              <span className="text-ink">Everything good is slow.</span> Schools funded today
              show up in the workforce in eight years, under a government that will not be
              yours. Readiness cut today costs nothing anybody can see and changes what is
              possible for somebody else.
            </li>
            <li>
              <span className="text-ink">You may put a resolution; you may not pass one.</span>{' '}
              Other governments vote their own interests, and five of them hold a veto. A
              player who has not spent years building relationships will find that being right
              is not sufficient and is sometimes not relevant.
            </li>
          </ul>
        </Panel>

        <Panel title="Where you play">
          <p className="text-sm leading-relaxed text-ink-soft">
            {playableCountries().length - 1} real parliamentary democracies, and one invented
            country. The country decides how votes become seats, which parts of it vote
            differently from each other, what the state already owes, and who is outside the
            window.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            If you are learning the machinery, start in <span className="text-ink">Verdana</span>
            . It is the one place with nothing real to get wrong: proportional counting, eight
            regions, seven other parties, and an economy at exactly the scale everything else
            in the engine is measured against.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            The countries are real. Nobody in them is. Every party, politician, official and
            publication in the game is invented, including in the real countries — offices,
            never people.
          </p>
        </Panel>

        <Panel title="One more thing">
          <p className="text-sm leading-relaxed text-ink-soft">
            Everything is a year late and nothing is reversible. The decisions that decide a
            run are taken in the first term and paid for in the third, which means the way to
            play this well is to spend your first four years on things you will not see
            finish.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Most players do not, the first time. That is fine. The career summary at the end
            tells you what it cost, and the next run is {TURNS_PER_YEAR} weeks a year better
            informed.
          </p>
        </Panel>
      </div>

      <div className="mt-8 flex flex-wrap gap-2 border-t border-rule pt-5">
        {midRun ? (
          <Button variant="primary" onClick={() => setScreen('game')}>
            ← Back to the desk
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={() => setScreen('setup')}>
              Found a party →
            </Button>
            <Button variant="quiet" onClick={() => setScreen('title')}>
              {saves.length > 0 ? 'Back to your runs' : 'Back'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
