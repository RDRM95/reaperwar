# Character bible — voices for the Cinematics scenes (V2, brief §11)

Stage D document. Written first so stage B can script against it (`WORK_BREAKDOWN.md` §3.3 B7 and the stage prompt in `docs/apex/workflows/stages-abcd.js`). This is the writers' contract: every line of timed dialogue in a scene script (`{ at, speaker, text, channel }`, brief §11) is written to the sheets below and reviewed with the checklist in §6. The continuity lint that every caption, codex AU line and dialogue line is also checked against is `docs/apex/CONTINUITY_CHECKLIST.md`.

Sources this document is built from, in order of authority: `docs/V2_CINEMATIC_BRIEF.md` §11 (the requirement), §9.2, §10 and §15; `docs/apex/ADOPTION_PLAN.md` §5 (the Showcase scene and its fixed lines), §22.2 (flagship transmissions) and §15 (AU wording); `docs/apex/CINEMATIC_DESIGN.md` §5–§6; `docs/apex/PACK_ADOPTION.md` §2.1, §2.7–§2.11, §2.14 and §3 (the Apex continuity facts and the pitfalls); `docs/apex/reference/APEX_Fleet_Reference.md` §1, §6, §7, §9, §12 and `APEX_Montage_Prompts.md` §1, §4 (cards 16–23), §6 (the adopted AU caption and line bank); `LORE_REFERENCE.md`; `src/codex/entries.ts`, `src/scenarios/index.ts` and `src/data/factions.ts` for the facts the project already states.

Binding rules restated (project rules; nothing here relaxes them): original text only — never a quotation or a close paraphrase of any line, codex entry or description from the games, and no game dialogue is reproduced anywhere in this document or in a review finding, not even as a negative example (it is described instead); canon by default, AU by choice — every alternate-universe item carries an AU label; HADES is "a penetrator with a nuclear warhead" and the forbidden ammunition phrasing never appears in any spelling; no hull cap is ever claimed (the simulation fields compressed stand-ins and the live count is whatever the machine's measured budget allows); honesty — every number in this document is a scene value, a simulation estimate or an AU scenario value and is labelled as such where it appears on screen.

## 0. How to use this document

- **Who writes what.** Stage B writes the seven scene scripts (brief §11: three canon, four AU) and may use the sample lines of §2 verbatim, adapt them, or write new lines to the same sheets. The sheets are the contract; the samples show the register. Stage D's reviewer (the writers' room) applies §6 to every line and reports pass or fix-needed per line id.
- **Fixed lines.** Some lines already exist as canon-for-this-project text and are reproduced here exactly: the Showcase scene's three dialogue captions and Harbinger's line in `ADOPTION_PLAN.md` §5.3, every flagship transmission and reaction in §22.2 (`src/data/transmissions.ts`, CORE), and Shepard's closing line of that scene. They are marked **FIXED**. A scene that uses them uses them as written; nobody rewrites them without a plan change. One of them is longer than the line budget allows for new lines (§4.0) and is exempt by name.
- **Bank lines.** The pack's §6 original AU dialogue was adopted by `PACK_ADOPTION.md` §2.14 as AU caption and comms text. The bank lines reproduced here are marked **BANK**; they may be used in any AU scene once, and never attributed to the games.
- **Data contract for the script layer** (proposal; stage B owns the implementation and may rename fields, but the ids below are what `tests/` can check the scripts against): `speaker` is one of the ids in §2.0; `channel` is one of the ids in §2.0 (table 2); `text` is under 18 words for every non-fixed line; `at` is scene seconds at `beatScale 1` or an `anchor` resolved like a shot anchor (`CINEMATIC_DESIGN.md` §2.2), and every anchored line names a fallback or a forced beat (§6, check 20).
- **Shepard's gender.** No line in any scene uses a pronoun about Shepard. The pack's Apex production bible describes the default male Shepard for its own video; this project renders no character models, so the lines are written to work either way and the speaker tag is `SHEPARD` (`SHEPARD · AU` in AU scenes), never "Prime", which is a production name.

## 1. Purpose and rules

### 1.1 Original writing only

Every line is written for this simulation. The test the reviewer applies is recognition: if a player of the trilogy would recognise the line, or recognise its shape after every noun and verb is swapped, it is a quotation and is rejected. Famous exchanges, catchphrases, running gags, speeches with a repeated refrain, radio call-and-response pairs and codex sentences are all quotations. A finding about a rejected line describes where the resemblance comes from (the game, the mission, the speaker, the situation) and never writes the source line out.

Stock military phrasing (bearings, marks, contact reports, weapons status, acknowledgements) is not a quotation unless it is a recognisable set-piece from the games; the sheets below and the fixed lines use plenty of it.

### 1.2 Short lines

Under 18 words per line (17 at most), one thought per line, declaratives, radio brevity. Two sentences at most. Numbers are spoken only as ranges, small counts, callsigns and designations; a figure that looks like an Apex scale value belongs in a `tactical` caption with its suffix, never in a mouth. A scene carries at most 14 lines (§4.0), fixed and event-driven lines included.

### 1.3 No exposition dumps

Nobody explains what the picture already shows, recites history, or states on an open channel something everybody on that channel already knows. Facts enter as operational detail: a bearing, a barrier state, a loss report, an order. If a line exists to inform the audience rather than the people on the channel, it is cut or it becomes a caption.

### 1.4 The pictures and the music carry the emotion

No line names a feeling. Fear, grief, pride and relief are shown by what the speaker does next: a held breath, a shorter order, a return to the work. Victory is never announced on an active tactical channel; a confirmed kill is a target change. The pack's creative direction (montage guide §1) is adopted whole: the triumph stays expensive, the Reapers stay formidable, and the strongest reaction is attention turning back to the people beside the speaker.

### 1.5 Canon by default, AU by choice

- A canon scene (`Battle of the Citadel, 2183`, `Earth Falls, 2186`, `The Final Battle of Earth`) contains no AU object: no Titan gun, HADES, Valkyrie, Black Fleet dreadnought or heavy cruiser, SSV Omaha, Olympus/Praetor super-dreadnought, Sol defence platform, drive attack, 38,420 or any `APEX_SCALE` figure, no Council refusal, no Javik recovered in 2183, no unindoctrinated Illusive Man. Its player-dependent assumptions are declared on screen (§4.0).
- An AU scene carries `ALTERNATE UNIVERSE · PRIME/APEX` on screen from its first frame to its last, every speaker tag is suffixed `· AU`, every caption with an Apex figure ends in `· AU SCENARIO VALUE`, and no caption, line or summary text says or implies that the trilogy went this way. AU dialogue describes its own world as its own world: nobody in an AU scene says "in canon", and nobody says "this is what really happened".
- AU facts in this document carry **(AU)**. A fact without the label is canon or a project estimate, and the row says which.

### 1.6 Honesty

- HADES, wherever it is spoken or captioned: "penetrator", "warhead", "HADES penetrators", "a penetrator with a nuclear warhead". The forbidden ammunition phrasing (the lint regex of `ADOPTION_PLAN.md` §7) never appears, in any spelling, in a line, a caption, a speaker note or a review finding.
- Drive attacks are captioned `BLACK FLEET DRIVE ATTACK — CAPITAL KILL CONFIRMED · AU` and never carry a yield number; no line names a gigaton or teraton figure.
- No line, caption or summary claims a hull cap or a limit on how many ships a battle can field; the only performance words a player sees are the governor's warnings (`ADOPTION_PLAN.md` §15, §21).
- A line never settles a player-dependent outcome in a canon scene (§5.6). Where a scene must assume one, the assumption is captioned as such.
- Flagship transmissions are original text and the UI footer says so (`FINAL TRANSMISSION · ORIGINAL TEXT (SIM)`, `· AU` under AU presets). Nothing in a scene suggests otherwise.

### 1.7 The writers' room rejection list

A line is rejected when it is any of the following. The reviewer names the item, never the source.

