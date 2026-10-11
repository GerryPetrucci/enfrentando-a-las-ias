// Lo privado (spec, planes, plan de contenido, terminos, prototipos) vive en privado/ y NUNCA debe llegar al repo publico.
// Esta prueba falla si privado/ deja de estar en .gitignore o si git rastrea algo ahi (por ejemplo, tras un `git add -f`).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const git = (...args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
const hayGit = git('--version').status === 0;

test('privado/ esta en .gitignore', { skip: !hayGit && 'git no esta instalado' }, () => {
  assert.equal(git('check-ignore', '-q', 'privado/cualquier-cosa.md').status, 0, 'privado/ no esta ignorada por git');
  assert.match(readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8'), /^privado\/\s*$/m);
});

test('git no rastrea ningun archivo de privado/', { skip: !hayGit && 'git no esta instalado' }, () => {
  const r = git('ls-files', 'privado');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '', `git rastrea archivos privados:\n${r.stdout}`);
});
