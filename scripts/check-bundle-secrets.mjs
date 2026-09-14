/**
 * Secret audit of the production client bundle.
 *
 * Security requirement 2.2.4: after the edge function exists, grep the built
 * client for the Groq key prefix and any key fragment, and confirm zero
 * matches. This runs over every emitted asset, not just the JS, because a key
 * can just as easily end up in a sourcemap or a CSS url().
 *
 * Exits non-zero on any finding, so it can gate a deploy.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

/**
 * Each rule is a thing that must never reach the browser.
 * `allow` lets through the specific benign strings we expect to see.
 */
const RULES = [
  {
    name: 'Groq API key prefix',
    pattern: /gsk_[A-Za-z0-9]{8,}/g,
    allow: [],
  },
  {
    name: 'Groq API key prefix (bare)',
    // The literal prefix on its own, even without a plausible body.
    pattern: /gsk_/g,
    allow: [],
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
for (const rule of RULES) console.log(`  · ${rule.name}: ${findings.filter((f) => f.rule === rule.name).length} match(es)`);

if (findings.length > 0) {
  console.error('\nFAILED — secret material found in the production bundle:');
  for (const finding of findings) {
    console.error(`  ${finding.file}  [${finding.rule}]  ${finding.excerpt}`);
  }
  process.exit(1);
}

console.log('\nPASS — zero matches. No key material reaches the client.');
