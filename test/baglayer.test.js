// The Bag's layer over the table (QA's blocker, CEO): nothing behind it can be reached, and focus comes back where it
// should. Stand-in elements, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeInert, clearInert, focusTarget } from '../src/ui/baglayer.js';

const el = (name, o = {}) => ({ name, inert: false, isConnected: true, offsetParent: {}, ...o });

test('while the layer is open everything else is inert (no Tab, key or click reaches the table); closing clears only what it set', () => {
  const header = el('header');
  const table = el('table');
  const modal = el('a modal already inert', { inert: true });
  const layer = el('layer');
  const changed = makeInert([header, table, modal, layer], layer);
  assert.equal(header.inert, true);
  assert.equal(table.inert, true);
  assert.equal(layer.inert, false);
  assert.deepEqual(changed.map((c) => c.name), ['header', 'table']);
  clearInert(changed);
  assert.equal(header.inert, false);
  assert.equal(table.inert, false);
  assert.equal(modal.inert, true); // not ours to clear
});

test('focus after closing: the control you left from, else the redrawn "What is this?" link, else the menu', () => {
  const body = el('body');
  const link = el('What is this?');
  const more = el('More');
  const summary = el('Menu');
  // the link you clicked is still on screen
  assert.equal(focusTarget({ was: link, body, from: 'ranges', rangesLink: link, moreButton: more, menuSummary: summary }), link);
  // the Ranges panel redrew: the old link is gone, the new one takes focus (QA: not BODY)
  const gone = el('old link', { isConnected: false });
  const fresh = el('new link');
  assert.equal(focusTarget({ was: gone, body, from: 'ranges', rangesLink: fresh, moreButton: more, menuSummary: summary }), fresh);
  assert.equal(focusTarget({ was: body, body, from: 'ranges', rangesLink: fresh, moreButton: more, menuSummary: summary }), fresh);
  // from Learn (a menu that has closed): the More button, or on a phone the menu's summary
  const hidden = el('menu link', { offsetParent: null });
  assert.equal(focusTarget({ was: hidden, body, from: 'learn', rangesLink: fresh, moreButton: more, menuSummary: summary }), more);
  assert.equal(focusTarget({ was: hidden, body, from: 'learn', rangesLink: null, moreButton: el('More', { offsetParent: null }), menuSummary: summary }), summary);
});
