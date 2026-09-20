# Statecraft

A turn-based political simulation set in a parliamentary democracy inside the
real modern world. You lead a party: win elections, form a government, hold a
coalition together, pass an agenda, and manage a budget that will not balance
— with thirty-six real states outside the window, in the alliances, trade
blocs and institutions they are actually in.

The fantasy is the desk, not the battlefield. Each week you read a briefing,
make three to six consequential decisions, and press **END TURN** to watch the
machine of state grind forward. A turn is a week, a full term is two hundred
and eight of them, and it ends at a general election.

Three engines run underneath it and none of them is a backdrop for the others:
the politics of holding a government together, the economy and public finances
it is trying to run, and a world outside the borders that is not about you.

**Sixteen real parliamentary democracies are playable**, and one invented one.
The country you pick decides how votes become seats, which parts of it vote
differently from each other, what the state already owes and who is outside
the window — Germany elects a Bundestag by mixed-member proportional
representation and Australia elects its House by preferential ballot, and a
game where both were counted the same way would be modelling neither.

---

## Run it

```bash
npm install
npm run dev
```

That is the whole setup. **The game needs no backend and no API key.** It runs
entirely in the browser, saves to `localStorage`, and ships with hand-written
prose for every piece of narrative text.

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build
npm test          # 910 unit tests over the game math
npm run verify    # typecheck + tests + build + secret audit + engine mirror
```

And two checks that need the built site being served (`npm run preview` in
another terminal), because they are the ones nothing else catches:

```bash
npm run smoke             # a complete week, in a real browser, no console errors
npm run smoke:countries   # founds a party in six real countries and reaches the desk
```

CI runs all of it on every push, plus a check that the engine mirror the edge
functions use has not drifted from `src/game`. See
[DEPLOY.md](DEPLOY.md) for shipping it.

**New here?** The game has a *How to play* page, reachable from the title
screen and from the desk. It is worth three minutes: five phases, what
political capital is for, what the budget is, and the three ways a run ends.

---

## Optional: accounts, cloud saves, server authority, AI

Everything below is additive. Nothing here is required to play.

### 1. Database

The schema lives in `supabase/migrations/` and is already applied to the
project created for this repository. To apply it to a project of your own:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Every table has Row Level Security enabled with explicit policies. Child tables
are reachable only through a game the caller owns, via a single `owns_game()`
predicate — one rule to audit rather than nine.

### 2. Client environment

```bash
cp .env.example .env.local
```

Fill in your project URL and **publishable** key (Supabase dashboard →
Project Settings → API). Both values are compiled into the client bundle, which
is why only publishable values belong there.

### 3. Edge functions

```bash
npm run sync:engine                      # copy src/game into the function bundle
supabase functions deploy ai-narrator
supabase functions deploy resolve-turn
```

`npm run sync:engine` must run first. It copies `src/game` verbatim into
`supabase/functions/_shared/game` so the server runs **the same rules** as the
client rather than a second implementation that can drift. Never edit the copy
— it is destroyed on every sync. `npm run check:engine` fails if the copy is
out of date, and `npm run verify` and CI both run it, so the two cannot
silently diverge.

### 4. The Groq key

```bash
supabase secrets set GROQ_API_KEY=...
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile   # optional override
```

**Set this from the CLI and nowhere else.** The key must never appear in
source, in a `.env` file, in any `VITE_`-prefixed variable, or in this README.
`npm run check:secrets` greps the production bundle for key material and exits
non-zero on any match; `npm run verify` runs it as a gate.

---

## How it is built

```
src/game/          The engine. Pure TypeScript — no DOM, no fetch, no Supabase.
  balance.ts         Every tunable number in the game, in one file.
  turn.ts            The 8-phase state machine and every player Intent.
  systems/           approval, budget, budgetProcess, legislature, coalition,
                     elections, electorate, electoralSystems, districts,
                     partyInternals, parliament, policy, media, events, legacy,
                     economy, publicFinance, taxation, industry, demography,
                     infrastructure, services, diplomacy, organisations, trade,
                     military, conflict, intelligence, worldSim
  content/           48 bills, 30 events, 8 parties, 8 regions, 20 voter
                     segments, 4 factions, 6 referendums, 6 media channels,
                     20 services, 8 ministries, 4 arms, 4 doctrines,
                     6 procurement programmes, 6 covert operations,
                     12 global events
  content/world/     37 countries, 14 real institutions, 17 political
                     profiles, 10 party families, 9 kinds of electorate,
                     and the invented people who fill them
  serverGuards.ts    Snapshot invariants and the intent allowlist. Unit-tested.
