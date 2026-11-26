// The Bag's layer over the table (CEO, QA): what it makes inert while open, and where focus goes when it closes. Pure
// enough to test with stand-in elements (test/baglayer.test.js).

// Every other child of the page becomes inert while the layer is open, so no Tab, key or click reaches the table;
// returns the ones it changed, so closing clears only those
export function makeInert(children, layer) {
  const changed = [];
  for (const c of children) {
    if (c === layer || c.inert) continue;
    c.inert = true;
    changed.push(c);
  }
  return changed;
}
export function clearInert(changed) {
  for (const c of changed) c.inert = false;
}

// Focus after closing: the control you left from if it is still on screen; from the Ranges panel (which redraws) its
// new "What is this?" link; else the menu button; else the phone menu's summary
const shown = (el) => !!el && el.isConnected !== false && el.offsetParent !== null;
export function focusTarget({ was, body, from, rangesLink, moreButton, menuSummary }) {
  if (was && was !== body && shown(was)) return was;
  if (from === 'ranges' && shown(rangesLink)) return rangesLink;
  if (shown(moreButton)) return moreButton;
  return menuSummary || null;
}

// A key pressed on the page behind the layer while it is open (QA: Tab past The Bag's last control leaves focus on BODY,
// where the table's hotkeys still answered): Escape closes the layer, Tab goes back into it, and every other key is
// swallowed before any table handler sees it. Keys inside The Bag itself never reach this page.
export function keyWhileOpen(key) {
  if (key === 'Escape') return 'close';
  if (key === 'Tab') return 'refocus';
  return 'swallow';
}
