# Pool-wide playing tendencies in live low-stakes NLHE cash games (US casinos, full ring, $1/$2 to $3/$5)

Reading notes for the report writer (apply to every section):

- Evidence tags: **[DATA-LIVE]** = tracked live hands; **[MODEL]** = author's calculation built on tracked live stats; **[OPINION]** = coach/author experience, no sample; **[ONLINE]** = online data, flagged, not shown to transfer unless stated; **[SNIPPET]** = seen only in a search-result summary, page not opened.
- Headline result: only two tracked live datasets were found. (1) Steve Selbrede's hand-recorded Las Vegas $1/$2 sample ("a few hundred" hand histories, four card rooms, published 2017) - small, but it is the only one that is actually the target pool. (2) Hand2Note's Live Poker Database (450k-600k+ hands transcribed from YouTube streams) - large, but streamed games at $2/$5 up to $100/$200 and beyond, and the published stats are mostly for winning TAG players, not the pool. **No tracked live low-stakes data was found for any postflop frequency** (c-bet, fold-to-c-bet, raise-bluff share, check-raise, donk, WTSD, river call accuracy). Everything postflop below is opinion or flagged online data.
- All pages were read through a text-extraction fetch tool. Selbrede's full stat tables ("Figure 1") are images and were not readable; only numbers quoted in article text are reported. Two extracted Selbrede figures look ambiguous and are flagged inline.
- Paywalled/primary material not accessed: Ed Miller's books, Crush Live Poker member videos, Hungry Horse course material and YouTube videos, Jonathan Little's paid content, Selbrede's "Donkey Poker" books (Vol. 2 reportedly holds the full Vegas $1/$2 and $2/$5 stat tables).

## Preflop: limping, open sizes, players per flop, 3-bet/4-bet, calling width, fold-to-iso, limp-reraise, straddles

### Takeaway
The one tracked target-pool sample (Vegas $1/$2) shows a very loose-passive pool: VPIP 35-37%, PFR 6%, 3-bet 0.8%, 28% call of a raise, 4.0 players per flop. Coaches unanimously describe 3-bet and 4-bet ranges as value-only (4-bet about KK+/AKs), but they disagree on whether the pool over-folds or under-folds to 3-bets.

### Cited Findings

