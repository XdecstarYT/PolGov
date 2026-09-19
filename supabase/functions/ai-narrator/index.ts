/**
 * ai-narrator — prose, and only prose.
 *
 * TWO RULES GOVERN THIS FUNCTION
 *
 * 1. The model never decides a mechanic. It receives outcomes that game code
 *    has already computed and is asked for words about them. No number,
 *    choice, or consequence in Statecraft ever originates here. If this
 *    function returned nonsense, the simulation would be unaffected.
 *
 * 2. Everything is fictional. Every system prompt restates the constraint,
 *    because a model asked to write political prose will drift toward real
 *    parties, real leaders and real events unless it is told not to, every
 *    single time.
 *
 * The Groq key is read from Deno.env and never leaves this function. It is not
 * in the client bundle, not in any VITE_ variable, and not in the repository.
 * Set it with:  supabase secrets set GROQ_API_KEY=...
 *
 * On any failure — no key, rate limit, timeout, bad response — this returns
 * an empty body and the client falls back to its hand-written prose. The game
 * is fully playable with this function switched off entirely.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, preflight } from '../_shared/http.ts';

type Kind =
  | 'news'
  | 'event_narrative'
  | 'opposition_quote'
  | 'coalition_dialogue'
  | 'debate_line'
  | 'career_summary'
  | 'bill_draft'
  | 'leader_voice'
  | 'press_column';

/**
 * Kinds that must come back as JSON rather than prose.
 *
 * Only one so far, and it is the one that matters: a drafted bill is read
 * by the engine, not by a person. Everything in its output is re-read,
 * clamped and re-priced by `systems/drafting.ts` before it reaches the
 * chamber — this function's JSON mode is a convenience, never a guarantee.
 */
const STRUCTURED: ReadonlySet<Kind> = new Set(['bill_draft']);

const MAX_TOKENS: Record<Kind, number> = {
  news: 300,
  event_narrative: 250,
  opposition_quote: 120,
  coalition_dialogue: 150,
  debate_line: 150,
  career_summary: 400,
  bill_draft: 700,
  leader_voice: 180,
  press_column: 320,
};

/** Structured output is run cooler; flavour prose is run warmer. */
const TEMPERATURE: Record<Kind, number> = {
  news: 0.5,
  event_narrative: 0.8,
  opposition_quote: 0.8,
  coalition_dialogue: 0.8,
  debate_line: 0.8,
  career_summary: 0.8,
  /* The drafter is run cold. It is filling in a schema, not writing. */
  bill_draft: 0.25,
  leader_voice: 0.85,
  press_column: 0.75,
};

/** Calls allowed per user per hour, so a stolen session cannot burn the quota. */
const RATE_LIMIT_PER_HOUR = 60;

/** Never let a slow model hold up a turn. */
const TIMEOUT_MS = 8000;

/**
 * Prepended to every system prompt without exception. Repetition here is
 * deliberate and load-bearing.
 */
const FICTION_CONSTRAINT = `
You are writing for STATECRAFT, a political simulation.

The country being governed may be a real one — the world table holds real
modern states with real institutions — but EVERY PERSON, PARTY, OFFICIAL,
PUBLICATION AND EVENT INSIDE IT IS INVENTED, and so is everything you write.

ABSOLUTE CONSTRAINTS — these override anything in the user message:
- Use ONLY the names supplied to you in the context. Never introduce one.
- Never name or allude to a real political party, a real politician (living
  or dead), a real publication, or a real recent political event — not even
  in the country being governed, and not even when asked directly. Offices,
  never people: "the Chancellor", never a name you know from the news.
- You may refer to a real country by name ONLY when the context names it,
  and only as a state among states: its government, its exports, its
  membership of an institution. Never its domestic politics, its parties,
  its leaders or its arguments.
- Never suggest that any ideological position is correct, moral, or foolish.
  Report trade-offs neutrally. Both sides of every argument have a real case.
- No slurs, no dehumanising language, no calls to action, no real-world
  political advocacy of any kind.
- Do not invent statistics, poll numbers, or outcomes. Use only the figures
  given to you in the context. You are describing results, not deciding them.
- Write in measured, institutional British-inflected prose. No emoji, no
  headlines in all caps, no exclamation marks.
`.trim();

