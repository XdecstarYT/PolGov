/**
 * Copy the game engine into the edge functions' shared directory.
 *
 * The engine is the single source of truth for the rules. The client imports
 * it from src/game; the edge functions need their own copy inside
 * supabase/functions so the deploy bundle is self-contained. Running this
 * before deploying keeps the two identical — which is the whole point of
 * server authority: the server must run the SAME rules, not a second
 * implementation of them that can drift.
 */
import { cp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SRC = 'src/game';
const DEST = 'supabase/functions/_shared/game';

if (!existsSync(SRC)) {
  console.error(`sync-engine: ${SRC} not found`);
  process.exit(1);
}

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });
await cp(SRC, DEST, {
  recursive: true,
  filter: (source) => !source.includes('__tests__'),
});

await writeFile(
  `${DEST}/GENERATED.md`,
  `# Generated — do not edit

This directory is a verbatim copy of \`src/game\`, produced by
\`npm run sync:engine\`. Edit the engine in \`src/game\` and re-run the sync;
any change made here will be destroyed on the next run.

Tests are excluded from the copy.
`,
);

console.log(`sync-engine: copied ${SRC} -> ${DEST}`);
