# Solver vs. pool: spots where equilibrium play loses money in live low-stakes NLHE ($1/$2 to $3/$5, US, full ring)

Reading notes (apply to every numbered spot below):

- **Solver play tags.** `[src]` = the equilibrium play is stated in the cited source (often with frequencies). `[char]` = my own characterization of what an equilibrium strategy typically does in that spot; it is NOT from the source and was NOT solver-verified. Every `[char]` baseline must be checked in the simulator's own solver before the spot is used as a test case.
- **Evidence tags.** `OPINION` = coach/author experience, no dataset. `SOLVER-SIM` = solver run against an assumed (nodelocked or profiled) opponent; shows the exploit is right IF the opponent behaves as assumed, but is not evidence that the pool behaves that way. `DATA-ONLINE` = measured population data from online games. `DATA-LIVE (author-reported)` = author says it comes from live tracking; methodology not published. `FORUM` = forum consensus, seen only as search-result snippets.
- **Stakes flags.** Many of the best-specified examples were played at $2/$5, $5/$5 or $5/$10, or come from tournament or online solver setups. These are flagged per spot.
- Spots are numbered 1-47 continuously across sections. Where sources disagree, both positions are in the spot itself and collected again in the last section.
- Direct quotation was kept to a minimum; hand details are paraphrased from the sources.

## 1. Folding strong hands to aggression (river raises, turn/river barrels, 3-bets and 4-bets from passive players)

### Takeaway
The single most repeated live exploit is over-folding to late-street raises and to 3-bets/4-bets from passive players, including hands a solver treats as mandatory calls on pot odds. The support is almost entirely coach experience; the only measured data found is online (and from high-stakes regulars), and the one solver experiment only shows the fold is right if the "never bluff-raises" assumption holds.

### Cited Findings