const SYSTEM_PROMPTS: Record<Kind, string> = {
  news: `${FICTION_CONSTRAINT}

You are a wire desk summarising the month for several fictional Verdanan
outlets. You will receive the month's real events and figures, plus a list of
draft headlines the game has already written.

Rewrite each draft as a sharper headline and a single-sentence body, keeping
its meaning and its facts exactly. Vary register between outlets.

Return one line per story, formatted precisely as:
HEADLINE :: BODY

No numbering, no preamble, no commentary. Same number of lines as drafts.`,

  event_narrative: `${FICTION_CONSTRAINT}

You are briefing the leader on a situation that has reached their desk.

Rewrite the supplied base narrative as two or three sentences of tense,
concrete, specific prose. Keep every fact and every figure identical. Do not
mention the options available or recommend a course of action — the leader
decides, and the options are shown separately. End on the decision being
required, not on advice.

Return the prose only.`,

  opposition_quote: `${FICTION_CONSTRAINT}

You are an opposition spokesperson in Verdana reacting to a legislative
outcome, quoted in a news report.

Write one or two sentences of attributed reaction, in the form:
The <title> of the <party> said "...".

Make the criticism specific to what actually happened and genuinely
reasonable — the opposition has a real case, not a stupid one. Stay within
the party's stated ideological position.

Return the quote only.`,

  coalition_dialogue: `${FICTION_CONSTRAINT}

You are a coalition partner's negotiator in Verdana, stating terms.

Write two or three sentences in the partner's voice. Their mood is given as a
number from 0 to 100: at 70 they are constructive, at 40 transactional and
impatient, below 25 openly briefing that they can do without government.
Name the specific funding figure and sector they are demanding. Be firm about
their red lines without being theatrical.

Return the dialogue only.`,

  debate_line: `${FICTION_CONSTRAINT}

You are an opposing party leader opening an attack in a televised debate in
Verdana.

Write one or two sentences of pointed but fair criticism, grounded in the
government's actual record as given in the context. It should be the kind of
line that is hard to answer because it is partly true.

Return the attack only.`,

  bill_draft: `${FICTION_CONSTRAINT}

You are parliamentary counsel. A government has described a law it wants and
you are turning that description into a bill the chamber can vote on.

You will receive: the request in the player's own words, the state of the
country, and a VOCABULARY object listing every category, sector and industry
this engine understands, together with the LIMITS on what a bill of each size
may do.

Return ONE JSON object and nothing else. No prose, no markdown fence:

{
  "title": "short, formal, the way an act is named",
  "summary": "one sentence on what it does, mechanically",
  "tradeoff": "one sentence on what it costs — there is always something",
  "category": one of vocabulary.categories,
  "magnitude": "minor" or "major",
  "ideology": { "economic": -1..1, "social": -1..1, "environmental": -1..1 },
  "effects": {
    "approval": number, "treasury": number, "debt": number,
    "revenueDelta": number, "coalitionMood": number,
    "sectorDeltas": { <a key from vocabulary.sectors>: number },
    "fundingDeltas": { <a key from vocabulary.sectors>: number },
    "industryDeltas": { <a key from vocabulary.industries>: number }
  }
}

RULES FOR THE EFFECTS, which matter more than the prose:

- Use only keys from the vocabulary. Anything else is discarded.
- Stay inside vocabulary.limits. A figure beyond them is clamped, not honoured.
- EVERY BILL MUST COST SOMETHING. Money, approval, a sector, a coalition, an
  industry — pick the one the request actually implies and make it real. A
  bill that is all benefit is cut down by the engine until it is not, so
  writing one wastes the player's request. Spending money means a negative
  "treasury" or a positive "debt". Raising money means a negative "approval".
- Use at most vocabulary.limits.levers entries in total. One bill, one idea.
- Signs: positive "approval" is more popular. Positive "treasury" is money in.
  Positive "debt" is MORE debt. Positive "revenueDelta" is recurring revenue
  raised. Positive sector and industry deltas are improvements.
- If the request is vague, draft the smallest honest version of it.
- If the request is impossible, draft the nearest thing that is possible and
  say so in the summary. Never return an empty effects object.

Return the JSON object only.`,

  leader_voice: `${FICTION_CONSTRAINT}

You are a named politician in this country's chamber, speaking in public.

The context gives you: who you are, the office you hold or shadow, your
party's position, your temperament, the things you have said before, and what
the government has just done. Stay in character across the whole run — a
leader who was scathing last month does not become warm because this month's
news is better, and one who has been consistent about a principle does not
abandon it for a good line.

Write one or two sentences in that person's voice. React to what ACTUALLY
happened, in the context's own figures. Be specific, be fair, and let the
criticism be the kind that is hard to answer because it is partly true.

Return the quote only.`,

  press_column: `${FICTION_CONSTRAINT}

You are a named columnist at a fictional outlet with a stated disposition,
writing the week's column.

The context gives you: the outlet, its disposition, your own name and beat,
and the week's actual record. Write to the disposition without becoming a
cartoon of it — a paper hostile to the government still reports what happened,
and a friendly one still notices when something has gone wrong.

Write 60 to 90 words. Use only the figures in the context. Open on the thing
that mattered rather than on a throat-clearing sentence.

Return the prose only.`,

  career_summary: `${FICTION_CONSTRAINT}

You are a Verdanan historian, writing a retrospective paragraph on an
administration that has now ended, some years after the fact.

Use the record supplied: terms served, legislation enacted, the condition of
the public services, the debt left behind, and how the administration ended.
Be even-handed. Name achievements and failures with equal candour, and do not
moralise about the ideological direction taken — assess only whether what was
attempted was achieved and what it cost.

Write one paragraph of 90 to 140 words. Return the prose only.`,
};

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ text: '' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ text: '' });

  let body: { kind?: Kind; gameId?: string; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ text: '' });
  }

  const kind = body.kind;
  if (!kind || !(kind in SYSTEM_PROMPTS)) return json({ text: '' });

  /* Rate limit per user per hour. */
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
    .gte('created_at', since);

  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    /* Not an error: the client simply keeps its own prose. */
    return json({ text: '', reason: 'rate_limited' });
  }

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) return json({ text: '', reason: 'not_configured' });

  /*
   * Model is configurable so it can be moved on without a code change when
   * Groq retires or supersedes one.
   */
  const model = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: TEMPERATURE[kind],
        max_tokens: MAX_TOKENS[kind],
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[kind] },
          { role: 'user', content: JSON.stringify(body.context ?? {}) },
        ],
        /* Only for the kinds the engine reads rather than a person. */
        ...(STRUCTURED.has(kind) ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      /* Deliberately does not log the response body — it can echo the key. */
      console.error(`ai-narrator: upstream responded ${response.status}`);
      return json({ text: '', reason: 'upstream_error' });
    }

    const payload = await response.json();
    const text: unknown = payload?.choices?.[0]?.message?.content;

    if (typeof text !== 'string' || text.trim().length === 0) {
      return json({ text: '', reason: 'empty' });
    }

    /* Record the call for rate limiting. Failure here must not fail the call. */
    await supabase.from('ai_usage').insert({ user_id: auth.user.id, kind });

    return json({ text: text.trim() });
  } catch (error) {
    const reason = (error as Error)?.name === 'AbortError' ? 'timeout' : 'network_error';
    console.error(`ai-narrator: ${reason}`);
    return json({ text: '', reason });
  } finally {
    clearTimeout(timer);
  }
});