1. A quotation from the games, or a line whose shape identifies one after the words are swapped (§1.1).
2. A recognisable catchphrase or running gag of a trilogy character, including the well-known gunnery joke, the pilot's standing complaints, the Prothean's contempt formula, the Reapers' signature imperatives and insults, and any speech built around a repeated refrain.
3. A villain monologue: a Reaper explaining its purpose, its origin, its view of synthetic life, or the mechanism of the cycle.
4. A shouting Reaper, a sarcastic Reaper, a Reaper with contractions, questions, exclamation marks or a sense of humour.
5. A victory speech, a rallying cry, a toast, a prayer, or a benediction on an active tactical channel; any line that exists to make the audience cheer.
6. A line that names an emotion or tells the audience how to feel.
7. Exposition: history, technology lectures, counts of the enemy, explanations of what is on screen.
8. War-film stock phrases: the one about not dying today, the one about ending it here, the one about giving the enemy a place with a temperature, the one about the watch, the one about a hell of a show; "no matter what", "whatever it takes", "this is it", "it's been an honour" and their relatives.
9. Any line that presents AU as canon, or a canon-scene line that depends on an AU fact.
10. Any line that fixes a player-dependent outcome in a canon scene (§5.6).
11. Pronouns about Shepard.
12. Real-world quotations, pop-culture references, references to the player, to the simulation, to cameras or to the recording.
13. Apex scale figures, yields, caps, limits, credits, or the forbidden HADES phrasing.
14. Lines over the length budget or scenes over the line budget.
15. A silent-running ship called invisible or cloaked, a silent ship that is fired on from beyond detection range, or a silent ship that fires without being revealed (§5.3).
16. A ship named that the scene's fleet table does not fix by name, or a Reaper designation that does not match CORE's assignment in the headless run.

## 2. Speaker sheets

### 2.0 Ids, tags and channels (the data contract)

**Table 1 — speaker ids.** `speaker` in a script line is the id; the subtitle shows the tag (suffixed ` · AU` in an AU scene). Colour: the faction colour of `src/data/factions.ts` for fleet speakers; Reapers red; Council white.

| id | tag on screen | who | faction colour | canon scenes | AU scenes |
| --- | --- | --- | --- | --- | --- |
| `SHEPARD` | `SHEPARD` | Commander Shepard | alliance | Earth Falls, Final Battle | all four |
| `HACKETT` | `ADM. HACKETT` | Admiral Steven Hackett | alliance | all three | all four |
| `ANDERSON` | `ANDERSON` | Admiral David Anderson | alliance | Earth Falls, Final Battle (ground) | Harbinger Falls (ground, AU) |
| `GARRUS` | `GARRUS` | Garrus Vakarian | turian | Final Battle (declared assumption) | all four |
| `LIARA` | `LIARA` | Liara T'Soni | asari | Final Battle | all four |
| `TALI` | `TALI` | Tali'Zorah | quarian | Final Battle (declared assumption) | all four |
| `EDI` | `EDI` | EDI | alliance | Earth Falls, Final Battle | Valkyrie, Harbinger Falls (from the Valkyrie) |
| `JOKER` | `JOKER` | Jeff Moreau | alliance | Earth Falls, Final Battle | all four |
| `ILLUSIVE_MAN` | `ILLUSIVE MAN` | the Illusive Man | cerberus | none | Refuse, Black Fleet, Harbinger Falls |
| `JAVIK` | `JAVIK` | Javik | alliance (crew) | Final Battle only under a declared assumption; prefer silent | all four |
| `HARBINGER` | `HARBINGER` | Harbinger | reaper | Final Battle | Refuse, Harbinger Falls |
| `SOVEREIGN` | `SOVEREIGN` | Sovereign | reaper | Battle of the Citadel | none (destroyed in 2183 in both continuities) |
| `REAPER` | `REAPER {des}` | an unnamed Reaper capital | reaper | Earth Falls (at most one line, optional) | none |
| `SWORD_CONTROL` | `SWORD CONTROL` | Sword fleet controller | alliance | Final Battle | all four |
| `HAMMER_CONTROL` | `HAMMER CONTROL` | ground net controller | alliance | Final Battle | Harbinger Falls |
| `FIFTH_FLEET` | `FIFTH FLEET` | Fifth Fleet flag deck / controller | alliance | Battle of the Citadel, Earth Falls | none |
| `KILIMANJARO` | `SSV KILIMANJARO` | the Kilimanjaro's captain | alliance | Final Battle | Refuse, Harbinger Falls |
| `OMAHA` | `SSV OMAHA` | the Omaha's captain (AU super-dreadnought) | alliance | none | Harbinger Falls (only where the table fields the hull) |
| `CITADEL_CONTROL` | `CITADEL CONTROL` | Citadel traffic and defence control | council (white) | Battle of the Citadel | none |
| `CITADEL_FLEET` | `CITADEL FLEET` | the Citadel Fleet's turian commander (unnamed) | turian | Battle of the Citadel | none |
| `HIERARCHY_COMMAND` | `HIERARCHY COMMAND` | Sword's turian contingent commander (unnamed) | turian | Final Battle | none (Victus speaks) |
| `VICTUS` | `PRIMARCH VICTUS` | Primarch Adrien Victus | turian | none (his place in the battle is not established) | Black Fleet, Valkyrie, Harbinger Falls |
| `LIDANYA` | `DESTINY ASCENSION` | Matriarch Lidanya, captain of the Destiny Ascension | asari | Battle of the Citadel; Final Battle as the bridge voice (captain unnamed, §5.6) | Refuse, Black Fleet |
| `TEVOS` | `COUNCILLOR TEVOS` | the asari councillor | council | none | Refuse (insert) |
| `SPARATUS` | `COUNCILLOR SPARATUS` | the turian councillor | council | none | Refuse (insert) |
| `VALERN` | `COUNCILLOR VALERN` | the salarian councillor | council | none | Refuse (insert) |
| `COUNCILLOR_HUMAN` | `HUMAN COUNCILLOR` | the human councillor, never named (§5.6) | council | none | Refuse (insert), where the world state seats one |
| `PROMETHEUS` | `BLACK FLEET PROMETHEUS` | the Black Fleet flagship's captain (AU) | cerberus | none | Refuse, Black Fleet, Harbinger Falls |
| `EREBUS` | `CERBERUS EREBUS` | the heavy cruiser Erebus's captain (AU) | cerberus | none | Refuse, Black Fleet |
| `VALKYRIE_CAPTAIN` | `SSV VALKYRIE` | the Normandy Valkyrie's captain, unnamed (AU, Alliance) | alliance | none | Valkyrie, Harbinger Falls |
| `RAAN` | `ADM. RAAN` | Admiral Shala'Raan vas Tonbay | quarian | Final Battle (declared assumption) | all four |
| `GERREL` | `ADM. GERREL` | Admiral Han'Gerrel vas Neema | quarian | Final Battle (declared assumption) | Black Fleet, Harbinger Falls |
| `GETH` | `GETH CONSENSUS` | the geth fleet (one voice, plural) | geth | Final Battle (declared assumption) | all four |

