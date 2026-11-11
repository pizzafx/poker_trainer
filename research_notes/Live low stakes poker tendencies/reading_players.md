# Reading players at live low-stakes NLHE ($1/$2 to $3/$5, US casinos): observable cues, reliability, and how fast evidence should override first impressions

Evidence labels used throughout:
- **[DATA]** = rests on a dataset or experiment (sample described where known).
- **[OPINION]** = an experienced player's or coach's stated view; no data shown.
- **[UNSOURCED NUMBER]** = a figure printed by a content site with no method given; treat as opinion.
- **(snippet)** = I saw this only in a search-result excerpt and did not open the page; wording may be out of context.

Headline for the report writer: almost everything written about appearance-based profiling and physical tells at low-stakes live poker is expert opinion. I found no dataset that measures how well any appearance cue (age, gender, dress, accessories, chip handling, buy-in) predicts playing style at a live table. The only quantified material is (a) a handful of lab/online studies that are adjacent, not on point, and (b) binomial arithmetic on sample size, which I computed myself and label as such.

---

## 1. Which observable cues are claimed to predict player type or skill, and how reliable is each? (cue catalogue)

### Takeaway
Sources agree that pre-hand cues are a legitimate *starting prior* at low stakes and that most small-stakes players roughly conform to type, but every source that discusses them also reports a personal misread, and none quantifies accuracy. Cues that signal "regular vs. recreational" (backpack, knows the dealers, device use, instant unemotional rebuy, neat stack) are described more confidently than cues that signal "tight vs. loose" or "passive vs. aggressive" (age, gender, dress), and several sources warn that "serious" does not mean "good".

### Cited Findings

