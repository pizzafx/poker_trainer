# Live Low-Stakes Trainer

A browser trainer for live $2/$3 and $3/$5 no-limit hold'em. You play an eight-handed table
against simulated opponents, and every decision is scored by how much money it makes against
those opponents, not against a solver.

## Run it

```bash
npm start
```

Then open http://localhost:5173. Needs Node 18 or later; there are no dependencies.

## What is in it

- **Eight opponent types** (nit, straightforward recreational, calling station, gambler,
  maniac, solver-style, solid regular, tricky regular). Each player is their own variation
  of a type, has a look that only loosely predicts their style, and can go on tilt.
- **A judge** that deals opponents hands consistent with how they have played, plays each of
  your options out thousands of times, and flags plays that clearly lose money.
- **Leak review and drill mode**: mistakes are grouped by type and tracked across sessions;
  drill mode deals only spots of the type you pick.
- **Settings** for stakes, buy-in, rake, table type (typical, aggressive, conservative,
  loose-passive), skipping junk hands, and feedback timing.

## How far to trust it

Only preflop tendencies at these stakes have published measurements (see `reports/`).
Every postflop number in `src/bots/profiles.js` is an assumption in the direction coaches
agree on. The opponents are easier to beat than real players, so trust the direction of the
advice more than the dollar figures. Guardrails in `Session.temper` stop the trainer from
flagging plays that only work against bots (bluff-raises, overbets with one pair, thin river
bluffs) and drop any flag that does not survive the opponents being a little looser or
tighter than assumed.

## Checks

```bash
npm test                       # engine: hand ranking, betting, side pots, rake
node scripts/spots.js          # the judge on 13 set-piece spots
node scripts/calibrate.js      # stats that emerge from bot-vs-bot play, per type
node scripts/audit.js 11 150   # hand histories behind the costliest verdicts
node scripts/selfplay.js       # win rate of a player who blindly follows the judge
node scripts/noise.js 3000     # how repeatable the judge's numbers are
```

## Layout

- `src/engine/` cards, hand evaluator, betting rules, hand-strength reading
- `src/bots/` opponent profiles and the decision model
- `src/trainer/` session, reads, judge, feedback text, drills
- `src/ui/` the page
- `reports/`, `research_notes/` the research behind the opponent model
