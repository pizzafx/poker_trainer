// "Best play": a green verdict that was clearly the best, not a coin flip (header design, Addendum B;
// the rule is STRAT's, 13 Nov 2026). Display only: grading, costs and the coach's sentences are
// unchanged. Every place that shows or counts best plays asks this one function.
//
// All of these must hold, otherwise the play is "fine":
//   1. Kind: your kind of play (fold, check, call, bet/raise) is the best kind.
//   2. Size: your size is the best size, or the reference size a guardrail capped the comparison at,
//      or within the yellow bar of it. A bigger size than the reference qualifies only when the two are
//      within noise: the reference ahead by less than max(1 paired SE, $1) (STRAT B4a, CEO).
//   3. Clearly ahead: the reference beats the best option of every other kind by more than the
//      coach's margin of error (that option is not marked ≈) and by at least half the yellow bar,
//      max(1.5 bb, 5% of the pot), and at least 2 paired SEs (B4b), so a tie across kinds reads
//      "fine" on every seed rather than flipping.
//   The paired SEs are each option's `pse` (its SE to the best, stored when it was graded); a record
//   without them has no noise margin.
//   4. Not trivial: no mark for a fold or a check when the best other kind loses by three yellow
//      bars or more (folding junk, checking air where betting is clearly bad).
//   5. No coach note, guardrail, multiway rule or tip on the decision. The size-reference notes
//      (bets capped at the pot or at 3/4 pot, sizes not graded) are size matters, so rule 2 handles
//      them instead.

const SIZE_NOTES = new Set(['overbet', 'sizeCheck', 'sizePeak']);
const SIZE_REFS = new Set(['upToPot', 'upTo75']);

export function bestPlayEdge(v, d) {
  if (!v || v.grade !== 'good' || !(v.mine >= 0) || !(v.best >= 0) || !v.options) return null;
  if (v.note && !SIZE_NOTES.has(v.note)) return null;
  if (v.costly || v.rule || (d && d.tipKind)) return null;
  if (v.ref && !SIZE_REFS.has(v.ref)) return null;
  const bar = v.small;
  if (!(bar > 0)) return null;
  const mine = v.options[v.mine];
  const ref = v.options[v.best];
  // 1. kind
  if (mine.type !== ref.type) return null;
  // 2. size
  if (v.mine !== v.best) {
    if (mine.type !== 'raise') return null;
    if (v.ref && SIZE_REFS.has(v.ref) && mine.to > ref.to && ref.ev - mine.ev >= Math.max(mine.pse || 0, 1)) return null;
    if (ref.ev - mine.ev >= bar) return null;
  }
  // 3. clearly ahead of every other kind
  let alt = -1;
  v.options.forEach((o, i) => {
    if (o.type !== mine.type && (alt < 0 || o.ev > v.options[alt].ev)) alt = i;
  });
  if (alt < 0) return null;
  const other = v.options[alt];
  const gap = ref.ev - other.ev;
  if (other.close || gap < Math.max(bar / 2, 2 * (other.pse || 0))) return null;
  // 4. not trivial
  if ((mine.type === 'fold' || mine.type === 'check') && gap >= 3 * bar) return null;
  return { alt, label: other.label, gap };
}

export const isBestPlay = (v, d) => !!bestPlayEdge(v, d);

// The Coach headline when the ring shows: it never says "fine" under "BEST PLAY". "{label}: best
// play.", plus "({other} works about as well.)" when another size of the same kind is within the
// yellow bar of yours.
export function bestHeadline(v, d) {
  if (!bestPlayEdge(v, d)) return null;
  const mine = v.options[v.mine];
  let twin = -1;
  v.options.forEach((o, i) => {
    if (i !== v.mine && o.type === mine.type && Math.abs(o.ev - mine.ev) < v.small && (twin < 0 || o.ev > v.options[twin].ev)) twin = i;
  });
  const bare = (o) => o.label.replace(/\s*\([^)]*\)\s*$/, '');
  return `${mine.label}: best play.${twin >= 0 ? ` (${bare(v.options[twin])} works about as well.)` : ''}`;
}

// The notes that leave a passing verdict not graded. One set for the strip and card word, the headline and the checks,
// so a new not-graded note cannot read "not graded" in one place and "fine" in another (STRAT, CEO).
export const NOT_GRADED_NOTES = new Set(['unclear', 'closeCall', 'fragileRead']);
export const isNotGradedNote = (v) => !!v && NOT_GRADED_NOTES.has(v.note);

// The grade word every place uses for a verdict (strip, review and replayer rows, Hand log), so a
// past verdict is never restated differently from how it landed: "best play" exactly when the ring
// shows, "not graded" for close calls, otherwise "fine", "mistake" or "blunder".
export function verdictWord(v, d) {
  if (v.grade !== 'good') return v.grade;
  if (isNotGradedNote(v)) return 'not graded';
  return isBestPlay(v, d) ? 'best play' : 'fine';
}