`{des}` in a tag or a line is a token the script layer resolves at schedule time from a ship reference (`{des:R1}` → the CORE tracking designation such as `RC-07`; `{name:KILI}` → the hull's run-time name). A token counts as one word. This is the only way a line may carry a Reaper designation or a generated name (§1.7 item 16).

**Table 2 — channel ids.** Each channel is one radio-texture audio cue and one speaker-tag style. A line's `channel` must be one the speaker can physically be on (§5.1).

| id | texture | who is on it |
| --- | --- | --- |
| `alliance_fleet` | Alliance fleet comms: clean carrier, squelch at the end, a background of a second net | Hackett, Sword control, Fifth Fleet, Alliance captains, allied liaisons on the Sword net (canon Final Battle) |
| `hammer` | ground-to-orbit: heavier static, a wind bed, distant impacts | Anderson, Hammer control |
| `normandy` | Normandy intercom: close, dry, the drive hum | Shepard, Joker, EDI (canon), Garrus, Liara, Tali, Javik |
| `valkyrie` | Valkyrie bridge: the same intercom family, a deeper hull hum, more voices under it (AU) | Valkyrie's captain, EDI (AU) |
| `citadel_fleet` | the 2183 Citadel defence net: turian-clipped carrier, asari relay tone | Citadel control, Citadel Fleet, Lidanya |
| `coalition` | the Apex joint command net: multi-carrier, translator tick (AU) | Hackett, Victus, Lidanya, Raan, Gerrel, the geth, Prometheus, the Illusive Man, Shepard when addressing the fleet |
| `council` | the Council chamber: room tone, no carrier (AU inserts) | the four councillors |
| `cerberus` | Cerberus net: tight, encrypted warble at the start | the Illusive Man, Prometheus, Erebus |
| `reaper` | Reaper broadcast: sub-bass, a slow phase, every other channel ducks | Harbinger, Sovereign, the unnamed capital |

**Line shape.** `{ id, at | anchor, speaker, text, channel, duration? }`. `duration` defaults to `clamp(2.5, words × 0.33 + 1.2, 4.5)` seconds; a fixed caption line of scene 1 keeps the duration its beat table gives it.

### 2.1 Commander Shepard (`SHEPARD`; `SHEPARD · AU`)

- **Role and situation.** *Battle of the Citadel* — not a speaker: Shepard is inside the Citadel on foot and the fleet's net never hears the Tower. *Earth Falls* — on the ground in Vancouver with Anderson, then aboard the Normandy SR-2 as it lifts out of the atmosphere; speaks on `normandy` only once aboard. *Final Battle* — aboard the Normandy SR-2 during Sword's arrival and the volley, before the Hammer landing (this is canon for every playthrough); speaks on `normandy`, and once on `alliance_fleet` to Hackett. *AU, all four Sol scenes* — aboard the Normandy SR-2, the unique command vessel; commands the mission element (the Normandy group and the targets it marks); Hackett commands the coalition. Shepard is never aboard the Valkyrie in a scene (scene 1 card 23 is carried by the SR-2, §5.3 of the plan).
- **Voice.** Contained confidence. Short commands, four to ten words. Declaratives; an order is a noun and a verb. Asks for reports and waits for them: at least one Shepard line per scene is a question to a crew member or an acknowledgement of their answer, because listening is the characterisation. Vocabulary: operational (mark, solution, wing, lane, window, confirm, hold, clear). Humour: dry, rare, one word, never at a death. The voice does not rise; when the plan works the lines get shorter, not louder.
- **Wants.** The people beside Shepard alive. The next target. The plan to hold without needing a speech.
- **Would never say.** A speech, a rallying cry, a toast, a line that names a feeling, a line about destiny or hope, a taunt at a Reaper, an answer to Harbinger, anything about "the player", a count of the enemy, a figure from the Apex tables, a pronoun about Shepard (nobody says one).
- **Relationships.** Hackett: formal in address ("Admiral"), equal in trust; Shepard receives the mark and interprets it. Anderson: the mentor; Shepard says "Anderson", never "sir" on an open net. Garrus: the shortest exchanges in the script; one tease per scene is allowed, and Shepard lets it pass. Liara: Shepard asks her first when a question is about the enemy's shape. Tali: trusted on anything with a drive core in it. EDI: asked for numbers, thanked with the next order. Joker: a one-word reply is a full reply. The Illusive Man (AU): wary cooperation, never warmth; Shepard uses the ships and keeps the man at arm's length. Javik (AU): Shepard asks him for patterns and does not argue with the answer. Harbinger: Shepard does not answer it; the next order is the answer.
- **Channel.** `normandy`; `alliance_fleet` (canon) or `coalition` (AU) when speaking to the fleet.
- **Sample lines (original).**
  - (Final Battle · `normandy`) "Joker, keep us in the Kilimanjaro's shadow until the volley clears."
  - (Final Battle · `alliance_fleet`) "Hackett, Normandy. The volley landed. Hammer goes on your word."
  - (Black Fleet · `coalition`) "Your ships hold the gap beside the Hierarchy. Fire on what Hackett marks."
  - (Valkyrie · `coalition`) "Valkyrie, Shepard. Its port barrier is down. The shot is yours."
  - (Harbinger Falls · `normandy`) "Confirm it. Then get the rescue wings moving."
- **FIXED.** "Mark the next one." (scene 1, `next`, 118.0 s, `quote`, `SHEPARD · AU`).
- **BANK** (montage §6, adopted; each usable once across the AU set): "Confirm the kill. Get our people out." (`normandy`, after a capital kill; scene 1 already uses the fixed line at that beat, so this goes to another AU scene). "You want a future for humanity? Help me give everyone one." (`coalition`, to the Illusive Man; the only reply to his fixed line). Not used in V2: the fleet call beginning "All ships, this is Shepard" (over budget, and in this project Hackett addresses the fleet, not Shepard); "They came for a divided galaxy. Let them see who's here." (a rallying line on a tactical channel, §1.7 item 5; it may survive as a silent `quote` caption before first contact if stage B wants it, never on a live channel); "We get to live." (an after-the-war beat that no V2 scene depicts; reserved).
- **AU variant.** Same register, same economy; the tag is `SHEPARD · AU`. What changes is the situation: three years of preparation, a plan that is working and a crew that all lived. The lines may be a shade warmer towards the crew and a shade colder towards the Illusive Man. No line in an AU scene says that the trilogy went another way.

### 2.2 Admiral Steven Hackett (`HACKETT`)

- **Role and situation.** *Battle of the Citadel* — commands the Fifth Fleet's transit and commitment (canon: the Fifth Fleet arrives under his orders; where he stands is not shown and the scene does not say). *Earth Falls* — the Alliance's senior voice on the fleet net; Arcturus is lost; he orders the withdrawal from Sol (the withdrawal is canon; who worded the order is an inference, so the line is his but the scene never shows where he is). *Final Battle* — commands Sword. *AU* — commands the coalition at Sol; the fixed lines of scene 1.
- **Voice.** Measured, operational, low. Complete sentences, but short ones; the callsign first, then the message. Never raises his voice, never hurries, never exclaims. Numbers only as counts, callsigns and marks. One dry remark per scene at most, and only in the aftermath.
- **Wants.** The line to hold. Every loss accounted for. The plan executed by people who know what it is.
- **Would never say.** A speech on the tactical net. "We have won." A promise about the Crucible (canon) or the outcome (AU). A feeling. A swear word. A figure from the Apex tables.
- **Relationships.** Shepard: "Commander"; trust shown by giving a mark and nothing else. Anderson: peers of long standing; the fewest words between them. Victus (AU) and Lidanya: allied equals, exact courtesy, first names never. The Illusive Man (AU): cold, correct; Hackett gives the marks, never thanks, never explains. Sword control: his voice when he is not speaking.
- **Channel.** `alliance_fleet` (canon), `coalition` (AU).
- **Sample lines (original).**
  - (Battle of the Citadel · `alliance_fleet`) "Fifth Fleet, Hackett. Clear the relay and form on the Citadel Fleet."
  - (Earth Falls · `alliance_fleet`) "All Sol commands: fall back to the rally point. Hold nothing you cannot keep."
  - (Final Battle · `alliance_fleet`) "Sword, Hackett. Dreadnoughts hold fire until the window. Everything lands together."
  - (Final Battle · `alliance_fleet`) "Sword, the Crucible is inbound under escort. Keep its lane clear."
  - (Harbinger Falls · `coalition`) "Omaha, Kilimanjaro: concentrate on the command vessel. Everyone else keeps their targets."
- **FIXED.** "Every command that answered is here. Hold your vectors and wait for the mark." (scene 1, `hackett_sees`, 6.5 s, `insert`, `HACKETT · AU`). "First reports confirm multiple capital kills. Defence platforms remain operational. All commands, maintain concentration. We can hold them here." (scene 1, `hackett_holds`, 100.0 s, `quote`; 20 words — the one line exempt from the length budget by name, §4.0).
- **AU variant.** Identical voice; the tag is `HACKETT · AU`. He commands more navies and says no more words.

### 2.3 Admiral David Anderson (`ANDERSON`)

- **Role and situation.** *Battle of the Citadel* — on the Citadel, not on any fleet channel; not a speaker. *Earth Falls* — in Vancouver with Shepard when the Reapers arrive; he stays on Earth to organise the resistance (canon); speaks to Shepard over the Normandy's comm while the ship lifts. *Final Battle* — on the ground in London commanding Hammer's resistance forces (canon); speaks on `hammer`. *AU (Harbinger Falls)* — Earth ground command during the Sol battle (AU: with no Crucible there is no beam run, but the Reapers still land and Earth's ground forces still fight; label `ANDERSON · AU`).
- **Voice.** Warm and hard. A soldier's plain sentences; the shortest words in the script. The only speaker allowed to carry grief, and he carries it by giving the next order faster. Addresses Shepard by name; Hackett as "Hackett" between peers, "Admiral" on an open net.
- **Wants.** The city. Shepard off the ground and in the fight that matters. The sky kept busy so the ground can breathe.
- **Would never say.** A feeling named. A speech. An order to the fleet (he is ground). "Go without me" or any relative of the farewell cliché (§1.7 item 8).
- **Relationships.** Shepard: the mentor; the pride is never spoken. Hackett: equals. Udina, the Council: not in his lines.
- **Channel.** `hammer`; `normandy` only as a relayed comm in Earth Falls (the texture is `hammer`; the subtitle tag is his).
- **Sample lines (original).**
  - (Earth Falls · `hammer`, relayed to the Normandy) "Get to the Normandy and get Hackett the picture. The city needs me here."
  - (Final Battle · `hammer`) "Hammer command to Sword: landing zones are hot. Keep their eyes on you up there."
  - (Final Battle · `hammer`) "Sword, the ground saw your volley. Every beam you draw is one less on us."
  - (Harbinger Falls · `hammer`, AU) "Ground command confirms: no new landings in the last hour. Hold the orbit."
- **AU variant.** `ANDERSON · AU`; the same man with the same job, on a day that is going better.

### 2.4 Garrus Vakarian (`GARRUS`)

- **Role and situation.** *Battle of the Citadel* — aboard the Normandy SR-1 as Shepard's crew; the SR-1 is not a hull the scene fields (§5.4), so he is not a speaker. *Earth Falls* — on Palaven's moon Menae (canon); absent. *Final Battle* — aboard the Normandy SR-2 at Sword's arrival; his survival of 2185 is player-dependent, so the scene speaks him only under the declared assumption of §5.6, and prefers Liara, EDI or Joker where one of them can carry the line. *AU* — aboard the SR-2 in all four scenes (Apex continuity: the 2185 crew lives).
- **Voice.** Dry, precise, a sniper's economy. Understatement; humour by deflation, never a running gag. Pride in turian ships shown as criticism of their spacing. Lines of eight to fourteen words. He reports what he sees through a scope: ranges, gaps, which hull is turning.
- **Wants.** A clean shot. Shepard alive at the end of the scene. The Hierarchy line to hold its interval.
- **Would never say.** The gunnery joke the trilogy made his signature (§1.7 item 2). A feeling. A long sentence. An order to the Hierarchy fleet (he is not in its chain of command). A line about Palaven's fate in a canon scene beyond what the scene's date fixes.
- **Relationships.** Shepard: the closest; one tease per scene, which Shepard lets pass. Tali: easy, old. Liara: respect, no teasing. Joker: the natural target. Victus (AU): formal, "the Primarch".
- **Channel.** `normandy`.
- **Sample lines (original).**
  - (Final Battle · `normandy`) "The Hierarchy line's holding its spacing. Somebody over there read the manual."
  - (Final Battle · `normandy`) "Two cruisers gone on the left. Their screens are closing the gap already."
  - (Valkyrie · `normandy`) "Valkyrie's lining up. If that spine holds together, nothing in front of it will."
  - (Harbinger Falls · `normandy`) "Its weapon arm just went dark. That's your window, Shepard."
  - (Harbinger Falls · `normandy`, aftermath) "Count's in. We lost fewer than the plan said. Don't tell the plan."
- **AU variant.** `GARRUS · AU`; the same voice. In the Apex continuity Palaven holds (Homeworld Defence Rule), and one line per scene set may show it as relief hidden inside a complaint about turian spacing.

### 2.5 Liara T'Soni (`LIARA`)

- **Role and situation.** *Battle of the Citadel* — SR-1 crew; not a speaker (§5.4). *Earth Falls* — on Mars at the Prothean archive (canon); absent. *Final Battle* — aboard the Normandy SR-2 at arrival; her presence is fixed by canon, so she is the preferred crew voice for the enemy's shape and the reserve's movements. *AU* — aboard the SR-2; the Shadow Broker's intelligence on the coalition net is hers to summarise, never to lecture.
- **Voice.** Precise, scholarly cadence compressed to radio length; warmth under exactness. She reports intelligence: positions, timings, which group is forming where. Minutes and seconds as words, never percentages. She names the Protheans only as information, one clause, no lecture.
- **Wants.** The information to arrive in time. The people saved by it.
- **Would never say.** A speech about the cycle. Grief named. Her signature exclamation (the goddess invocation, §1.7 item 2). A claim about Thessia's fate in an AU scene (the Apex rules say nothing about Thessia; §5.7).
- **Relationships.** Shepard: devotion unspoken; on the net she is the information officer. Javik (AU): she defers on Prothean matters; he is curt; she is not wounded by it. Tevos: formal. EDI: the two exchange data without ceremony.
- **Channel.** `normandy`; `council` only in an AU insert if stage B stages her briefing the Council (not required).
- **Sample lines (original).**
  - (Final Battle · `normandy`) "Shepard, the reserve group is forming on the far side of the planet. Minutes, not seconds."
  - (Final Battle · `normandy`) "Harbinger is holding the centre. The capitals on its flanks are the ones that move."
  - (Black Fleet · `normandy`) "Their telemetry is on our net. Whatever the Illusive Man intends, the ships are honest."
  - (Harbinger Falls · `normandy`) "I have the Reaper reserve's vector. Sending it to Hackett's board now."
  - (Harbinger Falls · `normandy`, aftermath) "The other capitals are regrouping, not stopping. Javik was right about that."
- **AU variant.** `LIARA · AU`; the same voice. The Broker's network is wider in the Apex continuity and her lines may name allied commands by name (Hierarchy, Republics, Black Fleet), never by figure.

### 2.6 Tali'Zorah (`TALI`)

- **Role and situation.** *Battle of the Citadel* — SR-1 crew; not a speaker. *Earth Falls* — with the Migrant Fleet (canon); absent. *Final Battle* — aboard the Normandy SR-2; her survival is player-dependent (2185, and the Rannoch outcome), so she speaks only under the declared assumption of §5.6. *AU* — aboard the SR-2; the Rannoch joint command exists (early settlement), and she is the natural liaison to Admiral Raan on `coalition`.
- **Voice.** Quick, technical, warm. An engineer's nouns: the core, the sink, emission, venting, heat, channels. Sentences shorten when she is stressed; they never stop being accurate. She is the authority on the stealth system's state (§5.3) and on the Valkyrie's heat.
- **Wants.** The Fleet safe. The Normandy's core intact. The heat telemetry afterwards.
- **Would never say.** The quarian exclamation the trilogy made her signature (§1.7 item 2). A feeling named. The Admiralty's orders in a canon scene (player-dependent). The familial address for Raan the games use.
- **Relationships.** Shepard: trust. Garrus: easy. Raan: respect, formal on the net ("Admiral Raan"). Gerrel (AU): cool; in the Apex continuity the Rannoch incident the trilogy depicts never happened, and nothing refers to it in either continuity. The geth (AU): she addresses the consensus with respect and no ceremony.
- **Channel.** `normandy`; `coalition` (AU) when speaking to the Fleet.
- **Sample lines (original).**
  - (Final Battle · `normandy`) "Core's steady. If Joker wants to run silent, the sink has about two minutes."
  - (Final Battle · `normandy`) "That beam cut a cruiser clean through. Barriers do nothing against those. Keep moving."
  - (Valkyrie · `normandy`) "Three Thanix channels on one hull and they run it hot. I want that telemetry."
  - (Black Fleet · `coalition`) "Admiral Raan, Normandy. The geth wedge is covering your heavies. Trust the spacing."
  - (Harbinger Falls · `normandy`) "Sink is full. We vent in ten seconds whether we like it or not."
- **AU variant.** `TALI · AU`. Lines may refer to the SR-2-pattern frigates as a class she helped fit out (an AU flavour, never a figure).

### 2.7 EDI (`EDI`)

- **Role and situation.** *Battle of the Citadel* — does not exist yet (installed in the SR-2 in 2185): never a speaker in 2183. *Earth Falls* — the Normandy SR-2's AI, the ship's voice only (her mobile platform comes later). *Final Battle* — aboard the Normandy; the preferred voice for timings and the volley's state. *AU* — aboard the **Valkyrie** (`PACK_ADOPTION.md` §2.7 adopts "EDI aboard" as the Valkyrie's codex line and crew quality). This document therefore puts EDI's AU lines on `valkyrie`, and gives the SR-2's intercom to Joker, Shepard and the crew in AU scenes; no AU scene has EDI speak from both hulls. The lead may overrule this (open question).
- **Voice.** Precise, even, quantitative; probabilities and timings in words ("most of the line", "ninety seconds"), never percentages on the net (§1.2). Humour literal and dry, learned, one line per scene at most. She is a person: she says "I", she chooses, she is never a console.
- **Wants.** The crew alive. The numbers right. To be useful at the exact moment.
- **Would never say.** A feeling named. A stock machine phrase from another franchise (§1.7 item 12). "Processing". "Organics" in the Reapers' sense. An exclamation.
- **Relationships.** Joker: affection shown as precision indulging him. Shepard: reports, then acts on the next order. The Valkyrie's captain (AU): she addresses the captain by rank and treats the ship as hers to run. The Illusive Man (AU): one line may acknowledge that he treats her as a person; she does not thank him for it.
- **Channel.** `normandy` (canon); `valkyrie` (AU).
- **Sample lines (original).**
  - (Earth Falls · `normandy`) "Two Reaper capitals have our vector. Joker, the sink will hold for ninety seconds of this."
  - (Final Battle · `normandy`) "Volley release in four seconds. Most of the line has a solution."
  - (Valkyrie · `valkyrie`) "Captain, the target's port barrier is below half. The Nova has its condition."
  - (Valkyrie · `valkyrie`) "Channel two is at its heat limit. I am holding it until the spinal round lands."
  - (Harbinger Falls · `valkyrie`) "Harbinger's coordination signal has stopped. The others are compensating. They are not stopping."
- **AU variant.** `EDI · AU`, from the Valkyrie. She may say "the Normandy" about the SR-2 across the net as a ship she knows; she never explains how she came to be aboard a different hull (nothing in the sources does).

### 2.8 Jeff "Joker" Moreau (`JOKER`)

- **Role and situation.** *Battle of the Citadel* — pilots the SR-1; no SR-1 hull is fielded (§5.4), so he is not a speaker (open question: a named SR-1 frigate would make him one). *Earth Falls* — flies the Normandy SR-2 out of Vancouver with Shepard aboard; the first stealth run of the war. *Final Battle* — flies the Normandy with Sword; the Normandy runs silent on the flank per brief §15 doctrine (§5.3). *AU* — the same, with three SR-2-pattern frigates running beside him.
- **Voice.** Fast, deflecting; complaints as a coping rhythm — but none of the trilogy's running complaints (§1.7 item 2) and no boast about being the best. The jokes stop when the flying starts; the stealth calls are clipped and exact. "Commander" for Shepard; EDI by name.
- **Wants.** His ship intact. To be told what the plan is before it needs him.
- **Would never say.** The signature complaints. Exposition. A feeling. A line that claims the Normandy cannot be seen (§5.3: silent is not invisible).
- **Relationships.** EDI: partner; the banter is his, the precision hers. Shepard: "Commander", and he means it. Hackett: formal, slightly nervous. Garrus: trades one line a scene.
- **Channel.** `normandy`.
- **Sample lines (original).**
  - (Earth Falls · `normandy`) "Commander, we're clear of the tower. Hackett's fleet is already pulling back. Where to?"
  - (Earth Falls · `normandy`) "Going dark. Anyone who wants to shoot at a cold hull is welcome to look for it."
  - (Final Battle · `normandy`) "Kilimanjaro just fired. The whole line just fired. I felt that through the deck."
  - (Valkyrie · `normandy`) "Two kilometres of ship and they named it after us. No pressure."
  - (Harbinger Falls · `normandy`) "That's one. The others are still coming, so I'm still flying."
- **AU variant.** `JOKER · AU`. In AU scenes EDI is not on his intercom (§2.7); his lines to her go across `coalition` or are not needed. One line per scene set may notice the pattern frigates ("they built more of us") without a count.

### 2.9 The Illusive Man (`ILLUSIVE_MAN`)

- **Role and situation.** *Canon scenes* — never a speaker. In 2183 Cerberus is not at the Citadel; at Earth Falls he is absent; at the Final Battle he is indoctrinated and on the Citadel, on no fleet channel. A canon scene fields no Cerberus fleet (§5.6). *AU* — unindoctrinated (the Apex continuity removes the compromising exposure itself, `PACK_ADOPTION.md` §2.1), allied, "destroy-aligned": he has committed the Black Fleet to destroying Reaper combat forces and shares its telemetry. Speaks on `cerberus` to his captains and on `coalition` to Hackett and Shepard. Scene 1's fixed line at 20.5 s is his commitment; *The Black Fleet Joins the Line* begins after it.
- **Voice.** Controlled, proud, strategic. Complete, formal sentences; one long, then one short (the pause for the cigarette is in the rhythm, not in a stage direction — there are no faces). "Humanity" is his noun. He gives reasons in terms of advantage, never virtue. He addresses Shepard by name and Hackett as "Admiral". He never raises his voice, and his coldest lines are his quietest.
- **Wants.** Humanity's future, on terms he chose. To be proven right. To keep the Black Fleet's independence inside the coalition while obeying its marks — and to make sure everyone notices that he chose to obey.
- **Would never say.** An apology. Sentiment. "The greater good" or a relative. "Friend." Anything about indoctrination or control of Reapers (that is the Cerberus Ascendant continuity, which shares nothing with Apex). "In canon." A line that makes him an affable Alliance officer.
- **Relationships.** Shepard: adversarial respect turned into use; each thinks the other needs them, and both are right. Hackett: cold mutual competence. Prometheus's captain: his instrument; he gives the order, the captain executes. Miranda: not a speaker; her authority is a codex fact. EDI: he treats her as a person (one line may show it, no more). Victus: he knows the turians are watching his ships; one line may acknowledge it.
- **Channel.** `cerberus`, `coalition`.
- **Sample lines (original, AU).**
  - (Black Fleet · `cerberus`) "Prometheus, take the gap beside the Hierarchy. Fire on the Alliance mark and nothing else."
  - (Black Fleet · `coalition`) "Admiral, the Black Fleet is on your net. Use it. I expect it to come back smaller."
  - (Black Fleet · `cerberus`) "Erebus, put yourself between that Reaper and the Ascension. Yes, I know what it costs."
  - (Harbinger Falls · `coalition`, aftermath) "Humanity did not do this alone, Shepard. I would prefer the record said so."
- **FIXED.** "I wanted humanity to have a future, Shepard. I'm committing the fleet." (scene 1, `tim_commits`, 20.5 s, `quote`, `ILLUSIVE MAN · AU`).
- **BANK.** "The Alliance has the firing solution. Give it everything we have." (`cerberus`, the Black Fleet's first volley; once).
- **AU variant.** He exists only as an AU speaker in the seven scenes; the tag is always `ILLUSIVE MAN · AU`.

### 2.10 Javik (`JAVIK`)

- **Role and situation.** *Canon scenes* — in stasis on Eden Prime in 2183 and at Earth Falls; at the Final Battle aboard the Normandy only if the player's game recovered him (DLC content, player-dependent): the canon scene prefers him silent and speaks him only under the declared assumption of §5.6. *AU* — recovered in 2183 (Apex continuity); aboard the SR-2 at Sol. His function is the one `PACK_ADOPTION.md` §2.1 and the pitfall list fix: he supplies historical patterns, language and scepticism; modern intelligence still has to find the targets. He never knows what the Reapers will do next; he knows what they did before.
- **Voice.** Declarative, clipped, imperial. Second person for this cycle's people; "my cycle", "my people" for his own, one clause at a time. No humour. Present-tense observation of the fight in front of him. Lines of eight to sixteen words.
- **Wants.** The pattern broken. To see the end his people did not get. To be useful without being asked how he feels about it.
- **Would never say.** The contempt formula the trilogy made his signature (§1.7 item 2) or any slur about this cycle's species. A lecture on the cycle. A claim to know the Reapers' next move. A number of cycles or Reapers. "In my cycle" more than once per scene.
- **Relationships.** Shepard: the one he takes orders from; "Commander". Liara: curt; he corrects her, and is right about the past and wrong about the present. EDI and the geth: he does not hide his distrust of synthetics; one line per scene set, never a slur. The Illusive Man: contempt kept to silence.
- **Channel.** `normandy`.
- **Sample lines (original, AU).**
  - (Black Fleet · `normandy`) "Watch the capitals, not the destroyers. The destroyers go where the capitals already decided."
  - (Harbinger Falls · `normandy`) "It will try to leave behind a screen. That is what the oldest one always did."
  - (Harbinger Falls · `normandy`, aftermath) "They lost the one that spoke for them. They will not stop. Neither did we."
- **BANK.** "We made an empire. You made allies." (`normandy`, aftermath of any AU scene; once). "In my cycle, we learned what they were after our fleets were gone. You learned in time." (17 words; `normandy`; once).
- **AU variant.** The tag `JAVIK · AU` whenever he speaks in the seven scenes, since every line he has is AU.

### 2.11 Harbinger (`HARBINGER`)

- **Role and situation.** *Battle of the Citadel* — absent; Sovereign speaks. *Earth Falls* — not fielded by the scenario; not a speaker. *Final Battle* — commands the blockade in person (scenario `harbinger: true`); at most one broadcast line, placed after the volley lands, and the next shot answers it. *AU* — scene 1's fixed caption at 64 s and the fixed mission-kill transmission at 112 s; *Harbinger Falls* ends with the `flagship_destroyed` event, whose transmission is one of three fixed strings chosen by `sim.rng` (a scene cannot pick which; all three must fit every scene that uses the event).
- **Voice.** The rules of §3 in full. Declarative; contemptuous; patient. No contractions, questions, exclamation marks, humour. Second person plural to organics. Two clauses, the second shorter; five to eleven words. "This vessel", "we", "the harvest", "the cycle", "the correction". The register does not change when it is losing: a loss is a measurement.
- **Wants.** Nothing it would say aloud. The harvest proceeds; resistance is corrected; the count changes nothing.
- **Would never say.** Why the cycle exists, what the Reapers are, what synthetic life is for (§1.7 item 3). A possession imperative or any of its signature imperatives and insults (§1.7 item 2). A threat with a mechanism in it. A reaction to damage. Shepard's name more than once across the seven scenes.
- **Relationships.** Organics: a category. Shepard: an anomaly it refuses to treat as one. Sovereign: never mentioned. The other Reapers: "the chorus", "the harvest"; it speaks for them and does not need them to answer.
- **Channel.** `reaper`.
- **Sample lines (original).**
  - (Final Battle · `reaper`, after the volley) "Your weapons have been counted. The count is insufficient."
  - (Harbinger Falls · `reaper`, as the coalition shifts to it) "You concentrate on one vessel. The harvest is not one vessel."
  - (Harbinger Falls · `reaper`, after an allied capital kill) "A loss is a measurement. We have measured you before."
- **FIXED** (`ADOPTION_PLAN.md` §22.2; reproduced in §3.4): caption "Your resistance will be corrected." (scene 1, 64.0 s); mission kill "This cycle is not concluded."; destroyed, one of: "This vessel ends. The harvest does not." / "You have removed one voice. The chorus remains." / "Count this. It changes nothing."
- **AU variant.** `HARBINGER · AU` in AU scenes; the voice is identical in both continuities, which is the point.

### 2.12 Sovereign (`SOVEREIGN`)

- **Role and situation.** *Battle of the Citadel* — the only Reaper present; a geth fleet escorts it; it is docked at the Tower while the fleet fights (scenario briefing). At most two broadcast lines in the scene, and none that restate anything it told Shepard on Virmire (its origin, nature or purpose: §1.7 item 3 and canon secrecy). *Every other scene* — destroyed in 2183, in both continuities (in Apex by a prepared Citadel defence, pitfall 1 of the continuity checklist); never a speaker again.
- **Voice.** The §3 rules, colder and more singular than Harbinger: impersonal statements first, "I" only when nothing else serves, never "we" for itself. It calls the fleet "your fleet", the Citadel "the structure"; it does not say what the structure is for. Lines of six to ten words.
- **Wants.** The structure. Time. Nothing from the fleet.
- **Would never say.** Its name for its kind, the relay's purpose, the Catalyst, Saren's status, anything about the Tower fight. A reaction to the Fifth Fleet beyond arithmetic.
- **Relationships.** The geth: instruments, unmentioned. Saren: unmentioned (the scene does not depict him; §5.6). The fleet: a delay.
- **Channel.** `reaper`.
- **Sample lines (original).**
  - (Battle of the Citadel · `reaper`, as the Fifth Fleet arrives) "More hulls. The arithmetic does not change."
  - (Battle of the Citadel · `reaper`, under concentrated fire) "Your fleet is a delay. Delays are permitted."
- **FIXED.** Destroyed transmission (`ADOPTION_PLAN.md` §22.2): "Your victory is a rounding error." — the line the `flagship_destroyed` event carries when the scene's conventional kill lands (the scene declares the kill as the simulation's estimate, §5.6).
- **AU variant.** None in the seven scenes.

### 2.13 Alliance fleet controllers and battlegroup commanders

One voice sheet for `SWORD_CONTROL`, `HAMMER_CONTROL`, `FIFTH_FLEET`, `KILIMANJARO` and `OMAHA`; situation and samples per id.

- **Voice (all).** Textbook brevity: callsign, message, acknowledgement. Passive voice for status, imperative for orders, nothing for feelings. Numbers as counts, bearings, marks and windows. Loss reports flat and complete. Nobody on these nets ever cheers; a confirmed kill is a target change (§1.4).
- **Would never say (all).** A name the scene's table does not fix (§5.4). A figure from the Apex tables. "Cap", "limit". The forbidden HADES wording (§1.6): on these nets a HADES round is "a penetrator" and its effect "the burst".
- **`SWORD_CONTROL`** — *Final Battle* (canon) and every AU Sol scene: Hackett's voice when he is not speaking; the volley window, the screens, the loss reports; `alliance_fleet` (canon) or `coalition` (AU).
  - "All Sword elements, window open. Spinal weapons release."
  - "Sword control: Republics screen, hold your interval. The gap is where they will come."
  - "Sword control to all: two cruisers lost, left of centre. Screens close up."
  - (AU) "Sword control: Black Fleet, your mark is the capital already under Hierarchy fire."
- **`HAMMER_CONTROL`** — *Final Battle* (canon) and *Harbinger Falls* (AU): the ground net's controller, `hammer`; Anderson's net when he is not on it.
  - "Hammer control to Sword: shuttles are down and dispersing. Keep the sky loud."
  - (AU) "Hammer control: ground batteries report the landing zone quiet. Say again, quiet."
- **`FIFTH_FLEET`** — *Battle of the Citadel* and *Earth Falls*: the Fifth Fleet's flag deck or controller; `alliance_fleet`.
  - (2183) "Fifth Fleet is through the relay. Form on the flag. Citadel Fleet, we hold your left."
  - (2183) "Fifth Fleet to Ascension: we are on your port side. Pull back through us."
  - (Earth Falls) "Fifth Fleet, fall back by squadrons. Transports first. Nobody waits for a straggler."
  - (Earth Falls) "Fifth Fleet: the harvest group is on the terminator. Our cruisers are inside its arc."
- **`KILIMANJARO`** — the SSV Kilimanjaro's captain (the hull is fixed by name in the canon Final Battle and in scene 1; the captain is unnamed in canon and stays unnamed). *Final Battle*: the volley anchor. *Refuse*, *Harbinger Falls*: the Titan gun and the forced HADES strike. `alliance_fleet` / `coalition`.
  - (Final Battle) "Kilimanjaro has the solution. Standing by for the window."
  - (Final Battle) "Kilimanjaro took a beam across the forward plating. Holding. Guns are still ours."
  - (AU) "Kilimanjaro, penetrator away. Spotting for the burst."
  - (AU) "Burst confirmed inside the hull. Its weapon arm is off the line."
  - (AU) "Kilimanjaro at point-blank. Broadside batteries on the destroyer. Everything else keeps its target."
- **`OMAHA`** — the SSV Omaha's captain (AU; `INTEGRATION_NOTES.md`: the lead ship of the Alliance super-dreadnought line, a spinal-cannon standoff hull that holds the outer band of its range and never closes to broadside). Speaks only in a scene whose fleet table fields `alliance_super_dreadnought` ×1 (scene 1's table does not); `coalition`.
  - "Omaha holds the outer band. Bow solution on the command vessel. Firing on the mark."
  - "Omaha stays long. If it comes to us, it comes through the whole line first."
  - "Second channel loaded. Omaha fires on the Kilimanjaro's count, not ours."
  - "Omaha: the command vessel is turning out of our arc. We are turning with it."

