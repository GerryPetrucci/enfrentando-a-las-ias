// Las propuestas de juegos y enfrentamientos (web/propuestas.js): el sitio es estatico y no tiene servidor, asi que cada propuesta se manda como un Issue de GitHub
// (publico, con su contador de apoyos). Aqui se prueba lo puro: validar el formulario, armar la direccion del Issue y leer la lista que devuelve la API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPO, TIPOS, validarPropuesta, urlDePropuesta, propuestasDeIssues, urlDeLista } from '../../web/propuestas.js';

const buena = { tipo: 'juego', titulo: 'Poker sin limite', descripcion: 'Cada IA recibe dos cartas y apuesta en cuatro rondas.' };

test('hay dos tipos de propuesta: un juego nuevo o un enfrentamiento', () => {
  assert.deepEqual(Object.keys(TIPOS), ['juego', 'enfrentamiento']);
  assert.match(REPO, /^[\w-]+\/[\w-]+$/);
});

test('una propuesta necesita tipo, titulo y descripcion con algo de contenido', () => {
  assert.deepEqual(validarPropuesta(buena), []);
  assert.ok(validarPropuesta({ ...buena, tipo: 'otra' }).some((e) => /tipo/i.test(e)));
  assert.ok(validarPropuesta({ ...buena, titulo: 'ab' }).some((e) => /titulo|título/i.test(e)));
  assert.ok(validarPropuesta({ ...buena, titulo: 'x'.repeat(101) }).some((e) => /titulo|título/i.test(e)));
  assert.ok(validarPropuesta({ ...buena, descripcion: 'corta' }).some((e) => /descripci/i.test(e)));
  assert.ok(validarPropuesta({ ...buena, descripcion: '   \n  ' }).some((e) => /descripci/i.test(e)));
  assert.ok(validarPropuesta(null).length > 0);
  assert.ok(validarPropuesta({}).length >= 3);
});

test('la direccion abre un Issue nuevo del repo con el titulo marcado por tipo y los datos en el cuerpo', () => {
  const u = new URL(urlDePropuesta({ ...buena, ias: 'Claude, GPT', nombre: 'Ana' }));
  assert.equal(u.origin + u.pathname, `https://github.com/${REPO}/issues/new`);
  assert.equal(u.searchParams.get('title'), '[Juego] Poker sin limite');
  const cuerpo = u.searchParams.get('body');
  assert.match(cuerpo, /Cada IA recibe dos cartas/);
  assert.match(cuerpo, /Claude, GPT/);
  assert.match(cuerpo, /Ana/);
  const e = new URL(urlDePropuesta({ tipo: 'enfrentamiento', titulo: 'Claude vs GPT', descripcion: 'En Mayor o menor, 10 partidas.', juego: 'Mayor o menor' }));
  assert.equal(e.searchParams.get('title'), '[Enfrentamiento] Claude vs GPT');
  assert.match(e.searchParams.get('body'), /Mayor o menor/);
});

test('lo que escribe quien propone no rompe la direccion ni se pasa de largo', () => {
  const raro = urlDePropuesta({ ...buena, titulo: 'a&b=c #d', descripcion: 'x'.repeat(6000), nombre: '<script>' });
  const u = new URL(raro);
  assert.equal(u.searchParams.get('title'), '[Juego] a&b=c #d');
  assert.ok(raro.length < 7000, `direccion de ${raro.length} caracteres`);
  assert.ok(u.searchParams.get('body').length <= 3600);
  assert.doesNotThrow(() => urlDePropuesta(null));
});

test('de los Issues abiertos solo se muestran las propuestas (por el marcado del titulo), con sus apoyos', () => {
  const issues = [
    { number: 7, title: '[Juego] Poker sin limite', html_url: 'https://github.com/x/y/issues/7', created_at: '2026-10-22T10:00:00Z', comments: 2, reactions: { '+1': 12 }, user: { login: 'ana' } },
    { number: 8, title: '[Enfrentamiento] Claude vs GPT', html_url: 'https://github.com/x/y/issues/8', created_at: '2026-10-23T10:00:00Z', comments: 0, reactions: { '+1': 9 }, user: { login: 'beto' } },
    { number: 9, title: 'Un bug del sitio', html_url: 'https://github.com/x/y/issues/9', created_at: '2026-10-23T11:00:00Z', comments: 0 },
    { number: 10, title: '[Juego] Con PR', html_url: 'https://github.com/x/y/pull/10', pull_request: {}, created_at: '2026-10-23T12:00:00Z' },
    null, 5,
  ];
  const r = propuestasDeIssues(issues);
  assert.deepEqual(r.map((p) => [p.numero, p.tipo, p.titulo, p.apoyos, p.comentarios]), [
    [7, 'juego', 'Poker sin limite', 12, 2],
    [8, 'enfrentamiento', 'Claude vs GPT', 9, 0],
  ], 'las que mas apoyo tienen primero; sin bugs ni PRs');
  assert.equal(r[1].url, 'https://github.com/x/y/issues/8');
  assert.deepEqual(propuestasDeIssues(null), []);
  assert.deepEqual(propuestasDeIssues({}), []);
});

test('la lista se pide a la API publica del repo, solo Issues abiertos', () => {
  const u = new URL(urlDeLista());
  assert.equal(u.origin + u.pathname, `https://api.github.com/repos/${REPO}/issues`);
  assert.equal(u.searchParams.get('state'), 'open');
});
