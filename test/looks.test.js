// A look is never repeated at one table (brand handoff 2.7): twelve looks, at most eight
// opponents, so every table can have eight different faces and no name needs a number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/trainer/session.js';
import { LOOKS } from '../src/trainer/players.js';

const check = (sess, label) => {
  const opp = sess.seats.filter((p) => !p.hero);
  const ids = opp.map((p) => p.lookId);
  assert.equal(new Set(ids).size, ids.length, `${label}: repeated look ${ids.join(',')}`);
  for (const p of opp) assert.ok(!/\d/.test(p.nick), `${label}: numbered name ${p.nick}`);
};

test('looks: twelve distinct looks with avatar ids and hues', () => {
  assert.equal(LOOKS.length, 12);
  assert.equal(new Set(LOOKS.map((L) => L.id)).size, 12);
  assert.equal(new Set(LOOKS.map((L) => L.nick)).size, 12);
  for (const L of LOOKS) assert.ok(Number.isFinite(L.hue) && L.id && !('icon' in L));
});

test('looks: 1,000 generated tables never repeat a look or number a name', () => {
  const tables = ['typical', 'aggressive', 'tight', 'loose', 'tough'];
  for (let i = 0; i < 1000; i++) {
    const sess = new Session({ seed: 1000 + i, samples: 10, table: tables[i % 5], game: ['1/2', '2/3', '2/5'][i % 3] });
    check(sess, `casino seed ${1000 + i}`);
  }
});

test('looks: home games of one rare type still get eight different looks', () => {
  for (const type of ['gto', 'beginner', 'nit', 'tag', 'lag', 'maniac', 'whale', 'station', 'abc']) {
    for (let i = 0; i < 20; i++) {
      const sess = new Session({ seed: 50 + i, samples: 10, custom: { sb: 1, bb: 2, minBuy: 100, maxBuy: 200 }, lineup: new Array(8).fill(type) });
      check(sess, `home 8x ${type} seed ${50 + i}`);
    }
  }
});

test('looks: players who leave are replaced by someone who looks different from everyone seated', () => {
  for (let i = 0; i < 3; i++) {
    const sess = new Session({ seed: 400 + i, samples: 10 });
    const seen = new Set(sess.seats.map((p) => p.id));
    for (let h = 0; h < 100; h++) {
      sess.warmUp(1);
      check(sess, `seed ${400 + i} hand ${h}`);
      for (const p of sess.seats) seen.add(p.id);
    }
    assert.ok(seen.size > sess.seats.length, 'some players were replaced');
  }
});