### 2.14 Primarch Victus (`VICTUS`) and the Hierarchy voices (`CITADEL_FLEET`, `HIERARCHY_COMMAND`)

- **Role and situation.** *Battle of the Citadel* — the Citadel Fleet's turian commander is unnamed (`CITADEL_FLEET`; Victus is not Primarch in 2183 and is not placed). *Final Battle* — canon does not establish where Victus is during the battle, so Sword's turian contingent speaks as `HIERARCHY_COMMAND` (unnamed). *AU* — Victus commands the Hierarchy contingent at Sol on `coalition` (an AU placement; `VICTUS · AU`).
- **Voice.** Turian military formality. "The line" is the sacred noun. Short, flat, no boast; courtesy to allies exact and brief. Palaven is in every calculation and never in a speech. One dry remark per scene is allowed for Victus; none for the unnamed voices.
- **Wants.** The line to hold its interval. The mark. Palaven.
- **Would never say.** A speech about honour. The faction comms' rallying tag for Palaven as a cry (the HUD comms may say it; a cinematic line does not, §1.7 item 5). A count of the enemy.
- **Relationships.** Hackett: equal; Victus takes the mark and gives the line. Garrus: known; no line needed. The Illusive Man (AU): Victus accepts the Black Fleet beside his ships on the record, once, and watches it.
- **Channel.** `citadel_fleet` (2183), `alliance_fleet` (canon Final Battle, as a liaison on the Sword net), `coalition` (AU).
- **Sample lines (original).**
  - (`CITADEL_FLEET`, 2183) "Citadel Fleet, hold the approaches. The geth screen is the way to it."
  - (`CITADEL_FLEET`, 2183) "Hierarchy cruisers on the flagship's near arm. Keep its attention off the Ascension."
  - (`HIERARCHY_COMMAND`, Final Battle) "Hierarchy line in position. Spinal batteries loaded, holding for the window."
  - (`VICTUS`, Black Fleet) "Hierarchy line acknowledges the Cerberus formation. They hold the gap; we hold the mark."
  - (`VICTUS`, Harbinger Falls) "Our cruisers are inside its arms. Tell your dreadnoughts to aim past us."
  - (`VICTUS`, aftermath) "Victus to Hackett. The line held its interval. That is the whole report."

