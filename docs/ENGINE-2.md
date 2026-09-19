# Engine 2 — Nation & Economy

Coverage against the 150-feature brief, written to be useful rather than
flattering. Same three categories as `ENGINE-1.md`: **built** means a real
system with mechanical consequences and tests, **light** means present but
thin, **not built** means absent.

Roughly **118 built, 22 light, 10 not built**.

---

## What the engine actually does now

### The macroeconomy (1–20)

Three equations, and none of them is a dial the player can turn.

An **IS curve** sets the growth the economy is heading for: trend, minus the
output gap closing, minus the real interest rate above neutral, plus
confidence, plus the fiscal impulse, plus net exports. A boom exhausts faster
than a slump heals, because above capacity you run out of people and parts and
below it you merely have people sitting idle.

A **Phillips curve** sets inflation, with downward nominal rigidity: slack
pushes prices down far more weakly than tightness pushes them up, because
firms stop hiring long before they cut wages and cut wages long before they
cut prices.

A **Taylor rule** sets the policy rate. It is not the government's instrument
and cannot be argued with. A player who stimulates into a closed output gap
watches it climb and pays twice — once in growth and once in debt service.

Underneath: Okun's law for unemployment with hiring and firing both lagging,
an AR(1) business cycle with variance-matched weekly noise, productivity that
drifts toward what schools and infrastructure support over a decade, and a
Treasury forecast produced by running the same weekly step fifty-two times
with the weather set to zero — which is why the forecast is always a little
wrong in a way nobody could have told the player in advance.

### Government finance (21–40)

Debt is a **real book of bonds** with staggered maturities and individual
coupons, so refinancing is a problem from week one and a problem somebody else
created. Debt service is the sum of coupons actually due, not a flat rate.

A **credit rating** that reviews on its own schedule, a spread that widens
before the downgrade rather than after it, **fiscal rules** a government can
adopt and then break in public, an emergency fund it can draw down once, and
**regional grants** that decide whether a region's services are funded at all.

### Taxation (41–60)

Seventeen instruments, each with its own base, revenue peak and set of people
it falls on. The decision is almost never how much to raise — it is *from
whom*, and what the shape of the code does to investment, consumption and
prices beyond the money it collects. A revenue-neutral shift from corporate
tax to land tax has no fiscal impulse at all and still moves investment.

Progressivity, deductions and credits move who pays without moving the total.
Voters stop being angry about a rate long before the treasury stops collecting
it, so the memory of a change ages out.

### Industries (61–80)

Twenty industries, each with its own share of output, a different share of
employment, a regional footprint, an interest-rate sensitivity, a carbon
sensitivity, a tariff sensitivity and a cyclicality. Output is one number and
it cannot tell you why a rate rise ruins Sable Reach and barely touches
Ternhill. This is the system that can.

It is also the join between a national decision and a regional swing: a
tariff, a carbon price or a rate rise lands in specific places, and those
places vote.

### Population (81–100)

The slowest system in the game and the one with the longest reach. Births,
deaths, three age bands, migration in and out separately because they are
argued about separately, urbanisation, participation, and the skills the
economy is asking for. Nothing here moves fast enough for a government to see
the result of its own decisions about it.

It is also what drives every service's demand, and what makes the pensions
line grow through every term of every government.

### Infrastructure (101–120)

Sixteen assets with condition, capacity and utilisation. Maintenance is set as
a share of full upkeep, and anything not spent becomes a **backlog that costs
more than it avoided**. Projects take years, and a government that wants a
photograph rather than a working road finds out which it bought.

### Government services (121–140)

Twenty services, each driven by a headcount that moves on its own — the
retired, the young, the unemployed, the urban. **Nobody sets demand.** Holding
a budget flat is a cut, and the cut arrives as a waiting list rather than as
an announcement.

### Economic events (141–150)

Recessions, banking trouble, house prices, energy, and a recovery the
Treasury is prepared to put in writing. They fire through the economy's own
shock list rather than as bespoke modifiers, so they interact with everything
else automatically.

---

## The budget

The centrepiece, and the reason Engine 2 is not a spreadsheet.

Twenty service lines grouped under **eight ministries**, each held by a
coalition party in proportion to the seats it brings — portfolio share
tracking seat share is one of the most robust findings in the study of
coalitions. Cutting health is not moving a slider; it is telling a named
partner's Health Secretary their department is being reduced, and the
minister's reaction is printed under the number.

**Backbenchers vote, not parties.** A partner whose ministry was cut hard
votes for the budget — they are in the government. Their backbenchers do not,
and that is where budgets are actually lost. There is no whip: a budget is a
confidence matter and everybody already knows how they are voting.

**Most of it is not a decision.** Pensions, welfare and disability are
statutory — a rate in law times a headcount — so the budget cannot touch them,
and they are re-priced off the population every year without anybody voting.
About a sixth of the total, growing through every term.

**Nothing moves far in one year.** A line can fall by a quarter or rise by two
fifths. Capital spending commits the next three budgets, which is how a
government that wants to tie its successors' hands actually does it.

Losing the division, or never presenting one before the deadline, costs
approval and coalition mood and rolls last year's cash figures on. Twice is a
confidence crisis. A minority government gets through it by buying an
opposition party's abstention — confidence and supply, priced on their seats
and their distance from you, and paid for partly in your own party's patience.

---

## Light

- Wage bargaining is a single figure rather than a sector-by-sector process.
- Housing is an index rather than a stock with construction and tenure.
- Regional economies move with their industry mix but have no local policy.
- Corporate structure, bankruptcy and firm entry/exit are not modelled.
- The central bank has a rule but no governor, mandate debate or QE.
- Inequality is present as a distributional effect of the tax code rather than
  as a tracked Gini with its own dynamics.

## Not built

- A financial sector with balance sheets, leverage and contagion.
- An explicit labour market with vacancies and matching.
- Currency and exchange rates. The country is modelled as a closed monetary
  area with an open goods market, which is a simplification that shows.
- Sub-national tax powers.
- Sectoral input–output linkages between industries.
- A stock market.
