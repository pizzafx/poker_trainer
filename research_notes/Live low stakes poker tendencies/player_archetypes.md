# Player archetypes in live low-stakes NLHE cash games ($1/$2 to $3/$5, US casinos, full ring)

Research date: 2026-11-10. Purpose: parameter profiles for simulated opponents plus counter-strategies.

**How to read the evidence tags used throughout**

- `[DATA-live]` = numbers from hand-tracked or database-tracked live play. Very few exist; samples are small or the stakes are higher than $1/$2.
- `[DATA-online]` = numbers from online tracking databases. Not directly transferable to live full ring; always flagged.
- `[OPINION]` = coach / author / forum-poster judgement with no dataset shown.
- `[MODEL]` = output of an author's calculation built on their own assumptions (not an observation).
- `[EXCERPT]` = I only saw this in a search-engine excerpt; the page itself could not be opened (403/404/429) so wording and attribution are unverified. Treat as low confidence.

**Headline caveat for the developer.** Only pool-average live numbers are tracked (Selbrede's Vegas $1/$2 notes; Hand2Note's live database at $2/$5 and up). Every per-archetype VPIP/PFR range found is either coach opinion or an online-HUD convention. No source gives per-archetype c-bet, fold-to-bet, bluff-by-street or check-raise frequencies for live low stakes. Those cells are gaps and are marked as such rather than filled.

**Sources that could not be accessed.** The books named in the brief (Ed Miller "Playing the Player" and "The Course", Jonathan Little "Strategies for Beating Small Stakes Poker Cash Games", Doug Hull "Poker Plays You Can Use", Tommy Angelo, Zach Elwood) are not readable online; only a table of contents and the authors' free articles were used. Hungry Horse Poker's material is video-only and no primary page could be retrieved. Two Plus Two threads returned 403; Reddit was not reachable. These are recorded as gaps where relevant.

---

## 1. Approximate share of a typical table / player pool

### Takeaway
No source gives a census of archetypes at a $1/$2-$3/$5 table. The tracked evidence says only that the *average* Vegas $1/$2 player is loose-passive (37% VPIP / 6% PFR) and that, in a vendor live database at $2/$5-$5/$10, 90% of tables had at least two obvious weak players and 57% had three to five.

