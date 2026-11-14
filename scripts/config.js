// The game the command-line checks play. Sessions (flagrate, selfplay, the stand-in) play the game
// the app deals a new player: $1/$2, the typical casino rake, a $200 buy-in (APP_GAME in
// session.js, which the app's own defaults also read, so the two cannot drift apart).
// Set-piece hands (spots.js, calibrate.js) keep the stakes their expectations were written at:
// $1/$3 with the typical rake and $300 stacks, as the multiway benchmark spots do (gradeall.js).
// $1/$3 is no longer offered in the app (Nov 2026); these are fixed test positions.
//
// Pass --legacy anywhere on the command line to get the configuration these scripts used
// before November 2026, so earlier numbers can be reproduced: Session-based scripts at $2/$3
// with the stepped rake and $500 stacks; set-piece hands (spots.js, calibrate.js) at $2/$3
// with the engine's default rake (10% up to $5, no jackpot drop).
//
// Importing this module removes --legacy from process.argv, so positional arguments keep
// their places.

import { APP_GAME, GAMES, RAKES } from '../src/trainer/session.js';

const at = process.argv.indexOf('--legacy');
export const LEGACY = at >= 0;
if (LEGACY) process.argv.splice(at, 1);

// Options for new Session(...).
export const SESSION = LEGACY ? {} : { game: APP_GAME.game, rake: APP_GAME.rake, heroBuy: APP_GAME.heroBuy };

// Options for newHand(...) in scripts that deal hands directly. rake undefined = engine default.
const g = GAMES[APP_GAME.game];
export const HAND = LEGACY ? { sb: 2, bb: 3 } : { sb: 1, bb: 3, rake: RAKES.pct };

export const GAME_LINE = LEGACY
  ? 'Game: legacy ($2/$3; stepped rake for sessions, engine default rake for set pieces)'
  : `Game: sessions at $${g.sb}/$${g.bb}, ${RAKES[APP_GAME.rake].label}, $${APP_GAME.heroBuy} buy-in (the app's default); set pieces at $1/$3 (--legacy for the old one)`;
