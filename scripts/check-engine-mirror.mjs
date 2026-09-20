/**
 * Fail if the edge functions' copy of the engine has drifted from src/game.
 *
 * Server authority means the server runs the SAME rules, not a second
 * implementation of them. The copy under supabase/functions is generated,
 * so the only way it drifts is somebody editing the engine and not
 * re-running the sync — which produces a server that quietly disagrees
 * with the client about what a turn does, and a snapshot check that
 * rejects honest play.
 *
 * This runs the sync and asks git whether anything moved. It is the same
 * check CI makes, so `npm run verify` and the workflow agree.
 */
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

try {
  git('rev-parse', '--git-dir');
} catch {
  console.log('check:engine — not a git checkout, skipping drift check.');
  process.exit(0);
}

const dirty = git('status', '--porcelain', '--', 'supabase/functions/_shared/game').trim();
if (dirty) {
  console.error('check:engine — the mirror has uncommitted changes already:');
  console.error(dirty);
  console.error('\nCommit or stash them first; this check cannot tell them from drift.');
  process.exit(1);
}

execFileSync('node', ['scripts/sync-engine.mjs'], { stdio: 'inherit' });

const drifted = git('status', '--porcelain', '--', 'supabase/functions/_shared/game').trim();
if (drifted) {
  console.error('\ncheck:engine — FAIL. The mirror was out of date:');
  console.error(drifted);
  console.error('\nThe sync has just been run, so the files are now correct.');
  console.error('Commit them: git add supabase/functions/_shared/game');
  process.exit(1);
}

console.log('check:engine — PASS. The edge functions run the same engine as the client.');