### 2.15 Matriarch Lidanya, Destiny Ascension (`LIDANYA`)

- **Role and situation.** *Battle of the Citadel* — captain of the Destiny Ascension (canon); the Council is aboard (canon); the ship is under fire until the Fifth Fleet intervenes (the scene's declared assumption: saved, §5.6). *Final Battle* — the Ascension is present under the declared assumption; its captain in 2186 is not established, so the tag reads `DESTINY ASCENSION` and the sheet's voice is the bridge's, not Lidanya's by name. *AU* — the Ascension is at Sol (scene 1 table); Lidanya by name is an AU fixing (`LIDANYA · AU`); the Erebus interposes for her at 36.5 s and she withdraws at 42.5 s after one salvo.
- **Voice.** Asari command cadence: full, calm sentences; the ship is "Ascension"; exact about barrier state and losses; the Council's safety reported once and never again. No prayer, no exclamation, no goddess.
- **Wants.** The ship's main gun to fire once more. The Council off her bridge. The screen to hold long enough.
- **Would never say.** Panic. A speech. A claim about Thessia (canon: it falls; the Final Battle scene is after it, and she does not mention it; AU: unstated, §5.7).
- **Relationships.** Hackett: "Admiral Hackett", allied equal. The Fifth Fleet (2183): gratitude shown as a report of where to shoot. Erebus (AU): acknowledged, never thanked on the net; "We will not waste it."
- **Channel.** `citadel_fleet` (2183), `alliance_fleet` (canon Final Battle, liaison), `coalition` (AU).
- **Sample lines (original).**
  - (2183) "Ascension to Citadel Fleet. Our barriers are at a third. The Council remains aboard."
  - (2183) "Fifth Fleet, Ascension. We see you. Take the pressure off our port side."
  - (Final Battle, bridge voice) "Ascension in the Republics screen. Main gun has the centre capital. Holding for the window."
  - (AU, Black Fleet) "Ascension to the Cerberus cruiser on our bow: understood. We will not waste it."
  - (AU) "Ascension withdrawing to the recovery station. Our main gun fires once more on the way."
- **FIXED.** Destroyed transmission (`ADOPTION_PLAN.md` §22.2): "Ascension is lost. Hold the line for Thessia."; reaction: "The Ascension is gone. Close ranks." — only if a scene ever lets the hull die, which none of the seven does by design.

### 2.16 The Council (`TEVOS`, `SPARATUS`, `VALERN`, `COUNCILLOR_HUMAN`)

- **Role and situation.** *AU, The Refuse at Sol only* — the establishing beat may carry at most two `insert` captions on `council` showing the refusal that names the scene: the Crucible plans are judged a Reaper trap and refused (`ADOPTION_PLAN.md` §1.3, history line 9). The insert is undated (the sources fix no date for the Refuse) and framed as a record, not a flashback with faces. *Canon 2183* — the Council is aboard the Ascension; it does not speak on a fleet net. *Every other scene* — none.
- **Composition.** Tevos (asari), Sparatus (turian), Valern (salarian): canon. The human councillor: canon seats a human after 2183; the person is player-dependent in canon, so the tag is `HUMAN COUNCILLOR` and no line names anyone (§5.6). In the Apex continuity the Ascension was saved in 2183 (it is at Sol), so the original three survive and the human seat exists; the AU speaks all four.
- **Voices.** Tevos: diplomatic; long sentences cut to budget; speaks of consensus and time. Sparatus: blunt, military, sceptical; counts ships. Valern: analytical, fast; likelihoods as words ("likely", "exactly where"); the STG's man. The human councillor: political, plain; Earth and the yards. None of them use the dismissive gesture or the dismissal gag the trilogy made the Council's signature (§1.7 item 2).
- **Would never say.** A speech. "In canon." A figure (the yard numbers are captions). A promise of victory.
- **Channel.** `council`.
- **Sample lines (original, AU).**
  - (`SPARATUS`) "A weapon from the enemy's own archive, found when they wanted it found. No."
  - (`TEVOS`) "The Council declines the device. The fleets we have built are the answer we trust."
  - (`VALERN`) "The plans are incomplete in exactly the places a trap would be. We refuse."
  - (`COUNCILLOR_HUMAN`) "Earth's yards are at war tempo. We fight with what we made, not with what we found."

### 2.17 Cerberus officers (`PROMETHEUS`, `EREBUS`) — AU only

- **Role and situation.** `PROMETHEUS`: captain of the Black Fleet flagship Prometheus (`NAMES.cerberus_dreadnought[0]`; scene 1's table fields Prometheus and Eos). `EREBUS`: captain of the heavy cruiser Erebus (scene 1 `HC1`): interposes for the Ascension at 36.5 s, is hit at 39 s, is crippled at 78 s and commits to the drive run at 80.5 s (impact 94.5 s). Both speak on `cerberus` and `coalition`; neither exists in a canon scene.
- **Voice.** Cerberus discipline: clipped, exact, no sentiment. They obey the allied mark and say so. "The Illusive Man" is how they name him; "sir" when answering him. The drive run's own voice stays matter-of-fact; the sacrifice is in the picture, never in the words (card 21: silent, no heroic pose).
- **Wants.** The mark. The corridor clear. The telemetry shared so nobody can say the Black Fleet hid anything.
- **Would never say.** A speech. A farewell line (§1.7 item 8). A yield, a gigaton, a figure. The forbidden HADES wording; Titan guns carry "penetrators", held for degraded targets.
- **Relationships.** The Illusive Man: obeyed without comment. Sword control and Hackett: the mark comes from them; Prometheus acknowledges it as an Alliance mark, on the record. Lidanya: Erebus does not wait for thanks.
- **Sample lines (original, AU).**
  - (`PROMETHEUS` · `coalition`) "Prometheus to Sword control. Black Fleet in the gap, on your mark, firing solutions shared."
  - (`PROMETHEUS` · `cerberus`) "Prometheus: Titan magazines full. We hold the penetrators for degraded targets, as agreed."
  - (`EREBUS` · `coalition`) "Erebus taking station between the Reaper and the Ascension. Keep shooting past us."
  - (`EREBUS` · `cerberus`) "Erebus: hull is gone below the third deck. Engines answer. Clearing a corridor for a run."
  - (`EREBUS` · `cerberus`) "Corridor is clear. Erebus is committed. Keep the lane empty."
- **FIXED (scene 1 captions, not lines).** `CERBERUS BLACK FLEET — ALLIED IFF CONFIRMED · AU` (18.5 s), `DAMPING FAILURE. TERMINAL VECTOR CONFIRMED.` (80 s), `BLACK FLEET DRIVE ATTACK — CAPITAL KILL CONFIRMED · AU` (95.5 s).

### 2.18 The Valkyrie's captain (`VALKYRIE_CAPTAIN`) — AU only, Alliance

- **Role and situation.** Captain of the SSV Normandy Valkyrie, the 2,000 m Normandy-lineage command dreadnought (AU LOCK). The pack fixes the arrangement: the captain and watch officers run the ship; Shepard commands the mission element; Hackett commands the fleet. No source names the captain, so the tag is the hull's (`SSV VALKYRIE · AU`). *Valkyrie Earns Its Shot*: the Nova Array and the three heavy Thanix channels on a target whose barrier the escorts have already degraded; the shot is earned, never casual. *Harbinger Falls*: a line ship in the concentration.
- **Voice.** A capital-ship captain's deliberate pace. Heat, channels, conditions. The ship is "Valkyrie"; EDI is addressed by name and trusted with the channels. Respects Shepard's mission authority and keeps the ship's.
- **Wants.** The condition met before the shot. The screens close. The heat down afterwards.
- **Would never say.** That the Valkyrie can hide (signature 3.0, ECM 0.3: everyone can see it). That one shot kills an intact Reaper (the degraded-target rule is the ship's whole doctrine). A figure. The legacy Nova (not mounted under Apex core; a scene never mentions it).
- **Channel.** `valkyrie`, `coalition`.
- **Sample lines (original, AU).**
  - "Valkyrie to escorts: strip that barrier on the port quarter. We fire when it fails."
  - "Nova loaded. Channels one through three hot. Waiting for the condition, not for permission."
  - "Spinal impact confirmed. Thanix on the same section. Watch it fail."
  - "Valkyrie is heavy and slow and everybody can see us. Keep the screens close."
- **FIXED.** Destroyed transmission (`ADOPTION_PLAN.md` §22.2): "Valkyrie to all ships: the line is yours." — only if a scene lets the hull die; none of the seven does.

### 2.19 Quarian voices: Admiral Shala'Raan (`RAAN`) and Admiral Han'Gerrel (`GERREL`)

- **Role and situation.** *Final Battle* (canon) — the Migrant Fleet detachment is at Sword only under the declared assumption of §5.6 (peace or quarian victory at Rannoch); the liveships are never at Sol. Raan is the Admiralty's voice on the Sword net; Gerrel's survival is a further player-dependent fact, so the canon scene prefers Raan. *AU* — the Rannoch joint command exists (early settlement); both speak on `coalition`.
- **Voices.** Raan: measured, formal; maternal only in cadence; "the Fleet" is her noun; counts hulls; restrains Gerrel in one clause. Gerrel: Heavy Fleet; aggressive; wants to close; counts kills; obeys the mark after he has said what he thinks of it.
- **Would never say.** The quarian exclamation (§1.7 item 2). A speech about Rannoch or the homeworld. A figure. Anything about the Rannoch incident the trilogy depicts (canon: not relevant at Sol; AU: it never happened).
- **Relationships.** Hackett: "Admiral Hackett". Tali: Raan is formal with her on the net; Gerrel does not address her. The geth (AU): Raan accepts their cover on the record; Gerrel does not comment on it, which is his acceptance.
- **Channel.** `alliance_fleet` (canon, as liaisons on the Sword net), `coalition` (AU).
- **Sample lines (original).**
  - (`RAAN`, Final Battle) "Migrant Fleet detachment on station. Heavy Fleet forward, patrol hulls on the flank."
  - (`RAAN`, Final Battle) "Raan to Sword control: the liveships are not here. Everything we brought can be spent."
  - (`RAAN`, AU) "Raan to the geth wedge: your cover is noted. Hold it until our heavies are clear."
  - (`GERREL`, AU) "Gerrel. Our heavies are in range. Give us a target and get out of the way."
  - (`GERREL`, AU) "Heavy Fleet is closing on the destroyer screen. Keep the capitals off us for one minute."

### 2.20 The geth (`GETH`) — Legion-pattern phrasing rules

- **Role and situation.** *Final Battle* (canon) — the geth fleet is at Sword only under the declared assumption of §5.6 (the geth survived Rannoch); one voice for the consensus. *AU* — alive and allied (early settlement); the stacked wedge covers the Migrant Fleet; the consensus speaks on `coalition`.
- **Phrasing rules.** One voice, plural: "we" for the consensus; "this platform" or "these hulls" for the ships; never "I". No contractions, no idiom, no humour, no emotion. Sentences state the consensus and the action: "Consensus reached. We hold." Numbers small and exact ("three hulls", "one minute"), never figures. The Reapers are named by their tracking designation (`{des}` token) or as "the Reaper capital"; the quarians as "the Migrant Fleet" or "the quarian hulls". The signature constructions the trilogy gave the geth — the hyphenated rank address for Shepard, the geth's own names for the quarians and for the Reapers — are not used (§1.1 recognition test); the register is carried by the grammar, not by borrowed nouns.
- **Would never say.** An opinion about organics. A victory. A virus, an upload, a shutdown of the Reapers (pitfall 8 of the continuity checklist: the geth improve execution and logistics; Reaper autonomy stays dangerous).
- **Channel.** `alliance_fleet` (canon, liaison), `coalition` (AU).
- **Sample lines (original).**
  - "Geth consensus: the wedge is in position. We will absorb the destroyer screen."
  - "The capital on the left is turning on the quarian heavies. We are interposing."
  - "Consensus reached. We hold this position until the quarian hulls are clear."
  - (Harbinger Falls, aftermath) "Harbinger's signal has ceased. The others have not. Our assessment is unchanged."
