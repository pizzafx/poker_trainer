// The Ranges tab's run-outs off the page's thread (CEO, 24 Nov): win by the river per rung and per class, all 1,081
// run-outs on the flop, so opening the tab never stalls the table.
import { ladderEquity } from './rangeladder.js';

self.onmessage = (e) => {
  const { id, lad } = e.data;
  try {
    self.postMessage({ id, eq: ladderEquity(lad) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