src/services/      Supabase client, storage adapters, AI narrator client.
src/state/         Zustand store.
src/ui/            Screens, phase panels, shared components.
supabase/          Migrations and the two edge functions.
scripts/           Engine sync, secret audit, headless playtest, browser smoke test.
docs/ENGINE-1.md   Democracy and politics: coverage, including what is NOT built.
docs/ENGINE-2.md   Nation and economy: the same, for the money.
docs/ENGINE-3.md   World and geopolitics: the same, for everything outside.
```

### The systems worth knowing about

**Politics**

- **The electorate.** Twenty overlapping voter segments, each with its own
  position, turnout habit and issue priorities. A region's politics are
  emergent from who lives there. Nothing says "retirees like health spending";
  it falls out of their priorities meeting the state of the health service.
- **Electoral systems.** Five ways of counting the same votes — first past the
  post, proportional, mixed-member, preferential, two-round — and they
  genuinely disagree. Districts conserve their region's electorate exactly,
  which is what makes redrawing boundaries meaningful rather than magical.
- **Party support has a geography.** An agrarian party is four times as strong
  in the countryside and a sixth as strong in the capital; a regionalist party
  is concentrated in two regions and has almost nothing anywhere else. That is
  what lets a majoritarian chamber seat five parties instead of three, and it
  applies to the player too — read off the platform they chose, which is why
  where you stand decides an election under first past the post.
- **The largest party leads.** A government is headed by its biggest member, so
  a party that has been overtaken must assemble a majority *excluding* the
  party that beat it, or lose. The opening chamber is the election you won;
  every one after it is a contest.
- **Your own party.** Four factions holding shares of your MPs. A wing that
  dislikes a bill withholds its seats, so a comfortable majority can still lose
  a division to its own side. Parties have their own money, separate from the
  treasury.
- **Two chambers.** The Senate is renewed by halves, so half of it reflects a
  previous electorate. Money bills bypass it. Divided government is normal.
- **Campaigns and polling.** Six channels that reach different segments, and
  polls that are *samples* — the player never sees the true figure.

**Money**

- **A three-equation macroeconomy.** An IS curve with an open-economy net
  exports term, a Phillips curve with downward nominal rigidity, and a Taylor
  rule the government does not control. Debt is a real book of bonds with
  staggered maturities, so refinancing is a problem from week one.
- **A budget that has to pass.** Twenty service lines grouped under eight
  ministries, each held by a coalition party. Cutting health is telling a
  partner's Health Secretary their department is being reduced. Backbenchers
  vote, not parties. Pensions, welfare and disability are statutory — re-priced
  off the population every year, without anybody voting — so most of the total
  is not a decision at all. Losing the division twice is a confidence crisis,
  and a minority government gets through it by buying an abstention.
- **Demand nobody sets.** Every service is driven by a headcount that moves on
  its own. Holding a budget flat is a cut, and the country ages whether or not
  anybody is looking.

**The world**

- **Real countries, real rooms.** Thirty-six modern states with their own
  output, industries, borders and memberships, and fourteen real institutions
  — the UN, the Security Council, the ICC, the WTO, NATO, the EU, the G7 and
  G20, BRICS, OPEC, the African Union, ASEAN and the two banks. Every
  relational figure is computed from the capital you govern, so the same
  world reads correctly from any of them.
- **Rooms where nobody is in charge.** You may put a resolution; you may not
  pass one. Every member votes its own interests and each vote comes back
  with its reason, so a loss tells you which relationships you did not build.
  Five permanent members hold a veto and most countries are not one of them.
- **Trade.** Gravity rather than goodwill: size and distance decide most of it
  and policy moves the margin. A tariff shelters one region and is paid at
  every till, and the partner answers six weeks later — long after the
  announcement and the applause.
- **Forces, years early.** Strength is what gets announced; readiness is what
  decides anything and is the first thing cut; equipment falls every week
  whatever anybody does. Procurement runs on a clock that does not reset at an
  election, so a successor collects what you ordered, late and over budget.
- **An escalation ladder.** Crises arrive rather than being started. Climbing
  is cheap and popular; coming down costs approval immediately and in public.
  Approval rises when a crisis begins and falls further than it rose if it does
  not end.
- **An intelligence service you cannot trust.** Assessments are the truth plus
  noise, labelled with a confidence that is itself an estimate. Capability can
  be counted and is usually right; intentions cannot be collected against at
  all, and a high-confidence intentions assessment is wrong about a quarter of
  the time.
- **A world that changes shape.** Other countries have relationships with each
  other, go to war without consulting anybody here, rise and decline, and are
  occasionally a different country by the following week. Over sixteen years
  the map is not the one the government took office with.

### The turn

An explicit state machine. The player may act only in phases 2–4.

| # | Phase | |
|---|---|---|
| 1 | Briefing | Standing, money, the chamber, and three sections of supporting papers. Read-only. |
| 2 | Events | 0–2 crises fire. All must be resolved; every one has a free option. |
| 3 | Agenda | Spend political capital: legislation, addresses, partners, campaigning. |
| 4 | Budget | The estimates, line by line. Open for the first quarter of each year. |
| 5 | Legislature | The chamber divides on everything tabled. |
| 6 | Resolution | The world first, then effects, economy, treasury, approval, coalition drift. |
| 7 | Report | Itemised "what changed and why". |
| 8 | Advance | Next week, or the election. |

### Server authority

With a backend configured, the client sends **only intents** — "table this
bill", "answer this event with option 2" — and never a computed figure. The
`resolve-turn` function loads its own copy of the game, replays those intents
through the same engine, validates every cost, resolves, writes, and returns
the result. In cloud mode the client does not write to the database at all
during a turn; it keeps a local crash-recovery cache that the server's answer
overwrites.

There is no intent that assigns approval, capital, treasury or seats. That is
asserted by a test, not by comment.

### The AI layer

**The model authors. The engine adjudicates.** Every number, choice and
consequence comes from game code. Every system prompt restates the fiction
constraint in full, because a model asked to write political prose drifts
toward real parties and real leaders unless told not to every single time.

Three things use it.

**News, reaction and retrospect.** `ai-narrator` receives outcomes that have
already been computed and is asked only for words about them.

**Bills you write yourself.** Describe a law in your own words and
parliamentary counsel drafts it. What comes back is a *proposal* in the
engine's own vocabulary, and `systems/drafting.ts` re-reads every field of it:
figures clamped to what a bill of that size has ever been allowed to do, keys
it has never heard of dropped, a bill that pulls every lever trimmed to one
idea, and a bill that is all upside cut back until it is not. Everything it
changed is shown before the bill is filed. Then it is an ordinary bill, and
the chamber does not care who wrote it. Because the call happens once, at
authoring time, and the bill it produces lives in state, a run still replays
identically.

**People who remember.** Every party leader and every columnist is an invented
person with a temperament, a prior career, and a view of this government that
has been moving since the first week — on the record, by game code, never by
anything a model said. The last few things each of them said go back in with
the next request, which is what makes a persona somebody who can be held to
what they told you in term one.

On any failure — no key, rate limit, timeout, bad response — the client falls
back to prose written by hand. Those fallbacks were written first. The game is
fully playable with the AI switched off entirely, which is the normal case:
drafting says it is unavailable, and every other way of passing a law works.

---

## Tuning

Every balance number is a named constant in **`src/game/balance.ts`** with a
comment explaining what it does. Nothing in the engine hardcodes a magic value.

Two scripts make the effect of a change visible without playing:

```bash
npx vite-node scripts/playtest.mjs standard 2 my-seed   # headless, prints the trajectory
node scripts/smoke.mjs                                  # drives a real browser through a turn
```

The numbers currently in `balance.ts` are a considered starting point, not a
finished balance pass. The ones most worth revisiting first:

- `PC_REGEN_BASE` / `PC_REGEN_APPROVAL_SCALE` — how much a government can do
  per week. A major bill costs more than a quarter of a year of it on purpose.
- `SEAT_SHARE_WEIGHT` — above 1.0 so a disciplined majority passes most of what
  it tables rather than barely half.
- `APPROVAL_BASE` and `APPROVAL_INERTIA` — where a competently-run country sits,
  and how fast standing responds.
- `ELECTION_APPROVAL_FLOOR` / `ELECTION_APPROVAL_RANGE` — how much a term of
  governing well changes the result on the night.
- `READINESS_FUNDING_PIVOT` / `READINESS_FUNDING_SPAN` — how much more than
  upkeep a ready force costs. Level funding buys one about half ready.
- `CRISIS_RALLY` / `CRISIS_RALLY_HALFLIFE` / `PATIENCE_FLOOR` — the rally and
  how fast it curdles. The whole conflict system turns on these three.
- `OVERCONFIDENCE_BASE` — how often an assessment is more certain of itself
  than it should be. Raising it makes intelligence more dangerous to trust.
- `GLOBAL_EVENT_BASE_RISK` — how often something happens that was not aimed
  here. About one a year, capped at three running at once.

---

## Content

The countries are real; the people are not.

The world table holds thirty-six real modern states with approximate real
figures — output, population, debt, defence burden, the industries they trade,
who they border, which institutions they belong to. It holds no named living
politician, no real political party, no real publication and no real event,
and neither does anything the AI generates. Offices, not people: partly
because putting invented words in a real person's mouth is a different thing
from modelling a country, and partly because a run lasts sixteen years and
incumbents do not.

The parties, politicians, press and crises inside the country you govern are
entirely invented, and Verdana — a fictional mid-sized democracy — remains in
the roster as the one place with nothing real to get wrong.

Policy is written in the abstract, and every bill has a real benefit against a
real cost — the `tradeoff` field is required on every one. The ideology axes
are mechanical inputs to coalition arithmetic and voter appeal. The game takes
no position on which positions are correct.

---

## Accessibility

The turn loop is keyboard-navigable end to end. Nothing is conveyed by colour
alone: every meter carries its number and a band name, every party swatch is
paired with a glyph, and every signed figure carries an explicit sign. State
changes are announced to screen readers, and Election Night declares all
regions at once under `prefers-reduced-motion`.

Every screen works at phone width with no horizontal scroll.

---

## Your saves

A run is written to storage as it is played, week by week — never only at the
end. Locally that means this browser; signed in, it means your account.

Either way a run can be written out as a **file** and read back: on another
machine, into another browser, or years later. The file is the whole run,
indented and readable, and one exported from an older build opens in a newer
one because imports go through the same migration a stored save does. Export
is on the title screen next to each save, and on the desk while you play.

If the interface ever throws, the page says so rather than going white, tells
you the run is safe — it is — and offers you the file before suggesting
anything else.