### Cited Findings
- `[DATA-live, small sample]` The average Vegas $1/$2 player has VPIP 37% and PFR 6%; the looseness was consistent across the four rooms sampled and Vegas $2/$5 is "similarly loose". Sample: "a few hundred live hand histories", hand-noted by the author. — [Selbrede, PokerNews, Feb 2017](https://www.pokernews.com/strategy/donkey-poker-low-stakes-live-games-differ-online-27134.htm); [Selbrede, PokerNews, Feb 2017 (part 2)](https://www.pokernews.com/strategy/donkey-poker-do-you-play-too-many-hands-27182.htm)
- `[DATA-live, vendor database, stakes $2/$5 and $5/$10]` 90% of tables had at least two "obvious fish"; 57% had three to five. "Fish" = anyone failing the regular filter (VPIP <= 38, PFR 13-38, VPIP minus PFR < 20, 30+ hands). Online comparison: most tables have one recreational player. Source of the live hands is not stated. — [Hand2Note, "Online vs Live Poker Insights", Jul 2025](https://hand2note.com/Blog/Databases/online-vs-live-poker-insights)
- `[DATA-live, single observer]` One author hand-tracked six named low-limit regulars over time: VPIPs were 14%, ~14%, 18%, 27%, 30% and 36%. A regular labelled a "nit" by impression turned out to be 36%. The author's impressionistic labels ("the ancient gentleman in the 1-seat as a nit and the young drunk in the five a bad LAG") were often wrong. — [Kat Martin, Red Chip Poker, 2018/2021](https://redchippoker.com/know-thine-enemy-profiling-your-opponents-for-poker-profit/)
- `[OPINION]` Forum poster on live $1/$3: "About the only consistent and predictable players at live 1/3 are OMCs." Another: low-stakes players "aren't much better than home gamers, if at all." — [PokerChipForum thread, Mar-Sep 2025](https://pokerchipforum.com/threads/scared-to-take-the-leap-starting-1-3.129852)
- `[OPINION]` An anonymous live-play lesson lists four table archetypes (tourist, old-man-coffee rock, local pro, gambler/maniac) and says players can be classified within two orbits from posture, chip handling, buy-in amount and first showdowns. No shares given. — [BetterPoker, "The Live Player Census"](https://betterpoker.vercel.app/learn/live-poker/live-dynamics/live-player-census)
- `[EXCERPT]` Jonathan Little groups players by motive and says the type that "plays the game mostly for the social interactions, makes up the majority of the player pool, especially at the small and middle stake games." Page returned 404/403; quoted from search excerpt only. — [Card Player blog, "Understanding the three player types"](https://cardplayer.com/poker-blogs/96-jonathan-little/entries/563518-understanding-the-three-player-types)
- `[OPINION]` Taxonomies used by the named coaches: SplitSuit uses Nit, TAG, LAG, A-Fish (maniac), P-Fish (calling station), Unknown. — [SplitSuit player types (ThePokerBank)](https://www.thepokerbank.com/videos/splitsuit/player-types/). Ed Miller's "Playing the Player" is organised as Tight Players / Loose-Aggressive Players / Bad Players. — [Ed Miller table of contents (Goodreads author blog)](https://www.goodreads.com/author_blog_posts/2572519-playing-the-player-preorder-details-and-table-of-contents?tab=book). Little's site lists TAG, LAG, Maniac, Calling Station, Nit, GTO-Oriented. — [Jonathan Little, PokerCoaching, Dec 2023](https://pokercoaching.com/blog/different-poker-players/)
- `[OPINION]` Additional low-stakes archetypes named by one author: "Sticky Bun" (tight preflop, cannot fold postflop), "Roly Poly" (raises light preflop, folds to any action when he misses), "Chirper" (small preflop raises with a wide weak range), "Butterfly" (solid player who floats flops to take pots on the turn). — [Ashley Adams, PokerNews, Aug 2017](https://www.pokernews.com/strategy/player-profiling-four-new-poker-archetypes-28747.htm)

### Inferences
- A pool average of 37/6 cannot be produced by a table of mostly tight players, so loose-passive players must be the modal type at Vegas $1/$2. The tracked regulars at 14-18% show tight players are a real minority, not the norm.
- The Hand2Note table counts are from $2/$5 and up in games that were straddled 85% of the time, which looks more like streamed or private-style games than a casino $1/$2. They are a lower bound on how soft $1/$2 is, not a measurement of it.
- For a simulator, table composition should be a configurable input. The sources support "at least 2, commonly 3-5 weak players of 8-9 opponents" and nothing more precise.

### Gaps
- No source gives a percentage split by archetype (nit / station / maniac / reg / GTO-style) for any live low-stakes pool.
- No source quantifies how many winning regulars sit at a typical $1/$2 or $1/$3 table. A search specifically for this returned nothing citable.
- The "sticky Asian gambler" stereotype named in the brief was not described in any source retrieved. No parameters exist for it here.

---

## 2. Preflop: VPIP/PFR, ranges, limping, open sizing, 3-bets, response to raises

### Takeaway
Tracked live data covers the pool only: 37/6, no positional adjustment, 3-bets very rare and value-heavy, limpers call an iso-raise about 56% of the time. Per-archetype stat bands are opinion or online conventions, and the sources disagree by 5-10 points on where each band sits.

### Cited Findings

**Pool-level (applies to all archetypes as the baseline)**
- `[DATA-live, small sample]` Vegas $1/$2 average VPIP 37%, PFR 6%, versus about 22% / 8.5% online at NL50-NL100 `[DATA-online, ~6 million hands]`. — [Selbrede, PokerNews](https://www.pokernews.com/strategy/donkey-poker-low-stakes-live-games-differ-online-27134.htm)
- `[DATA-live, small sample]` Position is ignored: late-position VPIP divided by early-position VPIP is 1.0 for the average Vegas $1/$2 player (he "plays the same range from the cutoff as he does under the gun"), versus 1.2 online. — [Selbrede, PokerNews, Mar 2017](https://www.pokernews.com/strategy/donkey-poker-are-you-a-position-dummy-27256.htm)
- `[DATA-live, small sample]` Online players 3-bet "more than three times as often" as Vegas $1/$2 players, and Vegas players call preflop raises "nearly twice as often". No absolute 3-bet percentage is given. — [Selbrede, PokerNews](https://www.pokernews.com/strategy/donkey-poker-low-stakes-live-games-differ-online-27134.htm)
- `[MODEL built on live notes]` Typical early/middle-position limper modelled as 35/6, limping roughly the 6th-35th percentile of hands; calls a raise after limping about 56% of the time. Button raising to $10 over one limper: everyone folds 23.1%, one caller 47.0%, two callers 25.7%, three callers 4.2%. Blinds raise over one limper only 4.8% (SB) and 3.4% (BB). Button calls a cutoff raise about 22%. Three-betting is "very rare"; limp-three-betting rarer. — [Selbrede, PokerNews, Oct 2017](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- `[DATA-live, source of data described only as backing-group and student-tracked hands; likely includes tournaments]` Live low-to-mid players do not 3-bet enough; they fold to 3-bets "a wildly small percentage of the time" (attributed to saving face); "the average guy was opening up 25%+ of the hands from the lojack or later if he was under the age of 45". No fold-to-3-bet number given. — [Alex Fitzgerald, JonathanLittlePoker.com, Mar 2019](https://jonathanlittlepoker.com/exploitativealex/)
- `[DATA-live, vendor database, $2/$5 and up, winning regulars only]` 242 winning TAG-filtered live players (~500k hands): average VPIP/PFR 31/20, 3-bet 13% (online about 8-10%), and opponents folded to 3-bets only 26% of the time; 28% cold-call or 4-bet after a 3-bet. Some winners run 37/21. — [Hand2Note, Jul 2025](https://hand2note.com/Blog/Databases/online-vs-live-poker-insights)
- `[OPINION]` Live open-raise sizes: "three to five times the big blind", and most opponents do not punish the size. — [Jonathan Little, PokerCoaching, Aug 2026](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/). Forum: at $1/$3 "expect opens from $10-$20" (3.3-6.7bb), and 3-4 players may call a raise. — [PokerChipForum, Mar 2025](https://pokerchipforum.com/threads/scared-to-take-the-leap-starting-1-3.129852)
- `[OPINION]` Live 3-bet and 4-bet ranges are "weighted heavily towards value hands"; 4-bets are typically AA, KK, AKs. — [Upswing Poker, Jun 2019](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- `[OPINION]` A limp-reraise "usually" shows KK+. — [Lee Jones, PokerCoaching, May 2023](https://pokercoaching.com/blog/3-deadly-techniques-to-punish-limpers-in-live-cash-games/). A limp-3-bet "signals serious strength". — [Upswing Poker, Apr 2025](https://upswingpoker.com/limps-poker-open-limpers-strategy/)
- `[OPINION]` Ed Miller: "Your typical live no-limit hold'em player plays way, way too many hands", limps habitually, and this includes nits. — [Ed Miller, Card Player, Jan 2015](https://cardplayer.com/cardplayer-poker-magazines/66294-cppt-foxwoods-28-2/articles/22227-three-skills-to-beat-1-2)

**Archetype stat bands as published (all opinion or online-derived; note disagreements)**

| Archetype | Jonathan Little / PokerCoaching `[OPINION, format not stated]` | PokerSkill `[OPINION, no sources; says full ring runs "several points tighter than 6-max"]` | DeucesCracked HUD guide `[DATA-online framing, 6-max, uncited]` |
|---|---|---|---|
| Nit / rock | VPIP 8-15, PFR 5-12 | VPIP <18, PFR <14 | example 14/12; VPIP <18 |
| TAG | 15-25 / 12-20 | 22-27 / 18-23 | example 22/19; winners 22-28 VPIP |
| LAG | 25-40 / 20-35 | 28-38 / 22-30 | not given |
| Maniac | 50+ / 35+ | 45+ / 35+ | AF > 4.0 = hyper-aggressive |
| Calling station / loose-passive | 35-50 / 5-10 | 35-60 / <12 | example 35/8; WTSD > 32% |
| GTO-oriented | 22-28 / 18-24 | not given | not given |

Sources for the table: [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/); [PokerSkill, "VPIP and PFR"](https://www.pokerskill.com/blog/vpip-and-pfr/); [DeucesCracked HUD stats](https://www.deucescracked.com/poker/strategy/hud-stats).

- `[DATA-online, uncited]` Online population references in the same HUD guide: micro stakes VPIP 28-35 / PFR 12-18 / 3-bet under 4%; low stakes 24-28 / 18-22 / 3-bet 5-7%; fold to 3-bet 55-62%. Online only. — [DeucesCracked HUD stats](https://www.deucescracked.com/poker/strategy/hud-stats)
- `[OPINION]` Full-ring online TAG reference: about 15% VPIP (about 5 hands per hour live at 33 hands/hour); a 10% raising range is roughly 22+/AJ+/KQ; a loose-passive live player may play about 60% of hands. — [James Sweeney, Red Chip Poker, 2014/2019](https://redchippoker.com/using-a-hud-for-live-poker/)

**Old man coffee / nit / rock**
- `[OPINION]` Defined as an older low-stakes cash player who plays an "extremely tight range" and rarely gets involved without a strong hand. — [PokerNews, Nov 2026](https://www.pokernews.com/strategy/where-did-the-term-old-man-coffee-come-from-52735.htm)
- `[DATA-live, single observer]` Real tight regulars tracked at 14%, ~14% and 18% VPIP. The tightest range the author has seen is about 6% (AA-99, AKs-ATs, KQs, AKo-AQo), from two regulars who "fork the range so that the weaker hands are limps". Ed Miller's published "nit" range is about 21% (AA-22, AKs-A2s, KQs-KTs, QJs-54s, QTs, AKo-ATo, KQo-KTo, QJo-JTo), which the author calls too loose for the nits she plays. — [Kat Martin, Red Chip Poker](https://redchippoker.com/know-thine-enemy-profiling-your-opponents-for-poker-profit/)
- `[OPINION]` Older players with a limit-hold'em background undervalue suitedness: model them with "symmetrised" ranges (each suited hand paired with its offsuit partner), which lifts a 21% range to about 35%. — [Kat Martin, Red Chip Poker](https://redchippoker.com/know-thine-enemy-profiling-your-opponents-for-poker-profit/)
- `[OPINION]` Ed Miller's tight-player traits include "limp-folding preflop" and "refusing to felt without the nuts". — [Ed Miller TOC](https://www.goodreads.com/author_blog_posts/2572519-playing-the-player-preorder-details-and-table-of-contents?tab=book)
- `[OPINION]` A tight player who rarely 3-bets (example: 2% over 2,000 hands) can be folded to with AQ. `[online micro-stakes example]` — [BlackRain79 guest article, Sep 2019](https://www.blackrain79.com/2019/09/play-gto-against-bad-poker-players.html)

**Loose-passive calling station / recreational limper**
- `[MODEL on live notes]` 35/6; limp range roughly the 6th-35th percentile of hands; calls an iso-raise about 56%. — [Selbrede, PokerNews](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- `[OPINION]` Limp range of a typical limper: weak-to-medium Ax, offsuit broadways, suited and offsuit connectors, random high-card suited hands (K7s, Q8s, J7s). Pure trash limps (93o) are "rare these days". — [Upswing Poker](https://upswingpoker.com/limps-poker-open-limpers-strategy/)
- `[DATA-live, single observer]` When recreational players show down junk, "the vast majority of the time the junk hands were being folded postflop"; low-limit players "will include all aces" and all pairs in their playing range. — [Kat Martin, Red Chip Poker](https://redchippoker.com/know-thine-enemy-profiling-your-opponents-for-poker-profit/)
- `[OPINION]` Stations "limp or call preflop raises to see flops". — [Alex Fitzgerald, PokerNews, Mar 2023](https://www.pokernews.com/strategy/alex-fitzgerald-nits-stations-and-maniacs-43259.htm)

**Maniac / spewy aggro / good LAG**
- `[OPINION]` Maniac: VPIP over 50%, PFR 35%+, "rarely" profitable. LAG: 25-40 / 20-35, profitable only with high skill. — [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/)
- `[OPINION]` Maniacs "will constantly spam reraises in preflop" and fire multiple barrels. — [Alex Fitzgerald, PokerNews](https://www.pokernews.com/strategy/alex-fitzgerald-nits-stations-and-maniacs-43259.htm)
- `[OPINION]` Ed Miller's LAG traits: "frequent preflop raising and postflop barrelling" and "reflexive weakness attacking". — [Ed Miller TOC](https://www.goodreads.com/author_blog_posts/2572519-playing-the-player-preorder-details-and-table-of-contents?tab=book)
- `[OPINION]` A loose player raising from the hijack may hold "half of all poker hands". — [Little, PokerCoaching, Aug 2026](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/)
- `[OPINION]` "Chirper" sub-type: small preflop raises from any position with a wide weak range, "preflop noise, signifying nothing". — [Ashley Adams, PokerNews](https://www.pokernews.com/strategy/player-profiling-four-new-poker-archetypes-28747.htm)
- `[EXCERPT, forum]` Two Plus Two posters distinguish "the ones that fold when facing aggression, and the maniac stations". Threads returned 403; seen in search excerpts only. — [2+2 LLSNL "How best to play against a smart maniac?"](https://forumserver.twoplustwo.com/170/live-no-limit-holdem-cash/how-best-play-against-smart-maniac-1812381/); [2+2 LLSNL "How to play against Maniac?"](https://forumserver.twoplustwo.com/170/live-low-stakes-nl/how-play-against-maniac-1691440/)

**Solver-style young player**
- `[OPINION]` "GTO-oriented" type: VPIP 22-28, PFR 18-24, narrow gap, profitable "at higher stakes". — [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/)
- `[DATA-live, tournaments likely included]` Men under 45 opened 25%+ of hands from the lojack or later. — [Alex Fitzgerald](https://jonathanlittlepoker.com/exploitativealex/)

**TAG reg / weak-tight reg**
- `[DATA-live, vendor database, $2/$5+]` Winning live regulars average 31/20 with a 13% 3-bet; this is looser than any published "TAG" band. — [Hand2Note](https://hand2note.com/Blog/Databases/online-vs-live-poker-insights)
- `[OPINION]` Ed Miller's own prescription for a winning $1/$2 regular: pocket pairs, suited big cards and suited connectors; never limp outside the blinds; be the tightest player at the table and the most frequent 3-bettor. — [Ed Miller, Card Player, Jan 2015](https://cardplayer.com/cardplayer-poker-magazines/66294-cppt-foxwoods-28-2/articles/22227-three-skills-to-beat-1-2)
- `[MODEL/recommendation]` Selbrede's recommended live VPIP: about 18-20% overall, about 10% from early position, about 30% on the button. — [Selbrede, PokerNews](https://www.pokernews.com/strategy/donkey-poker-are-you-a-position-dummy-27256.htm)
- `[OPINION]` "Roly Poly" (a weak-tight variant): raises light preflop, sometimes fairly large, then "he'll roll up and go away in the face of any action" when he misses. — [Ashley Adams, PokerNews](https://www.pokernews.com/strategy/player-profiling-four-new-poker-archetypes-28747.htm)

### Inferences
- The disagreement between "TAG = 15-25% VPIP" (coaches) and "winning live regs = 31/20" (Hand2Note) is real but partly a stakes and format effect: Hand2Note's sample is $2/$5 and above, deep and heavily straddled. For a $1/$2-$3/$5 casino reg, the coach band (roughly 18-25% VPIP) is the better-supported starting point, with Hand2Note as evidence that good live regs loosen up when the table is soft.
- A pool PFR of 6% combined with reported open sizes of 3-7bb means most pots are limped or raised once and called in several places. Selbrede's caller distribution (one or more callers 77% of the time against a single limper) is the only quantified version of this.
- Because the average player's range does not change with position, positional ranges should only be given to the reg, LAG and GTO-style bots. Recreational bots can use one range for all seats.
- 3-bet frequencies for recreational archetypes are best modelled as "value only, roughly QQ+/AK" given the value-heavy claims and the 2% example; this is an inference from opinion sources, not a measured number.

### Gaps
- No tracked per-archetype VPIP/PFR for live full ring. Every band above is opinion or online convention.
- No absolute live 3-bet percentage for $1/$2-$3/$5. Selbrede gives only a ratio. A figure of "live 3-bet about 4% versus 8% online" appeared in one search excerpt attributed to PokerSkill but was not on the page when opened; treat as unverified.
- No fold-to-3-bet number for low-stakes recreational players. Fitzgerald says "wildly small"; Hand2Note's 26% is at $2/$5+ against winning regs. Upswing says live players over-fold to 3-bets, which contradicts both; Upswing shows no data.
- No per-position VPIP/PFR for any live archetype.
- No measured open-raise size distribution by archetype; only "3-5x" and "$10-$20 at $1/$3".
- Hungry Horse Poker's preflop material could not be retrieved in primary form.

---

## 3. Postflop: aggression, c-bets, bluffs by street, check-raises, folds, what raises mean, sizing tells

### Takeaway
The strongest and most consistent claim across coaches is that turn and river raises at live low stakes are almost never bluffs, and that river bluffing is far below theoretical frequency. It rests on experience, plus one live dataset summarised without numbers. No source publishes c-bet, fold-to-c-bet or check-raise frequencies for live low stakes.

### Cited Findings

**Pool-level tendencies**
- `[DATA-live, described but not tabulated; likely includes tournaments]` Live low-to-mid players: do not raise flop bets as bluffs enough; the majority do not double-barrel bluff on normal boards; do not bluff rivers enough; do not consistently fold pairs after the turn; do not float out of position with high cards enough. — [Alex Fitzgerald](https://jonathanlittlepoker.com/exploitativealex/)
- `[OPINION, author calls it "limited research"]` "About 20-40% of players are capable of double barrel bluffing at low to mid stakes." — [Alex Fitzgerald](https://jonathanlittlepoker.com/exploitativealex/)
- `[OPINION]` "Usually when someone raises the turn or the river they have better than a one pair hand but not always on the flop"; facing a flop raise, one pair may still be good because live players trap and overplay. — [Bart Hanson, Crush Live Poker, Oct 2012](https://crushlivepoker.com/articles/delayed-semi-bluffing)
- `[OPINION]` Turn/river raises "are almost never bluffs at the mid to low stakes of live No Limit holdem"; in ten years Hanson "could not think of a single time where someone had bluff raised the river versus an overbet". He still calls when the line does not make sense. — [Bart Hanson, Crush Live Poker, May 2016](https://crushlivepoker.com/articles/raises-to-overbets)
- `[OPINION]` River check-raise bluffs are "almost nonexistent". — [Bart Hanson, Crush Live Poker, Apr 2012](https://crushlivepoker.com/articles/small-flop-rasies)
- `[OPINION]` "Live poker players tend to under-bluff by a lot on the river"; "check-raising occurs relatively infrequently in live poker games"; inexperienced players in middle position "will often bet all of their Qx hands at 100% frequency" on a Q-high flop, leaving weak checking ranges; but many live players check strong hands such as AQ on later streets, so bet-then-check ranges are stronger than flop checks. — [Upswing Poker, Jun 2019](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- `[OPINION]` Small-stakes players "bluff, but they don't bluff often enough to make you want to call"; when they flop top pair "they are thinking of ways to push people out of the pot". — [Ed Miller, Card Player, Jan 2015](https://cardplayer.com/cardplayer-poker-magazines/66294-cppt-foxwoods-28-2/articles/22227-three-skills-to-beat-1-2)
- `[OPINION with theory benchmark]` A pot-sized river bet needs 33% bluffs to be balanced; "most $1-$2 players simply won't be bluffing 33 percent of the time". An all-in overbet on a river that completes an obvious flush is the flush. "The more obvious the hand is, the [more] likely it is that's what they have." — [Ed Miller, Card Player, Aug 2018](https://cardplayer.com/cardplayer-poker-magazines/66390-george-antonakos-wins-cppt-bike-main-event-31-18/articles/23459-bluff-catching-at-1-2)
- `[OPINION]` $1/$2 players "call wide against small bets, but they hate getting stacked"; they call flops and turns too wide, fold "far more than GTO would allow" to a large bet, bet when strong and check when weak (a check caps the range), and rarely call a stack with one pair. — [Jonathan Little, PokerCoaching, Aug 2026](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/)
- `[OPINION]` Most recreational players consider only their own hand strength: "They are not thinking about ranges, pot odds or what types of hands that they can represent." A turn bet after the preflop raiser checks back the flop is often a reflex, not strength. — [Bart Hanson, Card Player, Oct 2012](https://www.cardplayer.com/?p=1036018)
- `[DATA-live, vendor database, $2/$5+, winning regs]` Winning live regulars: aggression 1.6 and won-when-saw-flop 40%, both lower than online. Flops by number of players were reported as 2 players 45%, 3 players 24%, 4+ players 31%; the hand counts quoted beside these (109k / 71k / 59k) do not line up with the last two percentages, so verify on the page before use. — [Hand2Note](https://hand2note.com/Blog/Databases/online-vs-live-poker-insights)

**Sizing tells**
- `[OPINION]` "Small raises on the flop, especially on wet boards, are almost always indicative of top pairish types of hands"; players who flop two pair or better and do not slow-play "will raise big". Example: check-raise to $70 over a $30 bet on K-5-4 two-tone. — [Bart Hanson, Crush Live Poker, Apr 2012](https://crushlivepoker.com/articles/small-flop-rasies)
- `[OPINION]` Block bets: recreational and older players lead very small (example $40 into $400, one tenth of pot) with medium-strength showdown hands, weak top pair, or a small overpair facing an overcard, because they "desperately want to see a showdown". — [Bart Hanson, Crush Live Poker, Feb 2014](https://crushlivepoker.com/articles/countering-blockish-bets)
- `[OPINION, online micro example extended to low-stakes live]` After check-check, a sudden huge overbet from a weak player should mostly be folded to: "it's more likely he was trapping with a big hand". Minimum donk bets from a fish "should simply be ignored". — [BlackRain79 guest article, Sep 2019](https://www.blackrain79.com/2019/09/play-gto-against-bad-poker-players.html)
- `[OPINION]` Tight players have exploitable "bet-sizing tells" (chapter title only; content not accessible). — [Ed Miller TOC](https://www.goodreads.com/author_blog_posts/2572519-playing-the-player-preorder-details-and-table-of-contents?tab=book)
- `[EXCERPT]` Zach Elwood: "Quick calls in general indicate a medium-strength to weak hand", and a quick call makes draws less likely against an aggressive opponent. Another site says a snap call can indicate strength; the two conflict. — [PokerNews, "Reading Poker Tells Video: Immediate Calls"](https://www.pokernews.com/strategy/reading-poker-tells-video-immediate-calls-24532.htm)

**Old man coffee / nit**
- `[OPINION]` Tight-player postflop traits per Ed Miller: refuses to stack off without the nuts; bet-folds; pot-controls; refuses to fire a second or third barrel. — [Ed Miller TOC](https://www.goodreads.com/author_blog_posts/2572519-playing-the-player-preorder-details-and-table-of-contents?tab=book)
- `[OPINION, anecdote]` An 85-year-old who "never raised" for an hour check-raised the turn all-in with the nut flush; the lesson is that a passive player's sudden raise is the nuts or close to it. — [Bart Hanson, Card Player, Oct 2012](https://www.cardplayer.com/?p=1036018)
- `[OPINION]` Nit needs "more than a pair" to call three bets postflop; usually has the best hand at showdown. — [Alex Fitzgerald, PokerNews](https://www.pokernews.com/strategy/alex-fitzgerald-nits-stations-and-maniacs-43259.htm)
- `[OPINION]` "Sticky Bun" variant: tight preflop but "a rock who has a very hard time folding to action after the flop". — [Ashley Adams, PokerNews](https://www.pokernews.com/strategy/player-profiling-four-new-poker-archetypes-28747.htm)

**Calling station**
- `[OPINION]` "Calling stations do not reduce their calling frequency when you bet bigger." Calls with second pair and worse. — [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/)
- `[OPINION]` Ed Miller's bad-player traits: "peeling light on the flop and getting sticky at showdown" and "absolutely refusing to fold an overpair". — [Ed Miller TOC](https://www.goodreads.com/author_blog_posts/2572519-playing-the-player-preorder-details-and-table-of-contents?tab=book)
- `[OPINION]` Recreational limpers are "often calling stations", overestimate implied odds and chase draws, yet "fold more than they should on scare cards". — [Upswing Poker](https://upswingpoker.com/limps-poker-open-limpers-strategy/)
- `[OPINION]` Limpers "rarely bluff" with a raise or check-raise; when a limper raises (often on the turn), fold one pair. — [Lee Jones, PokerCoaching](https://pokercoaching.com/blog/3-deadly-techniques-to-punish-limpers-in-live-cash-games/)
- `[DATA-online, uncited]` HUD markers for a station: aggression factor under 1.5 (under about 1.0 in other guides), went-to-showdown above 32% against a 25-28% population. — [DeucesCracked HUD stats](https://www.deucescracked.com/poker/strategy/hud-stats)

**Maniac / LAG**
- `[OPINION]` Maniac "bets without regard to strength"; fires multiple barrels and bluffs frequently. — [DeucesCracked live types guide](https://www.deucescracked.com/blog/exploiting-player-types-in-live-poker-a-comprehensive-guide); [Alex Fitzgerald, PokerNews](https://www.pokernews.com/strategy/alex-fitzgerald-nits-stations-and-maniacs-43259.htm)
- `[OPINION]` Splashy players are the only type worth bluff-catching at $1/$2; half-pot river bets after a missed draw from a splashy player are the good calls. Multiple big turn and river bets are "some evidence" of a bluff but may simply be strong hands. — [Ed Miller, Card Player, Aug 2018](https://cardplayer.com/cardplayer-poker-magazines/66390-george-antonakos-wins-cppt-bike-main-event-31-18/articles/23459-bluff-catching-at-1-2)
- `[DATA-online, uncited]` Aggression factor above 4.0 marks hyper-aggression. — [DeucesCracked HUD stats](https://www.deucescracked.com/poker/strategy/hud-stats)

**Solver-style young player: how the style misfires at low stakes**
- `[OPINION]` Thinking players "out level themselves": "They do not adjust to the fact that most of their opponents are not thinking at all." Anecdote: a young aggressive 3-bettor paid off an old passive player's turn check-raise in a $5,000 pot because he gave the opponent credit for a bluff. — [Bart Hanson, Card Player, Oct 2012](https://www.cardplayer.com/?p=1036018)
- `[OPINION, online micro examples extended to low-stakes live]` Solver-style plays that are unnecessary or losing against weak players: river bluffs and bluff-raises against players who cannot fold top pair; defending a fixed share of range against players who 3-bet 2%; calling at minimum-defence frequency against overbets from passive players. — [BlackRain79 guest article, Sep 2019](https://www.blackrain79.com/2019/09/play-gto-against-bad-poker-players.html)
- `[OPINION]` Against a true GTO player "any big deviations ... will cost you"; exploit only observed deviations. — [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/)
- `[OPINION]` Treating a loose opener as if "they have a proper hijack range" is the named error; start from the range the opponent actually has. — [Little, PokerCoaching, Aug 2026](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/)
- `[EXCERPT]` A small (25% pot) c-bet "only earns its keep when one opponent can fold a wide enough range"; against two or more opponents it is close to pointless. — [DeucesCracked, three-way solver article](https://www.deucescracked.com/blog/gto-wizard-three-way-solver-cash-game-edge-2026). A live $1/$3 four-way flop where the solver's small c-bet "is a trap", and solver-balanced bluffs failing against stations. — [PokerRailbird](https://pokerrailbird.com/?p=6258). Neither page could be opened; search excerpts only.

**TAG reg / weak-tight reg**
- `[OPINION]` Solid players who are tight preflop and fold flops are the least likely to bluff rivers; "don't pay them off" works more reliably at $2/$5 than $1/$2 because $2/$5 players are more solid and so more predictably under-bluffed. — [Ed Miller, Card Player, Aug 2018](https://cardplayer.com/cardplayer-poker-magazines/66390-george-antonakos-wins-cppt-bike-main-event-31-18/articles/23459-bluff-catching-at-1-2)
- `[OPINION]` "Local pro": solid, predictable hourly grinder with capped ranges. — [BetterPoker](https://betterpoker.vercel.app/learn/live-poker/live-dynamics/live-player-census)
- `[OPINION]` "Butterfly": a solid player who floats the flop to take the pot away on the turn. — [Ashley Adams, PokerNews](https://www.pokernews.com/strategy/player-profiling-four-new-poker-archetypes-28747.htm)
- `[EXCERPT, forum]` A reg "is expected to c-bet with nothing and value bet strong hands". — [2+2 LLSNL thread list](https://forumserver.twoplustwo.com/170/live-no-limit-holdem-cash/playing-against-calling-stations-1192874/)

### Inferences
- Little ("they fold far more than GTO to a large bet; rarely call a stack with one pair") and Little/Miller ("stations do not reduce calling frequency when you bet bigger; refuse to fold an overpair") are not the same population. The consistent reading is two different response curves: the average recreational player is elastic (calls small, folds to stack-sized bets), while the true station and the "bad player" are inelastic. The bots need different fold-versus-size curves, and the sources support the direction of each but not the slope.
- The safest hard rule for all recreational bots is that raises on the turn and river should contain essentially no bluffs, and river check-raise bluff frequency should be at or near zero. This is the most widely repeated claim in the material (Hanson, Upswing, Miller, Fitzgerald, Jones) even though none gives a number.
- Sizing should carry information in the recreational bots: small flop raise = top pair; large raise = two pair or better; tiny lead = medium showdown hand; sudden overbet after passivity = very strong.
- Fitzgerald's "20-40% can double barrel bluff" is the only number that bears on barrel frequency. It is a share of players, not a frequency per hand.

### Gaps
- No live low-stakes numbers for: c-bet frequency by street, fold to c-bet, check-raise frequency, bluff frequency by street, fold to turn/river bets by size, or went-to-showdown, for any archetype. The online figures in the DeucesCracked guide (flop c-bet 65-70%, turn about 40%, river about 30% at lower stakes) are online, uncited, and should not be used as live values.
- No data on how fold frequency changes with bet size for recreational players. Only directional opinion.
- Ed Miller's "tight player bet-sizing tells" and Zach Elwood's behavioural material are in books that could not be read.
- A Card Player excerpt attributed to Ed Miller said opponents who flopped a pair "fold too much when an overcard comes on the turn" and that it is "way too easy to bet one-third or one-quarter pot on the turn and river and get a fold". The specific article could not be pinned down, so it is not cited above.
- A Card Player excerpt attributed to Bart Hanson put the frequency of a bluff "after getting raised on the river" at "basically zero"; the column opened did not contain it, so it is unverified.
- No source quantifies how often the solver-style player over-bluffs, under-folds or small-bets multiway. Everything on that archetype's leaks is opinion, and most of it is written as advice to the reader rather than as a description of an opponent.

---

## 4. Stack size and buy-in behaviour

### Takeaway
Evidence is forum-level only: at $1/$2-$1/$3 most players sit with $100-$300 (roughly 33-150bb), short buy-ins are common, and large opens make 100bb stacks "play like 60bb". No source ties stack size to archetype except that older regulars buy in for the minimum and add on.

### Cited Findings
- `[OPINION, forum]` At one room "many people buying in for the minimum $100" and "most opting for $200"; a $300 stack was often second biggest. "Some 1/3 games play small with most people in for $300 or less, some play more like 2/5." — [PokerChipForum, Mar 2025](https://pokerchipforum.com/threads/scared-to-take-the-leap-starting-1-3.129852)
- `[OPINION, forum]` Older regulars ("OMC") "buy in for $100 and just keep announcing they're adding on". — [PokerChipForum, May 2025](https://pokerchipforum.com/threads/scared-to-take-the-leap-starting-1-3.129852)
- `[OPINION, forum]` "100BB plays like 60BB, from my experience", because opens of $10-$20 bloat pots. A player sitting with $100 at a $300-$400 max table is "an instant target"; players with $500+ may "be playing to stack you". — [PokerChipForum, 2025](https://pokerchipforum.com/threads/scared-to-take-the-leap-starting-1-3.129852)
- `[OPINION, forum]` At a room with Mississippi straddles "the button straddled 95% of hands", making $1/$2 an effective $1/$2/$5. — [PokerChipForum, Mar 2025](https://pokerchipforum.com/threads/scared-to-take-the-leap-starting-1-3.129852)
- `[DATA-live, vendor database, $2/$5-$5/$10]` Straddles were on in 85% of these games; 60% of lower-stakes games had no ante. Win rates of winning regs rose with stack depth (0-300bb: 57 bb/100; 600-1000bb: 98 bb/100). — [Hand2Note](https://hand2note.com/Blog/Databases/online-vs-live-poker-insights)
- `[OPINION]` Buy-in amount is one of the quick classification cues for a new player. — [BetterPoker](https://betterpoker.vercel.app/learn/live-poker/live-dynamics/live-player-census)
- `[OPINION, small example]` Upswing's example hands assume $1/$2 with $200 stacks (100bb) and $2/$5 with $600 (120bb). — [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- `[DATA-live pace]` Hands per hour: about 33 (Red Chip), about 35 (Selbrede), 35-40+ with an auto-shuffler (forum), 20-25 in Hand2Note's higher-stakes sample. — [Red Chip Poker](https://redchippoker.com/using-a-hud-for-live-poker/); [Selbrede](https://www.pokernews.com/strategy/donkey-poker-do-you-play-too-many-hands-27182.htm); [PokerChipForum](https://pokerchipforum.com/threads/scared-to-take-the-leap-starting-1-3.129852); [Hand2Note](https://hand2note.com/Blog/Databases/online-vs-live-poker-insights)

### Inferences
- A reasonable simulator default is a mixed stack distribution centred below 100bb for recreational bots (many at 33-70bb, most at or under 100bb) with regs and the solver-style player at the table maximum. This is an inference from forum reports, not a measured distribution.
- The short-stacking tourist is supported only as "minimum buy-in is common"; nothing describes how that player's strategy differs.

### Gaps
- No survey or tracked distribution of buy-ins at $1/$2-$3/$5, and none broken down by archetype.
- No data on rebuy or top-up behaviour by type (other than the single OMC forum remark), or on hit-and-run behaviour when winning.
- No source on stack sizes of maniacs or of the solver-style player.

---

## 5. Most profitable adjustments against each archetype

### Takeaway
Advice converges: value-bet big and never bluff the station; steal from and fold to the nit; call down lighter and let the maniac bluff; 3-bet linear for value against loose openers; iso-raise limpers to 4bb plus 1bb per limper; over-fold to turn and river raises from everyone. All of it is coach opinion; the one quantified piece is Selbrede's modelled iso-raise EV.

### Cited Findings

**Against the whole pool**
- `[OPINION]` Iso-raise sizing live: 4bb + 1bb per limper (3bb + 1 online); if limpers keep calling go to 5, 6, 7bb until they fold. — [Upswing Poker, Apr 2025](https://upswingpoker.com/limps-poker-open-limpers-strategy/). 3-4bb + 1 per limper in late position; from the blinds 8x or more. — [Lee Jones, PokerCoaching](https://pokercoaching.com/blog/3-deadly-techniques-to-punish-limpers-in-live-cash-games/). $10 + $2 per limper at $1/$2. — [Selbrede, PokerNews](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- `[MODEL on live notes]` Button versus one limper at $1/$2: raising to $10 is worth +$0.63 against −$0.38 for limping; immediately profitable raising range about 33% of hands versus one limper, about 13% versus four limpers; big blind can raise about 28% versus one early limper. — [Selbrede, PokerNews](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- `[OPINION]` 3-bet a linear range (premiums plus hands such as AJ, KJs, 99) because opponents raise too wide, call 3-bets too often and rarely 4-bet; fold AQ/KQ to a passive player's 4-bet. — [Little, PokerCoaching, Aug 2026](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/)
- `[OPINION]` Fold JJ, TT, AQs to live 4-bets (about 27% equity against a tight 4-bet range). — [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- `[OPINION]` Fold to big turn and river bets: "If you should fold, you should fold. Every time." — [Ed Miller, Card Player, Jan 2015](https://cardplayer.com/cardplayer-poker-magazines/66294-cppt-foxwoods-28-2/articles/22227-three-skills-to-beat-1-2). Over-fold to river raises even with good pot odds. — [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/). One pair is rarely good facing a turn or river raise. — [Bart Hanson](https://crushlivepoker.com/articles/delayed-semi-bluffing)
- `[OPINION]` C-bet 66-75% pot on boards without two cards nine or higher (a 75% bet needs 42.8% folds); use smaller bets against tight ranges. — [Alex Fitzgerald](https://jonathanlittlepoker.com/exploitativealex/). Contrast: Upswing prefers a small flop c-bet (example 37% pot at $1/$2 with $200 stacks) because check-raises are rare and players over-fold later. — [Upswing Poker](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- `[OPINION]` On the river against a capped range, jam rather than bet small (example: $142 into $117; needs to work just over half the time). — [Little, PokerCoaching, Aug 2026](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/)
- `[OPINION]` Raise block bets small for value (to roughly one third to one half pot) because the bettor wants to see a showdown. — [Bart Hanson](https://crushlivepoker.com/articles/countering-blockish-bets)
- `[OPINION]` Delay semi-bluffs: call the flop and raise the turn, because opponents read turn raises as strength (example: $500 raise over a $175 turn bet folded AK on a K-high board). — [Bart Hanson](https://crushlivepoker.com/articles/delayed-semi-bluffing)

**Old man coffee / nit**
- `[OPINION]` Steal his blinds, fold good hands to his aggression, attack his big blind with multiple bets, collect orphan pots. — [BetterPoker](https://betterpoker.vercel.app/learn/live-poker/live-dynamics/live-player-census); [Alex Fitzgerald, PokerNews](https://www.pokernews.com/strategy/alex-fitzgerald-nits-stations-and-maniacs-43259.htm); [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/)
- `[OPINION]` Punish nits' tight 3-bet ranges (fold to them). — [Red Chip Poker](https://redchippoker.com/using-a-hud-for-live-poker/)
- `[OPINION]` Against a tight opponent's small flop check-raise, call rather than re-raise with top pair good kicker, then value-bet the river when checked to. — [Bart Hanson](https://crushlivepoker.com/articles/small-flop-rasies)
- `[OPINION, anecdote from a $10/$20 game]` Table norm reported for one OMC: "We don't bluff Pat here". — [PokerNews, Nov 2026](https://www.pokernews.com/strategy/where-did-the-term-old-man-coffee-come-from-52735.htm)

**Calling station**
- `[OPINION]` Bet at least 65-75% pot with top pair or better; a coached example found 30% pot bets were used where 70-80% was right. Value-bet second pair. Never bluff. — [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/)
- `[OPINION]` Against limpers: value bets of 66-105% pot and frequent double barrels; bluffs sized 50-60% pot against unaware limpers; with missed hands on dry boards about 30% pot once and then give up. — [Upswing Poker](https://upswingpoker.com/limps-poker-open-limpers-strategy/)
- `[OPINION]` "Play good hands hard and skip bluffs"; second pair with a good kicker or top pair is enough. — [Alex Fitzgerald, PokerNews](https://www.pokernews.com/strategy/alex-fitzgerald-nits-stations-and-maniacs-43259.htm)
- `[EXCERPT]` Jonathan Little: against weak players, bet for value on three streets and fold if raised, because amateurs call wide preflop and then play straightforwardly. Seen in a search excerpt only; which of his Card Player posts it comes from was not confirmed. — [Jonathan Little, Card Player blog (probable post)](https://cardplayer.com/poker-blogs/96-jonathan-little/entries/563243-combating-weak-players)

**Maniac / LAG**
- `[OPINION]` Pick a halfway-decent hand and call down; do not raise him off the pot. — [Alex Fitzgerald, PokerNews](https://www.pokernews.com/strategy/alex-fitzgerald-nits-stations-and-maniacs-43259.htm)
- `[OPINION]` Tighten up, make bigger bets and raises, call in position with top pair or better. Against a LAG: sit on his left, defend the big blind wider, do not over-fold to 3-bets. — [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/)
- `[EXCERPT, forum; disagreement]` One camp: tighten and "let him bet into you". Another: maniacs "hate getting 3-bet and check-raised", so against the folding kind stay aggressive, and against the "maniac station" wait for {55+, AT+, KJ+} and "3bet huge". — [2+2 LLSNL threads](https://forumserver.twoplustwo.com/170/live-no-limit-holdem-cash/how-best-play-against-smart-maniac-1812381/); [second thread](https://forumserver.twoplustwo.com/170/live-low-stakes-nl/how-play-against-maniac-1691440/)
- `[OPINION]` Against the "Chirper", ignore the small raise and play as in an unraised pot. — [Ashley Adams, PokerNews](https://www.pokernews.com/strategy/player-profiling-four-new-poker-archetypes-28747.htm)

**Solver-style young player**
- `[OPINION]` Against a genuinely balanced player, stay near balanced and exploit only observed deviations. — [Little, PokerCoaching](https://pokercoaching.com/blog/different-poker-players/)
- `[DATA-live, tournaments likely included]` 3-bet in position against frequent late-position openers under 45; it profits "even with mistakes". 3-betting out of position profits on average but produces catastrophic losses when misplayed. — [Alex Fitzgerald](https://jonathanlittlepoker.com/exploitativealex/)

**TAG reg / weak-tight reg**
- `[OPINION]` Avoid big pots without a strong hand and attack capped ranges. — [BetterPoker](https://betterpoker.vercel.app/learn/live-poker/live-dynamics/live-player-census)
- `[OPINION]` Do not bluff-catch anyone who plays solidly "in any real way". — [Ed Miller, Card Player, Aug 2018](https://cardplayer.com/cardplayer-poker-magazines/66390-george-antonakos-wins-cppt-bike-main-event-31-18/articles/23459-bluff-catching-at-1-2)
- `[OPINION]` Against the "Roly Poly" weak-tight raiser: float from any position; out of position a small donk bet usually wins unless he connected. Against the "Butterfly" floater: bet less often with medium hands out of position and re-raise turns and rivers more. — [Ashley Adams, PokerNews](https://www.pokernews.com/strategy/player-profiling-four-new-poker-archetypes-28747.htm)
- `[OPINION]` Against a player who check-raises thin for value, his check-calls are weak: barrel turn and river more and value-bet thinner. — [Doug Polk via Upswing Poker](https://upswingpoker.com/live-poker-tips-strategy/)
- `[OPINION]` Ed Miller's stated focus is that tight regulars can be made to "let you win pot after pot" by attacking the six tight-player traits (bet-folding, pot-controlling, not firing second barrels). Content not accessible beyond chapter titles. — [Ed Miller TOC](https://www.goodreads.com/author_blog_posts/2572519-playing-the-player-preorder-details-and-table-of-contents?tab=book)

### Inferences
- The c-bet sizing disagreement (Fitzgerald 66-75% versus Upswing about one third) reflects different target opponents: big against wide, inelastic callers; small against players who fold later streets and never check-raise. An EV-grading simulator should let the best size depend on the specific bot's fold-versus-size curve rather than hard-code either.
- "Bluff more than you think" (Little 2026) and "never bluff" (everyone on stations) apply to different bots. Big-bet bluffs are for the elastic recreational player and the weak-tight reg in capped spots; none for the station.
- For mistake-flagging, the highest-confidence rules are: bluffing a station is an error; calling a turn or river raise from a passive player with one pair is an error; limping behind instead of iso-raising a limper in position is an error; small value bets against a station are an error.

### Gaps
- No tracked win-rate data by adjustment for live low stakes; all counter-strategy is opinion apart from Selbrede's model.
- No source gives a counter-strategy specific to a solver-style opponent who is *misapplying* theory at low stakes; the advice found is about not being that player.
- Hungry Horse Poker's exploit material could not be retrieved in primary form. One summary page attributed to it advised raising aggressively with tight ranges and not randomising hand selection live, but the page content did not load; unverified.
- Doug Hull's "Poker Plays You Can Use" was not accessible.

---

## 6. Changes when tilted, stuck or winning; and by time of day and day of week

### Takeaway
There is no per-archetype evidence on tilt or on session effects. General opinion says tilting players stop folding first and call wider, late-night players are disproportionately tired and "playing to get even", and nights and weekends are softer than weekday daytime; the one hand-tracked source says average looseness varies little by time or room.

### Cited Findings
- `[OPINION]` Signs of tilt: calling raises with hands previously folded, playing back at one specific player, calling big bets without a hand, limping and calling out of position, and loss of folding, which is "the first thing to disappear". "Rebuy tilt" = reloading and playing to get back to even. No sources cited. — [PokerSkill, "Poker tilt"](https://www.pokerskill.com/blog/poker-tilt/)
- `[OPINION]` Emotional/tilting players "make mistakes after bad beats", shown by faster betting and visible frustration; risk-averse players "fold to aggression and can be bluffed consistently". — [DeucesCracked live types guide](https://www.deucescracked.com/blog/exploiting-player-types-in-live-poker-a-comprehensive-guide)
- `[OPINION]` Graveyard-shift opponents are "tired, on tilt, playing to get even, and emotionally distraught"; people with day jobs "often stay out and play poker far too long"; holidays "usually bring in weaker competition". — [Nolan Dalla, Card Player, Jun 2006](https://cardplayer.com/cardplayer-poker-magazines/10-the-bicycle-casino-14-15/articles/252-tales-from-the-felt-playing-poker-around-the-clock)
- `[OPINION]` "Late nights and weekends are softest"; day sessions are "less profitable on average". Signs of a soft table: alcohol on side tables, groups playing for fun, loud players, many multiway pots. — [Upswing Poker, 2017/2019](https://upswingpoker.com/live-poker-tips-strategy/)
- `[DATA-live, small sample; contrary note]` Variation in average VPIP by location and time is "not generally dramatic" across the four Vegas rooms sampled. — [Selbrede, PokerNews](https://www.pokernews.com/strategy/donkey-poker-do-you-play-too-many-hands-27182.htm)
- `[DATA-live, author says it varies]` How often players lead the turn after a flop check-back "varies widely by cardroom and even month to month", so pool averages can mislead. — [Alex Fitzgerald](https://jonathanlittlepoker.com/exploitativealex/)
- `[EXCERPT]` Weekends bring more tourists to Las Vegas poker rooms; weekday daytime is "a mix of retired professionals and loose recreational players who are just killing time"; a forum thread suggests weekday daytime games "might be softer". Pages not opened (429 or not fetched); search excerpts only, and they conflict with the Upswing claim above. — [PokerForum.ca thread](https://pokerforum.ca/discussion/13813/changes-in-game-and-players-depending-on-time-of-day-and-day-of-week)
- `[OPINION]` Social motives drive many low-stakes decisions (not wanting to look weak, keeping a fun game going) `[EXCERPT]`; live players call 3-bets to save face. — [Alex Fitzgerald](https://jonathanlittlepoker.com/exploitativealex/)

### Inferences
- The sources support a session-level modifier rather than archetype-specific tilt models: late night and weekend raise the share of recreational, intoxicated and stuck players; weekday daytime raises the share of older tight regulars. The second half rests on the OMC definition (morning routine) and excerpts, so it is weakly supported.
- A minimal tilt modifier consistent with the sources is "fold less, call wider, enter more pots" after a large loss. Tightening after losses (scared money) is also described in excerpts, so direction should be a per-bot setting.
- Upswing (nights and weekends softer) and Selbrede (average VPIP varies little) can both hold if softness comes from stack depth, alcohol and stuck players rather than from average preflop looseness.

### Gaps
- No source describes how each specific archetype changes when tilted, stuck or winning big. Nothing on hit-and-run or lock-up behaviour when winning.
- Tommy Angelo's and Zach Elwood's material on tilt and behaviour is in books or paywalled and was not retrievable.
- No tracked data on table composition by hour or weekday for any US room.
- No source quantifies the effect of alcohol on any parameter.

---

## 7. Side-by-side archetype parameter table

### Takeaway
The table below is the consolidated profile. Cells hold only values that a source states; "GAP" means no reliable number was found and the cell must be set by the developer as an assumption. Use the sourced pool averages (37/6, no positional adjustment, about 56% call of an iso-raise, 3-bets rare and value-only) as the anchor for all recreational bots.

### Cited Findings

Source codes used in the table:
- **SEL** = [Selbrede, PokerNews series](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm) — `[DATA-live, small sample]` / `[MODEL]`
- **H2N** = [Hand2Note live database](https://hand2note.com/Blog/Databases/online-vs-live-poker-insights) — `[DATA-live, $2/$5+, vendor]`
- **KM** = [Kat Martin, Red Chip Poker](https://redchippoker.com/know-thine-enemy-profiling-your-opponents-for-poker-profit/) — `[DATA-live, single observer]`
- **AF** = [Alex Fitzgerald, live tendencies](https://jonathanlittlepoker.com/exploitativealex/) — `[DATA-live described, no tables]`
- **JL** = [Jonathan Little player types](https://pokercoaching.com/blog/different-poker-players/) — `[OPINION]`
- **JL26** = [Jonathan Little, 5 tips for $1/$2](https://pokercoaching.com/blog/5-tips-to-beat-small-stakes-cash-games-in-2026/) — `[OPINION]`
- **PS** = [PokerSkill VPIP/PFR bands](https://www.pokerskill.com/blog/vpip-and-pfr/) — `[OPINION, likely 6-max]`
- **DC** = [DeucesCracked HUD stats](https://www.deucescracked.com/poker/strategy/hud-stats) — `[DATA-online, uncited]`
- **EM** = [Ed Miller, Card Player 2015](https://cardplayer.com/cardplayer-poker-magazines/66294-cppt-foxwoods-28-2/articles/22227-three-skills-to-beat-1-2) / [2018](https://cardplayer.com/cardplayer-poker-magazines/66390-george-antonakos-wins-cppt-bike-main-event-31-18/articles/23459-bluff-catching-at-1-2) / [book TOC](https://www.goodreads.com/author_blog_posts/2572519-playing-the-player-preorder-details-and-table-of-contents?tab=book) — `[OPINION]`
- **BH** = [Bart Hanson, Crush Live Poker](https://crushlivepoker.com/articles/raises-to-overbets) and [sizing articles](https://crushlivepoker.com/articles/small-flop-rasies) — `[OPINION]`
- **UP** = [Upswing limpers guide](https://upswingpoker.com/limps-poker-open-limpers-strategy/) / [8 tactics](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/) — `[OPINION]`
- **LJ** = [Lee Jones, PokerCoaching](https://pokercoaching.com/blog/3-deadly-techniques-to-punish-limpers-in-live-cash-games/) — `[OPINION]`
- **AA** = [Ashley Adams, PokerNews](https://www.pokernews.com/strategy/player-profiling-four-new-poker-archetypes-28747.htm) — `[OPINION]`
- **PCF** = [PokerChipForum thread](https://pokerchipforum.com/threads/scared-to-take-the-leap-starting-1-3.129852) — `[OPINION, forum]`
- **RCP** = [Sweeney, Red Chip Poker](https://redchippoker.com/using-a-hud-for-live-poker/) — `[OPINION]`
- **GL** = [PokerSkill glossary, player types and exploits](https://www.pokerskill.com/poker-glossary/topics/player-types-and-exploits/) — `[OPINION, anonymous, no numbers]`; defines weak-tight as entering few hands and giving up too easily under pressure, with the exploit "apply pressure when the pot heats up"

| Parameter | Old man coffee / nit | Loose-passive station / limper | Maniac (spewy aggro) | Good LAG | Solver-style young player | TAG reg | Weak-tight reg | Short-stack tourist / scared money |
|---|---|---|---|---|---|---|---|---|
| Share of table | GAP | Modal type: pool average is 37/6 (SEL); 2+ weak players at 90% of $2/$5-$5/$10 tables, 3-5 at 57% (H2N) | GAP | GAP | GAP | GAP | GAP | GAP |
| VPIP % | 8-15 (JL); <18 (PS, DC); tracked regs 14, 14, 18 (KM); tightest seen ~6 (KM) | 35-50 (JL); 35-60 (PS); pool avg 37 (SEL); up to ~60 (RCP) | 50+ (JL); 45+ (PS) | 25-40 (JL); 28-38 (PS) | 22-28 (JL) | 15-25 (JL); 22-27 (PS, likely 6-max); live winners at $2/$5+ avg 31 (H2N); online full-ring ~15 (RCP) | GAP (tracked regs span 14-36, KM) | GAP |
| PFR % | 5-12 (JL); <14 (PS) | 5-10 (JL); <12 (PS); pool avg 6 (SEL) | 35+ (JL, PS) | 20-35 (JL); 22-30 (PS) | 18-24 (JL) | 12-20 (JL); 18-23 (PS); live winners avg 20 (H2N) | GAP | GAP |
| Positional awareness | GAP | None: late/early VPIP ratio 1.0 (SEL) | GAP | GAP | Opens 25%+ from lojack or later if under 45 (AF) | Recommended ~10% early, ~30% button (SEL) | GAP | GAP |
| Limping | Limps the weaker part of the range; limp-folds (KM, EM) | Limps roughly the 6th-35th percentile of hands (SEL); Ax, offsuit broadways, connectors, K7s-type suited (UP) | GAP | GAP | GAP | Never limps outside blinds (EM, prescription) | GAP | GAP |
| Open-raise size | GAP | Pool: 3-5bb (JL26); $10-$20 at $1/$3 (PCF) | "Chirper" sub-type raises small (AA) | GAP | GAP | 4bb + 1bb per limper (UP); $10 + $2 per limper at $1/$2 (SEL) | Raises light, "sometimes fairly large" (AA) | GAP |
| 3-bet | Very tight, value only; example 2% (online example, BlackRain79 in section 2) | Rare; blinds raise a limper 3-5% (SEL); limp-reraise = KK+ (LJ) | "Constantly spam reraises" (Fitzgerald, PokerNews, section 2) | GAP | GAP | Live winners 13% at $2/$5+ (H2N); "most frequent 3-bettor at the table" (EM) | GAP | GAP |
| 4-bet range | AA, KK, AKs for the live pool (UP) | AA, KK, AKs (UP) | GAP | GAP | GAP | GAP | GAP | GAP |
| Response to a raise / 3-bet | Limp-folds (EM) | Calls an iso-raise ~56% (SEL); calls raises nearly twice as often as online players (SEL); folds to 3-bets "wildly" rarely (AF) | GAP | Do not over-fold to his 3-bets (JL) | GAP | Opponents folded to regs' 3-bets 26% at $2/$5+ (H2N) | Folds to any action when he misses (AA, "Roly Poly") | GAP |
| C-bet frequency | GAP | GAP | GAP | GAP | GAP | GAP (inexperienced players bet all top pair at 100% on the flop, UP) | GAP | GAP |
| Barrelling / bluffing | Refuses to fire a second or third barrel (EM) | Rarely bluffs; river bluffs well under 33% on pot-size bets (EM) | Bluffs frequently, multiple barrels (Fitzgerald, PokerNews) | Frequent barrelling; attacks weakness reflexively (EM) | GAP | Only 20-40% of low-mid players can double-barrel bluff (AF); solid players least likely to bluff rivers (EM) | GAP | GAP |
| Aggression factor | GAP | <1.5 (DC, online) | >4.0 (DC, online) | GAP | GAP | 1.6 for live winners at $2/$5+ (H2N) | GAP | GAP |
| Check-raise / raise meaning | A raise from a player who never raises is the nuts or near it (BH) | Turn/river raise = better than one pair; small flop raise on wet board = top pair; big raise = two pair+ (BH) | GAP | GAP | GAP | Turn/river raises rarely bluffs across the pool (BH, UP) | GAP | GAP |
| Fold vs bets | Will not stack off without the nuts; bet-folds (EM) | Does not reduce calling when bet is bigger (JL); will not fold an overpair; peels flops light (EM); WTSD >32% (DC, online) | GAP | GAP | GAP | Pool: calls small, folds to stack-size bets, rarely calls a stack with one pair (JL26) | "Gives up too easily under pressure" (GL) | Risk-averse players fold to aggression (DeucesCracked, section 6) |
| Sizing tells | "Bet-sizing tells" (EM, chapter title only) | Block bets ~1/10 pot with medium hands (BH); overbet after passivity = strong (BlackRain79) | GAP | GAP | GAP | GAP | GAP | GAP |
| Stack / buy-in | Buys in $100 and keeps adding on (PCF) | Commonly $100-$300 at $1/$2-$1/$3 (PCF) | GAP | GAP | GAP | GAP | GAP | Minimum $100 buy-in common; "instant target" (PCF) |
| Best counter | Steal blinds; fold to his aggression; do not bluff-catch (JL; Fitzgerald, PokerNews) | Value-bet 65-75%+ pot, down to second pair; never bluff; fold one pair to his raise (JL, LJ, UP) | Call down lighter, do not raise him off bluffs; tighten and bet bigger (JL; Fitzgerald, PokerNews) | Sit on his left; defend BB wider; trap (JL) | 3-bet his late opens in position (AF); stay near balanced unless a leak is seen (JL) | Avoid big pots without a hand; attack capped ranges; do not pay off river bets (EM; BetterPoker, section 5) | Float and take it away; pressure on turn and river (AA, EM) | GAP |
| Tilt / stuck change | GAP | GAP | GAP | GAP | GAP | GAP | GAP | GAP |

### Inferences
- Rows that are almost entirely GAP (c-bet frequency, fold versus bet by street, check-raise frequency, tilt change, share of table, stack by type) are the parameters the developer will have to set by assumption and should expose as tunable. The qualitative direction for each is given in sections 3 to 6.
- Where two bands disagree (for example nit 8-15 versus under 18; TAG 15-25 versus 22-27 versus the 31 tracked for live winners at higher stakes), the lower bands suit full ring and the higher ones reflect 6-max or deep, straddled live games. This is a reading of the sources' stated formats, not a sourced statement.
- The only archetype whose numbers rest on tracked live data is the loose-passive limper (35/6, 56% call of an iso-raise, positional ratio 1.0), and the sample is "a few hundred" hand-noted hands from four Vegas rooms in about 2017.

### Gaps
- Per-archetype postflop frequencies for live low stakes do not exist in any source found.
- No tracked live data at $1/$2-$3/$5 newer than Selbrede's 2017 notes was found. Hand2Note's 2025 data starts at $2/$5 and does not state where its hands come from.
- Named sources not reached in primary form: Ed Miller's books, Jonathan Little's cash-game book, Doug Hull, Tommy Angelo, Zach Elwood, Hungry Horse Poker videos, Two Plus Two LLSNL threads, Reddit r/poker.
- Several lower-authority sites used for stat bands (PokerSkill, DeucesCracked, BetterPoker) cite no data and name no accountable author for the numbers; they are included because they are the only places that publish explicit bands, and are tagged accordingly.
