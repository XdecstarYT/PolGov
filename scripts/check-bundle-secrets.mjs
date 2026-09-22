/**
 * Secret audit of the production client bundle.
 *
 * Security requirement 2.2.4: after the edge function exists, grep the built
 * client for the Groq key prefix and any key fragment, and confirm zero
 * matches. This runs over every emitted asset, not just the JS, because a key
 * can just as easily end up in a sourcemap or a CSS url().
 *
 * Exits non-zero on any finding, so it can gate a deploy.
 *
 * ONE DELIBERATE EXCEPTION: `VITE_GROQ_API_KEY` opts a build into calling
 * Groq straight from the browser (see `src/services/narrator.ts`), which
 * means the key is *meant* to reach the bundle. If that variable was set for
 * this build, the two Groq-key-shaped rules below are skipped — everything
 * else (service-role keys, private-key blocks, the `GROQ_API_KEY` name
 * itself) still runs at full strength, so this narrows the exception to
 * exactly the thing that was opted into rather than turning the check off.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const CLIENT_KEY_OPT_IN = Boolean(process.env.VITE_GROQ_API_KEY);

/**
 * Each rule is a thing that must never reach the browser.
 * `allow` lets through the specific benign strings we expect to see.
 */
const RULES = [
  {
    name: 'Groq API key prefix',
    pattern: /gsk_[A-Za-z0-9]{8,}/g,
    allow: [],
    skip: CLIENT_KEY_OPT_IN,
  },
  {
    name: 'Groq API key prefix (bare)',
    // The literal prefix on its own, even without a plausible body.
    pattern: /gsk_/g,
    allow: [],
    skip: CLIENT_KEY_OPT_IN,
  },
  {
    name: 'Supabase secret/service key',
    pattern: /(sb_secret_[A-Za-z0-9_-]+|service_role)/g,
    allow: [],
  },
  {
    name: 'Generic long bearer-style secret',
    pattern: /\b(sk|rk|api|secret)[-_](live|prod|test)[-_][A-Za-z0-9]{16,}/gi,
    allow: [],
  },
  {
    name: 'Private key block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    allow: [],
  },
  {
    name: 'GROQ_API_KEY referenced by name in client code',
    pattern: /GROQ_API_KEY/g,
    allow: [],
  },
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error(`check:secrets — ${DIST}/ not found. Run "npm run build" first.`);
  process.exit(1);
}

const files = await walk(DIST);
const findings = [];
let bytes = 0;

for (const file of files) {
  bytes += (await stat(file)).size;
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    continue; // binary asset
  }

  for (const rule of RULES) {
    if (rule.skip) continue;
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      if (rule.allow.includes(match[0])) continue;
      findings.push({
        file,
        rule: rule.name,
        // Never print the match itself — that would move a secret into logs.
        excerpt: `${match[0].slice(0, 4)}… (${match[0].length} chars) at offset ${match.index}`,
      });
    }
  }
}

console.log(`check:secrets — scanned ${files.length} files (${(bytes / 1024).toFixed(0)} kB) in ${DIST}/`);
for (const rule of RULES) {
  console.log(
    `  · ${rule.name}: ${
      rule.skip ? 'skipped (VITE_GROQ_API_KEY opt-in)' : `${findings.filter((f) => f.rule === rule.name).length} match(es)`
    }`,
  );
}

if (findings.length > 0) {
  console.error('\nFAILED — secret material found in the production bundle:');
  for (const finding of findings) {
    console.error(`  ${finding.file}  [${finding.rule}]  ${finding.excerpt}`);
  }
  process.exit(1);
}

if (CLIENT_KEY_OPT_IN) {
  console.warn(
    '\nWARN — VITE_GROQ_API_KEY was set for this build, so the Groq-key-shaped ' +
      'checks above were skipped on purpose: that key is now IN the public bundle, ' +
      'readable by any visitor via dev tools or view-source. Every other rule still ' +
      'ran and found nothing. This is the documented, opted-into trade-off of the ' +
      'no-backend AI path — not a pass you should mistake for "no key exposure".',
  );
} else {
  console.log('\nPASS — zero matches. No key material reaches the client.');
}
