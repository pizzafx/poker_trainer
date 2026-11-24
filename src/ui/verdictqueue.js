// Verdicts from the judge worker attach to their decisions in the order the decisions were made (FIFO), whichever
// grade finishes first (CEO, owner, 23 Nov: the hand goes on while the coach grades).
export function createVerdictQueue(onVerdict, onError = (e) => console.error('grading failed', e)) {
  let chain = Promise.resolve();
  return {
    // `graded` is the grade's promise, already started; `ctx` is whatever onVerdict needs (the session, the decision)
    push(ctx, graded) {
      chain = chain.then(() => graded).then((v) => onVerdict(ctx, v)).catch(onError);
      return chain;
    },
    idle: () => chain,
  };
}
