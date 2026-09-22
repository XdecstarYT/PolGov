# Deploying Statecraft

The game is a static site. Everything below the first section is optional:
**the whole game is playable with no backend at all**, saving to browser
storage, with hand-written prose in place of the AI. That is a supported
way to ship it and the fastest way to try it.

---

## 1. The game on its own

```bash
npm ci
npm run build          # → dist/
```

Serve `dist/` from anything — Netlify, Vercel, Cloudflare Pages, GitHub
Pages, `npx serve dist`. There is no server component and no build-time
configuration.

What you get: every engine, every country, local saves, and the
hand-written prose. What you do not get: accounts, cross-device saves,
server-side turn resolution, and AI narration.

---

## 2. Accounts, cloud saves and server authority

Requires a Supabase project.

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                        # runs supabase/migrations/*
```

The migrations create the tables, turn on **row-level security for every
one of them**, and add the policies. `0002_rls.sql` is the one to read if
you are auditing: no table is reachable without `owns_game()`.

Then point the client at the project:

```bash
# .env.local — NOT committed
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<the publishable key, sb_publishable_...>
```

Both are *publishable* values and are meant to reach the browser. They are
safe there precisely because RLS is on; if RLS were off they would not be,
which is why the migrations turn it on rather than leaving it to a setting.

Deploy the functions:

```bash
supabase functions deploy resolve-turn
supabase functions deploy ai-narrator
```

`resolve-turn` is what makes the cloud mode authoritative: the client sends
intents, the server re-runs them against its own copy of the engine, and a
snapshot that does not match is rejected. `supabase/functions/_shared/game`
is that copy — keep it in step with `npm run sync:engine`. Both `npm run
verify` and CI fail if it has drifted.

---

## 3. The AI layer

One secret, set once, from your own machine:

```bash
supabase secrets set GROQ_API_KEY=<your key>
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile   # optional
```

**The key is never in the client.** Not in the bundle, not in a `VITE_`
variable, not in this file, not in the repository. It is read from
`Deno.env` inside `ai-narrator` and used there. `npm run check:secrets`
greps the built bundle for key material and fails the build if it finds
any; CI runs it on every push.

Per-user rate limiting is on by default at 60 calls an hour, in
`ai-narrator/index.ts`, so a stolen session cannot burn the quota.

With no key set, every AI call returns empty and the client uses its own
prose. Nothing breaks, nothing is disabled, and no error is shown — the
fallbacks were written first, which is why this is the normal case rather
than a degraded one.

---

## 3b. AI without Supabase at all (not recommended)

Everything above — accounts, cloud saves, `resolve-turn`, and the safe path
to Groq — needs a Supabase project. If you don't want one but still want AI
prose, the client can call Groq directly from the browser instead. This is a
straight security trade-off, not a shortcut to the same thing:

- The key ships **inside the public bundle**. Anyone who opens dev tools or
  views the page source on your deployed site can read it and spend it as
  their own. There is no way to stop this short of rotating the key.
- There is no per-user rate limit, because there is no server to hold one.
  The client throttles itself to 60 calls an hour, which stops this game's
  own code from running away with your quota — it does nothing against
  someone using the key they just lifted from the page.
- `npm run check:secrets` is written to fail a build that embeds a Groq key,
  on purpose. Setting `VITE_GROQ_API_KEY` makes it print a loud warning and
  skip only the two rules shaped for that key, instead of failing — every
  other rule (service-role keys, private-key blocks, the `GROQ_API_KEY`
  name) still runs.

If that trade-off is one you want:

```bash
# .env.local, or your host's environment variables — NOT committed
VITE_GROQ_API_KEY=<your Groq key>
VITE_GROQ_MODEL=llama-3.3-70b-versatile   # optional
```

On Netlify specifically: Site configuration → Environment variables → add
`VITE_GROQ_API_KEY`, then trigger a redeploy — Vite bakes `VITE_` values in
at build time, so setting the variable alone does not change an
already-built site.

When both this and a configured Supabase project are present, the Supabase
path is used and this one is never called — this is purely a fallback for
when there is no backend at all, not a way to add a second key.

---

## 4. Before you publish

```bash
npm run verify     # typecheck, test, build, secret audit, engine mirror
node scripts/smoke.mjs   # drives a whole turn in a real browser
```

`scripts/smoke.mjs` needs the built site being served — `npx vite preview
--port 4173` in another terminal — and walks eighteen steps from the title
screen through a complete week, failing on any console error.

### Things worth deciding before a public launch

- **Rate limits.** The 60/hour default is per user. If the deployment is
  open to the internet, the AI quota is the thing that will be exhausted
  first.
- **Auth.** Magic links only. There is no password to leak, and no
  password reset flow to get wrong.
- **Saves.** Local saves live in one browser. The title screen offers
  export and import for exactly this reason; say so somewhere your players
  will read it.