**General stance on appearance-based priors**
- Stereotypes are "a starting point"; most small-stakes players "will conform to the stereotypes" but "it only takes one outlier"; abandon the stereotype completely when a showdown contradicts it. [OPINION, Carlos Welch] — [Be Cautious When Using Stereotypes in Poker, PokerNews 2016](https://www.pokernews.com/strategy/be-cautious-when-using-stereotypes-in-poker-25425.htm)
- "Stereotyping isn't necessarily wrong — as most stereotypes have some basis in reality", but it becomes costly once the opponent shows contrary evidence; the primacy effect makes players overweight first impressions and some strong players exploit that by switching styles; "Sometimes, you are going to be wrong." [OPINION, Jeff Hwang] — [Profiling Errors, Card Player 2009](https://cardplayer.com/cardplayer-poker-magazines/65764-barry-shulman-22-22/articles/18846-profiling-errors)
- Adjusting to a guess about how a type of opponent plays is legitimate and "essentially the entire point of the game"; the read is about the *average* player of that type, not the individual; "don't focus strictly on the way someone looks" and narrow the generalisation as conversation supplies more information; no reliability figure and no hand count given. [OPINION, Phil Galfond] — [The Anatomy of a Read](https://philgalfond.com/articles/the-anatomy-of-a-read)
- Opponents form assumptions from "age, gender, race, clothing, jewelry, electronics, personal hygiene" and first impressions are "sticky". [OPINION, David Bass] (snippet) — [Leverage Your Image at the Poker Table, PokerNews](https://www.pokernews.com/strategy/leverage-your-image-at-the-poker-table-35748.htm)
- Zach Elwood's default for unknown $1-2 / $1-3 players: assume tight and unlikely to bluff big, and give big bets a lot of respect "until I learn differently". [OPINION] — [Some thoughts on quick reads of opponent tendencies, Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent)

**Catalogue (cue -> claimed prediction -> stated reliability)**

| Cue | Claimed to predict | Stated reliability / caveat | Basis | Source |
|---|---|---|---|---|
| Older player (senior man or woman) | Tight, passive, rarely bluffs; "treat her bets as if she always has the nuts" | Both authors who state it also report being burned by it (see section 4). Welch: regional/cultural read "tends to trump" age and gender | OPINION | [Hwang](https://cardplayer.com/cardplayer-poker-magazines/65764-barry-shulman-22-22/articles/18846-profiling-errors); [Welch](https://www.pokernews.com/strategy/be-cautious-when-using-stereotypes-in-poker-25425.htm) |
| Older wealthy businessman | Tight, not bluffing big | Galfond folded a strong hand on this read and was wrong against the individual (Bill Klein); he still defends it as correct vs. the average | OPINION | [Galfond](https://philgalfond.com/articles/the-anatomy-of-a-read) |
| Woman | Tight-passive, limps marginal hands, "fit or fold", strong when raising or 3-betting; suggested exploit: bet until she folds, respect raises | Mismatch signs: does not limp much, or raise-folds where a strong hand would not. Same author misread a grey-haired woman who 3-bet and stacked off with 6-4 offsuit | OPINION | [Welch](https://www.pokernews.com/strategy/be-cautious-when-using-stereotypes-in-poker-25425.htm) |
| Woman (how *others* play against her) | Opponents bluff more at women | Online experiment, 502 participants: bluffed about 6% more often at tables of female-only avatars; participants denied avatar gender affected them; male participants bluffed 13% more often than female participants. Simulated online tasks, not live casino play | DATA (adjacent) | [Palomäki et al. 2016, PLoS ONE](https://pmc.ncbi.nlm.nih.gov/articles/PMC4934693) |
| Region / ethnicity / accent (Asian, European, South American players) | More aggressive, bluffs more, 3-bets light, floats; "action gambler / maniac" | Hwang's own example is a misread: the player he typed as a maniac turned out to raise mostly from late position and play competently post-flop. Welch: "Bluff catching against someone who is not often bluffing is not a good idea." No data | OPINION | [Welch](https://www.pokernews.com/strategy/be-cautious-when-using-stereotypes-in-poker-25425.htm); [Hwang](https://cardplayer.com/cardplayer-poker-magazines/65764-barry-shulman-22-22/articles/18846-profiling-errors) |
| Young man in a hoodie | Used by Galfond only as an example of a too-coarse category that should be refined by talking to the player; he attaches no style to it | No reliability stated | OPINION | [Galfond](https://philgalfond.com/articles/the-anatomy-of-a-read) |
| Good-looking / well-presented person | Assumed smart, ambitious, competent (halo effect) | Named explicitly as a profiling *error* | OPINION | [Hwang](https://cardplayer.com/cardplayer-poker-magazines/65764-barry-shulman-22-22/articles/18846-profiling-errors) |
| Tidy dress, pressed shirt, well-kept hair | Conservative, careful player; chatty and lively -> looser; quiet -> conservative | No reliability stated | OPINION, Negreanu (snippet) | [MasterClass: Player Profiling](https://www.masterclass.com/classes/daniel-negreanu-teaches-poker/chapters/player-profiling) |
| "Dressed for a club", says he is leaving soon | The "Playboy" tourist: impatient, runs wild all-in bluffs, calls down light, sits about an hour then shoves when bored | Presented as a type description, not a tested cue | OPINION, Ed Miller | [Beating the Tourists in Vegas, Card Player 2011](https://cardplayer.com/cardplayer-poker-magazines/65881-aussie-millions-24-5/articles/20032-beating-the-tourists-in-vegas) |
| Trustworthy-looking face | Opponents assume a stronger hand / less bluffing and fold more | Lab study, 14 poker novices, 300 one-shot hands each, no feedback; neutral and untrustworthy faces had no effect. The face says nothing about the wearer's actual style; it only biases the observer | DATA (adjacent, small n) | [Schlicht et al. 2010 summarised by BPS Research Digest](https://www.bps.org.uk/research-digest/thats-not-poker-face-poker-face) |
| Backpack (food, charger, change of clothes) | Regular / grinder settling in for a long session; "Recreational or casual players are not bringing backpacks" | Called one of the "strongest" regular tells; no evidence offered; Vegas-based | OPINION, Doug Hull / Ed Miller (Red Chip) | [Spotting Live Poker Pros](https://redchippoker.com/spotting-live-poker-pros-podcast/) |
| iPad / watching shows or playing games on a device | Regular / pro ("You're not going to see a casual player catching up on their favorite TV show") | Generalisation; no evidence | OPINION | [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/) |
| Headphones, keeps to self | "Online-style" player | One-line remark on a micro-stakes online blog; no reliability | OPINION (snippet) | [BlackRain79: How the Poker Pros Get Reads on You](https://www.blackrain79.com/2015/10/15-smart-ways-to-get-better-read-on.html) |
| Arrives already holding chips; chips from several casinos | Regular / pro ("an absolute tell") | Overstated by the source; no evidence | OPINION | [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/) |
| Converts cash to chips on arrival and cashes out everything on leaving | Casual player | Logical inference by the hosts | OPINION | [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/) |
| First-name terms with dealers; chats with other regulars about the room as a "workplace" | Regular / pro | "The better pros know this is an extremely obvious tell and will do their best to hide it", though "by month three, almost everyone has let their guard down" | OPINION | [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/) |
| Instant rebuy with no emotion | Pro / regular ("#1 tell I see") | Reader comment endorsed by James "SplitSuit" Sweeney, not the hosts | OPINION | [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/) |
| Frequent table or seat changes | Pro practising game selection | Contested in the same thread: Sweeney says these are "baby-pros" | OPINION, disputed | [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/) |
| Plays exactly long enough to earn a comp (e.g. 90 minutes for a buffet); retirees on a fixed routine | Recreational local / comp-driven retiree | Tied to one promotion at time of recording | OPINION | [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/) |
| Stingy tipping (asks dealer to break a $1 chip to tip 50 cents) | Nit | "Standard practice among many of the nits" | OPINION, Ed Miller | [Beating the Locals in Vegas, Card Player 2011](https://cardplayer.com/cardplayer-poker-magazines/65882-eugene-katchalov-24-6/articles/20055-beating-the-locals-in-vegas) |
| Neat, organised stack + chip riffling + larger-than-average stack | Takes poker seriously "regardless of if he was good or not" | Elwood explicitly says it indicates seriousness, not skill or style | OPINION | [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent) |
| Neat stack vs. messy stack | Neat -> conservative; messy -> loose, willing to gamble | Generic claim repeated by content sites; no evidence. Conflicts in emphasis with Elwood, who reads neatness as seriousness only | OPINION (snippet) | [PokerStrategy.com: Poker tells - hidden body language](https://www.pokerstrategy.com/strategy/live-poker/poker-tells-body-language/) |
| Short or odd-amount buy-in, never tops up | Recreational; "not treating the session as a business" | Same source: "often, but not reliably", since some short-stackers are strong. Source is about online club apps | OPINION | [RP Union: How to Spot a Recreational Player](https://rpunion.com/how-to-spot-a-recreational-player.html) |
| Does not buy in for / keep a full stack | Recreational ("the only players who disregard" the 100bb guideline) | Online micro-stakes blog; not live-specific | OPINION (snippet) | [BlackRain79: How to Easily Spot the Fish](https://www.blackrain79.com/2017/10/how-to-easily-spot-fish-at-poker-table.html) |
| Doesn't know procedures: string bets, acts out of turn | "First-timer" tourist: impatient, calls all-ins with ace-high, "almost never leaves the table with chips" | Type description | OPINION, Ed Miller | [Beating the Tourists in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65881-aussie-millions-24-5/articles/20032-beating-the-tourists-in-vegas) |
| Comfortable with rules but visibly nervous, sighs, small bets | "Timid tourist": limps, bets too small, rarely bluffs, over-folds (even sets) to pressure | Type description | OPINION, Ed Miller | [Beating the Tourists in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65881-aussie-millions-24-5/articles/20032-beating-the-tourists-in-vegas) |
| Looks at hole cards before the action reaches them | Inexperienced player, and leaks hand strength ("a massive amount of information") | No figure | OPINION, Chance Kornuth | [Breaking Down the Most Important Tells & Live Reads, PokerNews 2025](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm) |
| Big table talker | Not reliably a fish; "many good live players will in fact use table talk to their advantage" | Stated as a caution | OPINION (snippet) | [PokerListings: How to Spot a Fish at Low Stakes](https://www.pokerlistings.com/blog/how-to-spot-a-fish-at-low-stakes) |
| Smirk, holds eye contact, "looked at me like I was a chump" | Confident, possibly willing to bluff | Elwood rates his own read low: "hard to describe", partly unconscious, "not a vibe I often get immediately"; in the hand described the read was wrong on the specific holding | OPINION | [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent) |
| Plays a locals casino once or twice a week | "Casual local": too loose on every street, limps weak hands, calls big raises, under-bets good hands | Vegas-specific, 2011 | OPINION, Ed Miller | [Beating the Locals in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65882-eugene-katchalov-24-6/articles/20055-beating-the-locals-in-vegas) |
| Daytime regular, retired, plays nearly every day | Nit: tight preflop and tighter post-flop; a bet of a third or more of his stack is "a huge hand — every time" | Nits "common in small-stakes games, especially daytime games" | OPINION, Ed Miller | [Beating the Locals in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65882-eugene-katchalov-24-6/articles/20055-beating-the-locals-in-vegas) |

**On how much "regular" or "pro" tells you**
- Hull and Miller stress "pro" is used loosely at low stakes, many self-described pros will not be playing in two years, and low-stakes pros are less threatening than they look. [OPINION] — [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/)
- Miller: pros and "wannabes" appear mostly at $2-$5 and $5-$10 and "all have flaws in their games". [OPINION] — [Beating the Locals in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65882-eugene-katchalov-24-6/articles/20055-beating-the-locals-in-vegas)
- Low-stakes regulars "often know more than they look like they do"; watch a table for a few minutes before sitting. [OPINION] (snippet) — [Surviving at the Lower Stakes, PokerNews](https://www.pokernews.com/strategy/surviving-at-the-lower-stakes-and-moving-beyond-them-26094.htm)

### Inferences
- The catalogue separates into two axes with different strength. Axis A (regular vs. recreational/tourist): backpack, device, dealer familiarity, chips in hand, unemotional rebuy, procedural fluency. Sources state these confidently and they are mechanically plausible (they reflect time spent in the room). Axis B (tight vs. loose, passive vs. aggressive): age, gender, dress, ethnicity, stack neatness. These are stated with hedges and each comes with a published misread.
- Axis A does not map onto skill or style. A regular can be a nit, a competent TAG, or a long-term losing calling station. For the simulator, "looks like a regular" should shift the probability of *recreational-tourist* types down, not pick a style.
- Suggested correlation tiers for the simulator (my design proposal; no source gives numbers): procedural fluency and room-familiarity cues -> strong link to "regular"; age, dress and buy-in size -> weak-to-moderate link to style; gender, ethnicity, stack neatness, headphones/hoodie/sunglasses -> weak. A reasonable reading of "most conform, but outliers exist" (Welch) is that the stereotype is right more often than not but far from always; no source supports a figure, so any percentage is a tuning choice.
- Because first impressions are "sticky" (Bass) and the primacy effect is named as an error (Hwang), a trainer that sometimes mismatches appearance and style is directly targeting a documented human failure, which supports the simulator's premise.

### Gaps
- No source found, data or opinion, on these requested cues as predictors of style or skill: sunglasses, card protector, chip tricks as a skill indicator (only riffling as "serious"), topping up, drink in hand, strategy jargon in table talk, how blinds are posted, watching sports vs. watching the action, phone use (distinct from iPad viewing), player's card status, arriving in a group. Searches returned nothing usable; treat any weighting for these as invented.
- Headphones and hoodie: only one passing remark (headphones = "online-style") and a joke; nothing substantive.
- No dataset anywhere links age, gender, ethnicity or dress to measured VPIP/PFR/aggression at live tables. The only gender data (Palomäki 2016) is an online avatar experiment about how people bluff *against* women, plus a finding that men bluffed more in that task.
- TwoPlusTwo LLSNL and Reddit r/poker threads on profiling could not be retrieved through search; forum folk wisdom (e.g. "old man coffee") is therefore not documented here beyond one unverified snippet.
- An Ed Miller Card Player line that $1-$2 Vegas players are "overwhelmingly" ultra-nit or tight reraisers and loose reraisers are "very uncommon" appeared in a search excerpt, but I could not pin it to a specific column URL, so it is not cited above.

---

## 2. First-hands evidence: which actions in the first orbit or two are most diagnostic?

### Takeaway
Open-limping (especially limp-calling) is the most consistently named early marker of a recreational/loose-passive player, and bet sizing "by feel" is the second; a raise or 3-bet from a player who has been limping is treated as strong. Sources on min-raises, donk bets and straddles are thin or contradictory.

### Cited Findings
- "Open-limping is the clearest single signal"; two limps in one orbit is enough to start adjusting; playing more than about 40% of hands at a full table marks a recreational. Source is about online club apps and gives no data. [OPINION / UNSOURCED NUMBER] — [RP Union](https://rpunion.com/how-to-spot-a-recreational-player.html)
- Four questions give "80% of the practical value of a full statistical readout" and are answerable "within about thirty hands": does he open-limp (almost always recreational), 3-bet non-premium hands (separates regulars from recreationals), check-raise flops, fold the big blind to steals. Written for online play; the 80% is unsourced. [UNSOURCED NUMBER] — [DeucesCracked: Player Profiling Notes](https://www.deucescracked.com/blog/poker-player-profiling-notes-live-online-guide)
- High VPIP combined with low PFR means "you can be almost certain you are looking at a recreational player". [OPINION] (snippet) — [PokerListings: How to Spot a Fish at Low Stakes](https://www.pokerlistings.com/blog/how-to-spot-a-fish-at-low-stakes)
- Counter-view on limping: open-limping is less costly and less diagnostic in low-stakes live cash games than online. [OPINION] (snippet) — [A Preflop Question: Is Limping Lame?, PokerNews](https://www.pokernews.com/strategy/a-preflop-question-is-limping-lame-27755.htm)
- Ed Miller: timid tourists "like to limp" and bet too small; casual locals limp weak hands and call big raises; when a pro raises after a bad player limps, expect a wide, weak isolating range. [OPINION] — [Beating the Tourists in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65881-aussie-millions-24-5/articles/20032-beating-the-tourists-in-vegas); [Beating the Locals in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65882-eugene-katchalov-24-6/articles/20055-beating-the-locals-in-vegas)
- Bart Hanson: live players "limp with a lot of speculative hands" and "call a lot of three-bets" even out of position with awkward stacks; lower-level players often cannot fire multiple barrels. [OPINION] — [Crushing Live Poker With Twitter, Card Player Oct 2012](https://cardplayer.com/cardplayer-poker-magazines/66214-haig-kelegian-25-20/articles/20863-crushing-live-poker-with-twitter)
- Bart Hanson: "one of the easiest ways to spot a weak player is to notice if he habitually limp reraises". [OPINION] (snippet; specific column not identified) — [Crushing Live Poker With Twitter series, Card Player](https://cardplayer.com/poker-news/13089-bart-hanson-crushing-live-poker-with-twitter)
- Raise sizing varying with hand strength: "one of the easier things to spot in live no-limit games is the predictability of hand strength through raise sizing". [OPINION, Hanson] (snippet; specific column not identified) — [Crushing Live Poker With Twitter series, Card Player](https://cardplayer.com/poker-news/13089-bart-hanson-crushing-live-poker-with-twitter)
- Regulars use a small set of bet sizes; recreationals size "by feel" (odd fractions, arbitrary chip counts), so hand strength drives the size. [OPINION] — [RP Union](https://rpunion.com/how-to-spot-a-recreational-player.html)
- A bet of $1 into a $15 pot "is only something that a recreational player would ever do". [OPINION] (snippet; online blog) — [BlackRain79: How to Put Them on a Hand](https://www.blackrain79.com/2018/02/how-to-put-them-on-hand.html?m=0)
- Showdowns are the strongest update: abandon a stereotype "completely" when contradicted at showdown; action frequencies (limping, raise-folding, 3-betting) become usable "after the first few orbits". [OPINION, Welch] — [PokerNews](https://www.pokernews.com/strategy/be-cautious-when-using-stereotypes-in-poker-25425.htm)
- Elwood, from one hand with a stranger: UTG limp then calling flop and turn let him discount medium pocket pairs; quick classification relied on action plus several weak tells pointing the same way, and still missed the actual holding. [OPINION] — [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent)
- Calling three streets then folding the river to a small bet is read as a recreational "hoping to improve and giving up" line. [OPINION] — [RP Union](https://rpunion.com/how-to-spot-a-recreational-player.html)

### Inferences
- Ranking by how often and how firmly sources assert them: (1) open-limp / limp-call, (2) sizing that varies with hand strength or is oddly sized, (3) showdown of a weak hand after calling multiple streets, (4) limp-reraise habit, (5) cold-calling 3-bets out of position. Items 1 and 2 can be observed without a showdown, which is why they dominate first-orbit advice.
- Limping is diagnostic of *loose-passive recreational* specifically; it does not separate a nit from a competent regular (neither limps much), and the PokerNews counter-view implies some live regulars limp too. In the simulator, an open-limp should move weight strongly toward recreational types but not to certainty.

### Gaps
- Min-raise opens: the only statement found is a snippet that a min-raise "can mean either a strong hand or a recreational player with any two cards"; I could not attribute it to a specific page. No reliability claim.
- Donk bets: snippets disagree. One says an unskilled player's lead "is almost always really weak"; another says a min donk is a hand "they are not willing to fold" but want to see cheaply; another says small donks are noise. None was pinned to a retrievable live-poker source.
- Straddling as a diagnostic of player type: nothing found.
- No source ranks first-orbit actions by measured predictive power.

---

## 3. How often does appearance mislead, and what are the classic mismatches?

### Takeaway
No source gives a rate. What exists is a set of first-person misreads by experienced players, almost all in the same direction: someone who "looked" tight and passive (older, female, grandmotherly, wealthy businessman) turned out to be bluffing or gambling, plus one where an apparent maniac turned out to be competent and positionally aware.

### Cited Findings
- Old man who bluffs: Galfond folded a strong hand on High Stakes Poker "primarily due to stereotypes" against an older recreational businessman who was in fact bluffing and plays aggressively; "a bad fold against him specifically". [ANECDOTE] — [The Anatomy of a Read](https://philgalfond.com/articles/the-anatomy-of-a-read)
- Older man typed as tight who was bluffing; the author says his European accent should have outweighed age. [ANECDOTE, Welch] — [PokerNews](https://www.pokernews.com/strategy/be-cautious-when-using-stereotypes-in-poker-25425.htm)
- Grey-haired, grandmotherly woman who 3-bet and called an all-in with 6-4 offsuit; the author notes her shirt was an overlooked contrary cue. [ANECDOTE, Welch] — [PokerNews](https://www.pokernews.com/strategy/be-cautious-when-using-stereotypes-in-poker-25425.htm)
- Woman in her 70s: default "always has the nuts", but revise if she "plays every hand and bets every flop". [OPINION, Hwang] — [Profiling Errors](https://cardplayer.com/cardplayer-poker-magazines/65764-barry-shulman-22-22/articles/18846-profiling-errors)
- Apparent maniac who is actually solid: a man in his 40s typed as an "action gambler", with early hands seeming to confirm it (frequent raises, frequent pot-sized calls); on closer watching he raised mostly from late position and played well post-flop. Hwang attributes the error to stereotype plus confirmation from a small early sample. [ANECDOTE] — [Profiling Errors](https://cardplayer.com/cardplayer-poker-magazines/65764-barry-shulman-22-22/articles/18846-profiling-errors)
- Serious-looking is not the same as good: neat stack, riffling, big stack signals seriousness "regardless of if he was good or not". [OPINION, Elwood] — [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent)
- Self-described pros at low stakes are often not long-term winners. [OPINION] — [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/)
- The strong "tight-looking" read can be exploited deliberately: a trustworthy-looking face made novices fold more, and the researchers suggest frequent bluffers would benefit from looking trustworthy (their inference, untested). [DATA, n=14] — [BPS Research Digest on Schlicht et al. 2010](https://www.bps.org.uk/research-digest/thats-not-poker-face-poker-face)
- People bluffed more at female avatars while denying gender influenced them, i.e. the stereotype operates without awareness. [DATA, n=502, online] — [Palomäki et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4934693)

### Inferences
- The documented mismatches are asymmetric: the costly error is over-folding to someone who "looks" tight. That matches Elwood's and Miller's baseline that unknown low-stakes players rarely bluff big, so the stereotype is usually rewarded and occasionally punished hard.
- Hwang's case is the most useful design pattern for the simulator: a misleading appearance *plus* a short run of early hands that happens to confirm it. Early confirming hands should not be allowed to lock in the first impression.
- For the simulator, the classic mismatches with at least one published example are: old man who bluffs; grandmotherly woman who gambles; apparent maniac who is a competent positional player; serious-looking "reg" who is a losing player.

### Gaps
- No published example found for "young hoodie kid who is a calling station" or "drunk who is actually a solid reg"; these are plausible folk mismatches but I found no source stating them.
- No estimate anywhere of the base rate at which appearance mispredicts style.

---

## 4. How many hands or showdowns does it take to classify someone?

### Takeaway
Published guidance is rule-of-thumb and spans an order of magnitude: roughly 20-50 hands (about an hour live) for a coarse preflop type, 100+ for aggression and 3-bet reads, several hundred to 1,000+ for post-flop frequencies. Binomial arithmetic (mine) agrees: one hour separates extremes (nit vs. loose) with about 97% accuracy but cannot separate adjacent types, which need 200-500 hands.

### Cited Findings
- Live cash runs about 20-30 hands per hour (25-30 in another passage of the same page). [OPINION / common figure] — [SplitSuit: Live Poker Cash Game Truths](https://www.splitsuit.com/live-poker-cash-game-truths)
- At roughly 17% VPIP a tight player voluntarily plays only 3-5 hands per hour live. [Arithmetic by source] — [SplitSuit](https://www.splitsuit.com/live-poker-cash-game-truths)
- Minimum samples (rules of thumb, no math): VPIP 20 hands; PFR 20; aggression factor 100; 3-bet 100; fold to c-bet 100; turn stats 300; river stats 1,000; consider a stat after at least 5 opportunities and be confident after 10. Online HUD context. [OPINION] — [BlackRain79: Poker HUD Stat Sample Sizes](https://www.blackrain79.com/2017/11/poker-hud-stat-sample-size.html)
- Preflop tendencies: about 30-50 hands online "or about an hour live"; post-flop frequencies: at least 200 hands before significant adjustments; require at least three consistent observations before acting ("a single bluff does not make someone aggressive"); a live bet-sizing pattern "usually emerges within two hours". Unsourced. [OPINION] — [DeucesCracked: Player Profiling Notes](https://www.deucescracked.com/blog/poker-player-profiling-notes-live-online-guide)
- VPIP needs "several hundred hands or more" to be reliable. [OPINION] (snippet) — [DeucesCracked glossary: VPIP](https://www.deucescracked.com/learn/poker-glossary/vpip)
- The binomial formula for a 95% interval on VPIP (observed plus or minus 1.96 x sqrt(p(1-p)/n)) appears in a forum post, but that post's own worked example is arithmetically wrong (it reports about plus or minus 20 points at 100 hands where the formula gives about plus or minus 8.5). [Formula is standard; example unreliable] (snippet) — [PokerStrategy.com forum](https://www.pokerstrategy.com/forum/topicid/75926/)
- Stats are also position-dependent, so pooled small samples understate uncertainty; one poster recommends waiting for stats to converge by position. [OPINION] (snippet) — [PokerStrategy.com forum](https://www.pokerstrategy.com/forum/topicid/75926/)
- Tell-based reads need a per-player baseline; a tell seen once is "much weaker" than a confirmed one; verify at showdown. [OPINION, Jonathan Little] — [PokerCoaching: Live Poker Tells](https://pokercoaching.com/blog/live-poker-tells/)
- Small early samples mislead: Hwang's "maniac" looked confirmed by his first few hands. [ANECDOTE] — [Profiling Errors](https://cardplayer.com/cardplayer-poker-magazines/65764-barry-shulman-22-22/articles/18846-profiling-errors)
- Elwood needed to see "a large bluff, or other signs" of a serious player before dropping his tight default; he gives no hand count. [OPINION] — [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent)

### Inferences
All figures below are my own binomial calculations (independent yes/no trials per hand, exact binomial). They are not from any source, and real hands are not independent (position, table dynamics, mood), so true uncertainty is somewhat larger.

95% half-width on an observed VPIP:

| Hands (approx. live time) | True VPIP 15% | True VPIP 25% | True VPIP 45% |
|---|---|---|---|
| 10 (20-25 min) | plus/minus 22 pts | plus/minus 27 | plus/minus 31 |
| 30 (about 1 h) | plus/minus 13 | plus/minus 16 | plus/minus 18 |
| 60 (about 2 h) | plus/minus 9 | plus/minus 11 | plus/minus 13 |
| 100 (3-4 h) | plus/minus 7 | plus/minus 8.5 | plus/minus 10 |
| 200 (7-8 h) | plus/minus 5 | plus/minus 6 | plus/minus 7 |
| 300 (10-12 h) | plus/minus 4 | plus/minus 5 | plus/minus 5.6 |

Worst-case misclassification when choosing between two candidate types with the best single cut-off:

| Distinguishing | 10 hands | 20 | 30 | 60 | 100 | 200 | 300 |
|---|---|---|---|---|---|---|---|
| VPIP 15% (nit) vs. 45% (loose) | 18% | 7% | 3% | under 1% | | | |
| VPIP 25% vs. 40% | | | 20% | 12% | 6% | 1% | under 1% |
| VPIP 15% vs. 25% | | | 29% | 18% | 11% | 4% | 2% |
| VPIP 20% vs. 30% | | | 28% | 21% | 13% | 5% | 2% |
| PFR 4% (passive) vs. 18% (aggressive) | | | 12% | 3% | 1% | | |
| 3-bet 2% vs. 8% (per opportunity) | | | 30% | 13% | 9% | 2% | under 1% |

- Reading the tables: one orbit (9-10 hands) is close to worthless for VPIP on its own; one hour reliably splits "plays almost everything" from "plays almost nothing"; telling a competent TAG from a slightly loose regular takes multiple sessions. This matches the low end (20-50 hands for a coarse type) and the high end (several hundred for a reliable number) of the published rules of thumb, which are answering different questions.
- 3-bet opportunities arise in only a fraction of hands, so "100 opportunities" is many hours live; in practice a single live 3-bet from a passive player is treated as premium on population grounds rather than on a personal sample.
- Showdowns arrive far more slowly than hands. A player voluntarily entering 15-45% of 25-30 hands per hour plays roughly 4-13 hands per hour and shows down only a fraction of those. I found no sourced live went-to-showdown rate, so showdowns-per-hour is an assumption the developer must set; on any plausible value a nit shows down perhaps once an hour or less.
- A single showdown is nonetheless high-information when it reveals a hand inconsistent with a type (limp-calling 9-4 offsuit, 3-bet stacking off with 6-4 offsuit, a river bluff). Sources treat one such showdown as enough to discard a stereotype (Welch) while requiring about three consistent observations before attributing an *aggressive* tendency (DeucesCracked). That asymmetry is defensible in Bayesian terms: some observations are near-impossible under one type, whereas one bluff is merely unlikely under several.
- Suggested override schedule for the simulator (design proposal): appearance prior dominates for the first handful of hands; frequency evidence should carry roughly equal weight by 20-30 hands for extreme types; any unambiguous showdown should outweigh appearance immediately; by 60-100 hands appearance should contribute almost nothing.

### Gaps
- No statistical treatment of sample size specific to live reads was found in poker literature; the tables above are my computation.
- No sourced figure for live showdown frequency per player-hour, or for how many showdowns coaches consider sufficient, beyond "three consistent observations".
- No source quantifies how much one showdown should move a read.

---

## 5. Physical and timing tells considered reliable at low stakes

### Takeaway
The tells most consistently endorsed for low-stakes recreational players are the immediate call (weak/medium hand or draw), defensive or pre-emptive chip grabbing while waiting to act (weak, wants a cheap showdown), prolonged staring at cards or board (weak), and weak-hand statements or goading from a bettor (strong). Reliability is stated qualitatively; the only figure from a primary author is Elwood's hedged "75%, more for most players" for defensive chip handling. Authors agree tells are a tiebreaker layered on betting patterns, work mainly on recreational players, and that passive low-stakes players bluff too rarely for post-bet "is he bluffing" tells to matter much.

### Cited Findings

**Framing and overall reliability**
- At $1-2 most struggling players should fix strategy before tells; tells are worth studying once you are "a decent winner at $1-2". Because passive players rarely make big bluffs, the useful tells at this level are mostly waiting-for-action tells (is the caller weak?) rather than post-bet tells. [OPINION, Elwood] — [Poker tells at live $1-2 no-limit](https://www.readingpokertells.com/2012/11/poker-tells-at-live-1-2-no-limit/)
- Low-stakes illogical play limits tells: a correct read of weakness may not matter if the player calls anyway. [OPINION, Elwood] — [Poker tells at live $1-2 no-limit](https://www.readingpokertells.com/2012/11/poker-tells-at-live-1-2-no-limit/)
- "Tells are subjective"; context decides meaning; psychology yields "small edges" after strategy is solid; general body-language principles (he criticises Joe Navarro) often do not transfer to poker. [OPINION, Elwood] — [Talking About Tells, PokerNews](https://www.pokernews.com/strategy/talking-about-tells-an-interview-with-zachary-elwood-21626.htm)
- Reads are "just a likelihood thing"; they matter most when "two or three smaller, not-that-reliable-on-their-own tells" point the same way. [OPINION, Elwood] — [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent)
- Tells are a "supplement to a solid strategy, not a replacement"; meaningful only against a player's baseline. [OPINION, Little] — [PokerCoaching](https://pokercoaching.com/blog/live-poker-tells/)
- Reads "should never be the main factor"; they tip near 50-50 spots. [OPINION, Max Silver] — [PokerNews 2025](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm)
- Tells are "an additional layer", people "do random things for random reasons", and cold rooms cause shaking. [OPINION, Sweeney] — [SplitSuit](https://www.splitsuit.com/live-poker-cash-game-truths)
- Caro's core principle: players act weak when strong and strong when weak; acted tells (shrugs, sighs, sad voice) indicate strength; a trembling hand is "almost always" involuntary and indicates a strong hand; the principle is less solid against skilled players, and Caro has said tells mainly work against weak opponents. His book attaches per-tell reliability percentages by skill level, which I could not retrieve. [OPINION] (snippets) — [Mike Caro: Reverse](https://www.poker1.com/archives/27818/mike-caro-poker-word-reverse); [Poker tells to believe in](https://www.poker1.com/?p=10438)
- Dissent: a micro-stakes coaching blog states physical tells "don't have any bearing in an actual poker game". [OPINION] — [BlackRain79: 5 Obvious Signs You Are Facing a Poker Pro](https://www.blackrain79.com/2024/03/poker-player-signs.html)
- Content-site figures with no method: "individual tells are only 50-70% reliable"; bet-sizing tells "80%+" for amateurs; timing tells "60-70%". [UNSOURCED NUMBER] (snippets) — [DeucesCracked: Live Poker Tells](https://www.deucescracked.com/blog/live-poker-tells-physical-reads-guide)

**Specific tells**

| Tell | Claimed meaning | Stated reliability / caveat | Source |
|---|---|---|---|
| Immediate (snap) call | Weak, medium or drawing hand; strong hands would at least consider raising | "Almost all" immediate calls; "rampant in low-stakes games"; do not use it to bluff calling stations. Against aggressive players a snap call makes strong draws *less* likely (they would raise) | [Elwood $1-2](https://www.readingpokertells.com/2012/11/poker-tells-at-live-1-2-no-limit/) |
| Immediate call (second source) | Bottom pair, gutshot, small pair | "One of the most exploitable tells"; not quantified | [Little](https://pokercoaching.com/blog/live-poker-tells/) |
| Quick call of a turn bet | Strong draw more likely | Title-level claim from a $2-5 hand | (snippet) [Elwood: quick call of turn bet](https://www.readingpokertells.com/2013/01/2-5-quick-call-of-turn-bet-indicates-probable-draw/) |
| Defensive chip handling while waiting (holding chips ready, cutting out a call, riffling while staring) | Vulnerable hand that wants to discourage a bet | Hypothetical "75% reliable", and in his experience "more reliable than that for most players" | [Elwood $1-2](https://www.readingpokertells.com/2012/11/poker-tells-at-live-1-2-no-limit/) |
| Conspicuous chip grab before you act, or grab-then-check | Weak hand with some showdown value | "A dependable sign of weakness", among the most reliable amateur tells; applies to beginner/intermediate players; advanced players reverse it (Bellande example). Caro quoted in agreement | [Woolley, PokerNews 2014](https://www.pokernews.com/strategy/when-strong-means-weak-the-chip-grabbing-tell-19843.htm) |
| Reaching for chips as soon as you bet | Probably not a strong hand | Hedged "probably" | [PokerNews 2025 (Elwood via Upswing)](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm) |
| Chip grab before turn to act | Planning to call or raise with a marginal hand | "One of the few genuinely reliable physical tells at low stakes"; unsourced | [DeucesCracked profiling](https://www.deucescracked.com/blog/poker-player-profiling-notes-live-online-guide) |
| Player behind you reaching for chips before you act | May intend to call or raise (interest) | Hedged "may". Note this conflicts with the weak/defensive reading above; the difference is whether the motion is conspicuous | [PokerNews 2025 (Negreanu)](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm) |
| Staring at hole cards a long time; re-checking after the flop; staring at the board | Weak; strong hands are glanced at and "hidden" | Not for big decisions; "good players are capable of staring consistently"; best in borderline spots | [Elwood $1-2](https://www.readingpokertells.com/2012/11/poker-tells-at-live-1-2-no-limit/); [Little](https://pokercoaching.com/blog/live-poker-tells/) |
| Glance at own chips or at your stack right after a new card | Card helped; hand they will not fold | Little: gives away recreationals "most clearly", done "completely automatically" | [Little](https://pokercoaching.com/blog/live-poker-tells/); [PokerNews 2025 (Negreanu)](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm) |
| Long time to check to the aggressor | Weak, unimproved medium hand | Low: "Don't use this tell generally"; only vs. very nitty players | [Elwood $1-2](https://www.readingpokertells.com/2012/11/poker-tells-at-live-1-2-no-limit/) |
| Long tank before acting when facing a bet | A raise was being considered (calls and folds are simpler decisions) | Reasoned inference from one hand | [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent) |
| Long pause then a large bet | "Skews strong in most live populations" | Unsourced | [DeucesCracked profiling](https://www.deucescracked.com/blog/poker-player-profiling-notes-live-online-guide) |
| Glancing at / studying the bettor before calling; quick "How much is it?" | Weakness (seeking information) | Weak if followed by a raise; in Elwood's own example the read was wrong (opponent had a straight) | [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent) |
| Bettor stares you down after a big bet | Bluff (recreationals); recreationals with strong hands look away | "Not universal"; some players do it "every time"; strong players give nothing | [Little](https://pokercoaching.com/blog/live-poker-tells/) |
| Bettor more willing to make eye contact after betting | Strong (for one specific $5-10 player) | Player-specific. Directly conflicts with the row above; both authors stress per-player baselines | (snippet) [Elwood: tells in a $5-10 game](https://www.readingpokertells.com/2011/06/some-tells-in-a-5-10-no-limit-game/) |
| Forceful chip slam vs. smooth single motion | Slam -> bluff; smooth -> value | "One of the most reliable signals" but only "more often than not"; recreationals only; needs several observations of the same player | [Little](https://pokercoaching.com/blog/live-poker-tells/) |
| Aggressive betting motion / splashing | Weak hand wanting you to stop | Hedged "may" | [PokerNews 2025 (Negreanu)](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm) |
| Smooth, confident arm motion when betting | Stronger hand | Lab study: 78 non-playing undergraduates judging 2-second WSOP clips did best from arms alone, about chance from upper body, *below* chance from faces. About 20 professional players in the clips; nobody verified the motions were objectively smoother | DATA (weak ecological fit) [Science News on Slepian et al. 2013](https://www.sciencenews.org/article/poker-pros-arms-betray-their-hands) |
| Weak-hand statement from a bettor ("I'm on a draw") | Strong | "Generally"; less reliable when the statement is obviously true to both players | (snippet) [Elwood: LA trip, verbal behavior](https://www.readingpokertells.com/2014/03/poker-trip-to-los-angeles-observing-verbal-behavior/); [PokerNews 2025](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm) |
| Goading ("I know you're going to fold") | Strong; bluffers avoid provoking | "Usually" | [PokerNews 2025](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm) |
| Talking while waiting for someone to act | Usually not strong (a strong hand does not want to discourage action) | Talkative players are the main exception | (snippet) [Elwood: LA trip, verbal behavior](https://www.readingpokertells.com/2014/03/poker-trip-to-los-angeles-observing-verbal-behavior/) |
| Chatty player goes silent; quiet player starts talking | Silent -> very strong; sudden talk -> possible bluff | "One of the most consistent signals" vs. recreationals; unreliable vs. thinking players and habitual talkers | [Little](https://pokercoaching.com/blog/live-poker-tells/) |
| Sits up, leans forward, becomes attentive | Strong hand or connected board; bored/slumped -> weak | Not quantified | [Little](https://pokercoaching.com/blog/live-poker-tells/); [PokerNews 2025 (Kornuth)](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm) |
| Visible sighing or worried face | Genuinely worried, will fold to pressure (timid tourist) | One anecdote (opponent folded middle set). Note Caro reads sighs as acted weakness = strength; the two views conflict and hinge on whether the display is performed for you | [Miller: Tourists](https://cardplayer.com/cardplayer-poker-magazines/65881-aussie-millions-24-5/articles/20032-beating-the-tourists-in-vegas); (snippet) [Caro](https://www.poker1.com/?p=10438) |
| Riffling chips repeatedly before a big bet | Strong (one specific player) | "100% reliable as far as I could tell" for that player; higher-limit players leak less | (snippet) [Elwood: tells in a $5-10 game](https://www.readingpokertells.com/2011/06/some-tells-in-a-5-10-no-limit-game/) |

**Blake Eastman / Beyond Tells (claims data backing)**
- More than 384 hours of footage filmed from multiple angles with folded hands recorded by an assistant; paid coders counted 63,000 blinks. [Self-reported] — [Going "Beyond Tells" with Blake Eastman, PokerNews 2015](https://www.pokernews.com/strategy/obsessed-with-human-behavior-going-beyond-tells-with-blake-e-21727.htm)
- Findings as reported: blink rate alone does not indicate strength or weakness; in some individuals a sharp decrease "almost perfectly correlates with strength"; some players are stiller when bluffing; pre-flop baseline behaviour is key to interpreting post-flop behaviour; hindsight bias is severe ("It's so easy to find things when you know the cards"). No per-tell hit rates are published in the article. [Self-reported, unpublished] — [PokerNews 2015](https://www.pokernews.com/strategy/obsessed-with-human-behavior-going-beyond-tells-with-blake-e-21727.htm)
- Podcast blurbs describe 79 filmed players, an initial conclusion that tells had little value, and a later view that quantitative counting is "useless" while qualitative per-player patterns are valuable. [Self-reported, promotional] (snippet) — [Mindset Advantage Podcast ep. 146](https://directory.libsyn.com/episode/index/show/mindsetadvantage/id/20977676)

### Inferences
- Across authors the consistent structure is: universal tells do not exist; a small set of *population* tendencies hold for recreational players; everything else is player-specific and must be learned by correlating a behaviour with showdowns. Eastman's reported result (aggregate counts useless, individual patterns strong) is the closest thing to data and points the same way.
- Simulator implication: give each simulated recreational player a personal subset of tells with fairly high within-player consistency, give regulars few or none, and let a minority of players show a reversed or fake tell. A trainee should only be able to trust a tell after seeing it line up with at least a couple of that player's showdowns.
- Timing tells (snap call, tank) can be displayed in a text or graphical simulator without animation and are the best-supported category, so they are the cheapest reliable cue to implement.
- Several tells have published opposite readings (eye contact after betting; reaching for chips; sighing). The discriminator in each case is whether the behaviour is a conspicuous display aimed at the opponent (Caro's "actor": reverse it) or incidental.

### Gaps
- No independently published, quantified hit rate for any physical or timing tell in live cash play. Elwood's 75% is explicitly hypothetical; Caro's per-tell percentages exist in his book but were not retrievable; Eastman's data is unpublished.
- The Slepian arm-motion study used clips of tournament professionals judged by non-players; whether it applies to $1/$2 recreational players is unknown. I searched for a critique by Elwood and did not find one.
- Elwood's books (Reading Poker Tells, Verbal Poker Tells, Exploiting Poker Tells) were not accessible; findings here come from his free articles and interviews.

---

## 6. Betting-pattern "tells" that function as reads

### Takeaway
Coaches treat betting patterns as more reliable than physical tells at low stakes. The dominant claims are: big bets and raises from passive or nitty players are strong; recreational sizing tracks hand strength (bigger = stronger, small c-bet = uncomfortable medium hand); and a raise from a habitual limper deserves respect. None is quantified beyond unsourced marketing figures.

### Cited Findings
- "Bigger bets usually are stronger"; weaker players bet big to "drive out the draws" with hands they think are best; a small continuation bet is "usually indicative of weaker hands" (e.g. 9-9, 10-10, A-K, A-Q rather than aces or kings) unless it is a monster like top set; strong players keep c-bets around half to two-thirds pot so sizing reveals nothing; check these reads against showdowns. [OPINION, Hanson] — [Crushing Live Poker With Twitter, Card Player Oct 2012](https://cardplayer.com/cardplayer-poker-magazines/66214-haig-kelegian-25-20/articles/20863-crushing-live-poker-with-twitter)
- A nit's bet of a third or more of his stack is "a huge hand — every time"; nits bluff only when you have shown so much weakness they are nearly sure you will fold; nits oversize with medium-strength hands pre-flop (e.g. J-J), which reveals the hand. [OPINION, Miller] — [Beating the Locals in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65882-eugene-katchalov-24-6/articles/20055-beating-the-locals-in-vegas)
- Unknown $1-2 / $1-3 players: big bets get a lot of respect by default. [OPINION, Elwood] — [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent)
- Loose-passive players call often and rarely raise, so their river raises are usually strong; loose-aggressive players raise without support; the two need opposite responses. [OPINION] — [RP Union](https://rpunion.com/how-to-spot-a-recreational-player.html)
- Timid tourists bet too small, check back too often and rarely bluff; "Playboy" tourists shove when bored and their big bets can be called lighter; first-timers call all-ins with ace-high. [OPINION, Miller] — [Beating the Tourists in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65881-aussie-millions-24-5/articles/20032-beating-the-tourists-in-vegas)
- Habitual limp-reraising marks a weak player. [OPINION, Hanson] (snippet; specific column not identified) — [Crushing Live Poker With Twitter series](https://cardplayer.com/poker-news/13089-bart-hanson-crushing-live-poker-with-twitter)
- After repeated limping, "when they finally raise, respect it". [OPINION] (snippet) — [DeucesCracked profiling](https://www.deucescracked.com/blog/poker-player-profiling-notes-live-online-guide)
- Chip selection: round bets in big-denomination chips may be strength inviting a call; precise sizings may want a fold. [OPINION, Kornuth] — [PokerNews 2025](https://www.pokernews.com/news/2025/11/breaking-down-poker-live-reads-and-tells-49735.htm)
- Example of a full sizing leak: about 40% pot with draws and 80% with made hands, typically visible "within two hours" live. [UNSOURCED] — [DeucesCracked profiling](https://www.deucescracked.com/blog/poker-player-profiling-notes-live-online-guide)
- Snap-call and tank-call readings: see section 5 (snap call = weak/medium/draw; long tank = was considering a raise). — [Elwood $1-2](https://www.readingpokertells.com/2012/11/poker-tells-at-live-1-2-no-limit/); [Elwood Substack](https://zacharyelwood.substack.com/p/some-thoughts-on-quick-reads-of-opponent)
- Instant large bets are polarised: very strong or a pre-decided bluff. [OPINION] (snippet) — [DeucesCracked: Live Poker Tells](https://www.deucescracked.com/blog/live-poker-tells-physical-reads-guide)
- Hanson cautions that online-style aggression does not translate directly to live games, and that small sizing can trick less advanced players in reraised pots. [OPINION] (snippet; specific column not identified) — [Crushing Live Poker With Twitter series](https://cardplayer.com/poker-news/13089-bart-hanson-crushing-live-poker-with-twitter)

### Inferences
- "Sudden large bet from a passive player = very strong" is the single most repeated betting read across Miller, Hanson and Elwood, and all three frame it as a population default to hold until that specific player is seen bluffing big.
- For the simulator these are properties of the hidden style, not separate cues: a loose-passive or nit profile should produce size-follows-strength betting and near-zero big bluffs, and a competent regular should produce uniform sizing. The trainee then learns the read by correlating size with showdowns.

### Gaps
- No quantified frequency for any of these (how often a passive player's river raise is the nuts, how often a limp-reraise is aces or kings). A snippet claiming "most amateurs only limp-raise hands like Aces and Kings" and one claiming live 3-bet frequency is roughly 4% vs. 8% online could not be pinned to a retrievable page and are left uncited.
- No source separates $1/$2 from $2/$5 or $3/$5 populations for these reads other than Miller's remark that pros and wannabes concentrate at $2-$5 and above.

---

## 7. How styles shift during a session, and how table composition varies by time and day

### Takeaway
The only quantitative evidence is from high-stakes online data: after a big loss roughly twice as many players loosen up as tighten, and the loosening is costly. Live-specific claims come from Bart Hanson's columns: stuck recreationals play very badly and stay late, players with a deadline "blow up" before leaving, night games are looser than day games, and daytime regulars are disproportionately retired nits (Miller agrees).

### Cited Findings

**Loss-chasing and tilt [DATA, online, high stakes]**
- Smith, Levere and Kurtzman (Management Science, 2009): 346 experienced players at $25/$50 online, big win/loss defined as $1,000 in one hand, next 12 hands tracked. At six-handed tables 135 players played looser after a big loss than after a big win, versus 68 the reverse. Those who loosened after a big loss did worse than their norm. — [Gary Smith, Psychology Today](https://www.psychologytoday.com/au/blog/what-the-luck/201612/make-peace-your-losses); [paper](https://pubsonline.informs.org/doi/pdf/10.1287/mnsc.1090.1044)
- Additional figures seen in a search excerpt of the same work: heads-up tables 154 looser and 181 more aggressive after a big loss versus 74 and 47 after a big win; six-handed 117 more aggressive after a loss versus 85 after a win; the share loosening rises with the size of the loss. (snippet, not verified in the fetched page) — [paper](https://pubsonline.informs.org/doi/pdf/10.1287/mnsc.1090.1044)
- "Staying ahead and getting even" (Games and Economic Behavior, 2014) reports "strong evidence for the break-even effect", increased risk-seeking while losing within a session, among experienced poker players. (snippet; authors and numbers not retrieved) — [catalogue record](https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_miscellaneous_1613946370)
- Palomäki, Laakasuo and Salmela (2014): players primed with an upsetting story and exposed to a "watching eyes" cue made the worst call/fold decisions; experienced players were less affected. Their 2013 work: experienced players self-reflect after losses, inexperienced players ruminate. Sample sizes not given in the secondary source. — [What Scientists Have Learned From Studying Poker Players, Card Player](https://cardplayer.com/cardplayer-poker-magazines/66289-shan-jing-27-23/articles/22139-what-scientists-have-learned-from-studying-poker-players)

**Live, opinion (Bart Hanson)** — all from [Crushing Live Poker With Twitter, Card Player](https://cardplayer.com/cardplayer-poker-magazines/66292-mark-newhouse-27-26/articles/22180-crushing-live-poker-with-twitter)
- Recreational players "play very badly when they are behind in a session"; stuck players often stay late chasing.
- Players who must leave soon "tend to 'blow up' at the end of their session", may lose a stack on one poor play, and call more because they do not want to drive home having folded. Advice: value bet them more, bluff them less.
- "Night games are of better overall quality than day games", attributed to younger opponents, more alcohol and a gambling mood toward early morning.
- "Weekday evening play tends to be somewhat erratic" among recreationals; late-night weekday games "can be so good" because players have work deadlines.
- Daytime regulars are often retirees with no time pressure; daytime small-business owners show the same end-of-session restlessness as evening players.
- He does not discuss how recreationals play when winning.

**Other live, opinion**
- Nits are "common in small-stakes games, especially daytime games"; longtime regulars are often retired and play nearly every day; casual locals play once or twice a week. [Miller] — [Beating the Locals in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65882-eugene-katchalov-24-6/articles/20055-beating-the-locals-in-vegas)
- "Playboy" tourists typically sit about an hour then push chips in once bored; first-timers rarely leave with chips. [Miller] — [Beating the Tourists in Vegas](https://cardplayer.com/cardplayer-poker-magazines/65881-aussie-millions-24-5/articles/20032-beating-the-tourists-in-vegas)
- Some retirees play a fixed short session to earn a comp. [Hull/Miller] — [Red Chip](https://redchippoker.com/spotting-live-poker-pros-podcast/)
- Composure after bad beats is cited as a pro marker, with the caveat that nobody is immune to tilt. [OPINION] — [BlackRain79](https://www.blackrain79.com/2024/03/poker-player-signs.html)
- Low-stakes players "often change strategy between hands". [Reader comment, anecdote] — [Elwood $1-2 comments](https://www.readingpokertells.com/2012/11/poker-tells-at-live-1-2-no-limit/)

### Inferences
- Direction of drift is consistent across the data and the live opinion: losing -> looser, more aggressive or more call-happy; deadline -> looser and stickier. Nothing in the sources supports a symmetric "winning -> tighter" rule; the Smith data show loosening after a loss is about twice as common as the reverse, not universal (68 of roughly 200 went the other way).
- For the simulator: style drift should be probabilistic and per-player (roughly two in three loosen when stuck, per the only dataset, and that is high-stakes online), larger for recreational profiles than for regulars (Palomäki: experience dampens the effect), and visible through observable triggers the trainee can see: a lost big pot, a rebuy, a glance at the clock or "last orbit" comment.
- Time-of-day composition suggested by Hanson and Miller: daytime weekday tables skew to retired regulars and nits; evening and late-night tables skew younger, drunker and looser; weekday late-night has deadline-driven blow-ups. This is two authors' Las Vegas / Los Angeles experience, not a census.

### Gaps
- No data on live low-stakes table composition by hour or day; nothing citable on weekend vs. weekday beyond Hanson's remarks and unreliable affiliate pages (excluded).
- Nothing found on alcohol's measured effect on live play, on fatigue late in long sessions, or on how recreationals play when ahead.
- The loss-chasing data are from $25/$50 online players; transfer to $1/$2 live recreationals is assumed, not shown.
- No source describes observable "leaving soon" behaviours (racking chips, checking phone) beyond Hanson's general "eager to go".

---

## Source quality summary (for the report writer)

- Strongest on-topic primary sources (opinion from named, experienced authors, fetched in full): Elwood's $1-2 article and Substack post; Ed Miller's two Card Player columns (2011, Las Vegas); Bart Hanson's Card Player columns (2012-2014, Los Angeles); Red Chip "Spotting Live Poker Pros"; Hwang; Welch; Galfond; Woolley; Jonathan Little.
- Data-based but adjacent: Smith et al. 2009 (online high stakes); Palomäki et al. 2016 (online avatars); Schlicht et al. 2010 (14 novices); Slepian et al. 2013 (78 non-players, tournament clips). None measures live low-stakes cash behaviour.
- Self-reported data, unpublished: Blake Eastman / Beyond Tells.
- Low quality, used only with flags: DeucesCracked, RP Union, BlackRain79 and similar content-marketing pages; several are online-focused and print unsourced percentages. A site called SpotMyTell that ranks $1/2 tells "by reliability" appeared in results and was excluded as unverifiable.
- Many sources are 10-15 years old (2009-2016). Whether today's low-stakes population matches is not addressed by anything I found.
