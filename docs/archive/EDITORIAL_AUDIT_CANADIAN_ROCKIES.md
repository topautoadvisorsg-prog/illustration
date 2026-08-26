# Editorial & Storytelling Audit — THE WILDLANDS: Canadian Rockies

**Status:** Audit complete. No manuscript changes or regenerations have been made. Everything below is a proposal awaiting approval.

**Scope:** Front matter (Introduction) + all 8 chapters, full page-by-page pass against the four-category rubric (Editorial / Structural / Illustration / Educational), run as 9 parallel independent chapter audits then consolidated here.

**Method:** Audited from the manuscript source text (`readingFieldText`), not the rendered images — this is a content/pedagogy pass, not an illustration-QA pass (that's the separate `verify-text-fidelity.ts` / `batch-ai-review.ts` tooling).

---

## Executive Summary

| Classification | Approx. count |
|---|---|
| Editorial (voice/tone/thin intros) | ~25 |
| Structural (density, needs splitting) | ~20 |
| Illustration (missing instructional art) | ~35 |
| Educational (safety-relevant content gaps) | ~6 |

**The book is not weak at the sentence level.** Almost every chapter has genuinely strong prose — vivid hooks, real voice, a closing passage that lands emotionally. The problems are structural and systemic, not "bad writing":

1. **No chapter carries a real chapter-level introduction.** Every chapter (front matter Introduction aside) opens cold into its first entry. The closing passages consistently do the framing work the openers should have done — several chapters literally end with the synthesis they never started with.
2. **A handful of high-stakes "how-to" pages are severely overloaded.** Chapter 8 (Bushcraft) is the worst case: knots/lashings (8 techniques), shelter (site selection + 2 full builds), and water (4 distinct skills) are each crammed onto a single page. This is the one chapter that likely needs real expansion, not just polish.
3. **The book has almost no instructional illustration**, despite being full of content that is inherently visual: species/track/antler comparisons, dangerous look-alike pairs (mushrooms, plants), knot-tying steps, shelter-building stages, first-aid techniques, terrain/navigation diagrams. This is the single largest opportunity in the whole audit — illustration findings outnumber every other category combined.
4. Several life-safety topics are under-resourced relative to their stakes: spinal injury (2 sentences), tourniquet use (1 clause), false-hellebore young-shoot identification (missing entirely), the honey-mushroom/deadly-Galerina pairing (the manuscript itself calls this "the single best teacher of the most important rule" but gives it standard page space).
5. A few production artifacts leaked into reader-facing text: `(Expert verification needed.)` appears at least 5 times across chapters 1, 6, 7, and 8 and needs resolving before print regardless of this audit.

**On "First Aid from the Land":** no page by that name exists in Chapter 7 (confirmed by direct search) or Chapter 8. The closest match is Chapter 8's plant-medicine page (yarrow, resin, tea, balm — CH08_P006), which likely is what was meant. Flagged in the Chapter 8 section below.

---

## Part 1 — Findings by Chapter

### Front Matter (Introduction)
*Scope: FM_007–FM_014. Copyright/TOC/glossary/index skipped as pure reference.*

- **FM_007/009/010/012 — Structural.** Orphaned-heading pattern repeats 4 times: a heading lands at the bottom of a page with no body text before the break. *Fix: apply the same orphan-heading rule already used elsewhere in the pipeline.*
- **FM_010 — Structural.** One page crams 6 content units (structure summary, reading-order note, 3-zone list, zone tip, verification paragraph, next heading). *Fix: split into 2 pages.*
- **FM_010 — Illustration.** Montane/Subalpine/Alpine zones given as a flat 3-line text list, right after FM_008 already covered the same concept narratively. *Fix: small annotated mountain cross-section graphic, previewing the fuller Ch.1 diagram.*
- **FM_012 — Editorial.** The Indigenous-history note ("removal of the people who had always lived in them") is sandwiched between a mushroom-safety warning and a foraging-law note — tonal whiplash on a topic the book calls foundational. *Fix: give it a standalone page / lead position.*
- **FM_010–013 vs. FM_004–005 — Editorial/Structural.** The Introduction's safety and legal notes substantially restate the dedicated Disclaimer pages within 7 pages of each other. *Fix: consolidate; keep one authoritative version, point to it from the other.*
- **FM_004 — Structural (broken reference).** Promises a back-matter note "A Note on Expert Reviewers" that doesn't exist in the back matter index. *Fix: verify/create it, or remove the promise.*

**Chapter verdict:** Bookends (FM_007 opening, FM_014 closing) are genuinely strong. The middle six pages are an organization problem — too many short admin notes back-to-back, redundant with existing disclaimers, at the cost of the one topic (Indigenous history) that deserved real space.

---

### Chapter 1 — "I. Know Your Region" (22 pages)

- **CH01_P001 — Structural/Educational.** Opens straight into Continental Divide geography; the chapter's real thesis ("elevation is destiny... learn to read your elevation and you can read the whole range") doesn't appear until page 21 of 22 — backloaded instead of framing. *Fix: foreshadow the elevation/life-zone thesis in the opener.*
- **CH01_P001_c1/_c2 — Illustration.** 8 named landmarks described in prose with spatial relationships ("strung along it like beads"). *Fix: labeled regional overview map.* (+1 page)
- **CH01_P002_c1 — Structural + Illustration.** One page carries both the tectonic thrust-fault story AND 4 glacial landform terms (horn/arête/cirque/trough/moraine). *Fix: split into 2 pages, each with its own diagram (thrust-fault step diagram; labeled glacial-landform panorama).* (+1 page)
- **CH01_P003_c1 — Editorial (production).** Live placeholder in reader text: *"(Expert verification needed.)"* on glacier travel. *Fix before print.*
- **CH01_P003_c1 — Illustration.** Crevasse/snow-bridge hazard (invisible from above) described only in words. *Fix: cutaway diagram.*
- **CH01_P004_c1/_c2 — Structural + Illustration.** Orphaned thunderstorm paragraph + dense Winter/Spring entries (avalanche stats, denning/calving). Scattered seasonal timing facts (calving, rut, hyperphagia, avalanche season) across 4 paragraphs. *Fix: move thunderstorm para back to climate section; add a seasonal hazard/wildlife calendar graphic.* (+1 page)
- **CH01_P005_c1 — Editorial.** Text claims it will "tell the harder part of the story honestly" (Indigenous displacement) but gives it ~2 sentences — thinner than the paragraphs around it. *Fix: expand to match its own stated weight.* (possible +1 page)
- **CH01_P007_c2 — Structural.** Hazard 3 (Glacial Rivers — explicitly "forgetting it drowns people") gets the least space of any of the 7 hazards. *Fix: rebalance hazard section.* (+1 page)
- **CH01_P007 (Hazards 1/3/4) — Illustration.** Bear defensive-vs-predatory response, river-crossing technique, and avalanche burial-survival stats all described only in prose for genuinely high-stakes decisions. *Fix: decision diagram (bear), step-by-step crossing diagram, survival-curve + slope-angle graphic (avalanche).*
- **CH01_P008/_c1 — Illustration (highest priority in chapter).** The three-zone elevation model — the book's stated organizing idea — has zero illustration. *Fix: labeled vertical cross-section spread (montane/subalpine/alpine, treeline, krummholz, representative species).* (+1 page)

**Chapter verdict:** Strong voice throughout; the issue is architecture — thesis buried at the end, several 2-concept pages, one production placeholder, and near-zero illustration support for the most visual/spatial content (which is most of the chapter).

---

### Chapter 2 — "II. Animals" (57 pages, largest chapter)

- **CH02_P001 — Structural/Educational.** No dedicated chapter intro found — opens cold into grizzly bear. *Fix: confirm whether one exists elsewhere; if not, add one framing the category ordering and entry structure.* (+1 page if missing)
- **Recurring pattern, ~9 entries (ground squirrels, marmot, pika, chipmunk, grouse, raven, dipper, etc.) — Editorial.** Strong italic hooks followed by flat, checklist-style bodies ("Colonies riddle open meadows... Bold beggars.") — a real gap versus the predator entries (bear/wolf/moose), which sustain narrative voice throughout. *Fix: bring these up to the established standard, even 1-2 more sentences each.*
- **CH02_P025 (raven) — Editorial.** Best hook in the chapter, but no Behaviour section at all — omits the well-known raven/wolf scavenging relationship, a natural fit for this book's voice. *Fix: add it.*
- **CH02_P027 (dipper) — Editorial.** Hook promises underwater hunting behavior the body never actually describes. *Fix: add the paragraph.*
- **CH02_P001/P002 — Illustration.** Grizzly-vs-black-bear ID (hump, face profile, claw length) explained twice in parallel prose blocks. *Fix: one side-by-side silhouette comparison, cross-referenced from both.*
- **~14 entries across the chapter — Illustration (highest-value single finding in this chapter).** Track ID (bear/cougar/wolf/coyote/wolverine/beaver/moose/elk) is taught in isolated prose per-entry with no way to compare. *Fix: consolidated "tracks of the Rockies" comparison plate.* (+1 page)
- **CH02_P009–014 — Illustration.** Antler/horn shape (the primary ID differentiator for 6 large mammals) explained piecemeal, never shown together. *Fix: single comparison illustration.* (+1 page, or inset at no cost)
- **CH02_P018 — Illustration.** Chipmunk-vs-ground-squirrel face-stripe test — the text nearly writes its own caption. *Fix: simple two-panel comparison, no page cost.*
- **CH02_P001_c2/P002_c1/P003_c1/P008_c1/P009_c1 — Illustration.** Safety-critical body postures (bear play-dead, cougar stand-tall, moose warning signs) described only in prose. *Fix: pictogram-style diagrams — highest-stakes content in the chapter deserves the clearest format.*
- **CH02_P029–033 — Illustration.** 5 fish species distinguished by spot color/fin shape, with real legal consequences (catch-and-release rules differ by species) for misidentification. *Fix: fish-ID comparison plate.* (+1 page or inset)
- **CH02_P009_c1 (moose) — Structural.** One page carries habitat/diet + 2 danger seasons + winter ecology + full tracks-and-sign, denser than sibling entries which split tracks into their own subsection. *Fix: match the established template.* (+1 page if fully split)
- **CH02_P025/P027 — Structural (minor).** Raven and dipper skip the standard "Danger level: None" line every other safe species includes. *Fix: template consistency.*

**Chapter verdict:** The marquee predator entries (bear/wolf/moose, first 9 pages) are excellent. Past that, voice quality drops for smaller mammals/birds — same hook quality, weaker bodies. Track/antler/fish ID information is taught redundantly across many separate entries where a handful of consolidated comparison plates would work far better.

---

### Chapter 3 — "III. Plants" (42 pages)

- **CH03_P013 — Structural/Editorial (author-flagged, confirmed).** "Medicine & Useful Plants" section intro is exactly 2 sentences (~70 words) alone on a full page before jumping into entries — no WHY, no scene-setting, despite later entries in the same section (yarrow, Labrador tea) clearly knowing how to hook a reader. *Fix: expand with a grounding image (a cut hand, a cold night) before the plant list.*
- **CH03_P017 — Editorial.** Same defect as P013 for the toxic-plants intro, and undersells scope ("two of them can kill you" when the section spans 7 entries across 3 risk tiers). *Fix: broaden the preview.*
- **CH03_P001→P002 — Structural.** The chapter's largest section (10 edible-berry entries, ~20 pages) has no intro or hand-off at all.
- **CH03_P019 (false hellebore) — Educational (safety gap).** Text stresses the dangerous confusion happens at the "young emerging" stage, but the ID section only describes the *mature* plant — no young-shoot cues given, which is the one moment people actually die from this mix-up. *Fix: add young-shoot ID + expand to 2 pages.* (+1 page)
- **CH03_P012 (spring beauty) — Structural.** Single page, missing the "Practical uses" section every peer entry has, despite real historical material (actively harvested Indigenous food source) sitting unused. (+1 page)
- **CH03_P022 (monkshood) — Structural (minor).** Thinner than its "deadly plant" peers (hemlock, camas, baneberry all get 2 pages); flagged for pagination consistency, not a hard requirement.
- **CH03_P005/P009 — Editorial/Structural.** Both entries front-load content onto page 1, leaving page 2 with only a single short paragraph and real unused space.
- **6 entries (Labrador tea, yarrow, water hemlock, false hellebore, death camas, cow parsnip) — Illustration (primary finding, life-safety).** The chapter's most lethal identification calls are taught entirely in prose, including one entry that admits "plant-identification apps have been filmed confidently misidentifying this plant." *Fix: dedicated comparison diagrams for the 3 highest-lethality pairs (water hemlock vs. edible umbels, false hellebore vs. corn, death camas vs. wild onion).*

**Chapter verdict:** Individual entries already have real narrative hooks — criterion 1 is largely handled. The weakness is structural: both section-level intros are afterthoughts, 3 entries are inconsistently under-paginated (one with an actual safety gap), and the deadliest look-alike pairs have zero visual support.

---

### Chapter 4 — "IV. Trees" (24 pages)

- **CH04_P001 / chapter-wide — Structural/Editorial.** No chapter-level intro; opens straight into lodgepole pine. The closing meditation does the synthesis work the opener never did. *Fix: short frame up front (elevation-as-altimeter, the embracer/resister/avoider fire-strategy system).*
- **CH04_P004 (white spruce) — Editorial.** Sharp quality drop right after the chapter's strongest entry (Engelmann spruce) — ID collapses to "same spruce rules as its cousin," flat inventory prose. *Fix: bring to standard, or merge P003+P004 into one "Two Spruces" spread.*
- **CH04_P003/_c1, P004, P005/_c1 — Illustration.** The spruce-vs-fir ID test (square/rolls/pegs vs. flat/won't-roll/scars) is explained via near-duplicate mnemonics 3 separate times. *Fix: one diagram, referenced by all three entries.*
- **CH04_P001/P007 — Illustration.** Needle-bundle count (2 vs. 5) called "the instant giveaway" twice in prose across separated entries. *Fix: small bundle-count comparison graphic.*
- **CH04_P002 — Illustration.** Douglas-fir's signature 3-pronged cone bract described only via simile ("like a mouse diving in"). *Fix: labeled cone close-up.*
- **CH04_P008/P012 — Illustration.** Aspen-vs-birch bark confusion stated in full on both entries independently. *Fix: one shared diagram.*
- **CH04_P007_c1 — Illustration.** Whitebark-vs-limber pine (both 5-needle) distinguished only by a subtle behavioral cue (cone opens or not). *Fix: small comparison diagram.*
- **CH04_P006 — Illustration.** Larch's tufted-needle growth pattern vs. a pine's fixed bundles, described only in prose. *Fix: small diagram.*

**Chapter verdict:** Best-voiced chapter in the early book — most entries already carry real narrative hooks and a strong closer. Two real gaps: no chapter intro, and white spruce is a depth trough between two of the chapter's best entries. Otherwise mostly illustration opportunities (ID tests repeated in prose 2-3× when one diagram would do it once).

---

### Chapter 5 — "V. Fungi & Mushrooms" (30 pages)

- **CH05_P001 — Structural.** No chapter intro; opens directly into king bolete. Doesn't preview why fungi matter, mycorrhizal/decomposer ecology, or the chapter's own safety logic ("learn the four killers before the eight edibles" — a line that exists in the *closer* and should be echoed up front). (+1 page likely)
- **Every entry (P001–P009) — Editorial (chapter-wide pattern).** Strong sensory hooks cut abruptly, with zero transition, into clinical "What it is" field-guide prose. *Fix: one bridging sentence per entry — low-effort, high-consistency.*
- **CH05_P003_c1 (true vs. false morel) — Illustration (highest priority in chapter).** The deadliest, most famous look-alike pair described only in words (honeycomb pits/clean hollow vs. brain-folds/chambered interior). *Fix: sliced side-by-side comparison illustration.*
- **CH05_P002_c1 — Illustration.** Chanterelle false-gills vs. 2 toxic true-gilled look-alikes, prose only. *Fix: cross-section comparison.*
- **CH05_P006_c1/P013_c1 — Illustration.** Puffball-vs-Amanita-egg test described vividly but only in words on both cross-referencing pages. *Fix: one shared cross-section illustration.*
- **CH05_P009/P016 (honey mushroom / deadly Galerina) — Illustration + Structural.** The manuscript itself calls this pairing "the single best teacher of the most important rule... learn them together" — yet the two entries sit 4 pages apart with no shared visual, and both openers are unusually feature-dense relative to peers. *Fix: shared comparison illustration bridging the two entries; consider a dedicated 3rd "compare" page.* (possible +1 page)
- **CH05_P013–016 (all 4 deadly Amanitas) — Illustration.** Ring/volva/gill-attachment — the load-bearing ID features across all 4 — described in prose every time, no anatomy diagram anywhere. *Fix: one labeled "anatomy of a deadly Amanita" diagram, placed on P012 which has room.*
- **CH05_P015 (fly agaric) — Structural.** Only entry in the chapter with no continuation page, despite fame and genuine toxicity, sitting oddly next to 2-page treatments of much lower-stakes fungi (chaga, Ganoderma). (+1 page)
- **CH05_P007/_c1 — Editorial.** Single ID fact (soft teeth) restated near-verbatim 3 times across 2 pages with little else added.
- **CH05_P009_c1 — Editorial (production).** Verification placeholder embedded mid-sentence in body prose rather than in the header tag like every other flagged entry.
- **Unassigned closing text — Structural (data gap).** The chapter's closing meditation carries no page key at all; the chapter's stated page budget already sums exactly to 30 — needs a definitive page assignment, possibly +1 page.

**Chapter verdict:** Real prose strength (hooks, closer) undercut by zero chapter intro, uniformly abrupt hook-to-reference transitions, and — most importantly — the chapter's own stated most-important safety pairing (honey mushroom/Galerina) and its deadliest single pair (true/false morel) both taught in prose only, with no illustrated look-alike comparisons anywhere despite this being explicitly the highest-stakes ID chapter in the book.

---

### Chapter 6 — "VI. Terrain & Navigation" (23 pages)

- **CH06_P001 — Educational.** Opener establishes why elevation matters but gives no roadmap for the chapter's actual scope (crossings, glaciers, avalanche, rockfall, winter hazards, navigation, weather, comms).
- **CH06_P001_c1 — Illustration.** Contour-line steepness and aspect (sun/shade, snow retention, lee-loading) both explained in prose only — canonical diagram cases. *Fix: topo diagram + valley cross-section.* (+1 page if both get full treatment)
- **CH06_P003_c1 — Editorial.** Six named lakes listed back-to-back, flattens into a directory entry.
- **CH06_P006/_c1 — Structural/Editorial (highest priority, avalanche).** The deadliest hazard in the chapter drops into flat bullets (the only other voice-drop besides P009) and stacks recognizing-terrain (3 sub-topics) + gear + forecast-checking onto one page. *Fix: restore narrative voice; split terrain-recognition from gear/planning.* (+1 page)
- **CH06_P006_c1 — Illustration.** Avalanche terrain recognition (slope angle, lee loading, terrain traps) — highest-value diagram opportunity in the chapter, currently zero art. *Fix: labeled slope-angle diagram with safe-zone marking.*
- **CH06_P002/P006 — Structural (production).** Live "(Expert verification needed.)" tags on the two most life-safety-critical topics (glacier travel, avalanche stats).
- **CH06_P009/_c1 — Structural.** Navigation-tools list drops into bullets right after a strong opener line; the continuation page then stacks 5 distinct skills (map/compass basics, declination, dead reckoning, terrain association, tech-fails trap) onto one page — for comparison, avalanche gets 2 full pages for less material. *Fix: split into 2 pages.* (+1 to +2 pages)
- **CH06_P009_c1 — Illustration.** Dead reckoning ("leapfrogging" bearings) and terrain association, core spatial-reasoning skills, prose only. *Fix: sequence diagram + terrain-association panel — second-highest-value illustration in the chapter.*
- **CH06_P010/_c1 — Structural.** Season coverage imbalanced: opener covers only Spring; continuation crams Summer/Fall/Winter/synthesis onto one page, compressing real safety content (rut caution, chinook danger). (possible +1 page)
- **CH06_P011 — Illustration.** 4 distinct sky/cloud signals described in prose only. *Fix: small illustrated reference panel.*

**Chapter verdict:** Best-voiced of the hazard-heavy chapters, but voice consistently drops exactly where content gets technical (avalanche, navigation tools) — which is also where density and missing illustration are worst. Fixing those two sections would address most of the chapter's issues. Estimated growth: 23 → ~25-27 pages.

---

### Chapter 7 — "VII. Survival & First Aid" (15 pages)

**No "First Aid from the Land" page found in this chapter** (confirmed by direct search) — see Chapter 8 note above; likely refers to CH08_P006.

- **CH07_P001_m — Structural/Editorial.** Chapter opener is also a compacted page — rule-of-threes triage framework immediately followed by the dense "Seven Rules" checklist, no scene-setting at all. *Fix: real narrative opener; split rules checklist onto its own page.* (+1 page)
- **CH07_P003 — Structural (highest priority, life-safety).** One page carries bear-avoidance prevention + initial-encounter behavior + 4 distinct attack-response branches (defensive/predatory/black bear/the shift between them) — the single highest-stakes decision tree in the book, not even flagged `_m`. *Fix: split prevention from attack-type response.* (+1 page)
- **CH07_P004_c1 — Editorial.** Strong closing line on hypothermia ("not dead until warm and dead") immediately undercut by an abrupt pivot into frostbite in the same block. *Fix: give frostbite its own section break.*
- **CH07_P012_m — Structural/Educational (highest priority in chapter).** Sprains/fractures + head injury + spinal injury compressed onto one page. Spinal injury — "wrong choice = paralysis" — gets exactly 2 sentences, no stabilization guidance. *Fix: split into 2+ pages; give spinal injury real treatment.* (+1 to +2 pages)
- **"Wound Care and the Long-Carry-Out Reality" (unmarked page) — Structural/Educational.** 4 topics bulleted with no connective prose (breaks from the chapter's usual style); tourniquet use for catastrophic bleeding — where incorrect technique is dangerous — reduced to one clause with no placement/mechanism/timing detail. *Fix: split tourniquet content into its own properly-illustrated entry.* (+1 page)
- **"Emergency Signaling and Rescue" (unmarked page) — Structural.** 5 sub-topics stacked as flat bullets; ground-to-air signal shapes described in words only.
- **Altitude/AMS page — Structural (verify).** This and the two pages above carry no `CH07_Pxxx` marker and the surrounding planned-page numbers run consecutively with no gap — flag for the pipeline team to confirm these have real, independent page allocations and aren't silently overflowing onto neighboring pages.
- **CH07_P007 — Editorial (production).** Live verification placeholder on the avalanche section.
- **Illustration, chapter-wide (grouped) — Illustration.** Near-total absence of instructional art in a chapter that's almost entirely physical technique: bear play-dead position, shelter cutaways, avalanche self-arrest position, river self-rescue swimming position, hypothermia-wrap/heat-pack placement, EpiPen injection site, splinting technique, tourniquet placement, ground-to-air symbols. Highest-value three: **bear play-dead position, tourniquet technique, ground-to-air symbols.**

**Chapter verdict:** Voice is strongest at the bookends and in the sections that got real room (hypothermia, shelter). The `_m` pages and 3 unmarked sections compress genuinely distinct, high-stakes medical topics with minimal connective tissue — and CH07_P012_m under-resources spinal injury, the single highest-consequence call in the book. This chapter should expand, not just get polished — estimate +3 to +4 pages.

---

### Chapter 8 — "VIII. Bushcraft & the Living Forest" (10 pages — shortest chapter, most severe density problem in the book)

- **CH08_P001 — Structural/Editorial.** Opens as a fire-only mini-intro, never frames the chapter's actual breadth (shelter/water/food/medicine/tools/knots/weather/Indigenous knowledge).
- **CH08_P001/P002 — Illustration.** Fire-lay progression, spruce-bough torch technique, batoning, and feather-stick carving — all hands-on physical techniques — described only in prose.
- **CH08_P003 "Shelter from the Land" — Structural, HIGH PRIORITY, author-flagged & confirmed.** One page stacks site selection/hazard-reading + materials + full lean-to construction + full debris-shelter construction. Site selection alone (avalanche terrain, flash-flood gullies, widow-makers, cold sinks) is a complete skill squeezed into a paragraph next to two full builds. *Fix: split into 3 pages (site selection, lean-to, debris shelter), each with a staged-build diagram.* **(+2 pages)**
- **CH08_P004 "Water from the Land" — Structural, HIGH PRIORITY, author-flagged & confirmed.** One page stacks terrain/plant water-finding + quality judgment + birch sap tapping (a wholly separate seasonal skill) + winter snow/ice procedure. *Fix: split into 2 pages with tapping-setup and winter-water diagrams.* **(+1 page)**
- **CH08_P005 — Structural (lower priority).** 5 food categories as an equally-weighted bulleted list, reads as checklist rather than a foraging walkthrough. (+0-1 page, optional)
- **CH08_P006 "First Aid / plant medicine" — Editorial + production.** Live verification placeholder; 5 plant-medicine entries as a flat list despite genuinely interesting material (yarrow's old name "soldier's woundwort") going underused. **This is almost certainly the page the author meant by "First Aid from the Land."**
- **CH08_P007 — Structural.** Cordage-making + tool sharpening + 4 carved camp tools all on one page — 3 legitimate standalone skill areas. *Fix: split cordage from tools/carving; illustrate the reverse-wrap technique (described as "the root skill behind all natural rope" with zero visual support).* **(+1 page)**
- **CH08_P008 "Knots" — Structural + Illustration, HIGHEST PRIORITY IN THE BOOK, direct author requirement.** 5 knots (bowline, clove hitch, timber hitch, trucker's hitch, taut-line hitch) + 3 lashings (square, diagonal, tripod) — 8 distinct binding techniques — compressed onto ONE page, each given a single sentence describing what it *does*, never how to *tie* it. This is precisely "list, don't show." *Fix: expand into a dedicated 3-page knots-and-lashings section with real step-by-step tied-sequence diagrams for every knot and lashing named.* **(+2 to +3 pages — single highest-value expansion in the entire audit)**
- **CH08_P009 — Editorial (positive benchmark).** Genuinely strong voice ("a sudden midday hush in the alpine is worth heeding") — use this page's tone as the model when revising the flatter list pages.
- **CH08_P010 — Editorial (positive benchmark).** Best-written material in the chapter (Indigenous acknowledgment + Kochanski closer). Consider a callback to it in the reframed chapter opener.
- **Chapter-wide — Editorial.** Nearly every page follows an identical bolded-term/colon/bullet scaffold with minimal connective prose — this pattern, more than any individual weak sentence, is what makes the chapter read as reference material.

**Chapter verdict:** Sentence-level writing is competent, occasionally excellent (fire closer, weather page, Kochanski closer) — but this is the clearest case in the book of page-count pressure overriding pedagogy. Given the volume and safety-criticality of what it's teaching in 10 pages, **this chapter should grow to roughly 16-18 pages** (+6 to +8 pages), concentrated in shelter (+2), water (+1), cordage/tools (+1), and knots/lashings (+2 to +3).

---

## Part 2 — Regeneration Plan

**Nothing below has been executed.** This is the proposal for approval before any manuscript edits or paid re-renders happen.

| Priority | Chapter | Pages affected | Reason | Recommended change | Page-count impact | Illustration needed |
|---|---|---|---|---|---|---|
| **P0** | 8 | P008 (Knots) | 8 knots/lashings on 1 page, described not shown — direct author requirement | Split into 3 pages: (bowline/clove/timber), (trucker's/taut-line), (3 lashings) | +2 to +3 | Full tied-sequence diagram for every knot/lashing (8 diagrams) |
| **P0** | 8 | P003 (Shelter) | Site selection + 2 full builds on 1 page — author-flagged | Split into 3 pages: site selection, lean-to, debris shelter | +2 | Hazard-reading diagram; staged build diagrams ×2 |
| **P0** | 8 | P004 (Water) | 4 distinct skills incl. a seasonal technique on 1 page — author-flagged | Split into 2 pages: finding/judging water, sap-tapping + winter procedure | +1 | Tapping-setup diagram; winter water-setup diagram |
| **P0** | 7 | P012_m (fractures/head/spine) | Spinal injury — highest-consequence call in the book — gets 2 sentences | Split sprains/fractures from head/spinal injury; expand spinal guidance | +1 to +2 | Stabilization technique diagram |
| **P0** | 7 | Wound Care page (tourniquet) | Catastrophic-bleeding tourniquet use reduced to 1 clause | Give tourniquet/bleeding its own entry | +1 | Tourniquet placement/windlass diagram |
| **P1** | 7 | P003 (bear attack response) | Single highest-stakes decision tree in the book, compressed to 1 page | Split prevention from attack-type response | +1 | Bear play-dead position diagram; decision tree |
| **P1** | 5 | P003_c1 (morel), P009/P016 (honey mushroom/Galerina) | Deadliest look-alike pairs in the book, prose-only | Add comparison illustrations; consider dedicated compare-page for the Galerina pairing | +0 to +1 | Sliced morel comparison; honey-mushroom/Galerina comparison |
| **P1** | 3 | P019 (false hellebore) | Young-shoot ID — the actual danger window — is missing | Add young-shoot cues, expand to 2 pages | +1 | Young-shoot vs. corn comparison |
| **P1** | 8 | P007 (cordage/tools) | 3 skill areas on 1 page; foundational cordage technique has zero art | Split cordage from tools/carving | +1 | Reverse-wrap step diagram |
| **P2** | 1 | P008/_c1 (life zones) | Book's stated organizing idea has zero illustration | Dedicated illustrated cross-section spread | +1 | 3-zone vertical cross-section |
| **P2** | 2 | Tracks, antlers/horns, fish ID (multiple pages) | Same ID information retaught in prose across many entries | Consolidated comparison plates (3 total) | +2 to +3 | Track plate; antler/horn plate; fish-ID plate |
| **P2** | 6 | P006/_c1 (avalanche), P009_c1 (navigation) | Highest-stakes terrain content, weakest prose + zero art | Restore voice; split density; add diagrams | +2 to +3 | Slope-angle/terrain-trap diagram; dead-reckoning + terrain-association diagrams |
| **P3** | All | Every chapter opener except front matter | No chapter carries a real introduction — thesis/synthesis lands in the closer instead | Add 2-4 sentence framing to each chapter opener | +0 to +1 per chapter | — |
| **P3** | Multiple | CH01_P003_c1, CH06_P002/P006, CH07_P007, CH08_P006 | Live `(Expert verification needed.)` placeholders in reader-facing text | Resolve verification, remove bracket | 0 | — |

**Rough total page-count impact if everything above is adopted: +25 to +35 pages** across the 243-page book, concentrated almost entirely in Chapter 8 (+6 to +8) and the illustration-comparison-plate additions in Chapters 2, 3, 5, 6.

---

## Part 3 — Cross-Book Illustration Pattern

The single biggest recurring theme across all 9 audits: **the same category of content (dangerous look-alike pairs, ID comparisons, physical technique) is taught in prose, repeatedly, across many separate entries, when one consolidated illustration would teach it once and better.** Good candidates for a reusable "comparison plate" treatment:

- Track identification (Ch. 2) — bear/cougar/wolf/coyote/wolverine/beaver/moose/elk
- Antler/horn comparison (Ch. 2) — 6 large mammals
- Fish ID (Ch. 2) — 5 species by spot/fin pattern
- Conifer needle/cone ID (Ch. 4) — spruce/fir roll test, needle-bundle counts
- Deadly plant look-alikes (Ch. 3) — water hemlock, false hellebore, death camas vs. edible counterparts
- Deadly mushroom look-alikes (Ch. 5) — true/false morel, chanterelle/false-gill species, honey mushroom/Galerina, Amanita anatomy
- Knot/lashing step sequences (Ch. 8) — 8 techniques
- Shelter build stages (Ch. 8) — lean-to, debris shelter
- First-aid technique diagrams (Ch. 7) — bear play-dead, tourniquet, splinting, ground-to-air signals
- Terrain/navigation diagrams (Ch. 1, Ch. 6) — life zones, contour steepness, avalanche terrain, dead reckoning

---

## Part 4 — Proposed Future Manuscript QA Rules

For the Manuscript QA platform, to catch this class of issue automatically before illustration begins on future books:

1. **Thin chapter/section intro detector** — flag any chapter or named section whose opening block, before the first entry/subheading, is under some word-count threshold (e.g. <150 words).
2. **Content-density detector** — flag any single page whose reading-field text contains more than N distinct bolded lead-in terms / H-level headings (proxy for "teaching several unrelated things at once").
3. **Orphaned-heading detector** — flag any page where a heading is the last line before a page break with no body text following it on the same page.
4. **Unillustrated technique/comparison detector** — flag prose containing comparison language ("distinguished by," "unlike," "vs.," "look-alike," step-sequence verbs like "first... then... finally") that has no corresponding illustration cue in the page's decorative/illustration metadata.
5. **Duplicate-disclaimer detector** — flag near-duplicate safety/legal boilerplate appearing in more than one section of the same book (e.g. via text-similarity check between designated "note"/"disclaimer" blocks).
6. **Reference-manual voice detector** — flag entries/pages whose body text is predominantly bullet-list structure with minimal connective prose, especially when adjacent entries in the same chapter use full narrative sentences (voice-consistency check).
7. **Unresolved-placeholder detector** — hard gate before ship: fail the build if `(Expert verification needed.)` or similar bracketed production notes remain anywhere in `readingFieldText`.
8. **Safety-stakes proportionality flag** — for content tagged with hazard/danger metadata already in the pipeline (`badgeContext.hazard`), flag pages where word count is unusually low relative to sibling high-hazard entries in the same chapter — a proxy for "this dangerous topic got compressed."

---

*Audit performed 2026-08-02 by 9 parallel review passes (front matter + chapters 1-8) against manuscript source text, consolidated into this report. Awaiting approval before any regeneration work begins.*
