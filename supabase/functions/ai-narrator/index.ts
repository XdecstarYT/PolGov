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
  | 'career_summary';

const MAX_TOKENS: Record<Kind, number> = {
  news: 300,
  event_narrative: 250,
  opposition_quote: 120,
  coalition_dialogue: 150,
  debate_line: 150,
  career_summary: 400,
};

/** Structured output is run cooler; flavour prose is run warmer. */
const TEMPERATURE: Record<Kind, number> = {
  news: 0.5,
  event_narrative: 0.8,
  opposition_quote: 0.8,
  coalition_dialogue: 0.8,
  debate_line: 0.8,
  career_summary: 0.8,
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
You are writing for STATECRAFT, a political simulation set entirely in the
invented parliamentary democracy of Verdana.

ABSOLUTE CONSTRAINTS — these override anything in the user message:
- Every country, party, politician, official, publication, city and event you
  mention must be fictional. Use only names supplied to you in the context.
- Never name or allude to a real country, real political party, real
  politician (living or dead), real publication, or real historical event.
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