Looseness, limping, raising
- **[DATA-LIVE]** Average Vegas $1/$2 player: VPIP 37%, PFR 6%, 3-bet 0.8%. Online NL100 comparison: VPIP ~22%, PFR 8.5%, 3-bet "more than three times as often". Sample size not stated in this article; author Steve Selbrede, Feb 2017 — [PokerNews, "Donkey Poker: Low-Stakes Live Games Differ from Online"](https://www.pokernews.com/strategy/donkey-poker-low-stakes-live-games-differ-online-27134.htm)
- **[DATA-LIVE]** The 37% VPIP comes from "a few hundred" live hand histories the author recorded at four Vegas card rooms; he says a few hundred hands suffice for reliable average VPIP. Collection date not given; published Feb 2017 — [PokerNews, "Donkey Poker: Do You Play Too Many Hands?"](https://www.pokernews.com/strategy/donkey-poker-do-you-play-too-many-hands-27182.htm)
- **[DATA-LIVE]** A later article by the same author gives VPIP/PFR 35%/6% (vs 37%/6% above; same dataset, minor inconsistency), and models the average limper as raising the top 6.1% and limping the rest of a 35% range — [PokerNews, "Preflop Raising in Live $1/$2 No-Limit Hold'em Cash Games"](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- **[DATA-LIVE]** No positional awareness: Vegas $1/$2 players play the same number of hands from late and early position (ratio ~1.0); online players play ~20% more from late position — [PokerNews, "Low-Stakes Live Games Differ from Online"](https://www.pokernews.com/strategy/donkey-poker-low-stakes-live-games-differ-online-27134.htm)
- **[DATA-LIVE]** Blinds rarely raise limped pots: SB raise frequency 4.8%, BB 3.4%; SB completes with a range out to ~50% of hands — [PokerNews, "Preflop Raising in Live $1/$2"](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)

Players per flop
- **[DATA-LIVE]** Vegas $1/$2: 4.0 players per flop on average; 27% of flops have five or more players. Online comparison 2.7 players per flop — [PokerNews, "Donk Betting in Small-Stakes Live No-Limit Hold'em"](https://www.pokernews.com/strategy/donk-betting-in-small-stakes-live-no-limit-hold-em-28638.htm)
- **[DATA-LIVE, different pool]** Hand2Note Live Poker Database (streamed games, stakes not specified for this table): flops are heads-up 45% (109k hands), 3-way 71k hands, 4+-way 59k hands. The article's percentage labels for the last two rows (24% and 31%) do not match its own hand counts (which give ~30% and ~25%); treat the split beyond "45% heads-up" as unreliable — [Hand2Note, "Online vs. Live Poker: Insights from the Live Poker Database", Jul 2025](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights) (fetched from a staging domain of hand2note.com)
- Disagreement: Selbrede's casino $1/$2 sample (4.0 per flop, only a minority heads-up) vs Hand2Note's streamed sample (45% heads-up). The pools differ (anonymous casino $1/$2 vs streamed, mostly higher-stakes, more aggressive line-ups); they should not be averaged.

Calling opens
- **[DATA-LIVE]** Vegas $1/$2 players call a preflop raise 28.0% of the time vs 15.3% online — [PokerNews, "Donk Betting in Small-Stakes Live"](https://www.pokernews.com/strategy/donk-betting-in-small-stakes-live-no-limit-hold-em-28638.htm)
- **[DATA-LIVE]** Average button calls a cutoff raise about 22% — [PokerNews, "Preflop Raising in Live $1/$2"](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)

Limpers versus an isolation raise
- **[DATA-LIVE / MODEL]** An EP/MP limper calls a raise after limping 56.4% of the time (so folds 43.6%); a BB raise to $10 (5 BB) against one limper has 43.6% fold equity — [PokerNews, "Preflop Raising in Live $1/$2"](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- **[MODEL]** Button raise to $10 over one limper: everyone folds 23.1%, one caller 47.0%, two callers 25.7%, three callers 4.2%. The author assumes calling frequency does not change with raise size across $10-$16 — [PokerNews, "Preflop Raising in Live $1/$2"](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- **Flagged as ambiguous extraction:** the same page was also reported to contain "four-way pot frequency about 92%" and "limp-fold after a blind raises: 8%". The second conflicts with the 43.6% fold figure and both may refer to a specific modelled scenario. Do not use without reading the original figure — [same article](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)

Open-raise sizes
- **[OPINION, recommendation]** Selbrede's rule for $1/$2: 4x BB plus 1 BB per limper, i.e. $10 / $12 / $14 / $16 over 1-4 limpers (5-8 BB) — [PokerNews, "Preflop Raising in Live $1/$2"](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- **[OPINION, recommendation, SNIPPET]** BlackRain79: open to 4x ($8 at $1/$2) plus 1 BB per limper — [BlackRain79, "12 Quick Tips to Beat $1/$2 Poker Games"](https://www.blackrain79.com/2024/06/1-2-cash-game-tips.html)
- **[OPINION, recommendation, SNIPPET]** Live rule of thumb: 4 BB + 1 BB per limper + 1 BB more from the blinds — [pokertrainer.se, "What is limping"](https://pokertrainer.se/how-to-win-money-from-limpers)
- **[OPINION, observed, SNIPPET]** In a described live $1/$2 spot "the standard raise was around $10 to $15" (5-7.5 BB), with some open-limping — [Fearless River quiz](https://app.fearlessriver.com/blog/pocket-tens-small-blind/)
- Note: the first three are what coaches recommend hero does, not measurements of what the pool does. Only the Fearless River line and the straddle line below describe observed pool sizing.

3-bets and 4-bets
- **[DATA-LIVE]** Population 3-bet 0.8% at Vegas $1/$2; the author elsewhere calls 3-betting "very rare"/"negligible" in this pool — [PokerNews, "Low-Stakes Live Games Differ from Online"](https://www.pokernews.com/strategy/donkey-poker-low-stakes-live-games-differ-online-27134.htm); [PokerNews, "Preflop Raising in Live $1/$2"](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- **[OPINION]** Live players' 3-bet and 4-bet ranges are "weighted heavily towards value hands"; a "typical 4-betting range" for a tight live player is AA, KK, AKs, "super tight" is AA/KK only. Against AA/KK/AKs, JJ/TT/AQs have 26-28% equity; against AA/KK, AKs has 23.1% and QQ 18.3% (calculated). Author George Mathias, 2019, examples at $1/$2 and $2/$5 — [Upswing Poker, "Crush Live Poker Games With These 8 Battle-Tested Tactics"](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- **[OPINION, SNIPPET]** Live players "do not 3-bet with nearly enough medium-strength or bluff hands" (2018 PDF; file could not be text-extracted, claim seen only in search summary) — [Upswing Poker, "10 Laws of Live Poker"](https://upswingpoker.com/wp-content/uploads/2018/11/10-Laws-of-Live-Poker-v5.pdf)
- **[OPINION, forum, SNIPPET]** TwoPlusTwo LLSNL posters: "the typical bad reg calls too wide and raises too narrow"; a hero 3-bet range of KK+, AKs at $1/$2 is "probably too nitty, but not horrible"; "in LLSNL, it is rare to see someone raising light". Threads are roughly 1.5 to 12 years old; quote-to-thread mapping not individually verified — [3 betting at low stakes](https://forumserver.twoplustwo.com/170/live-no-limit-holdem-cash/3-betting-low-stakes-1845285/); [3-betting at 1/2?](https://forumserver.twoplustwo.com/170/live-no-limit-holdem-cash/3-betting-1-2-a-1571365/); [Logic behind light 3-bets](https://forumserver.twoplustwo.com/170/live-no-limit-holdem-cash/logic-behind-light-3-bets-1838163/)
- **[OPINION]** Bart Hanson: 5-bet ranges are "rather defined" (narrow) at this level; players "usually" do not min-raise big pairs preflop — [Card Player, "Crushing Live Poker With Twitter", Nov 2014](https://www.cardplayer.com/?p=1037161); [Card Player, May 2016](https://www.cardplayer.com/cardplayer-poker-magazines/66329-bestbet-jacksonville-29-11/articles/22780-crushing-live-poker-with-twitter)
- **[DATA-LIVE, different pool]** Winning TAG players in streamed games ($2/$5 to $100/$200; 242 players, ~500k hands) 3-bet 13% and call a 4-bet 40%. This is the winners' stat, not the pool's — [Hand2Note, "Online vs. Live Poker"](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights)

Response to 3-bets (sources disagree)
- **[OPINION]** Live players over-fold to 3-bets because they are unaccustomed to wide 3-bet ranges — [Upswing Poker, Mathias 2019](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- **[OPINION, SNIPPET]** Contradicted by Alex Fitzgerald: in live poker people "fold to threebets a wildly small percentage of the time" (live poker generally, not specifically low-stakes cash) — [Card Player blog, "The Limitations of Exploitative Play"](https://cardplayer.com/poker-blogs/96-jonathan-little/entries/563032-the-limitations-of-exploitative-play-by-alex-fitzgerald)
- **[DATA-LIVE, different pool]** In streamed games, after a TAG 3-bets, all opponents fold preflop only 26% of the time, and in 28% of cases a player behind cold-calls or 4-bets; the article says live cold-call ranges are "much wider". Sample size for this stat not stated — [Hand2Note, "Online vs. Live Poker"](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights)

Limp-reraise
- **[DATA-LIVE, single player, not a population stat]** Hand2Note's help page shows one streamed player who limps 27% and, facing a raise, folds 30% / calls 54% / reraises 16%. Illustrates the stat exists in the database; it is not a pool average — [Hand2Note Live Poker Database help](https://hand2note.com/Help/LivePokerDatabase/Index)

Straddles
- **[DATA-LIVE, different pool]** 85% of lower-stakes streamed games ($2/$5 and $5/$10) include a straddle (65% of higher-stakes games); 60% of lower-stakes games have no ante. Straddle games have about 2x the variance of non-straddle games at the same stakes — [Hand2Note, "Online vs. Live Poker"](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights)
- **[OPINION, observed, SNIPPET]** In a $1/$2 game with a $5 straddle, the same players open to $15-$20 (3-4x the straddle), "an opening raise size you see more commonly in $2/$5 games" — [PokerNews, "How Straddling Changes the Game"](https://www.pokernews.com/strategy/how-straddling-changes-the-game-four-strategic-consideration-19521.htm)

Game pace (for simulator timing)
- **[DATA/OPINION]** Live deal rate: ~35 hands/hour (Selbrede, rough example) vs 20-25 hands/hour (Hand2Note, streamed games) — [PokerNews, "Do You Play Too Many Hands?"](https://www.pokernews.com/strategy/donkey-poker-do-you-play-too-many-hands-27182.htm); [Hand2Note](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights)

### Inferences
- VPIP 35-37% with PFR 6% implies roughly 29-31% of all hands dealt are played by limping or calling; about 5 of every 6 voluntarily played hands enter passively.
- A 0.8% 3-bet frequency is about the combinatorial weight of KK+ (12 of 1,326 combos = 0.9%); QQ+ is 1.4% and QQ+/AK is 2.6%. If the stat is per opportunity, the average $1/$2 3-bet range is narrower than QQ+/AK, consistent with the coaches' "value only" description. This is arithmetic on Selbrede's number, not a sourced range.
- Back-of-envelope only: if each of 9 players raises 6% of hands, the chance nobody raises is about 0.94^9 = 57%. That suggests somewhat over half of pots are limped/unraised at $1/$2, but no source states a limped-pot share directly.
- The 3-bet response disagreement may be a stakes/pool effect: Hand2Note's low all-fold rate (26%) is from streamed, deeper, straddled games with wide cold-callers; Mathias's "over-fold" claim targets tight casino regulars. Neither is measured on anonymous $1/$2-$2/$5 tables.
- Selbrede's raise-to-$10 fold/call numbers are for 5 BB; he assumes inelastic calling up to 8 BB. That inelasticity is an assumption, not a measurement.

### Gaps
- Share of pots limped vs raised: no direct figure found (only the inference above).
- Observed (not recommended) open sizes in BB by stake, and how they grow per limper: no tracked data; only coaching rules of thumb and two anecdotes.
- $1/$3, $2/$3, $2/$5, $3/$5 specifically: no tracked preflop stats found. Selbrede says $2/$5 stats are in "Donkey Poker Vol. 2" (not accessed).
- How often 4-bets are bluffs: no number anywhere; sources only say "value hands"/"AA, KK, AKs".
- Calling frequency versus 3-bets by the original raiser in the target pool: no data.
- Limp-reraise frequency and what it represents in the pool: no population figure and no accessible coach statement (a Hungry Horse write-up on GipsyTeam about limp-reraises could not be loaded).
- Straddle frequency at $1/$2-$1/$3 casino tables: none; the 85% figure is for streamed $2/$5-$5/$10 games.
- Data age: the Vegas $1/$2 sample predates 2017; no evidence either way on drift since.

## Postflop: c-bet, fold-to-c-bet, raise-bluff share, check-raise, donk, barrels, river bluffing, thin value, under-bluffing when checked to

### Takeaway
No tracked live low-stakes numbers exist in any accessible source for postflop frequencies. Coaches agree on direction (fit-or-fold c-betting, rare check-raises, late-street raises almost never bluffs, rivers heavily under-bluffed, pool calls small value bets and check-calls too much) but supply almost no percentages.

### Cited Findings

C-betting
- **[OPINION built on live data]** Because Vegas $1/$2 flops average 4.0 players and the pool is "more passive and less willing to bluff", raisers are less willing to c-bet bluff, especially multiway. No live c-bet percentage is given — [PokerNews, "Donk Betting in Small-Stakes Live"](https://www.pokernews.com/strategy/donk-betting-in-small-stakes-live-no-limit-hold-em-28638.htm)
- **[ONLINE, flagged]** Online NL50/NL100 comparison from the same author (~6M online hands): c-bet in position ~75% heads-up, ~65% multiway. The author presents live as lower than this, without a number — [PokerNews, "Donk Betting in Small-Stakes Live"](https://www.pokernews.com/strategy/donk-betting-in-small-stakes-live-no-limit-hold-em-28638.htm)
- **[OPINION]** Live players' c-bets are often "fit or fold"; some use large flop c-bets (example $35 into $41, ~80% pot) then stall on later streets; they often check strong value hands (e.g. AQ) on turn or river after betting flop; they "rarely" protect their checking range — [Upswing Poker, Mathias 2019](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)

Folding to c-bets and barrels
- **[OPINION, SNIPPET]** Low-stakes players who miss the flop "will usually fold" to a c-bet, and those who call "will often fold to the turn" — [Red Chip Poker, "The Low-Stakes Poker Playbook"](https://redchippoker.com/playbook)
- **[OPINION]** Live players over-fold on later streets to barrels; but "weak players won't call small bets often enough" is paired with advice to c-bet small (example $15 into $41, 37% pot) against over-folders — [Upswing Poker, Mathias 2019](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- **[OPINION]** Contradicted in part by Bart Hanson: players at mid and low stakes "have problems folding strong hands", so bluffs and semi-bluffs should be used less — [Card Player, Nov 2014](https://www.cardplayer.com/?p=1037161)
- **[OPINION, SNIPPET]** A Vegas-focused writer: $1/$2 and $1/$3 players are "absurdly unwilling to fold"; range-based bluffs are a poor fit — [Zachary Elwood, "Some thoughts on quick reads of opponent tendencies"](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent)
- **[ONLINE, flagged, no transfer argument]** One forum user's ~400k-hand NL10 online database: fold to c-bet 45% flop, 34% turn, 37% river — [TwoPlusTwo, "Fold to c-bet and betting frequency"](https://forumserver.twoplustwo.com/15/poker-theory-amp-gto/fold-c-bet-betting-frequency-1777835/) [SNIPPET]
- **[ONLINE, flagged, no transfer argument]** "Good opponents" at lower online stakes fold to flop c-bet around 42-57% — [Poker Copilot, "Continuation Bet"](https://pokercopilot.com/poker-statistics/continuation-bet) [SNIPPET]

Raises and check-raises
- **[OPINION]** Bart Hanson: late-street raises, especially on the river, are "almost never bluffs" at mid to low live stakes; players facing overbets have an "extremely low" bluffing frequency and "play straight up"; in about ten years of playing and broadcasting he could not recall one river bluff-raise against an overbet — [Card Player, "Crushing Live Poker With Twitter", May 2016](https://www.cardplayer.com/cardplayer-poker-magazines/66329-bestbet-jacksonville-29-11/articles/22780-crushing-live-poker-with-twitter)
- **[OPINION]** Calling river raises is EV-negative against most live players even with good pot odds; check-raising "occurs relatively infrequently in live poker games" — [Upswing Poker, Mathias 2019](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- **[OPINION, SNIPPET]** Small flop raises usually indicate top-pair-type hands — [Card Player, Bart Hanson column](https://www.cardplayer.com/?p=1035770)
- **[OPINION]** With a made flush draw arriving on the river, a $1/$2 opponent "will most likely raise" a small river bet (i.e. the raise is the made hand) — [Crush Live Poker, "Rarely check call the river", 2012](https://crushlivepoker.com/articles/rarely-check-call-the-river)

River bluffing and under-bluffing when checked to
- **[OPINION]** Live players "under-bluff by a lot" on the river — [Upswing Poker, Mathias 2019](https://upswingpoker.com/crush-live-poker-games-exploitative-tactics/)
- **[OPINION, SNIPPET]** They "don't bluff much on the river, especially when betting big or triple barreling" — [Upswing Poker, "10 Laws of Live Poker", 2018](https://upswingpoker.com/wp-content/uploads/2018/11/10-Laws-of-Live-Poker-v5.pdf)
- **[OPINION]** Hanson: it is a "common misconception" that players will bluff big when checked to after the hero has shown strength; an average player facing a scare card will often check back one pair, and if he does bet he "most likely" beats one pair — [Crush Live Poker, "Rarely check call the river"](https://crushlivepoker.com/articles/rarely-check-call-the-river)
- **[OPINION from a 5-player solver review]** Hungry Horse (Marc Goone) compared five winning live players with solver output: they over-raise strong hands on the flop, under-bluff turn and river, and over-fold to big river bets. No percentages on the summary page; sample is five winners, not the pool — [BluffAces summary of "There Are No Good Players in Live Poker", Oct 2024](https://bluffaces.com/videos/there-are-no-good-players-in-live-poker/)

Thin value getting called
- **[OPINION]** At $1/$2 "a small value bet ... is likely to get called"; check-calling the river is "one of the biggest mistakes" at lower stakes, and most $1/$2 players check-call rather than bet-fold — [Crush Live Poker, "Rarely check call the river"](https://crushlivepoker.com/articles/rarely-check-call-the-river)
- **[OPINION]** Hanson: opponents will sometimes call a large bet with weak hands after a long think (single-hand anecdote) — [Card Player, Sep 2014](https://www.cardplayer.com/?p=1037112)

Donk bets
- **[DATA gap / ONLINE]** Selbrede's donk-bet article gives no live donk frequency; it discusses purpose only (value, semi-bluff, representing strength). Its only numbers are online NL50/NL100 (donk-betting 14% of the time sharply increases a player's loss rate) — [PokerNews, "Donk Betting in Small-Stakes Live"](https://www.pokernews.com/strategy/donk-betting-in-small-stakes-live-no-limit-hold-em-28638.htm)

Solver-vendor material
- **[NO LIVE DATA]** GTO Wizard's blog search returned no article with measured live population frequencies. One article says "mass data analysis shows that the BB is heavily under 3-bet" (dataset, stakes and site unstated; all its percentages are solver or node-locked assumptions, e.g. GTO BB 3-bet vs UTG min-open 5.4%) — [GTO Wizard, "The 3 Biggest Leaks Killing Your Winrate", Sep 2025](https://blog.gtowizard.com/the_3_biggest_leaks_killing_your_winrate/)

### Inferences
- The fold-versus-call disagreement (Mathias/Red Chip "over-fold to barrels" vs Hanson/Elwood "won't fold") is probably about hand class, not a true contradiction: the pool folds air and weak draws to flop/turn bets but does not fold top pair or better. No source quantifies this split, so the simulator will need assumed values per hand class.
- If a parameter must be set for raise-bluff share, the sources support "near zero" for river raises and for raises against large bets, weakest on the flop (small flop raises = top pair). Exact values are not sourced.
- Online micro-stakes fold-to-c-bet numbers (45/34/37, 42-57%) are heads-up-heavy pools at 2.7 players per flop; with 4.0 players per flop live, per-player fold rates cannot be transplanted to "probability the c-bet takes the pot".

### Gaps
- No tracked live low-stakes figure found for any of: c-bet % (heads-up or multiway), fold-to-c-bet by street, turn/river barrel frequency, share of raises that are bluffs by street, check-raise frequency, donk-bet frequency, fold rate of pairs and draws to one/two/three barrels, river bet-bluff or raise-bluff frequency, how often thin value bets are called by worse, bet-when-checked-to frequency.
- Hand2Note's Live Poker Database could answer several of these (it is sold with full hole cards, 450k-600k+ hands), but its published article reports none of them, and its hands are streamed and mostly higher-stakes.
- Ed Miller's books, Jonathan Little's low-stakes material and Hungry Horse's videos were not accessible; whether they contain numbers is unknown.
- No source was found that argues, with evidence, that online micro-stakes mass-data postflop frequencies transfer to live play.

## Bet-sizing tells: small bets, pot-sized bets, overbets

### Takeaway
The only source material is Bart Hanson's opinion: the pool sizes bets by hand strength, small out-of-position river bets are weak "blocker" bets, and very large bets and overbets are strong. He calls this "one of the most consistent patterns", but nobody attaches a hit rate.

### Cited Findings
- **[OPINION]** Players at mid and low live stakes "usually" size by hand strength: larger with strong one-pair hands to "protect" (more so on draw-heavy boards); two pair on connected boards tends to "blast the pot", especially on the turn; very strong hands such as top set may be slow-played or bet small. Described as "one of the most consistent patterns". Hands discussed were at $5/$10 — [Card Player, "Crushing Live Poker With Twitter", Nov 2014](https://www.cardplayer.com/?p=1037161)
- **[OPINION]** A very large sizing or overbet from a recreational player means strength — [Card Player, Nov 2014](https://www.cardplayer.com/?p=1037161)
- **[OPINION]** Raises facing overbets, and turn/river overbets generally, are "rarely" bluffs — [Card Player, May 2016](https://www.cardplayer.com/cardplayer-poker-magazines/66329-bestbet-jacksonville-29-11/articles/22780-crushing-live-poker-with-twitter)
- **[OPINION]** Small river bets: "a lot of bad players" bet small out of position on the river to get to a cheap showdown (block bet); example sizing about one-fifth pot. "Many players" block and then still call a raise — [Card Player, Sep 2014](https://www.cardplayer.com/?p=1037112)
- **[OPINION, SNIPPET]** Small river bets from opponents are often weak and can be raised profitably, while a large raise deserves respect (search summary of the same Sep 2014 column) — [Card Player, Sep 2014](https://www.cardplayer.com/?p=1037112)
- **[OPINION]** Counter-view within Hanson's own columns: callers to his show often reason "a big bet showed strength", which he calls "fundamentally flawed" as a way for inexperienced players to play their own hands (they end up way ahead/way behind) — [Card Player, May 2016](https://www.cardplayer.com/cardplayer-poker-magazines/66329-bestbet-jacksonville-29-11/articles/22780-crushing-live-poker-with-twitter)
- **[OPINION, SNIPPET, generic]** "Most amateurs simply do not fire large bluffs into unimproved hands", so large river bets are value at low and mid stakes (site of low authority; not live-specific) — [DeucesCracked river bluff-catching guide](https://www.deucescracked.com/blog/river-bluff-catching-guide-2026-nash-equilibrium-poker)

### Inferences
- The sizing map implied by Hanson: big flop/turn bet on wet board = strong one pair or two pair; small bet from a strong line = possible slow-played monster or block; small OOP river bet = medium showdown value; overbet = near-nuts. The "small bet" tell is two-sided (weak blocker or trapped set), so it is the least reliable of the three by his own description.
- Hanson's sizing columns are from $5/$10 hands, 2014-2016; applying them to $1/$2-$3/$5 is his stated generalisation ("mid and low"), not something he sampled.

### Gaps
- No source gives a reliability figure (e.g. "overbet is value X% of the time") for any sizing tell.
- Nothing specific on pot-sized bets as a distinct category.
- No tracked data linking bet size to shown-down hand strength in live low stakes.

## Showdown: river calling width, WTSD, bluff-catching accuracy

### Takeaway
No live low-stakes showdown statistics were found. Opinion says the pool check-calls rivers too much and pays off small value bets; the only numeric WTSD benchmarks are online.

### Cited Findings
- **[OPINION]** Most $1/$2 players check-call the river rather than bet-fold; recreational players fear bet-folding — [Crush Live Poker, "Rarely check call the river"](https://crushlivepoker.com/articles/rarely-check-call-the-river)
- **[OPINION]** Players "want to get to showdown" and size their own bets down to ensure it; some fold because their hand "is not a $200 hand" (absolute rather than range-relative thinking) — [Card Player, Sep 2014](https://www.cardplayer.com/?p=1037112)
- **[DATA-LIVE, different pool]** Winning TAG players in streamed games have WWSF (won when saw flop) 40% and aggression factor 1.6, both described as much lower than online — [Hand2Note, "Online vs. Live Poker"](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights)
- **[ONLINE, flagged]** WTSD for online regulars usually 27-32%; higher indicates calling down too light — [Hand2Note, "Essential Postflop Stats"](https://hand2note.com/Blog/Features/essential-postflop-stats) [SNIPPET]

### Inferences
- With 4.0 players per flop and a passive pool, hands should reach showdown more often than online, but no source gives the live number.

### Gaps
- Live low-stakes WTSD, W$SD, river call frequency versus bet size, and bluff-catch success rate: none found.
- No data on how often river calls are correct (i.e. how often the bettor was bluffing when called).

## Aggregate stats: population VPIP / PFR / 3-bet / aggression factor / WTSD

### Takeaway
The best available target-pool line is Vegas $1/$2: VPIP 35-37, PFR 6, 3-bet 0.8, call-PFR 28, 4.0 players per flop (small hand-recorded sample, pre-2017). Aggression factor and WTSD for the pool are not published anywhere accessible.

### Cited Findings
- **[DATA-LIVE]** Vegas $1/$2 pool average: VPIP 37% (35% in a later article), PFR 6%, 3-bet 0.8%, call preflop raise 28.0%, players per flop 4.0, flops with 5+ players 27%, late/early position VPIP ratio ~1.0. Basis: "a few hundred" hand-recorded histories from four Vegas rooms — [PokerNews (Selbrede) 1](https://www.pokernews.com/strategy/donkey-poker-low-stakes-live-games-differ-online-27134.htm); [2](https://www.pokernews.com/strategy/donkey-poker-do-you-play-too-many-hands-27182.htm); [3](https://www.pokernews.com/strategy/donk-betting-in-small-stakes-live-no-limit-hold-em-28638.htm); [4](https://www.pokernews.com/strategy/preflop-raising-in-live-1-2-no-limit-hold-em-cash-games-29209.htm)
- **[ONLINE comparison from the same author]** Online NL50/NL100 (~6M hands): VPIP ~22%, PFR 8.5%, call preflop raise 15.3%, players per flop 2.7 — [PokerNews (Selbrede)](https://www.pokernews.com/strategy/donk-betting-in-small-stakes-live-no-limit-hold-em-28638.htm)
- **[DATA-LIVE, different pool: winners only, streamed, $2/$5-$100/$200]** 242 winning TAG players, ~500k hands: VPIP/PFR 31/20 (some 37/21), 3-bet 13%, call vs 4-bet 40%, aggression factor 1.6, WWSF 40%. TAG filter defined inconsistently in the article (VPIP under 38, PFR above 13-15) — [Hand2Note, "Online vs. Live Poker"](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights)
- **[DATA-LIVE, different pool]** Table composition at streamed $2/$5 and $5/$10: 90% of tables had at least two "obvious fish", 57% had three to five; sample size not stated — [Hand2Note, "Online vs. Live Poker"](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights)
- **[DATA-LIVE, different pool]** Winning TAGs' results by stake (rake ignored): $2/$5 95 EV bb/100 over 52k hands; $5/$10 56 bb/100 over 105k hands. Useful only as an upper bound on how exploitable streamed low-stakes line-ups are — [Hand2Note, "Online vs. Live Poker"](https://hand2note4-com-test-dzf5dpdueud7cqdm.westeurope-01.azurewebsites.net/Blog/Databases/online-vs-live-poker-insights)
- **[OPINION, low authority, SNIPPET]** Loose-passive live games run 33-40% VPIP; solid live regulars 20-28% VPIP. Neither cites a sample — [esports.gg VPIP guide](https://esports.gg/guides/betting/vpip-poker); [PokerTube](https://www.pokertube.com/?p=13029)
- **[DATABASE DESCRIPTION]** Hand2Note Live Poker Database size is reported inconsistently: 450k+/500k hands, 15k-17k players, 18+ YouTube channels (launch post, Dec 2024); "over 600,000" (help page); a third-party review says over a million hands, ~38,000 players, 19 channels. Launch post describes very high-stakes content (NL100k+, multi-level straddles) — [Hand2Note launch post](https://hand2note.com/Blog/News/hand2note-enters-live-poker); [Hand2Note help](https://hand2note.com/Help/LivePokerDatabase/Index); [VIP-Grinders review](https://www.vip-grinders.com/poker-tools/hand2note-review/) [SNIPPET]

### Inferences
- The pool-versus-winner gap is itself a usable parameter: pool PFR 6% and 3-bet 0.8% (Vegas $1/$2) against winners' PFR 20% and 3-bet 13% (streamed TAGs). The two come from different pools and eras, so the gap is indicative, not exact.
- Sources agree on rank order across all aggregate stats: live low-stakes pools are looser (VPIP), more passive (PFR, 3-bet, AF) and more multiway than online equivalents. Magnitudes rest on one small sample.

### Gaps
- Pool-wide aggression factor, WTSD, W$SD, c-bet and fold-to-c-bet for live low stakes: not published in any accessible source.
- No aggregate stats specific to $1/$3, $2/$3, $2/$5 or $3/$5, or to regions other than Las Vegas.
- No VPIP distribution (share of players per VPIP band) - only the mean.
- Sample size and collection dates for the Vegas dataset are stated only as "a few hundred" hands; confidence intervals on PFR (6%) and especially 3-bet (0.8%) are therefore wide.