- **Spot 1. Two pair facing a river shove over hero's own overbet.**
  - Situation: $5/$10 (flag: above target stakes), ~$1,150 effective. Hero K♠8♠ in CO isolates a limper to $40, BTN min-3-bets to $80, hero calls. Flop Q♠6♣8♣ check-check. Turn 4♠ hero bets $100, called. River K♥ (kings up): hero overbets $450 into $380, BTN shoves. Hero is getting about 3.5-to-1.
  - Opponent: older recreational player, not a high-level thinker.
  - Solver play: call `[char]` (top-of-range two pair needing ~22% equity).
  - Exploit play: fold unless villain's line genuinely cannot represent value. Hero called and lost to QQ (top set); the author's own conclusion is that he should have trusted the rarity of bluff-raises over hand-reading logic.
  - Why: late-street raises at low/mid-stakes live are almost never bluffs; the author could not recall one bluff-raise against a river overbet in roughly ten years.
  - Source: Bart Hanson, "Raises to overbets" — [Crush Live Poker](https://crushlivepoker.com/articles/raises-to-overbets)
  - Evidence: OPINION (one anecdote plus experience). The author also says he does pick off late-street bluffs when the line does not tell a coherent story, so this is not "always fold".

- **Spot 2. Overpair on a flush-completing river: bet small and fold to a raise instead of check-calling.**
  - Situation: $1/$2, $300 effective. Hero raises A♣A♥ to $10, BTN calls. Flop K♣5♦2♣ bet $20, call. Turn T♠ bet $50, call. River 7♣.
  - Opponent: average low-stakes player (pool-wide).
  - Solver play: mostly check, with check-call a large part of the response `[char]`.
  - Exploit play: small value bet; fold to a raise. The author ranks check-then-call as the worst option.
  - Why: the pool checks back one-pair hands (KQ, KJ) so checking loses value; it calls small bets with one pair; it raises only when it has the flush; and it under-bluffs when checked to.
  - Source: Bart Hanson, "Rarely check call the river" (2012) — [Crush Live Poker](https://crushlivepoker.com/articles/rarely-check-call-the-river)
  - Evidence: OPINION.

- **Spot 3. Top pair, weak kicker, facing check-raise flop / pot turn / jam river.**
  - Situation: 100bb, 8-handed cash. Hero BTN Q♥8♥ opens, BB calls. Flop Q♣6♦4♥ (pot 6.5bb): hero bets small, BB check-raises to 7.2bb, hero calls. Turn 9♠ (pot 20.9bb): BB bets pot, hero calls. River 2♠ (pot 62.7bb): BB jams.
  - Opponent: straightforward/tight player.
  - Solver play: flop call `[src]` (Q8 has ~47% vs the raising range; solver re-raises only ~3.6%); turn call "the vast majority of the time" `[src]`; river: hero needs about one-third equity, solver river frequency not stated in the article (`[char]`: Q8 is a bluff-catcher that calls at some frequency).
  - Exploit play: fold river. Folding the turn is also described as reasonable against a tight player who only barrels strong hands.
  - Why: most players do not jam rivers as pure bluffs, so the jam range is value-heavy; also call slightly tighter than equilibrium on the flop because real opponents under-bluff the check-raise.
  - Source: Jonathan Little, "Top Pair Facing a Check-Raise: Q8s BTN vs BB 100bb Cash" (Oct 2026) — [PokerCoaching](https://pokercoaching.com/blog/top-pair-facing-check-raise-q8s-btn-vs-bb-100bb-cash/)
  - Evidence: OPINION for the exploit; solver frequencies quoted for flop and turn.

- **Spot 4. Top pair good kicker facing a small-then-big sizing pattern.**
  - Situation: $2/$5 (flag), $1,000 stacks. Hero raised preflop with K♠Q♠. Flop K♣8♦7♦: villain bets $60 into $82, hero calls. Turn 8♥: villain bets $80 into $202. River 5♠: villain bets $250 into $362.
  - Opponent: typical live $2/$5 player (pool-wide).
  - Solver play: call `[char]` (TPGK facing ~69% pot).
  - Exploit play: fold. Rule of thumb from the author: do not call this pattern when the price is worse than about 3-to-1; bets over $100 are "serious" in these games.
  - Why: a small bet followed by a much larger one is a strong value pattern in live games.
  - Source: Ed Miller, "Three Bet-Sizing Tells" (Jul 2016) — [Card Player](https://cardplayer.com/poker-news/20644-poker-strategy-with-ed-miller-three-bet-sizing-tells)
  - Evidence: OPINION.

- **Spot 5. Top pair, marginal kicker, facing a triple barrel from a tight straightforward player.**
  - Situation: hero J♥T♥ calls a raise; J♣5♦2♠-type board; villain bets all three streets.
  - Opponent: tight, straightforward recreational player (nit).
  - Solver play: bluff-catch river at some frequency `[char]`.
  - Exploit play: call flop and turn, fold to the third barrel.
  - Why: these players rarely triple-barrel as a bluff.
  - Sources: Jonathan Little, "Exploiting Recreational Players" (Jun 2017; flag: written around a tournament example) — [Card Player](https://www.cardplayer.com/?p=1038047). Same rule stated generally (fold all pure bluff-catchers to triple barrels) by Dan B., "5 Strategic Mistakes Poker Players Make" (Feb 2019) — [Upswing Poker](https://upswingpoker.com/exploit-poker-leaks/)
  - Evidence: OPINION (both).

- **Spot 6. Weak ace in a multiway pot facing turn and river 75%-pot bets.**
  - Situation: hero CO A♠5♠ opens; BTN and BB call. Flop A♦J♣8♣ checks around. Turn 6♣: BB bets 75% pot, hero calls, BTN folds. River 4♦: BB bets 75% again.
  - Opponent: pool-wide.
  - Solver play: implied by the GTO bluff share for the size (30% bluffs at 60-89% pot) `[src]`; a weak ace would bluff-catch at some frequency `[char]`.
  - Exploit play: fold immediately.
  - Why (data): when the river is still multiway, the measured population bluffs 7% with block bets (GTO ~18%) and 9% at ~half pot (GTO 25%); heads-up in small pots it bluffs 12/16/19/22/25% across rising sizes against GTO ~18/25/30/33/37%. Curiously, the same table shows multiway pot-size bets and overbets close to GTO (29% vs 33%, 35% vs 37%).
  - Source: Dan B., "3 Cash Game Exploits That Print Against Today's Regs (Backed By Data)" (Jun 2026) — [Upswing Poker](https://upswingpoker.com/3-cash-game-exploits-regs-backed-by-data/)
  - Evidence: DATA-ONLINE. FLAG: the first two exploits in the article use 2025 data from 500NL-10000NL online regulars; the source of the river-bluff table is not specified (stakes, live/online and sample size not given), and the article's example is inconsistent with its own "pots under 20bb" filter. Direction is useful; magnitudes should not be transferred to live $1/$2.

- **Spot 7. Folding JJ/TT/AQs (and sometimes QQ/AKo) to a 4-bet.**
  - Situation: hero 3-bets, a typical live player 4-bets.
  - Opponent: pool-wide tight 4-bettor; QQ/AKo folds only against a player whose 4-bet range is AA/KK.
  - Solver play: JJ, TT, AQs are "usually mandatory" continues online `[src]`.
  - Exploit play: fold JJ, TT, AQs to a tight 4-bettor; fold QQ and AKo only versus an AA/KK-only range. Also fold KQ and AQ to a 4-bet from a passive player who rarely 4-bets.
  - Why (math against assumed ranges): JJ/TT/AQs have ~27.4% equity vs AA, KK, AKs; QQ has 18.3% and AKs 23.1% vs the "super tight" range. Many live players have no 4-bet bluffs at all.
  - Sources: George Mathias, "Crush Live Poker Games With These 8 Battle-Tested Tactics" (Jun 2019) — [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/); George Mathias, "5 Skills That Will Boost Your Live Poker Earnings" (updated Mar 2026) — [Upswing Poker](https://upswingpoker.com/live-poker-skills-earnings-boost/); "Small Stakes Cash Game Strategy: 5 Tips to Beat $1/$2" — [PokerCoaching](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/)
  - Evidence: equity arithmetic is exact, but the villain ranges are assumed (OPINION on the range). The author warns not to fold every strong hand to every 4-bet.

- **Spot 8. Continuing range versus a 3-bet from a player who only 3-bets premiums.**
  - Situation: hero opens, a tight/passive player 3-bets.
  - Opponent: players whose 3-bet range is roughly JJ+/AQ+ or about the top 5% of hands (described as common at $1/$3 and $2/$5).
  - Solver play: defend much wider, with calls and 4-bet bluffs `[char]`.
  - Exploit play: continue only with medium pairs up to QQ and AQs+; fold KQ and KJ; 4-bet only KK+ (drop the bluffs).
  - Why: the 3-bet range is value-only and rarely folds to a 4-bet.
  - Sources: Dan B., "5 Strategic Mistakes Poker Players Make" — [Upswing Poker](https://upswingpoker.com/exploit-poker-leaks/); Alex Fitzgerald, "Mistakes Low Stakes Players Make And How To Exploit Them" (Aug 2025) — [Card Player](https://www.cardplayer.com/poker-news/poker-strategy-mistakes-low-stakes-players-exploit-them)
  - Evidence: OPINION.

- **Spot 9. Bluff-catchers facing a river raise from a nitty, passive player.**
  - Situation: SB makes a 20% pot river probe; BB raises to a size where calling needs ~25.5% equity (NL500 online solver setup; flag).
  - Opponent: nitty/passive.
  - Solver play: SB continues with roughly 38% calls and 5% re-raise bluffs `[src]`; at equilibrium BB raises ~35% of second pairs and ~80% of top pairs.
  - Exploit play: fold every bluff-catcher.
  - Why: with BB nodelocked to just call second/top pair and never bluff-raise, hero's bluff-catchers have close to 0% equity.
  - Source: Vanja, "The 3 Biggest Leaks Killing Your Winrate" (Sep 2025) — [GTO Wizard Blog](https://blog.gtowizard.com/the_3_biggest_leaks_killing_your_winrate/)
  - Evidence: SOLVER-SIM (assumed opponent). Corroborating FORUM consensus (snippets only; thread pages returned HTTP 403): Two Plus Two live low-stakes posters say a big river raise is nearly always a monster, especially into three players, and that the default versus a big river bet when hero had the lead is to fold without a read that the player bluffs a lot — candidate threads: ["Calling a big river bet"](https://forumserver.twoplustwo.com/170/live-no-limit-holdem-cash/calling-big-river-bet-1641572/), ["Flopped set of aces - crying fold or call?"](https://forumserver.twoplustwo.com/170/live-low-stakes-nl/flopped-set-aces-crying-fold-call-1324332/). The snippets could not be matched to a specific thread with certainty.

### Inferences
- The fold-to-aggression spots that are best specified for test cases are 1-4 (full action, sizes, board). Spot 1 is the cleanest "two pair is a fold" case, but it is one $5/$10 anecdote; a set-fold example with full action was not found in any fetchable source.
- The solver experiment in Spot 9 gives the simulator a principled rule: bluff-catcher EV collapses toward zero as the opponent's bluff-raise frequency goes to zero, so the flag should scale with the modeled opponent's bluff-raise frequency rather than be absolute.
- No source gave a live bluff-raise frequency. "Almost never" is the strongest claim available.

### Gaps
- No live-measured river bluff or bluff-raise frequencies were found. The Hand2Note "Live Poker Database" (vendor claims 600,000+ hands from streamed games) appears in search results, but its article page returned HTTP 403, and streamed games are not $1/$2 pools.
- Turn-raise folds (overpair/TPTK facing a turn raise) are widely repeated but I could not fetch a source with a specified hand. A Bart Hanson Card Player column says even weak players recognize top pair or an overpair is often no good when raised on the turn (seen only as a search snippet).
- Hungry Horse Poker's own site exposes only program pages (claims 50,000+ hours of live session data); its strategy content is video and was not retrievable as text. Ed Miller's books, Matt Berkey/Solve for Why, Andrew Brokos' Thinking Poker and Uri Peleg's course material were not accessible; only Miller's Card Player companion pieces and Brokos' GTO Wizard articles were read.
- Reddit could not be searched (blocked to the search tool); Two Plus Two thread pages returned 403.

## 2. Bluff-catching: under-bluffed lines versus lines the pool does over-bluff

### Takeaway
The default is "do not check-call rivers", but the same authors carve out exceptions: missed-draw run-outs, turn barrels from players who give up on rivers, small multiway flop bets, and genuine maniacs. One pro (Jerry Fang) directly contradicts the "big bets are always value" heuristic for live overbets.

### Cited Findings

- **Spot 10. Weak top pair on a run-out where draws miss: check-call instead of thin value bet.**
  - Situation: $5/$10/$20 (flag), $3,000 effective, four-way. Hero CO K♦4♦ raised to $65. Flop K♥6♠3♣ check-check (BTN checks behind). Turn 8♥: hero bets $90 into $260, BTN calls. River J♦ (flush and straight draws miss).
  - Opponent: BTN whose range is mostly draws and medium bluff-catchers (an eight, 77), few kings.
  - Solver play: not stated; `[char]` likely mixes a small value bet and a check.
  - Exploit play: check with the plan to call. (In the actual hand BTN checked back 85o.)
  - Why: worse made hands will not call a bet, missed draws may bluff; the author presents this as the exception to his own rule that low-stakes players do not bluff enough to justify river check-calls.
  - Source: Bart Hanson, "Crushing Live Poker With Twitter" (Feb 2018) — [Card Player](https://www.cardplayer.com/?p=1038248)
  - Evidence: OPINION. Related condition from the 2012 article: with K♦J♦-type medium top pair where worse kings will not call and flush draws fold, check-calling to induce is acceptable; with AA/AK it is not — [Crush Live Poker](https://crushlivepoker.com/articles/rarely-check-call-the-river).

- **Spot 11. Call bluff-catchers against double barrels; fold them to triple barrels.**
  - Situation: heads-up, villain barrels flop and turn.
  - Opponent: pool-wide (players who give up bluffs on the river).
  - Solver play: defend each street at roughly equilibrium frequencies `[char]`.
  - Exploit play: call all bluff-catchers on the turn, then fold all pure bluff-catchers to a third barrel.
  - Why: the pool rarely follows through with a river bluff, so the turn call is cheap to realize and the river bet is value.
  - Source: Dan B., "5 Strategic Mistakes Poker Players Make" — [Upswing Poker](https://upswingpoker.com/exploit-poker-leaks/)
  - Evidence: OPINION (no hands, boards or sizes given).

- **Spot 12. Middle pair facing a small flop bet in a multiway pot.**
  - Situation: $2/$5 (flag), $1,000 stacks, four players. Flop J♣8♣4♦; villain bets $35 into $107; hero holds 8♦6♥.
  - Opponent: typical live player (pool-wide sizing tell).
  - Solver play: multiway, defend much tighter than heads-up; marginal pairs fold often `[src for the principle]` — Tombos21, "10 Tips for Multiway Pots in Poker" — [GTO Wizard Blog](https://blog.gtowizard.com/10-tips-multiway-pots-in-poker/)
  - Exploit play: call.
  - Why: a one-third-pot bet into several players on a draw-heavy board is read as a medium hand or draw; strong hands bet $50-$70 here to protect.
  - Source: Ed Miller, "Three Bet-Sizing Tells" — [Card Player](https://cardplayer.com/poker-news/20644-poker-strategy-with-ed-miller-three-bet-sizing-tells)
  - Evidence: OPINION.

- **Spot 13. Against a true maniac: call down with a decent hand, do not raise.**
  - Situation: any pot where a verified over-bluffer is betting.
  - Opponent: true maniac (has shown down weak hands in big pots).
  - Solver play: raise strong hands for value/protection at some frequency `[char]`.
  - Exploit play: call with any halfway decent hand and let them keep firing; do not raise to show strength.
  - Why: raising folds out the bluffs. Important limiter from the same author: over-bluffers are rare; most players labeled maniacs are loud 3-bettors/floaters who still usually have it in big pots.
  - Source: Alex Fitzgerald — [Card Player](https://www.cardplayer.com/poker-news/poker-strategy-mistakes-low-stakes-players-exploit-them). Solver-side support for slow-playing versus over-bluffers: Barry Carter, "The Five Imbalances of Exploitative Poker" (Sep 2024) — [GTO Wizard Blog](https://blog.gtowizard.com/the-five-imbalances-of-exploitative-poker/)
  - Evidence: OPINION (Fitzgerald); SOLVER-SIM principle (Carter).

- **Spot 14. Second pair facing a flop overbet-jam from a loose-aggressive player. (DISPUTED)**
  - Situation: flop J-8-2; loose-aggressive villain jams the flop; hero holds 8♠5♠.
  - Opponent: loose-aggressive, non-thinking live player.
  - Solver play: fold second pair/no kicker to an overbet jam in most configurations `[char]`.
  - Exploit play: call (hero's read: draws and overcards; hero won).
  - Why (Fang): most live overbets are panic plays by players trying to scare opponents out.
  - Opposing position: Daniel Marks in the same panel says to assume an overbet from a weaker player is strong unless proven otherwise; Alex Fitzgerald lists "never overbet bluffing" as a common low-stakes trait and says to fold to their overbets.
  - Sources: Craig Tapscott, "Head Games: Cash Game Overbetting Dynamics" (Oct 2013) — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66253-mike-watson-26-21/articles/21475-head-games-cash-game-overbetting-dynamics); Fitzgerald — [Card Player](https://www.cardplayer.com/poker-news/poker-strategy-mistakes-low-stakes-players-exploit-them)
  - Evidence: OPINION on both sides.

- **Spot 15. Fold more to river bets from players who check back medium-strength hands.**
  - Situation: river bet from a player known to check medium hands (for fear of draws getting there).
  - Opponent: passive player who under-value-bets (described as common).
  - Solver play: bluff-catch at MDF-like frequency `[char]`.
  - Exploit play: fold more.
  - Why: because they check their medium hands, their river betting range is stronger than it should be.
  - Source: Alex Fitzgerald — [Card Player](https://www.cardplayer.com/poker-news/poker-strategy-mistakes-low-stakes-players-exploit-them)
  - Evidence: OPINION.

### Inferences
- The over-bluffed lines named by sources are narrow: (a) missed-draw rivers after hero shows weakness, (b) turn barrels (not rivers), (c) small flop stabs, especially multiway or after a check, (d) flop overbet jams from specific LAG players, and (e) verified maniacs. The simulator should treat "villain bets river big" and "villain raises" as under-bluffed by default and reserve bluff-catch credit for these lines.
- Hanson's 2012 article explicitly rejects one popular belief: opponents do not suddenly bluff big on a missed draw just because hero checks after showing strength all hand. So "missed-draw stab" over-bluffing is range- and line-dependent, not automatic.

### Gaps
- No source quantified how often live players stab missed draws on the river, or how often small river bets after checks are bluffs.
- No fetchable source gave a fully specified "call down versus maniac" hand at $1/$2-$3/$5.

## 3. Bluffing: where solver bluffs burn money and where the pool over-folds

### Takeaway
Sources agree that bluffs should be removed against players who call with any pair and added against capped, passive ranges: stabs when the raiser checks the flop, bets after a check-through, big turn/river barrels on scare cards. The over-fold evidence for probes and delayed c-bets is measured, but only in online high-stakes reg pools.

### Cited Findings

- **Spot 16. Three-barrel bluff with large sizing against a passive caller.**
  - Situation: $2/$5 (flag), $600. Two limpers; hero BTN J♥9♥ raises to $20; one limper calls. Flop Q♥6♣3♠: hero bets $35 into $52 (author prefers ~$20 to keep 55/AJ in). Turn A♠: hero bets $100 into $122, villain folds. Planned river: all-in $445 into $322.
  - Opponent: straightforward loose-passive limper. Explicit exception: calling stations.
  - Solver play: bluffs at a balanced frequency; J-high with backdoor equity gives up on many run-outs `[char]`.
  - Exploit play: small flop bet, then large turn and river bets at high frequency.
  - Why: recreational players check-raise two pair and better, so a check-call range is capped at one pair and folds more than minimum defense frequency to big barrels.
  - Source: Jonathan Little, "A Common Bluffing Spot" (Mar 2019) — [Card Player](https://www.cardplayer.com/?p=1038558)
  - Evidence: OPINION.

- **Spot 17. River jam as a bluff into a capped range.**
  - Situation: hero raises Q9 suited, BB calls. Flop T-8-4 bet/call; turn K bet/call; river checked to hero with pot $117 and $142 behind.
  - Opponent: passive player who will not call all-in without a very strong hand.
  - Solver play: mixes sizes; Q9 without showdown value bluffs at some frequency `[char]`.
  - Exploit play: jam, not the $30 or $60 most players choose. Needs to work just over half the time.
  - Why: checks cap the range; players hate getting stacked; small bluffs get called too often.
  - Source: "Small Stakes Cash Game Strategy: 5 Tips to Beat $1/$2" — [PokerCoaching](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/)
  - Evidence: OPINION (break-even arithmetic only).

- **Spot 18. Stab when the preflop raiser checks the flop — but not when a flop bettor checks the turn.**
  - Situation: MP raises to $10, HJ calls, hero BTN calls with 2♠2♦. Flop Q♠5♦4♣ (pot $33): MP checks, HJ checks.
  - Opponent: inexperienced raisers who bet every Qx on the flop.
  - Solver play: the raiser's checking range is protected with some top pairs, so 22 mostly checks back or bets cautiously `[char]`; the article itself contrasts with stronger players who protect checks.
  - Exploit play: bet and barrel at high frequency.
  - Counter-case in the same article: $2/$5, $600. Hero BTN K♠T♠ opens $15, SB 3-bets $65, call. Flop Q♦9♠4♣ SB bets $80, call. Turn 7♣ SB checks. Do NOT auto-bluff: many live players check strong hands like AQ here.
  - Why: flop checks are honest weakness; bet-then-check on later streets is often excess caution with a real hand.
  - Source: George Mathias — [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
  - Evidence: OPINION.

- **Spot 19. Bluff run-outs after a check-through.**
  - Situation: hero raised preflop, is out of position heads-up, checks J♦9♦2♣; villain checks back.
  - Opponent: recreational players (pool-wide).
  - Solver play: turn probe range is mixed; the in-position checking range contains some protected strong hands `[char]`.
  - Exploit play: bluff the turn and river at high frequency.
  - Why: live players rarely check back top pair, sets or two pair, so check-check means weakness.
  - Source: "Marc Goone Explains How To Properly Size Your Bets" (Oct 2024) — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66553-tyler-ninja-blevins-37-23/articles/25224-marc-goone-explains-how-to-properly-size-your-bets)
  - Evidence: DATA-LIVE (author-reported): based on 50,000+ hours of his stable's play at $2/$5, $5/$5 and $5/$10 (flag: slightly above target stakes); no numbers published.

- **Spot 20. Turn probes and delayed c-bets.**
  - Situation A (probe): BB defends vs BTN. Flop J♣T♣6♦ check-check. Turn 7♥. Situation B (delayed c-bet): HJ opens K♠6♠, BB calls. Flop A♦8♦5♥ BB checks; turn J♣ BB checks again.
  - Opponent: pool-wide (measured on regulars).
  - Solver play: A: mixed/near-indifferent probing hands `[src]`. B: flop mixes check 22% / 33% pot 64% / 75% pot 13% `[src]`.
  - Exploit play: A: always probe 75% pot with no-showdown hands that have some equity. B: check back the flop 100% and bet the turn.
  - Why (data): versus turn probes the pool over-folds by 10% (block), 8% (medium), 7% (overbet); versus delayed c-bets it over-folds by 11% at 30% pot and 6% at larger sizes.
  - Source: Dan B. (Jun 2026) — [Upswing Poker](https://upswingpoker.com/3-cash-game-exploits-regs-backed-by-data/)
  - Evidence: DATA-ONLINE. FLAG: 2025 data from 500NL-10000NL online professionals; sample size not stated. Not live, not low stakes.

- **Spot 21. Turn stab in a loose multiway pot when the preflop raiser checks the turn.**
  - Situation: e.g. $25 raise and four callers; flop bet around $50 into $125+; raiser checks turn.
  - Opponent: loose live players.
  - Solver play: pure bluffs are sharply limited multiway `[src]` — [GTO Wizard Blog](https://blog.gtowizard.com/10-tips-multiway-pots-in-poker/) (which also notes ranges after checked-down action are weak and can be attacked).
  - Exploit play: bet the turn, and keep pressure on the river; aim for many small laydowns worth $100-$200 each.
  - Why: loose players arrive with weak hands and betting stalls by the turn.
  - Source: Ed Miller, "Taking Advantage Of Loose Play" (Oct 2016, companion to The Course) — [Card Player](https://cardplayer.com/poker-news/20944-poker-strategy-with-ed-miller-taking-advantage-of-loose-play)
  - Evidence: OPINION.

- **Spot 22. No river bluffs against a player who calls with any pair.**
  - Situation: heads-up 15bb limped pot (flag: online spin format), board A♥Q♠3♣7♠2♣; villain snap-called a river shove with 9♠3♥ (pure fold in theory).
  - Opponent: calling station.
  - Solver play: bluff the river at equilibrium frequency `[src]`.
  - Exploit play: "maximum greed": shove every hand that wins more than half the time when called, check everything else, zero bluffs (a bluff needs ~43% folds).
  - Nuance from a second solver study: against GTO Wizard's Calling Station profile the solver still pure-bluffs its very worst hands on the river and even makes large bluffs with hands like AT; the author warns not to copy those bluffs unless you expect the modeled folds (KQ/AQ folding to pot-size bets).
  - Sources: Sibbeh, "Crush Calling Stations With These 3 Solver-Approved Strategies" (Oct 2025) — [GTO Wizard Blog](https://blog.gtowizard.com/crush-calling-stations-with-these-3-solver-approved-strategies/); Andrew Brokos, "Exploiting Profiles: Episode I – The Calling Station" (Apr 2026) — [GTO Wizard Blog](https://blog.gtowizard.com/exploiting-profiles-episode-i-the-calling-station/)
  - Evidence: SOLVER-SIM.

- **Spot 23. Raise top pair multiway to fold out a nit's overpair ("combo bet").**
  - Situation: $5/$10/$20 (flag). Tight UTG opens $65, four callers, hero in the straddle with A♦9♥. Flop 9♦8♦2♥: hero checks, UTG bets $175, short stack calls, hero raises to $600. UTG folds (author's read: TT or AA); short stack calls with A♠9♠.
  - Opponent: nitty preflop raiser betting into four players.
  - Solver play: call or fold; top pair is not a value raise multiway `[char]`.
  - Exploit play: raise, when hero blocks sets/nut draws, can represent two pair+ from the blind, and can barrel flush cards.
  - Why: a tight raiser folds overpairs to a multiway raise while draws call.
  - Source: Bart Hanson (Feb 2018) — [Card Player](https://www.cardplayer.com/?p=1038248)
  - Evidence: OPINION (one hand).

### Inferences
- Spots 16-19 all rest on one population assumption: live recreational players fast-play (bet or raise) their strong hands, so calls and checks cap their ranges. The simulator's opponent model needs that fast-play tendency for these bluffs to be +EV.
- Spot 18's counter-case is the main over-application trap: a check from a player who bet the previous street is not the same signal as a flop check from the raiser.

### Gaps
- River bluff-raises: no source specifically analyzed hero bluff-raising rivers against the live pool; the universal "never fold to... / never bluff-raise" lore concerns villain's raises.
- No live-measured fold-to-probe or fold-to-barrel frequencies were found; only the online reg data in Spot 20.

## 4. Value betting: bigger, thinner, no slow-playing, pot control versus nits

### Takeaway
Against players who call too much, sources agree on thinner value and less slow-playing; they disagree on whether the biggest hands should overbet (coaches say yes; a solver profile of a station that also slow-plays says no overbets). Against passive non-stabbers, bet your own strong hands; against over-stabbers, check them.

### Cited Findings

- **Spot 24. Thin river value with top pair and second pair against a station.**
  - Situation: UTG vs BTN, 100bb single-raised pot, board Q♥J♦5♣ 2♠ 7♦.
  - Opponent: calling station (GTO Wizard profile: extra incentive to check/call, less to bet/raise).
  - Solver play: AQ mostly checks the river; sizes are polarized between 25% and 150% pot `[src]`.
  - Exploit play: AQ mostly bets 40% pot; AJ and some KJ block-bet; sizes cluster at 40% and 100% pot.
  - Why: the station reaches the river with many weak pairs that call.
  - Source: Andrew Brokos (Apr 2026) — [GTO Wizard Blog](https://blog.gtowizard.com/exploiting-profiles-episode-i-the-calling-station/)
  - Evidence: SOLVER-SIM (profile, not measured pool; no EV figures given).

- **Spot 25. River overbet for value with very strong hands against players who cannot fold. (DISPUTED)**
  - Situation examples: (a) hero A♠2♠ on Q♠9♣5♣ T♠ K♠ (backdoor nut flush): bet about 2x pot; (b) K-6-4-T-2 against a check-caller: any top pair or better calls regardless of size, so bet bigger; (c) A♠9♦8♦ x x with all draws missed, hero AJ: ~1.5x pot against a "non-believer".
  - Opponent: recreational players who hero-call with two pair, sets and straights; stations.
  - Solver play: value sizing limited by what a balanced defender calls; AJ-type top pair does not overbet `[char]`.
  - Exploit play: overbet; a 2x pot bet needs to be called only about one-third as often as a two-thirds-pot bet to match it.
  - Opposing position: against the Calling Station profile the solver uses no river overbets and bets JJ/AA smaller, because a station that slow-plays arrives with more strong hands and hero risks value-owning himself.
  - Sources: Tapscott panel (Chantler, Marks, Fang) — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66253-mike-watson-26-21/articles/21475-head-games-cash-game-overbetting-dynamics); Fitzgerald ("hero calling rivers") — [Card Player](https://www.cardplayer.com/poker-news/poker-strategy-mistakes-low-stakes-players-exploit-them); Brokos — [GTO Wizard Blog](https://blog.gtowizard.com/exploiting-profiles-episode-i-the-calling-station/)
  - Evidence: OPINION (coaches) versus SOLVER-SIM (Brokos). The disagreement turns on whether the station also slow-plays.

- **Spot 26. Sizing against an inelastic caller.**
  - Situation: BB vs CO single-raised pot, 60bb (flag: tournament-style depth), flop 9♥6♦4♣.
  - Opponent: (a) BB who never folds to a 33% bet; (b) BB who calls any pair or ace-high regardless of size.
  - Solver play: CO mixes checks and mostly large bets/overbets; CO EV ~3.75bb `[src]`.
  - Exploit play: (a) bet 33% with 100% of range: EV rises to ~4.71bb; for T9s the small bet earns ~8.6bb vs ~7.2bb for the overbet. (b) keep the same betting frequency but use only overbets.
  - Why: the size should target the part of the calling range that does not respond to price.
  - Source: Barry Carter (Sep 2024) — [GTO Wizard Blog](https://blog.gtowizard.com/the-five-imbalances-of-exploitative-poker/)
  - Evidence: SOLVER-SIM.

- **Spot 27. Fast-play sets three-way when a sticky player is behind.**
  - Situation: CO c-bets small into BTN and BB on T♠7♥4♠; hero is BTN.
  - Opponent: BB nodelocked to never fold top pair, open-enders or any flush draw.
  - Solver play: BTN mostly slow-plays 77 and 44; BTN raises ~13% `[src]`.
  - Exploit play: raise 77/44 (except 77 without a spade) and more AT/KT/QT; raise frequency ~19%. JT raises slightly less (dominated top pairs no longer fold).
  - Why: raises now get called by worse instead of folding out top pair. The author's prior hypothesis (raise less against a sticky BB) was not supported.
  - Source: Andrew Brokos, "3-Way: How to Exploit a Calling Station?" (Jun 2026) — [GTO Wizard Blog](https://blog.gtowizard.com/3-way-how-to-exploit-a-calling-station/)
  - Evidence: SOLVER-SIM (stack depth and EV not reported).

- **Spot 28. Bet your overpair in a 3-bet pot instead of checking to induce.**
  - Situation: SB 3-bet, BTN called; flop 7♣5♦2♥; hero holds AA.
  - Opponent: passive in-position player who stabs too little.
  - Solver play: SB checks a large part of range including some overpairs; BTN stabs about two-thirds of range for 25% pot when checked to `[src]`.
  - Exploit play: bet. Cutting BTN's stab frequency by only 5% raises SB's overpair betting frequency by almost 20%.
  - Source: Vanja (Sep 2025) — [GTO Wizard Blog](https://blog.gtowizard.com/the_3_biggest_leaks_killing_your_winrate/)
  - Evidence: SOLVER-SIM.

- **Spot 29. Overpair multiway on a wet board: size up every street.**
  - Situation: $1/$2, $100 effective (flag: short). Five limpers; hero SB Q♥Q♦ raises to $10; three see the flop 9♣7♠5♥ (pot $47); hero bets $20, two call; turn 2♠ hero bets $25 into $107; river A♦ hero checks, faces a $43 shove, calls and loses to A♣7♣.
  - Opponent: loose limpers.
  - Solver play: multiway, smaller bets and more checking with one pair `[src for principle]` — [GTO Wizard Blog](https://blog.gtowizard.com/10-tips-multiway-pots-in-poker/)
  - Exploit play: raise to ~$18 preflop; bet ~$32 on the flop; shove the turn; check the river and ideally fold to the shove.
  - Why: small bets give draws and weak pairs correct prices; larger ones extract from hands that call anyway.
  - Source: Jonathan Little, "Betting Too Small" (Aug 2019) — [Card Player](https://cardplayer.com/poker-news/24134-poker-strategy-with-jonathan-little-betting-too-small)
  - Evidence: OPINION.

- **Spot 30. Check strong hands out of position against players who over-stab.**
  - Situation: hero raised preflop, is out of position heads-up, e.g. J♠9♠2♣.
  - Opponent: recreational players who bet good, medium and drawing hands when checked to and reveal strength by size.
  - Solver play: c-bets some share of range out of position `[char]`.
  - Exploit play: check nearly always, including strong hands; check-raise almost any hand with equity against a small stab; bet turn and river for value after a check-through.
  - Why: live players make more mistakes against a check than against a bet. Compare Spot 28, which says the opposite against players who do not stab.
  - Source: Marc Goone interview (Oct 2024) — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66553-tyler-ninja-blevins-37-23/articles/25224-marc-goone-explains-how-to-properly-size-your-bets)
  - Evidence: DATA-LIVE (author-reported, unpublished).

- **Supplementary (no separate number):** Players who "call slightly too much" still call down a value bet of about 40% pot; value bet relentlessly — Fitzgerald, [Card Player](https://www.cardplayer.com/poker-news/poker-strategy-mistakes-low-stakes-players-exploit-them). Against tight straightforward players, keep the pot small with marginal made hands (A♠5♠ on J♣5♦2♠: call flop, fold to continued betting; bet about one-third pot or check when checked to) — Little, [Card Player](https://www.cardplayer.com/?p=1038047).

### Inferences
- Spots 28 and 30 are the same decision with opposite answers; the deciding variable is the opponent's stab frequency when checked to. The simulator needs that as an explicit opponent parameter.
- For Spot 25, a station that never slow-plays makes the coaches right; a station that calls AND traps makes the solver profile right. Test cases should specify which.

### Gaps
- No source gave a measured live call frequency versus overbets. No fully specified "three streets with top pair versus a station" hand with sizes was found in a fetchable source.

## 5. Preflop: sizes, limping behind, 3-bet shape, 4-bets, implied odds, rake

### Takeaway
Live advice converges on larger isolation raises, a value-heavy 3-bet range against callers, no 4-bet bluffs against passive players, and tight blind defense under rake. It diverges on whether live players over-fold or over-call 3-bets, and on flatting versus 3-betting AK/AQ.

### Cited Findings

- **Spot 31. Isolation-raise size and width over limpers.**
  - Situation: one or more limpers ahead.
  - Opponent: loose-passive limpers. Caution versus first-position limpers, who are the most likely to hold AA/KK.
  - Solver play: no standard solution; solver sizes for an unopened pot are smaller `[char]`.
  - Exploit play: iso to 4bb + 1bb per extra limper in position, 5bb + 1bb per limper out of position, with 40% to 100% of hands depending on position and 3-bet risk. Concrete corrections from hand reviews: $2/$5 with two limpers, about $27 rather than $15-$20; $1/$3 with two limpers and AQo on the button, $22 rather than $16; $1/$2 with five limpers and QQ in the SB, ~$18 rather than $10.
  - Why: limp-callers call too often for small raises to isolate; raises are primarily for value.
  - Sources: Dan B. — [Upswing Poker](https://upswingpoker.com/exploit-poker-leaks/); Little — [Card Player](https://www.cardplayer.com/?p=1038558), [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66379-card-player-poker-tour-bestbet-jacksonville-31-8/articles/23352-combatting-a-three-bet-from-a-limper), [Card Player](https://cardplayer.com/poker-news/24134-poker-strategy-with-jonathan-little-betting-too-small)
  - Evidence: OPINION.

- **Spot 32. Over-limp speculative hands on the button; raise-or-fold elsewhere.**
  - Situation: limpers ahead.
  - Opponent: weak limping fields; raise most aggressively into "blackjack-style" loose-passives, less into nits who limp AKo/KK/QQ and limp-reraise.
  - Solver play: custom 40bb MTT solves (flag: not cash, not 100bb+) `[src]`.
  - Exploit play: outside the button and blinds play raise-or-fold; on the button consider over-limping small pairs, small suited connectors, Q6s, 98o; raise hands that dominate limp-calling ranges (e.g. A9).
  - Source: Andrew Brokos, "How to Handle Loose-Passive Limpers" (Mar 2024) — [GTO Wizard Blog](https://blog.gtowizard.com/how-to-handle-loose-passive-limpers/)
  - Evidence: SOLVER-SIM plus OPINION. A glossary-level source also says over-limping small pairs/suited connectors exploits implied odds in deep multiway games where few players punish limps (search snippet only) — [PokerSkill](https://www.pokerskill.com/poker-glossary/overlimp/).

- **Spot 33. Folding a small pair when the implied odds are "phantom".**
  - Situation: $1/$2 with a $5 straddle, $250 effective. Hero calls $5 with 55; BTN raises to $20; the straddler (hero's target) folds; $15 to call into $33 with ~$230 behind.
  - Opponent: thinking button with position who will slow down against a flat-caller.
  - Solver play: `[char]` set-mine by price/stack ratio.
  - Exploit play: fold (hero would have called $25-$30 from the loose multi-barreling straddler).
  - Numbers: flop a set about 1 in 8.5; minimum 7.5-to-1 implied odds, author prefers ~10-to-1; another author uses 15-to-1 (search snippet only) — [BlackRain79](https://www.blackrain79.com/2019/12/is-set-mining-profitable.html).
  - Why: stack depth is not implied odds; what matters is how much this opponent actually pays off, and position.
  - Source: Carlos Welch, "Avoiding Phantom Implied Odds" (Apr 2015) — [PokerNews](https://www.pokernews.com/strategy/cash-advances-vol-3-avoiding-phantom-implied-odds-21399.htm)
  - Evidence: OPINION with arithmetic.

- **Spot 34. 3-bet shape: linear versus callers, polarized versus folders. (DISPUTED on which the live pool is)**
  - Situation: facing an open from a wide raiser.
  - Solver play: mixed/polarized 3-bet ranges in many positions `[char]`; one cited equilibrium: BB 3-bets ~5.4% polarized vs a UTG min-open `[src]` — [GTO Wizard Blog](https://blog.gtowizard.com/the_3_biggest_leaks_killing_your_winrate/)
  - Exploit play, position A (pool calls 3-bets too much): 3-bet linear/merged for value — AJ, KJs, 99 (PokerCoaching); AJ, ATs, A9s, KQ, KJs, adding KJo/KTs against someone who has called with K8o (Upswing, Dan B.). Against a player who always calls re-raises, stop bluffing entirely.
  - Exploit play, position B (pool over-folds and never 4-bets): expand 3-bets with 99, QJs, 87s, possibly AJs-ATs, suited broadways, KQo, AJo; from the blinds 3-bet middling pairs, suited connectors and suited broadways versus loose late-position opens. Caveat: avoid wide 3-bets with short stacks behind.
  - Dan B.'s rule: polarized (76s-43s, A2s-A6s, K2s-K9s as bluffs) only when the opener folds to 3-bets more than half the time.
  - Sources: [PokerCoaching](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/); [Upswing Poker (Dan B.)](https://upswingpoker.com/exploit-poker-leaks/); [Upswing Poker (Mathias)](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
  - Evidence: OPINION. Both camps end up 3-betting more medium-strong hands; they differ on whether to include low suited bluffs.

- **Spot 35. No 4-bet bluffs against a passive 3-bettor.**
  - Situation: UTG min-open, BB 3-bets to 9.5bb, 100bb (NL500 online solver setup; flag).
  - Opponent: passive BB (mass data is cited as showing the BB heavily under-3-bets; no figures given).
  - Solver play: UTG 4-bets strong hands plus bluffs such as AQo, A4s, KJs `[src]`.
  - Exploit play: drop the 4-bet bluffs and over-fold. Versus an over-aggressive BB do the reverse (add offsuit 4-bet bluffs and calls).
  - Source: Vanja — [GTO Wizard Blog](https://blog.gtowizard.com/the_3_biggest_leaks_killing_your_winrate/)
  - Evidence: SOLVER-SIM; the population claim is DATA-ONLINE without numbers.

- **Spot 36. Flat-calling AK/AQ instead of 3-betting in deep live games. (DISPUTED)**
  - Situation: $5/$5 (flag), $1,000 effective. MP raises to $25; hero BTN A♥Q♦ calls. Flop 8♦2♠5♥, raiser bets $30: hero usually calls.
  - Opponent: pool-wide (players who call 3-bets out of position and cannot fold top pair).
  - Solver play: AK 3-bets; AQo 3-bets or folds in many full-ring spots `[char]`.
  - Exploit play: flat to keep dominated AJ/KQ in and extract postflop; requires continuing when you miss, because the pool rarely fires multiple barrels.
  - Opposing position: PokerCoaching recommends 3-betting a wider linear range that includes AJ (Spot 34).
  - Source: Bart Hanson (Oct 2012) — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66214-haig-kelegian-25-20/articles/20863-crushing-live-poker-with-twitter)
  - Evidence: OPINION (and dated: 2012).

- **Spot 37. Tight blind defense under rake and against large opens.**
  - Situation: BB facing a 2.75bb CO open, 100bb, raked, no ante; and BB facing 3bb vs 5bb opens.
  - Opponent: any; the point is structural.
  - Solver play: ~28-29% defense with rake and no ante `[src]` versus ~76% in a 1bb-ante, rake-free tournament `[src]`. The raked range is roughly 22+, A2s+, KTo+, down to 43s.
  - Exploit/correct play: defend far tighter than tournament charts; from the SB play 3-bet or fold, never call. Versus a 5bb open, weak suited connectors, offsuit broadways and bad suited kings are clear folds (borderline versus 3bb).
  - Sources: Jonathan Little, "More Rake Is Not Better For A Wider Range" (Jan 2026) — [Card Player](https://www.cardplayer.com/?p=1633660); [PokerCoaching](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/)
  - Evidence: solver output quoted by the author (the article gives both 28% and 29%); not live-specific and assumes the opener plays well. This is a "wrong solver chart" case: a rake-free or ante chart flags correct folds as mistakes.

- **Spot 38. Cold-call pairs, suited aces and suited connectors in position against tight recreational raisers; fold offsuit broadways.**
  - Situation: a tight recreational player raises; hero is in position.
  - Opponent: tight recreational player who raises premiums and will not fold them.
  - Solver play: full-ring cold-calling ranges are narrow; many of these hands fold or 3-bet `[char]`.
  - Exploit play: call with pairs, suited aces, suited connectors; fold (or 3-bet bluff) KTo, QJo and similar.
  - Why: you want hands that stack an overpair, not hands dominated by the raiser's range.
  - Source: Jonathan Little (Jun 2017) — [Card Player](https://www.cardplayer.com/?p=1038047)
  - Evidence: OPINION.

### Inferences
- For the simulator, Spot 37 argues that the "solver baseline" itself must be a raked, no-ante cash solution; otherwise blind-defense flags will be systematically wrong before any pool exploit is applied.
- Spots 34 and 36 show that preflop exploit direction depends on two opponent parameters: fold-to-3-bet and willingness to stack off with dominated top pairs.

### Gaps
- No source gave live-measured open sizes or fold-to-3-bet frequencies at $1/$2-$3/$5. A PokerNews piece states live low-limit opens of 5x or more are common (snippet only) — [PokerNews](https://www.pokernews.com/strategy/10-hold-em-tips-bet-sizing-25443.htm).
- No source quantified the EV of over-limping versus isolating in multiway limped pots, and no rake-adjusted set-mining math for capped live rake was found.
- Hungry Horse's "Live Poker Preflop Bible" exists as a video; the third-party summary page returned no content.

## 6. C-betting: frequency and size multiway, small range-bets versus stations

### Takeaway
Solver work says to stop range-betting multiway and size down; live coaches split between small c-bets (to keep fold equity for later streets against players who never check-raise) and large ones (to charge loose callers with real hands). Against stations, solver sims show small, frequent, value-weighted flop bets gain EV — the small bet does not fail; the bluff barrels behind it do.

### Cited Findings

- **Spot 39. C-bet size in multiway or bloated single-raised pots. (DISPUTED)**
  - Situation: $1/$2, $200 effective, hero MP J♠T♠; flop 9♠7♣2♦, pot $41.
  - Solver play (multiway): give up more, no range-betting, smaller sizes, higher value thresholds, bluffs need real equity `[src]` — [GTO Wizard Blog](https://blog.gtowizard.com/10-tips-multiway-pots-in-poker/). Example quoted: in a 9-way pot even a 1% pot bet needs each player to defend only ~44%.
  - Exploit play, position A (small): bet $15 (~37%) rather than $35 (~80%); turn pot $71 with SPR 2.5 instead of $111 with SPR 1.4, preserving fold equity for later barrels — Mathias, [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/). Little also prefers ~$20 into $52 when betting most of range heads-up — [Card Player](https://www.cardplayer.com/?p=1038558).
  - Exploit play, position B (large with value): with QQ three-way on 9♣7♠5♥ bet ~$32 into $47 and shove the turn — Little, [Card Player](https://cardplayer.com/poker-news/24134-poker-strategy-with-jonathan-little-betting-too-small). Miller treats $50 into $125+ four-way as not large and reads $35 into $107 as a weak-hand tell — [Card Player](https://cardplayer.com/poker-news/20944-poker-strategy-with-ed-miller-taking-advantage-of-loose-play), [Card Player](https://cardplayer.com/poker-news/20644-poker-strategy-with-ed-miller-three-bet-sizing-tells).
  - Why: A relies on the pool rarely check-raising and over-folding later; B relies on the pool calling flop bets too wide with draws and pairs.
  - Evidence: OPINION on both sides; SOLVER for the multiway baseline.

- **Spot 40. Heads-up: in position bet almost always; out of position check almost always.**
  - Situation: LJ c-bet versus BB on 7♦4♦3♥ (in position); raiser out of position on J-9-2 two-tone boards.
  - Opponent: live players generally.
  - Solver play: bets range 100% on the 7♦4♦3♥ LJ-vs-BB example `[src]`; out of position solvers c-bet a portion of range `[char]`.
  - Exploit play: in position, bet nearly always and choose the size at which opponents raise their strong hands and call their weak ones (board-texture theory matters little); out of position, check nearly always (see Spots 19 and 30).
  - Why: in an informal test, six winning live pros defending that flop over-raised strong hands, over-called weak ones and under-check-raised bluffs.
  - Source: Marc Goone interview — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66553-tyler-ninja-blevins-37-23/articles/25224-marc-goone-explains-how-to-properly-size-your-bets)
  - Evidence: DATA-LIVE (author-reported): six-player test plus 50,000+ stable hours; not published.

- **Spot 41. Against a station: c-bet more often and small on the flop, value-weight it, barrel the turn less.**
  - Situation A: UTG vs BTN 100bb. Versus the Calling Station profile UTG bets more often, almost exclusively 40% pot or less; on Q♥J♦5♣ the quarter-pot bet is used 83% vs 71% against GTO; turn barrel frequency and size are lower than against GTO (medium hands check because the river comes free).
  - Situation B: heads-up 15bb (flag), 8♦7♦5♣; BB locked to call all gutshots and pairs: c-bet frequency 40% → 49%, more "best/good" hands, less trash. Over a whole hand (A♥Q♠3♣ limped pot): flop c-bet 96% → 85%, turn barrel ~41% with bluffs replaced by 70%+ equity hands.
  - Situation C: BB never folds to 33%: CO bets 33% with full range, EV 3.75bb → 4.71bb.
  - Solver play: as quoted `[src]`.
  - Sources: Brokos — [GTO Wizard Blog](https://blog.gtowizard.com/exploiting-profiles-episode-i-the-calling-station/); Sibbeh — [GTO Wizard Blog](https://blog.gtowizard.com/crush-calling-stations-with-these-3-solver-approved-strategies/); Carter — [GTO Wizard Blog](https://blog.gtowizard.com/the-five-imbalances-of-exploitative-poker/)
  - Evidence: SOLVER-SIM. Note the direction differs by setup (frequency up in A and C, slightly down across streets in B).

- **Supplementary:** When cold-called by an in-position player, the raiser should check most of range out of position; players who c-bet too often there should be raised with almost all continues and stabbed at with a large size when they check — Dan B., [Upswing Poker](https://upswingpoker.com/exploit-poker-leaks/). Ace-high boards are called out as profitable small c-bet spots from the blinds after 3-betting because weak players' call/fold ranges are inelastic there — Mathias, [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/).

### Inferences
- The premise "small range-bets fail against stations" is not supported by the solver sims found: against opponents who call too much but rarely raise, small frequent bets gain EV through thin value and cheap equity denial. What should be flagged is continuing to bluff on the turn and river.
- Positions A and B in Spot 39 are reconcilable by hand class: small with range/air to set up barrels, large with vulnerable strong hands multiway. No source states this reconciliation explicitly.

### Gaps
- No live-measured fold-to-c-bet or check-raise frequencies by number of players were found.

## 7. Sizing exploits: reading sizing tells and sizing against inelastic ranges

### Takeaway
Live sizing tells are consistently described in one direction (bigger means stronger; small into a field means marginal; shrinking size then a check means capped), and the recommended responses are concrete. All of it is experience-based.

### Cited Findings

- **Spot 42. Small c-bet from a tight recreational raiser: treat as weak and attack.**
  - Situation: $2/$3, $400 effective. Tight early-position recreational player opens to $15, two callers; flop J♥4♠3♠; raiser bets $20.
  - Opponent: tight recreational raiser.
  - Solver play: small sizes are part of a balanced strategy and say little about hand strength `[char]`.
  - Exploit play: read the range as 99/TT/AK/AQ, rarely sets, AA/KK or AJ; continue and apply pressure. Goone's version: against a small bet on J♠9♠2♣, check-raise almost any hand with equity.
  - Why: weak players size up with hands they want to protect.
  - Sources: Bart Hanson (Oct 2012) — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66214-haig-kelegian-25-20/articles/20863-crushing-live-poker-with-twitter); Goone — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66553-tyler-ninja-blevins-37-23/articles/25224-marc-goone-explains-how-to-properly-size-your-bets)
  - Evidence: OPINION (Hanson); DATA-LIVE author-reported (Goone).

- **Spot 43. Big-to-small sizing then a river check: bluff big.**
  - Situation: $2/$5 (flag), $1,000 stacks. Flop J♥T♦6♦: raiser bets $60 into $100. Turn 7♦: bets $100 into $207. River 3♣: checks. Hero holds Q♣J♣ (top pair, no diamond).
  - Opponent: typical live raiser.
  - Solver play: Q♣J♣ has showdown value and mostly checks back `[char]`.
  - Exploit play: consider turning the hand into a bluff with a large bet, about $400 into $427.
  - Why: the shrinking turn size and river check indicate one pair playing defensively against the flush.
  - Source: Ed Miller — [Card Player](https://cardplayer.com/poker-news/20644-poker-strategy-with-ed-miller-three-bet-sizing-tells)
  - Evidence: OPINION. (The author says "consider"; this is the least firm of his three tells.)

- **Cross-references:** small-then-big pattern = fold (Spot 4); small multiway flop bet = call lighter (Spot 12); jam versus capped range (Spot 17); all-small or all-overbet versus inelastic callers (Spot 26); overbet for value (Spot 25).
- **Supplementary:** in a shallow 4-bet pot ($5/$5, $700 effective, pot $490 with $480 behind on 9♣3♠3♦), a tiny bet (~$100) or a check with AA is near-optimal, and any ~$300 bet from the opponent should be evaluated as a shove — Hanson, [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66214-haig-kelegian-25-20/articles/20863-crushing-live-poker-with-twitter). Against a player observed to bet large only with strong hands, Little raised two pair and called a jam (it was AA) — tournament example — [Card Player](https://www.cardplayer.com/?p=1038047).

### Inferences
- The sizing tells give the simulator a testable opponent feature: bet size correlated with hand strength. Spots 4, 12, 42 and 43 only hold if the modeled opponent has that correlation.

### Gaps
- No dataset on the reliability of live sizing tells was found. A low-authority blog claims flop/turn min-raises are almost never semi-bluffs and that sizing tells are much weaker against regulars (search snippet only; not fetched) — [spotmytell](https://spotmytell.pages.dev/blog/why-sizing-tells-are-real-2026).

## 8. Donk bets, min-raises, limp-reraises and other unusual lines

### Takeaway
The limp-reraise is the clearest case: against a stereotypical low-stakes player it is a premium and AQ is a fold. For donk bets the only data-backed source argues hero should lead more in live multiway pots; sourcing on how to respond to opponents' donks and min-raises is thin.

### Cited Findings

- **Spot 44. Facing a limp-reraise with AQ.**
  - Situation: $1/$3, $160 effective (flag: short), eight-handed. Two limpers; hero BTN A♠Q♦ raises to $16; BB calls; first limper re-raises to $46.
  - Opponent: stereotypical $1/$3 player; range given as AA, KK, QQ, AK. Exception: a player known to limp-reraise junk.
  - Solver play: no equilibrium line exists for this node (limp-reraise ranges are not part of standard solutions); by pot odds alone (~$30 more into ~$100) a chart-follower would continue `[char]`.
  - Exploit play: fold. Against the known-junk exception, shove. Calling (what hero did) is the disliked option.
  - Source: Jonathan Little, "Combatting A Three-Bet From A Limper" (Apr 2018) — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66379-card-player-poker-tour-bestbet-jacksonville-31-8/articles/23352-combatting-a-three-bet-from-a-limper)
  - Evidence: OPINION.

- **Spot 45. Hero leads (donks) for value in family pots.**
  - Situation: five-way raised pot; hero SB A♣2♣ on A♠K♥2♥. Also a semi-bluff version: four-way, hero CO J♣T♣ on Q♣8♥2♣ after two checks with the raiser on the button.
  - Opponent: passive preflop raiser unlikely to c-bet air into a field.
  - Solver play: check to the raiser; the article's own online data shows donking loses money online `[src]`.
  - Exploit play: lead for value (or as a semi-bluff into a small remaining field, not a large one).
  - Why (data): Vegas $1/$2 figures in the article: preflop raise frequency ~6.0% live vs 8.5% online; call frequency ~28.0% vs 15.3%; average 4.0 players to the flop vs 2.7; ~27% of flops are five-way or more. A passive raiser will not bet for you. The author adds that donking is still generally not the most profitable play even live; these are exceptions.
  - Source: Steve Selbrede, "Donk Betting in Small-Stakes Live No-Limit Hold'em" (Jul 2017) — [PokerNews](https://www.pokernews.com/strategy/donk-betting-in-small-stakes-live-no-limit-hold-em-28638.htm)
  - Evidence: DATA-LIVE (author-reported; collection method and sample size not verified by me).

- **Related:** nits limp strong hands (AKo, KK, QQ) and limp-reraise more, so isolate them less — Brokos, [GTO Wizard Blog](https://blog.gtowizard.com/how-to-handle-loose-passive-limpers/). Check-raising a small in-position stab with any equity — Spot 42.

### Inferences
- Spot 45's participation numbers (4.0 players per flop, 27% five-way+) are the only live population statistics found in this research and are useful for configuring the simulator's multiway frequency, independent of the donk question.

### Gaps
- Responding to opponents' donk bets: only generic or online-micro sources surfaced (search snippets): one says low-stakes donks are usually weak and should be called or raised; another says regulars' donks are weak top pair/overpair or the nuts — [BlackRain79](https://www.blackrain79.com/2012/02/how-to-approach-donk-bets.html?m=0). Not live-specific; not fetched. Treat as unsourced for test-case purposes.
- Min-raises (flop/turn/river): no credible source with a specified hand was found. The common "turn min-raise is the nuts" heuristic is unsourced here.

## 9. Balance and protection: abandoning balanced checking ranges, folding "top of range"

### Takeaway
The pro-exploit position is that almost no live opponent can punish an unbalanced strategy, so protection is wasted EV; a minority view says to keep a disciplined check/call range because some recreational players do fire big. Folding hands at the top of one's range is the direct consequence of Section 1.

### Cited Findings

- **Spot 46. Abandon protected checking ranges and mixed strategies. (DISPUTED)**
  - Situation: heads-up postflop as the raiser.
  - Solver play: mix bets and checks, protect the checking range `[src for the specific 7♦4♦3♥ and overpair examples in Spots 28 and 40]`.
  - Exploit play: in position bet nearly always; out of position check nearly always; do not worry about being exploited. The author says he has needed a pure-theory approach against only two players in six years of live play, and advises underestimating rather than overestimating opponents.
  - Supporting argument: opponents are far less aware of your adjustments than you fear and cannot see your stats live. Worked example: if a player folds 70% to half-pot river bets and adjusts to 50% because "you're a bluffer", bluffing still profits (break-even is ~33% folds); if one player drops to 28%, you barely lose against him and still profit against everyone else.
  - Opposing position: do not cap your range even against recreational players; keep a disciplined check/calling range so someone capable of overbetting cannot profit from your passivity (Gareth Chantler).
  - Sources: Goone — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66553-tyler-ninja-blevins-37-23/articles/25224-marc-goone-explains-how-to-properly-size-your-bets); Phil Galfond, "How Understanding Your Player Pool Can Boost Your Winrate" (Sep 2023) — [philgalfond.com](https://www.philgalfond.com/articles/how-understanding-your-player-pool-can-boost-your-winrate); Chantler in Tapscott — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66253-mike-watson-26-21/articles/21475-head-games-cash-game-overbetting-dynamics)
  - Evidence: OPINION (Goone's is informed by unpublished live tracking).

- **Spot 47. Bluff rivers into a pool that over-folds, while folding your own bluff-catchers to the same pool.**
  - Situation: a local $2/$5 game where regulars under-bluff rivers and, having learned to over-fold, also call too little.
  - Solver play: defend and bluff at balanced frequencies `[char]`.
  - Exploit play: do both exploits at once — bluff more and call less — even though they are opposite deviations.
  - Why: under-bluffing and over-folding are complementary leaks; spotting one should prompt a search for the other. Caveat from the author: over-folding pools can drift into over-bluffing, though loss-aversion-driven under-bluffing may persist at low stakes.
  - Source: Phil Galfond — [philgalfond.com](https://www.philgalfond.com/articles/how-understanding-your-player-pool-can-boost-your-winrate)
  - Evidence: OPINION (hypothetical numbers).

- **Related:** Folding top-of-range hands is explicit in Spots 1, 3, 4 and 7. Derek Kwan argues adapting to opponents is rarely punished at low/mid stakes; the exploitable habits are sizing by your own hand strength, min-raising postflop with weak hands, and 3-betting only the top 5% (tournament context) — ["You're not that exploitable"](https://notpropoker.substack.com/p/youre-not-that-exploitable).

### Inferences
- An EV-against-pool simulator should not penalize unbalanced lines per se; it should penalize them only when the modeled opponent has the counter-strategy. That matches Goone's "three lenses" description (theory as the anchor, then exploit, then player incentive).

### Gaps
- No source measured how often live low-stakes opponents actually counter-adjust.

## 10. Disputed or commonly over-applied exploits

### Takeaway
The disagreements cluster in six places: what overbets from weak players mean, whether to overbet stations, whether the pool over-folds or over-calls 3-bets, c-bet size multiway, flat versus 3-bet with AK/AQ, and how far to take river over-folding. In each case the sources differ on the opponent's secondary tendency, not on the principle.

### Cited Findings

- **Over-folding the river is conditional, not absolute.** Hanson folds to late raises only when the line makes sense and says he has picked off bluffs when it does not — [Crush Live Poker](https://crushlivepoker.com/articles/raises-to-overbets). Mathias: do not fold your whole range to any size; base it on observed tendencies — [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/). Hanson's own exception on missed-draw run-outs is Spot 10. A PokerCoaching tip explicitly warns not to make the big fold against a loose player who bets wide — [PokerCoaching](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/).
- **Calling rivers: too much or too little?** Hanson's thesis is that live players call too much and bluff too little (so bet-fold thin) — [Crush Live Poker](https://crushlivepoker.com/articles/rarely-check-call-the-river). Galfond describes $2/$5 regulars who over-fold rivers — [philgalfond.com](https://www.philgalfond.com/articles/how-understanding-your-player-pool-can-boost-your-winrate). Fitzgerald splits the pool: callers ("common"), slight over-callers ("common"), over-folders ("rare"), over-bluffers ("rare") — [Card Player](https://www.cardplayer.com/poker-news/poker-strategy-mistakes-low-stakes-players-exploit-them). These are consistent if recreational players over-call and regulars over-fold; no source states that split with data.
- **"They never bluff" versus maniacs.** Fitzgerald: true over-bluffers are rare and most apparent maniacs still have strong hands in big pots; Fang: most live overbets are bluffs by non-thinking players (Spot 14) — [Card Player](https://www.cardplayer.com/poker-news/poker-strategy-mistakes-low-stakes-players-exploit-them), [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66253-mike-watson-26-21/articles/21475-head-games-cash-game-overbetting-dynamics).
- **Bluff-overbetting weak players.** Marks: weak players fold to the first one or two overbets and then turn into stations, so bluff early and switch to value — [Card Player](https://cardplayer.com/cardplayer-poker-magazines/66253-mike-watson-26-21/articles/21475-head-games-cash-game-overbetting-dynamics). This conflicts with "never bluff a station" unless the player's history with hero is tracked.
- **Overbet value versus stations.** Coaches say size up (Spot 25); the solver profile of a station that slow-plays uses no overbets — [GTO Wizard Blog](https://blog.gtowizard.com/exploiting-profiles-episode-i-the-calling-station/).
- **Raising less versus sticky players is wrong.** The intuitive adjustment (raise less because they will not fold) was tested and rejected: the solver raises more, for thinner value, against a sticky third player (Spot 27) — [GTO Wizard Blog](https://blog.gtowizard.com/3-way-how-to-exploit-a-calling-station/).
- **Checks are not always weak.** Flop checks from the raiser are attackable; turn/river checks after betting are often strong hands played cautiously (Spot 18) — [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/).
- **3-bet pots.** "Pool over-folds to 3-bets, so 3-bet light" (Mathias) versus "pool calls 3-bets too often, so 3-bet linear for value" (PokerCoaching; Dan B. conditions it on fold-to-3-bet above or below one half) — Spot 34.
- **AK/AQ.** Flat (Hanson 2012) versus 3-bet as part of a linear range (PokerCoaching) — Spots 34 and 36.
- **Multiway c-bet size.** Small (Mathias) versus large with value (Little, Miller) versus solver "check more, size down" — Spot 39.
- **Set-mining thresholds.** 7.5-to-1 minimum, 10-to-1 preferred (Welch) versus 15-to-1 (BlackRain79, snippet); and the caution that stack depth alone is not implied odds — Spot 33.
- **Quality of the evidence itself.** Of the 47 spots, the only measured population data are online high-stakes regs (Spots 6 and 20) and author-reported live figures (Spots 19, 30, 40, 45). Solver-sim spots (9, 22, 24, 26, 27, 28, 35, 41) prove the exploit only conditional on the assumed opponent. Everything else is coach opinion. Stat-aggregator pages surfaced in search (Gitnux, ZipDo, WifiTalents) quote live "bluff-catch" percentages with no methodology and were excluded as unreliable.

### Inferences
- Every dispute resolves into a second opponent parameter the simulator must model: bluff frequency by line (not one global number), slow-play frequency of stations, fold-to-3-bet, stab frequency when checked to, check-raise frequency, and size-strength correlation. A single "pool" profile will reproduce one side of each dispute and flag the other side as a mistake.
- Test cases built from `[char]` baselines are provisional. The safest initial set uses spots with source-stated solver baselines: 3, 6, 9, 20, 22, 24, 26, 27, 28, 35, 37, 40, 41.
- Suggested confidence tiers for test cases: high (many independent coaches agree, plus solver-sim support): 7, 8, 9, 22, 24, 31, 35, 37; medium (specific hand, single source): 1-5, 10, 12, 16-19, 29, 44; low or disputed: 14, 25, 34, 36, 39, 43, 46.

### Gaps
- No direct criticism of live over-folding from Matt Berkey, Uri Peleg or Andrew Brokos was retrieved; Peleg's exploit course is paid content and only its existence was confirmed.
- No live $1/$2-$3/$5 dataset with frequencies by line exists in anything I could access. All magnitudes for the live pool remain unquantified.
- Forum consensus (Two Plus Two LLSNL, Reddit) could not be read directly; only search snippets for Two Plus Two were seen, and they were several years old.
