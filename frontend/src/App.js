import { useEffect, useMemo, useState } from "react";
import "@/App.css";

// Pre-fill the live backend so the admin page is ready to test without hunting for
// the URL. REACT_APP_BACKEND_URL (set in Railway) overrides this when present.
const DEFAULT_BACKEND_URL = "https://wildlandsbackend-production.up.railway.app";
const configuredBackend = process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL;

// Pipeline phases you can "talk to" in the operator console.
const PHASES = ["Ingest", "Manifests", "Plan", "Text-Fit", "Images", "Review", "Render"];
const DEV_ISSUES_KEY = "wildlands_dev_issues";
const INTELLIGENCE_TYPES = [
  ["", "All Intelligence"],
  ["EXPERIMENT", "Experiments"],
  ["DECISION", "Decisions"],
  ["STANDARD", "Standards"],
  ["SOP", "SOP Library"],
  ["COST_RECORD", "Cost Tracking"],
  ["PRINT_REVIEW", "Print Reviews"],
  ["LESSON", "Lessons Learned"],
];

const RELATION_TYPES = [
  "DERIVED_FROM",
  "PRODUCED_DECISION",
  "PROMOTED_TO_STANDARD",
  "UPDATES_SOP",
  "SUPERSEDES",
  "EVIDENCED_BY",
  "AFFECTS",
  "RELATED_TO",
];

function loadDevIssues() {
  try {
    return JSON.parse(localStorage.getItem(DEV_ISSUES_KEY) || "[]");
  } catch {
    return [];
  }
}

const LAYOUT_TEMPLATES = [
  ["LAYOUT_1_STANDARD", "Standard", "Balanced text and illustration", 220, 320, 420],
  ["LAYOUT_2_TEXT_HEAVY", "Text Heavy", "Long entries with smaller art", 420, 560, 720],
  ["LAYOUT_3_ILLUSTRATION_DOMINANT", "Image Dominant", "Short text with a strong plate", 90, 160, 240],
  ["LAYOUT_4_DANGER_WARNING", "Comparison Recognition", "Two related subjects compared for quick visual recognition", 240, 340, 460],
  ["LAYOUT_5_CHAPTER_OPENER", "Chapter Opener", "Atmospheric opening page", 40, 90, 150],
  ["LAYOUT_6_BACK_MATTER", "Reference Grid", "Three specimen studies with open educational text space", 260, 420, 620],
  ["LAYOUT_7_SCATTERED_VIGNETTES", "Reference Studies", "Three staggered specimen studies with text flow", 160, 240, 340],
  ["LAYOUT_8_MARGIN_ILLUSTRATION", "Margin Art", "Tall plant or side illustration", 300, 430, 580],
  ["LAYOUT_9_DIAGNOSTIC_DIAGRAM", "Scattered Studies", "Central primary study with supporting studies around it", 180, 280, 400],
  ["LAYOUT_10_FULL_PAGE_PLATE", "Full Page Plate", "Nearly full-page museum plate illustration", 0, 40, 90],
  ["LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD", "Continuous Landscape Spread", "Two-page environmental landscape spread", 0, 60, 140],
  ["LAYOUT_12_DIAGNOSTIC_DIAGRAM", "Diagnostic Diagram", "Central subject diagram with restrained callouts", 180, 280, 400],
  ["LAYOUT_13_FEATURE_BANNER", "Feature Banner", "Wide horizontal feature illustration over educational text area", 260, 420, 620],
  ["LAYOUT_14_SIDEBAR_FEATURE", "Sidebar Feature", "Large left-side vertical illustration with open right text area", 300, 460, 640],
  ["LAYOUT_15_PROGRESSION_STUDY", "Progression Study", "Sequential stages over an open educational text area", 220, 340, 500],
  ["LAYOUT_16_CUTAWAY_FEATURE", "Cutaway Feature", "Layered cutaway illustration over an open educational text area", 180, 300, 440],
];

const VINTAGE_NATURALIST_DNA = `VINTAGE NATURALIST

MASTER STYLE DNA v1.0

This block defines the permanent visual identity of the Vintage Naturalist publishing system.

All future layout instructions and subject instructions must inherit this visual language.

This block defines style only.

It does not define subject matter, specimen type, page structure, composition arrangement, illustration placement, typography placement, or educational purpose.

Those instructions are supplied separately.

Create imagery in the style of a premium collector's edition natural history atlas.

The visual language should blend antique botanical illustration, historical naturalist field journals, museum specimen plates, scientific atlases, wilderness archive collections, and explorer notebooks.

The artwork should feel documented, preserved, collected, and curated.

Draw inspiration from historical natural history illustration traditions, antique botanical atlases, museum natural history collections, explorer field journals, scientific specimen plates, and wilderness archival documentation while remaining entirely original and never recreating copyrighted artwork, illustrations, or compositions.

Rendering style: watercolor illustration, naturalist ink work, delicate linework, museum-quality specimen rendering, subtle brush textures, hand-crafted appearance, scientific elegance, archival craftsmanship.

Surface characteristics: warm parchment paper, archival paper textures, subtle aging, natural paper grain, collector-edition presentation.

Color characteristics: muted earth tones, restrained saturation, botanical greens, woodland browns, parchment creams, faded natural pigments, soft natural color transitions.

Supporting visual language: naturalist annotations, specimen markings, field observations, scientific callouts, explorer notes, collection references, observational markings. These elements should feel archival and observational rather than modern or graphic.

Avoid modern infographic aesthetics, glossy commercial design, digital poster aesthetics, contemporary UI styling, comic-book styling, fantasy aesthetics, hyper-saturated colors, and artificial visual effects.

Emotional tone: timeless, scholarly, elegant, educational, exploratory, museum quality, collectible, archival.

The viewer should feel they are examining a rare plate from a beautifully preserved natural history collection.`;

const LAYOUT_SYSTEM_RULES = `LAYOUT SYSTEM RULES

Treat the selected layout as a strong reference template, not a rigid rule. Minor composition adjustments are allowed when they improve readability, subject presentation, or overall page quality.

Preserve future text areas above all else. Do not allow illustrations, background elements, diagrams, labels, decorative details, or environmental elements to consume areas intended for written educational content. When in doubt, leave more negative space.

Do not generate readable text by default. The only permitted image text is an explicit subject-name label supplied by the prompt. If a label is used, render exactly the supplied label text, large and legible, with no extra words. Do not render paragraphs, article text, captions, educational content, fake encyclopedia text, page numbers, headers, reference notes, or unrequested labels.

Use minimal annotation only when structurally necessary. Limit callouts to 0-2 major, obvious educational features per subject. Avoid dense labeling systems, technical breakdowns, scientific poster layouts, and small-detail callouts.

Layouts define image placement, negative space, reading flow, content zones, and visual hierarchy. They do not define subject matter, article content, or detailed scientific analysis.

Prioritize readability over visual density. A simpler image with protected text placement is preferred over a beautiful image that consumes the content area.

Subject-specific flexibility is allowed for mountains, rivers, mushrooms, trees, animal tracks, ecosystems, and other wilderness subjects, as long as the intended text zones remain clear.

Negative space is intentional. Do not fill empty areas simply because space is available.

Final rule: the educational knowledge belongs primarily in the written article. The illustration supports the lesson; it does not replace it.`;

function withLayoutSystemRules(prompt) {
  return `${prompt}\n\n${LAYOUT_SYSTEM_RULES}`;
}

const LAYOUT_1_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- Upper left quadrant contains the primary illustration.
- Upper right quadrant contains a secondary study illustration.
- Lower two-thirds of the page is reserved for educational text content.
- Small annotation callouts connect illustrations to the text area.
- A small field-guide information box appears near the bottom corner.
- Botanical or ecological supporting sketches are scattered lightly around the illustrations.

Visual balance:
- Top 35% illustration zone.
- Bottom 65% clean text zone.

Composition notes:
{COMPOSITION_NOTES}

Leave large clean areas for future text placement.
The page should read from top to bottom in a clear educational flow.
Museum-quality wilderness field guide layout.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_2_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- Top 15% contains a clean title area.
- Center 70% is reserved almost entirely for educational text content.
- Small supporting illustrations appear in the outer margins.
- Tiny scientific diagrams appear between sections.
- Bottom 15% contains reference notes and callouts.

Visual balance:
- Left and right margins contain visual support.
- Central column remains largely empty for future text placement.

Composition notes:
{COMPOSITION_NOTES}

Prioritize readability and information density.
Leave the central reading column clean and usable for body text.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_3_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- A large hero illustration occupies the upper right portion of the page.
- The hero illustration serves as the primary visual focal point.
- A large open content area remains on the left side and lower portion of the page.
- Small educational callouts may connect to the illustration.
- One or two supporting studies may appear near the hero illustration if helpful.

Visual balance:
- Approximately 60% of the page contains illustration elements.
- Approximately 40% remains clear for educational text placement.
- Preserve substantial blank space within the composition.
- Avoid allowing the illustration to fill the entire page.
- Maintain a strong distinction between visual and content areas.

Composition notes:
{COMPOSITION_NOTES}

The page should showcase a dramatic primary illustration while preserving ample space for educational content.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_4_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page comparing {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- Upper section contains two side-by-side comparison illustrations.
- Left side contains Subject A.
- Right side contains Subject B.
- Simple comparison callouts highlight only the most important distinguishing features.
- Avoid excessive labels, arrows, or technical breakdowns.
- Focus on quick visual recognition rather than detailed analysis.

Visual balance:
- Top 60% contains the comparison area.
- Bottom 40% remains largely clear for educational text placement.
- Leave generous negative space in the lower section.
- Maintain a clean and organized layout.

Composition notes:
{COMPOSITION_NOTES}

The page should help readers quickly understand the major differences between two related subjects while preserving substantial space for educational content.
Museum-quality wilderness field guide presentation.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_5_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a cinematic chapter-opening page for a premium wilderness encyclopedia.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- A large atmospheric environmental illustration occupies the upper 60% of the page.
- The lower 40% remains intentionally clear and largely empty.
- Do not place paragraphs, captions, labels, annotations, callouts, or educational content in the lower section.
- Do not generate readable text anywhere on the page.
- The lower section should function as reserved space for future chapter content.
- Maintain a clean transition between the illustration and the open content area.

Visual flow:
- Upper 60% contains the primary environmental artwork.
- Lower 40% remains mostly blank with generous negative space.
- Avoid clutter, diagrams, specimen studies, or supporting illustrations.
- Preserve a premium editorial presentation.

Include:
- cinematic wilderness scene
- environmental storytelling
- atmospheric depth
- strong sense of scale

Composition notes:
{COMPOSITION_NOTES}

The page should feel immersive, inspirational, and expansive while preserving a large open area for future chapter content.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_6_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- Upper 60% contains three educational specimen studies.
- One study is positioned in the upper left.
- One study is positioned in the upper center.
- One study is positioned in the upper right.
- Each study includes a small label and minimal scientific annotation.
- Maintain generous spacing between studies.

Visual balance:
- Top 60% serves as the reference illustration area.
- Bottom 40% remains largely clear for educational text placement.
- Avoid dense grids or crowded collections.
- Avoid excessive labels and callouts.
- Preserve strong negative space throughout the page.

Composition notes:
{COMPOSITION_NOTES}

The page should function as a quick-reference educational overview rather than a complete identification chart.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_7_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- Three educational specimen studies distributed vertically throughout the page.
- One study is positioned near the upper left area.
- One study is positioned near the center right area.
- One study is positioned near the lower left area.
- Each study includes a small label and minimal scientific annotation.
- Avoid dense grids or collection-box layouts.

Visual balance:
- Studies should alternate positions to create visual flow.
- Maintain generous negative space between studies.
- Preserve a large continuous area for educational text.
- Allow text to naturally flow around the specimen studies.
- Avoid overcrowding any section of the page.

Composition notes:
{COMPOSITION_NOTES}

The page should feel like an educational encyclopedia spread rather than a scientific catalog.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_8_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- Rightmost 25% contains one tall vertical illustration.
- Left 75% remains reserved for educational text.
- Small annotations extend from the illustration into the text area.

Visual balance:
- Keep the right illustration tall, elegant, and vertically composed.
- Preserve the left text area as the dominant readable zone.
- Use a strong editorial magazine layout with refined natural history styling.

Composition notes:
{COMPOSITION_NOTES}

Strong editorial magazine layout.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_9_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- One primary illustration positioned near the center of the page.
- Three smaller supporting studies distributed around the primary illustration.
- Supporting studies should vary in size and placement.
- Small labels and minimal annotations accompany each study.

Visual balance:
- The primary illustration serves as the focal point.
- Secondary studies create visual interest without forming a rigid grid.
- Maintain generous negative space throughout the page.
- Preserve substantial areas for educational text placement.
- Allow text to flow naturally between visual elements.

Composition notes:
{COMPOSITION_NOTES}

The page should feel dynamic, educational, and visually engaging while remaining highly readable.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_10_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a full-page illustration.

Subject:
Fog Rolling Through a Pine Forest

Page structure:
- The illustration occupies nearly the entire page.
- Only minimal labels.
- No large text areas.

Composition notes:
{COMPOSITION_NOTES}

Museum plate presentation.
Preserve the Vintage Naturalist identity while making the page feel like a collectible full-page natural history plate.
Do not render final body text, page numbers, titles, captions, or typography.`;

const LAYOUT_11_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a two-page encyclopedia landscape spread for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- Landscape extends continuously across both pages.
- Small callouts are placed along the lower edge.
- Upper portion remains visually uninterrupted.
- Emphasize environmental scale.

Visual balance:
- Preserve the upper landscape as a broad, uninterrupted atmospheric field.
- Keep callouts restrained and low on the page.
- Use the full spread to communicate wilderness scale and habitat context.

Composition notes:
{COMPOSITION_NOTES}

Museum-quality natural history landscape spread.
Do not render final body text, page numbers, titles, captions, or typography.`;

const LAYOUT_12_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- A large central subject occupies the upper portion of the page.
- Simple callout lines identify only the most important features.
- Limit annotations to major educational points.
- Avoid excessive labels, arrows, or technical breakdowns.
- Supporting diagrams may appear in corners if helpful, but should remain secondary.

Visual balance:
- Upper 60% contains the primary diagram and callouts.
- Lower 40% remains largely clear for educational text placement.
- Maintain generous negative space.
- Preserve a clean and organized presentation.

Composition notes:
{COMPOSITION_NOTES}

The page should help readers quickly identify and understand the most important characteristics of the subject without overwhelming them with detail.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_13_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- A wide horizontal illustration spans the upper portion of the page.
- The illustration acts as a visual header for the topic.
- Minimal callouts may appear within the illustration.
- The lower portion of the page remains primarily reserved for educational content.

Visual balance:
- Upper 35-40% contains the feature illustration.
- Lower 60-65% remains largely clear for text placement.
- Maintain strong separation between image and content areas.
- Preserve generous reading space.

Composition notes:
{COMPOSITION_NOTES}

The page should provide immediate visual context before transitioning into educational content.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, labels, captions, or typography.`;

const LAYOUT_14_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- A large vertical illustration occupies the left side of the page.
- The illustration should remain contained to approximately one-third of the page width.
- The remaining two-thirds of the page should remain largely clear and open.
- Do not fill the open area with additional illustrations, diagrams, labels, annotations, maps, or decorative elements.
- Do not generate readable text anywhere on the page.
- The open area should function as reserved space for future educational content.

Visual balance:
- Left 35% contains the primary illustration.
- Right 65% remains mostly empty.
- Maintain a strong visual separation between the illustration area and the content area.
- Preserve generous negative space throughout the open area.
- Avoid background elements spilling into the content area.

Composition notes:
{COMPOSITION_NOTES}

The page should showcase a strong supporting illustration while preserving a large uninterrupted area for future text placement.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, labels, captions, annotations, maps, diagrams, or typography.`;

const LAYOUT_15_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- Three to five educational studies arranged in a clear sequence.
- Each study represents a stage, progression, or development.
- Simple labels identify each stage.
- Visual flow should guide the reader naturally through the sequence.

Visual balance:
- Upper 50-60% contains the progression studies.
- Lower 40-50% remains available for educational text.
- Avoid excessive callouts or technical breakdowns.
- Maintain generous spacing between stages.

Composition notes:
{COMPOSITION_NOTES}

The page should clearly communicate change, development, or progression over time.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, captions, or typography.`;

const LAYOUT_16_MASTER_PROMPT = `{MASTER_STYLE_DNA}

Create a single encyclopedia page for {SUBJECT}.

Subject and scientific context:
{SCIENTIFIC_DETAILS}

Page structure:
- A large cutaway or layered illustration occupies the upper portion of the page.
- Simple callouts identify major layers or zones.
- Limit annotations to the most important educational points.
- Supporting studies may appear in corners if helpful.

Visual balance:
- Upper 60% contains the cutaway illustration.
- Lower 40% remains largely clear for educational text placement.
- Maintain clean organization and strong negative space.

Composition notes:
{COMPOSITION_NOTES}

The page should help readers understand internal structure, layers, or hidden relationships within the subject.
Museum-quality natural history encyclopedia presentation.
Do not render final body text, page numbers, titles, captions, or typography.`;

function defaultLayoutPromptAssets() {
  return LAYOUT_TEMPLATES.map(([id, name, description, minWords, targetWords, maxWords], index) => ({
    templateId: id,
    label: name,
    mockupImagePath:
      id === "LAYOUT_1_STANDARD"
        ? "/layout-references/layout-01-standard.png"
        : id === "LAYOUT_2_TEXT_HEAVY"
          ? "/layout-references/layout-02-text-heavy.png"
          : id === "LAYOUT_3_ILLUSTRATION_DOMINANT"
            ? "/layout-references/layout-03-illustration-dominant.png"
            : id === "LAYOUT_4_DANGER_WARNING"
              ? "/layout-references/layout-04-comparison-recognition.png"
              : id === "LAYOUT_5_CHAPTER_OPENER"
                ? "/layout-references/layout-05-chapter-opener.png"
                : id === "LAYOUT_6_BACK_MATTER"
                  ? "/layout-references/layout-06-reference-grid.png"
                  : id === "LAYOUT_7_SCATTERED_VIGNETTES"
                    ? "/layout-references/layout-07-reference-studies.png"
                    : id === "LAYOUT_8_MARGIN_ILLUSTRATION"
                      ? "/layout-references/layout-08-margin-illustration.png"
                      : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
                        ? "/layout-references/layout-09-scattered-studies.png"
                        : id === "LAYOUT_10_FULL_PAGE_PLATE"
                          ? "/layout-references/layout-10-full-page-plate.png"
                          : id === "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD"
                            ? "/layout-references/layout-11-continuous-landscape-spread.png"
                            : id === "LAYOUT_12_DIAGNOSTIC_DIAGRAM"
                              ? "/layout-references/layout-12-diagnostic-diagram.png"
                              : id === "LAYOUT_13_FEATURE_BANNER"
                                ? "/layout-references/layout-13-feature-banner.png"
                                : id === "LAYOUT_14_SIDEBAR_FEATURE"
                                  ? "/layout-references/layout-14-sidebar-feature.png"
                                  : id === "LAYOUT_15_PROGRESSION_STUDY"
                                    ? "/layout-references/layout-15-progression-study.png"
                                    : id === "LAYOUT_16_CUTAWAY_FEATURE"
                                      ? "/layout-references/layout-16-cutaway-feature.png"
        : `layout-${String(index + 1).padStart(2, "0")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`,
    layoutDescription:
      id === "LAYOUT_1_STANDARD"
        ? "Single encyclopedia page. Upper-left primary illustration, upper-right secondary study illustration, lower two-thirds reserved for educational text, small callouts, bottom-corner field-guide box, and light botanical/ecological supporting sketches."
        : id === "LAYOUT_2_TEXT_HEAVY"
          ? "Text-heavy encyclopedia page. Top 15% title area, center 70% reserved for dense educational text, margin support illustrations, tiny diagrams between sections, and bottom 15% reference notes/callouts."
          : id === "LAYOUT_3_ILLUSTRATION_DOMINANT"
            ? "Illustration-dominant encyclopedia page. Upper-right hero illustration is the focal point, while the left side and lower portion preserve open educational content space."
            : id === "LAYOUT_4_DANGER_WARNING"
              ? "Comparison recognition page. Top 60% contains two side-by-side subject illustrations with restrained distinguishing callouts; bottom 40% remains open for educational text."
              : id === "LAYOUT_5_CHAPTER_OPENER"
                ? "Chapter-opening page. Upper 60% atmospheric environmental artwork, lower 40% intentionally blank for future chapter content, no readable text, labels, callouts, diagrams, or supporting studies."
                : id === "LAYOUT_6_BACK_MATTER"
                  ? "Reference grid page. Upper 60% contains three spaced educational specimen studies across left, center, and right; bottom 40% remains open for educational text."
                  : id === "LAYOUT_7_SCATTERED_VIGNETTES"
                    ? "Reference studies page. Three educational specimen studies alternate vertically at upper-left, center-right, and lower-left while preserving a large continuous text flow area."
                    : id === "LAYOUT_8_MARGIN_ILLUSTRATION"
                      ? "Editorial margin illustration page. Rightmost 25% contains one tall vertical illustration; left 75% stays reserved for educational text with small annotations extending inward."
                      : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
                        ? "Scattered studies page. One primary illustration sits near center with three varied supporting studies arranged around it, preserving readable negative space."
                        : id === "LAYOUT_10_FULL_PAGE_PLATE"
                          ? "Full-page museum plate. Illustration occupies nearly the entire page, with only minimal labels and no large text areas."
                          : id === "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD"
                            ? "Continuous two-page landscape spread. Landscape extends across both pages, upper portion uninterrupted, with small lower-edge callouts emphasizing environmental scale."
                            : id === "LAYOUT_12_DIAGNOSTIC_DIAGRAM"
                              ? "Diagnostic diagram page. Upper 60% contains a large central subject with restrained major-feature callouts; lower 40% remains clear for educational text."
                              : id === "LAYOUT_13_FEATURE_BANNER"
                                ? "Feature banner page. Upper 35-40% contains a wide horizontal topic illustration; lower 60-65% remains open for educational text with strong separation between image and content."
                                : id === "LAYOUT_14_SIDEBAR_FEATURE"
                                  ? "Sidebar feature page. Left 35% contains one large vertical illustration; right 65% remains empty and uninterrupted for educational text."
                                  : id === "LAYOUT_15_PROGRESSION_STUDY"
                                    ? "Progression study page. Upper 50-60% contains three to five sequential studies; lower 40-50% remains open for educational text."
                                    : id === "LAYOUT_16_CUTAWAY_FEATURE"
                                      ? "Cutaway feature page. Upper 60% contains a layered or internal-structure illustration with restrained major-zone callouts; lower 40% remains clear for educational text."
        : `${name}: ${description}. Written agent instructions should be refined after analyzing the uploaded mockup.`,
    useCases:
      id === "LAYOUT_1_STANDARD"
        ? ["standard encyclopedia entry", "balanced educational field-guide page", "subject with one primary and one secondary study image"]
        : id === "LAYOUT_2_TEXT_HEAVY"
          ? ["long encyclopedia entry", "information-dense field-guide page", "page requiring maximum central reading space"]
          : id === "LAYOUT_3_ILLUSTRATION_DOMINANT"
            ? ["short entry with strong visual subject", "hero specimen page", "subject needing large artwork presence"]
            : id === "LAYOUT_4_DANGER_WARNING"
              ? ["quick comparison", "look-alike subjects", "related species recognition", "major visual differences"]
              : id === "LAYOUT_5_CHAPTER_OPENER"
                ? ["chapter opener", "section introduction", "landscape-led opening page", "atmospheric transition into content"]
                : id === "LAYOUT_6_BACK_MATTER"
                  ? ["quick-reference overview", "three related specimen studies", "educational reference page", "non-crowded visual summary"]
                  : id === "LAYOUT_7_SCATTERED_VIGNETTES"
                    ? ["reference studies", "flowing encyclopedia spread", "three specimen studies", "text wrapping around studies"]
                    : id === "LAYOUT_8_MARGIN_ILLUSTRATION"
                      ? ["tall vertical subject", "editorial magazine layout", "margin illustration", "large text-heavy educational page"]
                      : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
                        ? ["scattered studies", "central focal subject", "dynamic educational page", "multiple supporting studies"]
                        : id === "LAYOUT_10_FULL_PAGE_PLATE"
                          ? ["full-page illustration", "museum plate", "chapter atmosphere plate", "minimal text page"]
                          : id === "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD"
                            ? ["two-page spread", "environmental scale", "landscape habitat", "chapter atmosphere spread"]
                            : id === "LAYOUT_12_DIAGNOSTIC_DIAGRAM"
                              ? ["diagnostic diagram", "major feature callouts", "identification teaching page", "clean educational breakdown"]
                              : id === "LAYOUT_13_FEATURE_BANNER"
                                ? ["feature banner", "topic opener", "visual header", "medium-to-long educational page"]
                                : id === "LAYOUT_14_SIDEBAR_FEATURE"
                                  ? ["sidebar feature", "tall specimen or habitat subject", "large uninterrupted text area", "supporting illustration page"]
                                  : id === "LAYOUT_15_PROGRESSION_STUDY"
                                    ? ["life cycle", "growth stages", "seasonal sequence", "development over time", "step-by-step educational study"]
                                    : id === "LAYOUT_16_CUTAWAY_FEATURE"
                                      ? ["cutaway feature", "internal structure", "layers or zones", "hidden relationships", "ecosystem cross-section"]
        : [description],
    avoidWhen: ["Do not use if the manuscript text cannot pass text-fit at the configured font size."],
    textZoneDescription:
      id === "LAYOUT_1_STANDARD"
        ? "Bottom 65% of the page is a large clean educational text zone."
        : id === "LAYOUT_2_TEXT_HEAVY"
          ? "Center 70% is reserved almost entirely for dense text placement; keep this central column clean."
          : id === "LAYOUT_3_ILLUSTRATION_DOMINANT"
            ? "Approximately 40% of the page remains clear for educational text, mainly in the left side and lower portion."
            : id === "LAYOUT_4_DANGER_WARNING"
              ? "Bottom 40% remains largely clear for educational text placement, with generous negative space."
              : id === "LAYOUT_5_CHAPTER_OPENER"
                ? "Lower 40% remains intentionally blank and reserved for future chapter content."
                : id === "LAYOUT_6_BACK_MATTER"
                  ? "Bottom 40% remains largely clear for educational text placement."
                  : id === "LAYOUT_7_SCATTERED_VIGNETTES"
                    ? "Preserve a large continuous educational text area that can flow naturally around the staggered studies."
                    : id === "LAYOUT_8_MARGIN_ILLUSTRATION"
                      ? "Left 75% remains reserved for educational text."
                      : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
                        ? "Substantial educational text areas are preserved between and around the scattered visual elements."
                        : id === "LAYOUT_10_FULL_PAGE_PLATE"
                          ? "No large text areas; only minimal labels are expected."
                          : id === "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD"
                            ? "No large body text area; only small lower-edge callouts are expected."
                            : id === "LAYOUT_12_DIAGNOSTIC_DIAGRAM"
                              ? "Lower 40% remains largely clear for educational text placement."
                              : id === "LAYOUT_13_FEATURE_BANNER"
                                ? "Lower 60-65% remains largely clear for educational text placement."
                                : id === "LAYOUT_14_SIDEBAR_FEATURE"
                                  ? "Right 65% remains mostly empty and reserved for future educational content."
                                  : id === "LAYOUT_15_PROGRESSION_STUDY"
                                    ? "Lower 40-50% remains available for educational text."
                                    : id === "LAYOUT_16_CUTAWAY_FEATURE"
                                      ? "Lower 40% remains largely clear for educational text placement."
            : "Balanced text zone based on the uploaded mockup.",
    imageZoneDescription:
      id === "LAYOUT_1_STANDARD"
        ? "Top 35% illustration zone: primary illustration in upper-left quadrant, secondary study illustration in upper-right quadrant, with light supporting sketches and annotation callouts."
        : id === "LAYOUT_2_TEXT_HEAVY"
          ? "Small supporting illustrations in the outer margins, tiny scientific diagrams between sections, and bottom reference callouts."
          : id === "LAYOUT_3_ILLUSTRATION_DOMINANT"
            ? "Approximately 60% of the page contains illustration elements, led by an upper-right hero illustration plus optional nearby supporting studies."
            : id === "LAYOUT_4_DANGER_WARNING"
              ? "Top 60% comparison zone with Subject A on the left and Subject B on the right; use only essential distinguishing callouts."
              : id === "LAYOUT_5_CHAPTER_OPENER"
                ? "Upper 60% contains cinematic environmental artwork with atmospheric depth and strong sense of scale."
                : id === "LAYOUT_6_BACK_MATTER"
                  ? "Upper 60% contains three generously spaced specimen studies positioned upper-left, upper-center, and upper-right with minimal labels."
                  : id === "LAYOUT_7_SCATTERED_VIGNETTES"
                    ? "Three specimen studies alternate vertically: upper-left, center-right, lower-left, each with minimal label/annotation and generous negative space."
                    : id === "LAYOUT_8_MARGIN_ILLUSTRATION"
                      ? "Rightmost 25% contains one tall vertical illustration with small annotations extending into the left text area."
                      : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
                        ? "Primary illustration near center with three smaller supporting studies distributed around it in varied sizes and positions."
                        : id === "LAYOUT_10_FULL_PAGE_PLATE"
                          ? "Nearly the entire page is one atmospheric museum plate illustration."
                          : id === "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD"
                            ? "Continuous landscape spans both pages with an uninterrupted upper field and restrained lower-edge callouts."
                            : id === "LAYOUT_12_DIAGNOSTIC_DIAGRAM"
                              ? "Upper 60% contains the large central diagnostic subject with simple callout lines and optional secondary corner diagrams."
                              : id === "LAYOUT_13_FEATURE_BANNER"
                                ? "Upper 35-40% contains one wide horizontal feature illustration with minimal callouts."
                                : id === "LAYOUT_14_SIDEBAR_FEATURE"
                                  ? "Left 35% contains one contained vertical illustration; avoid spillover into the right content zone."
                                  : id === "LAYOUT_15_PROGRESSION_STUDY"
                                    ? "Upper 50-60% contains three to five sequential educational studies with generous spacing."
                                    : id === "LAYOUT_16_CUTAWAY_FEATURE"
                                      ? "Upper 60% contains one large cutaway or layered illustration with simple major-zone callouts and optional corner studies."
              : "Generated subject art replaces only the mockup image area.",
    capacityNotes: "Update after text-fit testing with the real mockup.",
    minWords,
    targetWords,
    maxWords,
    recommendedBodyPt: id === "LAYOUT_2_TEXT_HEAVY" ? 10.5 : 11,
    recommendedLineHeight: id === "LAYOUT_2_TEXT_HEAVY" ? 1.23 : 1.28,
    promptTemplate: withLayoutSystemRules(
      id === "LAYOUT_1_STANDARD"
        ? LAYOUT_1_MASTER_PROMPT
        : id === "LAYOUT_2_TEXT_HEAVY"
          ? LAYOUT_2_MASTER_PROMPT
          : id === "LAYOUT_3_ILLUSTRATION_DOMINANT"
            ? LAYOUT_3_MASTER_PROMPT
            : id === "LAYOUT_4_DANGER_WARNING"
              ? LAYOUT_4_MASTER_PROMPT
              : id === "LAYOUT_5_CHAPTER_OPENER"
                ? LAYOUT_5_MASTER_PROMPT
                : id === "LAYOUT_6_BACK_MATTER"
                  ? LAYOUT_6_MASTER_PROMPT
                  : id === "LAYOUT_7_SCATTERED_VIGNETTES"
                    ? LAYOUT_7_MASTER_PROMPT
                    : id === "LAYOUT_8_MARGIN_ILLUSTRATION"
                      ? LAYOUT_8_MASTER_PROMPT
                      : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
                        ? LAYOUT_9_MASTER_PROMPT
                        : id === "LAYOUT_10_FULL_PAGE_PLATE"
                          ? LAYOUT_10_MASTER_PROMPT
                          : id === "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD"
                            ? LAYOUT_11_MASTER_PROMPT
                            : id === "LAYOUT_12_DIAGNOSTIC_DIAGRAM"
                              ? LAYOUT_12_MASTER_PROMPT
                              : id === "LAYOUT_13_FEATURE_BANNER"
                                ? LAYOUT_13_MASTER_PROMPT
                                : id === "LAYOUT_14_SIDEBAR_FEATURE"
                                  ? LAYOUT_14_MASTER_PROMPT
                                  : id === "LAYOUT_15_PROGRESSION_STUDY"
                                    ? LAYOUT_15_MASTER_PROMPT
                                    : id === "LAYOUT_16_CUTAWAY_FEATURE"
                                      ? LAYOUT_16_MASTER_PROMPT
            : `{MASTER_STYLE_DNA}\n\nCreate the final illustration for ${name}. Subject: {SUBJECT}. ` +
              `Scientific/diagnostic details: {SCIENTIFIC_DETAILS}. ` +
              `Composition must match the approved mockup image slot for ${id}: ${description}. ` +
              `{COMPOSITION_NOTES} ` +
              `Do not render page text, labels, titles, captions, or typography.`),
    placeholders: ["{MASTER_STYLE_DNA}", "{SUBJECT}", "{SCIENTIFIC_DETAILS}", "{COMPOSITION_NOTES}"],
    textFitRule:
      id === "LAYOUT_2_TEXT_HEAVY"
        ? "Use this when manuscript text is long; art stays secondary and text must remain comfortable."
        : id === "LAYOUT_3_ILLUSTRATION_DOMINANT"
          ? "Use when a dramatic upper-right hero illustration should dominate while preserving open left/lower educational content space."
        : id === "LAYOUT_4_DANGER_WARNING"
          ? "Use for quick recognition pages comparing two related subjects; keep labels restrained and preserve the lower text zone."
        : id === "LAYOUT_5_CHAPTER_OPENER"
          ? "Use for chapter openers only; image generation must leave the lower 40% blank and avoid all readable text, labels, callouts, diagrams, or supporting studies."
        : id === "LAYOUT_6_BACK_MATTER"
          ? "Use for quick-reference overview pages with three specimen studies; avoid crowded chart behavior."
        : id === "LAYOUT_7_SCATTERED_VIGNETTES"
          ? "Use for encyclopedia pages where three staggered specimen studies should create flow while text wraps around them."
        : id === "LAYOUT_8_MARGIN_ILLUSTRATION"
          ? "Use for tall vertical subjects or editorial pages where a right-side illustration strip supports a large left text area."
        : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
          ? "Use for dynamic educational pages with one central focal illustration and three varied supporting studies."
        : id === "LAYOUT_10_FULL_PAGE_PLATE"
          ? "Use for full-page museum plate illustrations with minimal labels and no large text area."
        : id === "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD"
          ? "Use for two-page environmental landscape spreads where scale and uninterrupted atmosphere matter more than text density."
        : id === "LAYOUT_12_DIAGNOSTIC_DIAGRAM"
          ? "Use for clean diagnostic pages that teach only the most important identifying features."
        : id === "LAYOUT_13_FEATURE_BANNER"
          ? "Use when a wide visual header should establish the subject before a generous educational text area."
        : id === "LAYOUT_14_SIDEBAR_FEATURE"
          ? "Use when a strong left-side vertical illustration should support a large clean right-side educational text area."
        : id === "LAYOUT_15_PROGRESSION_STUDY"
          ? "Use when the page needs to explain stages, growth, seasonal change, or development over time."
        : id === "LAYOUT_16_CUTAWAY_FEATURE"
          ? "Use when the page needs to explain layers, internal structure, zones, or hidden relationships."
          : "Fit the real manuscript text into this mockup before generating final art.",
    imageSlotDescription: "Mockup image defines the art slot. Generated art replaces only that slot after text-fit approval.",
    capacityTestStatus: ["LAYOUT_1_STANDARD", "LAYOUT_2_TEXT_HEAVY", "LAYOUT_3_ILLUSTRATION_DOMINANT", "LAYOUT_4_DANGER_WARNING", "LAYOUT_5_CHAPTER_OPENER", "LAYOUT_6_BACK_MATTER", "LAYOUT_7_SCATTERED_VIGNETTES", "LAYOUT_8_MARGIN_ILLUSTRATION", "LAYOUT_9_DIAGNOSTIC_DIAGRAM", "LAYOUT_10_FULL_PAGE_PLATE", "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD", "LAYOUT_12_DIAGNOSTIC_DIAGRAM", "LAYOUT_13_FEATURE_BANNER", "LAYOUT_14_SIDEBAR_FEATURE", "LAYOUT_15_PROGRESSION_STUDY", "LAYOUT_16_CUTAWAY_FEATURE"].includes(id) ? "TESTING" : "UNTESTED",
    operatorNotes:
      id === "LAYOUT_1_STANDARD"
        ? "Mockup attached from layout 1 reference image. Capacity still needs real text-fit approval."
        : id === "LAYOUT_2_TEXT_HEAVY"
          ? "Mockup attached from layout 2 reference image. Capacity still needs real text-fit approval."
          : id === "LAYOUT_3_ILLUSTRATION_DOMINANT"
            ? "Mockup attached from layout 3 reference image. Capacity still needs real text-fit approval."
            : id === "LAYOUT_4_DANGER_WARNING"
              ? "Mockup attached from layout 4 reference image. Capacity still needs real text-fit approval."
              : id === "LAYOUT_5_CHAPTER_OPENER"
                ? "Mockup attached from layout 5 reference image. Capacity still needs real text-fit approval. Prompt remains strict: no readable generated text."
                : id === "LAYOUT_6_BACK_MATTER"
                  ? "Mockup attached from layout 6 reference image. Capacity still needs real text-fit approval."
                  : id === "LAYOUT_7_SCATTERED_VIGNETTES"
                    ? "Mockup attached from layout 7 reference image. Capacity still needs real text-fit approval."
                    : id === "LAYOUT_8_MARGIN_ILLUSTRATION"
                      ? "Mockup attached from layout 8 reference image. Capacity still needs real text-fit approval."
                      : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
                        ? "Mockup attached from layout 9 reference image. Capacity still needs real text-fit approval."
                        : id === "LAYOUT_10_FULL_PAGE_PLATE"
                          ? "Mockup attached from layout 10 reference image. Capacity still needs real text-fit approval."
                          : id === "LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD"
                            ? "Mockup attached from layout 11 reference image. Capacity still needs spread/text-fit approval."
                            : id === "LAYOUT_12_DIAGNOSTIC_DIAGRAM"
                              ? "Mockup attached from layout 12 reference image. Capacity still needs real text-fit approval."
                              : id === "LAYOUT_13_FEATURE_BANNER"
                                ? "Mockup attached from layout 13 reference image. Capacity still needs real text-fit approval."
                                : id === "LAYOUT_14_SIDEBAR_FEATURE"
                                  ? "Mockup attached from layout 14 reference image. Capacity still needs real text-fit approval."
                                  : id === "LAYOUT_15_PROGRESSION_STUDY"
                                    ? "Mockup attached from layout 15 reference image. Capacity still needs real text-fit approval."
                                    : id === "LAYOUT_16_CUTAWAY_FEATURE"
                                      ? "Mockup attached from layout 16 reference image. Capacity still needs real text-fit approval."
        : "Word range is a starting recommendation; approve after real text-fit tests.",
  }));
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

function defaultProjectConfig() {
  return {
    brand: "THE_WILDLANDS",
    audience: "ADULT",
    editions: ["PREMIUM", "KINDLE_EPUB"],
    volume: 1,
    title: "The Wildlands Field Guide",
    subtitle: "New England Volume",
    authorName: "The Wildlands",
    trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
    typography: {
      headingFont: "EB Garamond",
      bodyFont: "EB Garamond",
      captionFont: "Inter",
      bodyPt: 11,
      lineHeight: 1.28,
      smallCaps: true,
    },
    colorPalette: {
      paper: "#f4f1ea",
      ink: "#1b332d",
      accent: "#2f5d50",
      warning: "#9f2d20",
    },
    imageGeneration: {
      masterStyleBlockVersion: "VINTAGE_NATURALIST_DNA_v1.0",
      masterStyleBlockText: VINTAGE_NATURALIST_DNA,
      styleName: "Vintage Naturalist",
      imageModel: "gpt-image-1",
      upscaleModel: "Replicate Real-ESRGAN",
    },
    layoutPolicy: {
      layoutReferenceSet: "wildlands-layout-references-v1",
      textFitFirst: true,
      chapterByChapterRender: true,
      defaultTemplate: "LAYOUT_1_STANDARD",
      longTextTemplate: "LAYOUT_2_TEXT_HEAVY",
      comparisonTemplate: "LAYOUT_4_DANGER_WARNING",
    },
    layoutPromptAssets: defaultLayoutPromptAssets(),
    outputProfile: {
      printEdition: "PREMIUM",
      ebookEdition: "KINDLE_EPUB",
      renderEngine: "PUPPETEER_PAGEDJS",
      pdfTarget: "KDP premium color hardcover",
    },
  };
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function trimNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseJsonRecord(value, fallback = {}) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON value must be an object.");
  }
  return parsed;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read manuscript file."));
    reader.readAsText(file);
  });
}

async function readJson(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.message || `${response.status} ${response.statusText}`);
  }
  return data;
}

const defaultExperimentDraft = {
  title: "Typography Test: 11pt vs 11.5pt",
  hypothesis: "11.5pt body text will improve readability without causing common overflows.",
  testPerformed: "Render representative pages at 11pt and 11.5pt, then compare screen preview and proof output.",
  result: "",
  conclusion: "",
  ownerName: "Operator",
  tags: "typography, readability",
};

const defaultDecisionDraft = {
  title: "Decision: Use OpenAI as primary image generator",
  decision: "Use OpenAI gpt-image-1 as the primary image generator for v1 testing.",
  reason: "It produced the strongest style consistency in early smoke tests.",
  ownerName: "Operator",
  tags: "images, generator",
};

const defaultStandardDraft = {
  title: "Standard: Body text size",
  domain: "Typography",
  standardKey: "body_text",
  valueJson: '{ "font": "EB Garamond", "bodyPt": 11.5, "lineHeight": 1.28 }',
  rationale: "Accepted after readability and text-fit comparison testing.",
  ownerName: "Operator",
  tags: "typography, locked-standard",
};

const defaultSopDraft = {
  title: "SOP: Image Review",
  workflowName: "Image Review SOP",
  bodyMarkdown: "1. Review text-safe negative space.\n2. Confirm no generated article text.\n3. Approve only if subject matches the page context.",
  checklist: "No fake text\nText zones preserved\nSubject matches page\nReady for upscale",
  changeNotes: "Initial operator workflow.",
  ownerName: "Operator",
  tags: "sop, image-review",
};

const defaultCostDraft = {
  title: "Cost: Test image generation",
  provider: "OpenAI",
  model: "gpt-image-1",
  operation: "IMAGE_GENERATION",
  quantity: 1,
  unitCostUsd: 0,
  costUsd: 0,
  ownerName: "Operator",
  tags: "cost, images",
};

const defaultPrintDraft = {
  title: "Print Review: First proof copy",
  proofName: "Wildlands proof copy 1",
  vendor: "KDP",
  format: "Premium color hardcover",
  overallStatus: "OPEN",
  ownerName: "Operator",
  tags: "print-proof, kdp",
};

const defaultLessonDraft = {
  title: "Lesson: Preserve text zones",
  lesson: "Layouts fail when illustration detail consumes the reserved educational text area.",
  prevention: "Run text-fit preview before image spend and keep negative space intentional.",
  appliesTo: "layout planning\nimage prompts\nprint review",
  ownerName: "Operator",
  tags: "layout, image-prompt",
};

function App() {
  const [backendUrl, setBackendUrl] = useState(trimSlash(configuredBackend));
  const [health, setHealth] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectConfig, setProjectConfig] = useState(defaultProjectConfig);
  const [manuscript, setManuscript] = useState(`# CHAPTER 1 - Forest Floor

## Chanterelle

### Identification
Golden yellow mushroom with false gills running down the stem.

### Habitat
Found near hardwoods after summer rain.

### Notes
Use this entry to prove manuscript to manifest generation.`);
  const [manifests, setManifests] = useState([]);
  const [pages, setPages] = useState([]);
  const [plannedPages, setPlannedPages] = useState([]);
  const [layoutLibraryReport, setLayoutLibraryReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [commandInput, setCommandInput] = useState("");
  const [phase, setPhase] = useState("Manifests");
  const [devIssues, setDevIssues] = useState(loadDevIssues);
  const [intelligenceOverview, setIntelligenceOverview] = useState(null);
  const [intelligenceItems, setIntelligenceItems] = useState([]);
  const [intelligenceFilter, setIntelligenceFilter] = useState({ type: "", q: "" });
  const [experimentDraft, setExperimentDraft] = useState(defaultExperimentDraft);
  const [decisionDraft, setDecisionDraft] = useState(defaultDecisionDraft);
  const [standardDraft, setStandardDraft] = useState(defaultStandardDraft);
  const [sopDraft, setSopDraft] = useState(defaultSopDraft);
  const [costDraft, setCostDraft] = useState(defaultCostDraft);
  const [printDraft, setPrintDraft] = useState(defaultPrintDraft);
  const [lessonDraft, setLessonDraft] = useState(defaultLessonDraft);
  const [linkDraft, setLinkDraft] = useState({
    sourceItemId: "",
    targetItemId: "",
    relationType: "RELATED_TO",
    note: "",
  });
  const [operatorLog, setOperatorLog] = useState([
    {
      level: "system",
      text: "Console ready. Load a manuscript, create/select a project, then run upload and manifest generation.",
      time: "ready",
    },
  ]);

  const apiUrl = useMemo(() => trimSlash(backendUrl), [backendUrl]);
  const selectedProject = projects.find((project) => project.id === activeProjectId);

  function setConfig(path, value) {
    setProjectConfig((current) => {
      const next = structuredClone(current);
      let target = next;
      for (let index = 0; index < path.length - 1; index += 1) {
        target = target[path[index]];
      }
      target[path[path.length - 1]] = value;
      return next;
    });
  }

  function updateDraft(setter, key, value) {
    setter((current) => ({ ...current, [key]: value }));
  }

  function updateLayoutAsset(index, key, value) {
    setProjectConfig((current) => {
      const next = structuredClone(current);
      next.layoutPromptAssets[index][key] = value;
      return next;
    });
  }

  function appendLog(level, text) {
    setOperatorLog((current) => [
      {
        level,
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      },
      ...current,
    ].slice(0, 80));
  }

  function persistDevIssues(next) {
    try {
      localStorage.setItem(DEV_ISSUES_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable — keep in memory only */
    }
  }

  // Capture a plain-English issue tied to the current phase for the developer to fix.
  function flagForDeveloper() {
    const text = commandInput.trim();
    if (!text) return;
    const issue = {
      phase,
      projectId: activeProjectId || "(no project selected)",
      projectTitle: selectedProject?.title || "",
      status: selectedProject?.status || "",
      message: text,
      time: new Date().toISOString(),
    };
    setDevIssues((current) => {
      const next = [issue, ...current].slice(0, 200);
      persistDevIssues(next);
      return next;
    });
    appendLog("issue", `[${phase}] flagged for developer: ${text}`);
    setCommandInput("");
  }

  // Package all flagged issues into a structured report to hand to the developer.
  async function copyDeveloperReport() {
    if (devIssues.length === 0) return;
    const lines = devIssues.map(
      (i) => `- [${i.phase}] (project ${i.projectId}${i.status ? `, status ${i.status}` : ""}) ${i.message}  — ${i.time}`,
    );
    const report = `## Wildlands operator feedback for the developer\nBackend: ${apiUrl || "(unset)"}\nGenerated: ${new Date().toISOString()}\n\n${lines.join("\n")}\n`;
    try {
      await navigator.clipboard.writeText(report);
      setMessage(`Copied ${devIssues.length} issue(s) — paste this to the developer.`);
    } catch {
      setMessage("Copy failed; the report is logged below — copy it manually.");
      appendLog("issue", report);
    }
  }

  function clearDevIssues() {
    setDevIssues([]);
    persistDevIssues([]);
    setMessage("Cleared flagged developer issues.");
  }

  async function uploadLayoutMockup(index, file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setProjectConfig((current) => {
      const next = structuredClone(current);
      next.layoutPromptAssets[index].mockupImagePath = file.name;
      next.layoutPromptAssets[index].mockupImageDataUrl = dataUrl;
      return next;
    });
  }

  async function call(path, options = {}) {
    if (!apiUrl) {
      throw new Error("Set REACT_APP_BACKEND_URL in Railway or enter the backend URL here.");
    }
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    return readJson(response);
  }

  async function run(label, fn) {
    setBusy(true);
    setError("");
    setMessage(label);
    appendLog("running", label);
    try {
      await fn();
      appendLog("success", label.replace(/\.\.\.$/, " complete."));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      appendLog("error", errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function refreshHealth() {
    const data = await call("/health");
    setHealth(data);
    setMessage("Backend health check passed.");
  }

  async function refreshProjects() {
    const data = await call("/api/projects");
    setProjects(data.projects || []);
    if (!activeProjectId && data.projects?.[0]) {
      setActiveProjectId(data.projects[0].id);
    }
  }

  async function createProject() {
    const data = await call("/api/projects", {
      method: "POST",
      body: JSON.stringify({ config: projectConfig }),
    });
    setProjects((current) => [data.project, ...current.filter((project) => project.id !== data.project.id)]);
    setActiveProjectId(data.project.id);
    setMessage("Project created with the visible configuration.");
    appendLog("success", `Project ready: ${data.project.title}`);
    return data.project.id;
  }

  async function saveProjectConfig(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${projectId}/config`, {
      method: "PATCH",
      body: JSON.stringify({ config: projectConfig }),
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setMessage("Project configuration saved.");
    appendLog("success", "Project configuration saved.");
  }

  async function uploadManuscript(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${projectId}/manuscript`, {
      method: "POST",
      body: JSON.stringify({ filename: "milestone-1-test.md", markdown: manuscript }),
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setMessage(`Manuscript uploaded: ${data.manuscript.sizeBytes} bytes.`);
    appendLog("success", `Manuscript uploaded: ${data.manuscript.sizeBytes} bytes.`);
  }

  async function loadArtifacts(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const [manifestData, pageData] = await Promise.all([
      call(`/api/projects/${projectId}/manifests`),
      call(`/api/projects/${projectId}/pages`),
    ]);
    setManifests(manifestData.manifests || []);
    setPages(pageData.pages || []);
    setMessage("Loaded manifests and pages.");
  }

  async function refreshIntelligence() {
    const params = new URLSearchParams();
    if (intelligenceFilter.type) params.set("type", intelligenceFilter.type);
    if (intelligenceFilter.q.trim()) params.set("q", intelligenceFilter.q.trim());
    params.set("limit", "40");
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const [overviewData, itemsData] = await Promise.all([
      call("/api/intelligence/overview"),
      call(`/api/intelligence/items${suffix}`),
    ]);
    setIntelligenceOverview(overviewData);
    setIntelligenceItems(itemsData.items || []);
    setMessage("Publishing Intelligence refreshed.");
  }

  async function createExperimentRecord() {
    const data = await call("/api/intelligence/experiments", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProjectId || undefined,
        title: experimentDraft.title,
        summary: experimentDraft.conclusion || experimentDraft.hypothesis,
        scope: activeProjectId ? "PROJECT" : "GLOBAL",
        ownerName: experimentDraft.ownerName,
        tags: parseTags(experimentDraft.tags),
        hypothesis: experimentDraft.hypothesis,
        testPerformed: experimentDraft.testPerformed,
        result: experimentDraft.result || undefined,
        conclusion: experimentDraft.conclusion || undefined,
        status: experimentDraft.conclusion ? "CONCLUDED" : "RUNNING",
      }),
    });
    appendLog("success", `Experiment recorded: ${data.item.title}`);
    await refreshIntelligence();
  }

  async function createDecisionRecord() {
    const data = await call("/api/intelligence/decisions", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProjectId || undefined,
        title: decisionDraft.title,
        summary: decisionDraft.decision,
        scope: activeProjectId ? "PROJECT" : "GLOBAL",
        ownerName: decisionDraft.ownerName,
        tags: parseTags(decisionDraft.tags),
        decision: decisionDraft.decision,
        reason: decisionDraft.reason,
        status: "ACCEPTED",
      }),
    });
    appendLog("success", `Decision recorded: ${data.item.title}`);
    await refreshIntelligence();
  }

  async function createStandardRecord() {
    const value = parseJsonRecord(standardDraft.valueJson);
    const data = await call("/api/intelligence/standards", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProjectId || undefined,
        title: standardDraft.title,
        summary: `${standardDraft.domain}: ${standardDraft.standardKey}`,
        scope: "GLOBAL",
        ownerName: standardDraft.ownerName,
        tags: parseTags(standardDraft.tags),
        domain: standardDraft.domain,
        standardKey: standardDraft.standardKey,
        value,
        rationale: standardDraft.rationale,
        status: "LOCKED",
      }),
    });
    appendLog("success", `Standard locked: ${data.item.title}`);
    await refreshIntelligence();
  }

  async function createSopRecord() {
    const data = await call("/api/intelligence/sops", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProjectId || undefined,
        title: sopDraft.title,
        summary: sopDraft.workflowName,
        scope: "WORKFLOW",
        ownerName: sopDraft.ownerName,
        tags: parseTags(sopDraft.tags),
        workflowName: sopDraft.workflowName,
        bodyMarkdown: sopDraft.bodyMarkdown,
        checklist: parseLines(sopDraft.checklist),
        changeNotes: sopDraft.changeNotes || undefined,
        status: "ACCEPTED",
      }),
    });
    appendLog("success", `SOP recorded: ${data.item.title}`);
    await refreshIntelligence();
  }

  async function createCostRecord() {
    const data = await call("/api/intelligence/cost-events", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProjectId || undefined,
        title: costDraft.title,
        summary: `${costDraft.provider} ${costDraft.operation}: $${Number(costDraft.costUsd).toFixed(4)}`,
        scope: activeProjectId ? "PROJECT" : "GLOBAL",
        ownerName: costDraft.ownerName,
        tags: parseTags(costDraft.tags),
        provider: costDraft.provider,
        model: costDraft.model || undefined,
        operation: costDraft.operation,
        quantity: Number(costDraft.quantity),
        unitCostUsd: Number(costDraft.unitCostUsd) || undefined,
        costUsd: Number(costDraft.costUsd),
      }),
    });
    appendLog("success", `Cost recorded: ${data.item.title}`);
    await refreshIntelligence();
  }

  async function createPrintReviewRecord() {
    const data = await call("/api/intelligence/print-reviews", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProjectId || undefined,
        title: printDraft.title,
        summary: `${printDraft.vendor} ${printDraft.format}`,
        scope: activeProjectId ? "PROJECT" : "GLOBAL",
        ownerName: printDraft.ownerName,
        tags: parseTags(printDraft.tags),
        proofName: printDraft.proofName,
        vendor: printDraft.vendor,
        format: printDraft.format,
        overallStatus: printDraft.overallStatus,
        status: "RUNNING",
      }),
    });
    appendLog("success", `Print review recorded: ${data.item.title}`);
    await refreshIntelligence();
  }

  async function createLessonRecord() {
    const data = await call("/api/intelligence/lessons", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProjectId || undefined,
        title: lessonDraft.title,
        summary: lessonDraft.lesson,
        scope: "GLOBAL",
        ownerName: lessonDraft.ownerName,
        tags: parseTags(lessonDraft.tags),
        lesson: lessonDraft.lesson,
        prevention: lessonDraft.prevention || undefined,
        appliesTo: parseLines(lessonDraft.appliesTo),
        status: "ACCEPTED",
      }),
    });
    appendLog("success", `Lesson recorded: ${data.item.title}`);
    await refreshIntelligence();
  }

  async function createKnowledgeLink() {
    if (!linkDraft.sourceItemId || !linkDraft.targetItemId) {
      throw new Error("Source and target item IDs are required for lineage links.");
    }
    await call("/api/intelligence/links", {
      method: "POST",
      body: JSON.stringify({
        sourceItemId: linkDraft.sourceItemId,
        targetItemId: linkDraft.targetItemId,
        relationType: linkDraft.relationType,
        note: linkDraft.note || undefined,
      }),
    });
    appendLog("success", `${linkDraft.relationType} lineage link recorded.`);
    await refreshIntelligence();
  }

  async function promoteExperimentRecord(itemId) {
    const data = await call(`/api/intelligence/experiments/${itemId}/promote-decision`, {
      method: "POST",
    });
    appendLog("success", `Promoted experiment to decision: ${data.item.title}`);
    await refreshIntelligence();
  }

  async function generateManifests(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${projectId}/manifests`, {
      method: "POST",
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setMessage(`Manifested ${data.summary.totalPages} page(s), ${data.summary.manifestsWritten} manifest row(s).`);
    appendLog("success", `Claude manifest pass wrote ${data.summary.totalPages} page(s).`);
    await loadArtifacts(projectId);
  }

  async function planPages(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    await saveProjectConfig(projectId);
    const data = await call(`/api/projects/${projectId}/plan`, {
      method: "POST",
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setPlannedPages(data.plannedPages || []);
    setLayoutLibraryReport(data.layoutLibrary || null);
    const blockers = data.plannedPages?.reduce((total, page) => total + (page.blockers?.length || 0), 0) || 0;
    setMessage(`Planned ${data.plannedPages?.length || 0} page(s). Layout blockers: ${blockers}.`);
    appendLog(blockers > 0 ? "error" : "success", `Stage 2 planned ${data.plannedPages?.length || 0} page(s); ${blockers} blocker(s).`);
    await loadArtifacts(projectId);
  }

  async function uploadManuscriptFile(file) {
    if (!file) return;
    const text = await readFileAsText(file);
    setManuscript(text);
    appendLog("success", `Loaded local manuscript file: ${file.name}`);
  }

  async function runManuscriptIntake() {
    let projectId = activeProjectId;
    if (!projectId) {
      projectId = await createProject();
    }
    await uploadManuscript(projectId);
    await generateManifests(projectId);
    await planPages(projectId);
  }

  async function handleOperatorCommand(event) {
    event.preventDefault();
    const command = commandInput.trim();
    if (!command) return;
    setCommandInput("");
    appendLog("command", command);

    const normalized = command.toLowerCase();
    if (normalized.includes("check")) {
      await run("Checking backend...", refreshHealth);
    } else if (normalized.includes("create")) {
      await run("Creating project...", createProject);
    } else if (normalized.includes("upload")) {
      await run("Uploading manuscript...", uploadManuscript);
    } else if (normalized.includes("manifest") || normalized.includes("claude")) {
      await run("Generating manifests...", generateManifests);
    } else if (normalized.includes("plan") || normalized.includes("layout")) {
      await run("Planning pages...", planPages);
    } else if (normalized.includes("refresh") || normalized.includes("output")) {
      await run("Loading output...", () => loadArtifacts());
    } else if (normalized.includes("intelligence") || normalized.includes("knowledge") || normalized.includes("standards")) {
      await run("Refreshing Publishing Intelligence...", refreshIntelligence);
    } else if (normalized.includes("run") || normalized.includes("start")) {
      await run("Running manuscript intake...", runManuscriptIntake);
    } else {
      appendLog("system", "Try: check backend, create project, upload manuscript, generate manifests, refresh intelligence, refresh output, or run intake.");
    }
  }

  useEffect(() => {
    if (!apiUrl) return;
    run("Checking backend...", async () => {
      await refreshHealth();
      await refreshProjects();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">The Wildlands Publishing Platform</p>
          <h1>Pipeline Administration</h1>
        </div>
        <div className={`status ${health?.ok ? "ok" : "warn"}`}>{health?.ok ? "Backend online" : "Backend unchecked"}</div>
      </section>

      <section className="panel backend-panel">
        <Field label="Backend URL">
          <div className="inline-form">
            <input
              value={backendUrl}
              onChange={(event) => setBackendUrl(trimSlash(event.target.value))}
              placeholder="https://wildlandsbackend-production..."
            />
            <button disabled={busy} onClick={() => run("Checking backend...", refreshHealth)}>
              Check
            </button>
          </div>
        </Field>
        <p className="hint">This must be the backend API URL, not the database URL.</p>
      </section>

      {(message || error) && <section className={`notice ${error ? "error" : ""}`}>{error || message}</section>}

      <section className="operator-grid">
        <section className="panel command-panel">
          <div className="section-head">
            <div>
              <h2>Operator Command Center</h2>
              <p className="hint">Type a command or use the buttons. This is where you drive the pipeline.</p>
            </div>
            <span className="mode-pill">{busy ? "Running" : "Ready"}</span>
          </div>
          <div className="phase-row">
            <label htmlFor="phase-select">Talking to phase</label>
            <select id="phase-select" value={phase} onChange={(event) => setPhase(event.target.value)}>
              {PHASES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <span className="hint">
              {activeProjectId ? `Project ${activeProjectId.slice(0, 8)}` : "No project selected"}
            </span>
          </div>
          <form className="command-form" onSubmit={handleOperatorCommand}>
            <input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              placeholder={`Message the ${phase} phase — run an action, or flag an issue for the developer`}
            />
            <button disabled={busy} type="submit">Run</button>
            <button type="button" disabled={!commandInput.trim()} onClick={flagForDeveloper} title="Save this as an issue for the developer to fix">
              Flag for Developer
            </button>
          </form>
          <div className="dev-actions">
            <button type="button" disabled={devIssues.length === 0} onClick={copyDeveloperReport}>
              Copy Developer Report ({devIssues.length})
            </button>
            <button type="button" disabled={devIssues.length === 0} onClick={clearDevIssues}>
              Clear Flags
            </button>
          </div>
          <div className="quick-actions">
            <button disabled={busy} onClick={() => run("Checking backend...", refreshHealth)}>Check Backend</button>
            <button disabled={busy} onClick={() => run("Creating project...", createProject)}>Create Project</button>
            <button disabled={busy || !activeProjectId} onClick={() => run("Saving project configuration...", saveProjectConfig)}>
              Save Config
            </button>
            <button disabled={busy || !activeProjectId} onClick={() => run("Uploading manuscript...", uploadManuscript)}>
              Upload Manuscript
            </button>
            <button disabled={busy || !activeProjectId} onClick={() => run("Generating manifests...", generateManifests)}>
              Generate Manifests
            </button>
            <button disabled={busy || !activeProjectId} onClick={() => run("Planning pages...", planPages)}>
              Plan Pages
            </button>
            <button disabled={busy} onClick={() => run("Running manuscript intake...", runManuscriptIntake)}>
              Run Intake
            </button>
          </div>
          <div className="operator-log" aria-live="polite">
            {operatorLog.map((entry, index) => (
              <div className={`log-row ${entry.level}`} key={`${entry.time}-${index}`}>
                <span>{entry.time}</span>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel flow-panel">
          <h2>What Happens Next</h2>
          <div className="flow-steps">
            <div className={`flow-step ${activeProjectId ? "done" : "current"}`}>
              <strong>1. Project</strong>
              <span>{activeProjectId ? "Created or selected" : "Create/select project first"}</span>
            </div>
            <div className={`flow-step ${selectedProject?.manuscriptPath ? "done" : activeProjectId ? "current" : ""}`}>
              <strong>2. Manuscript</strong>
              <span>Paste or upload the .md manuscript, then send it to backend storage</span>
            </div>
            <div className={`flow-step ${pages.length > 0 ? "done" : selectedProject?.manuscriptPath ? "current" : ""}`}>
              <strong>3. Manifest</strong>
              <span>Claude splits chapters/pages and writes manifest rows</span>
            </div>
            <div className={`flow-step ${plannedPages.length > 0 ? "done" : pages.length > 0 ? "current" : ""}`}>
              <strong>4. Layout Fit</strong>
              <span>Agent selects one of 16 layouts, assembles prompts, then waits for text-fit approval</span>
            </div>
            <div className="flow-step">
              <strong>5. Images + Exports</strong>
              <span>Approved layout prompts generate final art, then PDF/EPUB stages run</span>
            </div>
          </div>
        </section>
      </section>

      <section className="panel intelligence-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Publishing Intelligence</p>
            <h2>Standards Ledger + Knowledge System</h2>
            <p className="hint">
              Capture experiments, decisions, locked standards, SOPs, costs, print-proof findings, and lessons learned.
            </p>
          </div>
          <button disabled={busy} onClick={() => run("Refreshing Publishing Intelligence...", refreshIntelligence)}>
            Refresh Intelligence
          </button>
        </div>

        <div className="intelligence-metrics">
          <div>
            <strong>{intelligenceOverview?.totals?.experiments ?? 0}</strong>
            <span>Experiments</span>
          </div>
          <div>
            <strong>{intelligenceOverview?.totals?.decisions ?? 0}</strong>
            <span>Decisions</span>
          </div>
          <div>
            <strong>{intelligenceOverview?.lockedStandards ?? 0}</strong>
            <span>Locked Standards</span>
          </div>
          <div>
            <strong>{intelligenceOverview?.totals?.sops ?? 0}</strong>
            <span>SOPs</span>
          </div>
          <div>
            <strong>{intelligenceOverview?.totals?.printReviews ?? 0}</strong>
            <span>Print Reviews</span>
          </div>
          <div>
            <strong>{intelligenceOverview?.totals?.costRecords ?? 0}</strong>
            <span>Cost Records</span>
          </div>
        </div>

        <div className="intelligence-filter">
          <Field label="Search Intelligence">
            <input
              value={intelligenceFilter.q}
              onChange={(event) => setIntelligenceFilter((current) => ({ ...current, q: event.target.value }))}
              placeholder="Search title or summary"
            />
          </Field>
          <Field label="Record Type">
            <select
              value={intelligenceFilter.type}
              onChange={(event) => setIntelligenceFilter((current) => ({ ...current, type: event.target.value }))}
            >
              {INTELLIGENCE_TYPES.map(([value, label]) => (
                <option key={value || "all"} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <button disabled={busy} onClick={() => run("Searching Publishing Intelligence...", refreshIntelligence)}>
            Search
          </button>
        </div>

        <div className="capture-grid">
          <article className="mini-form">
            <h3>Experiment</h3>
            <Field label="Title">
              <input value={experimentDraft.title} onChange={(event) => updateDraft(setExperimentDraft, "title", event.target.value)} />
            </Field>
            <Field label="Hypothesis">
              <textarea className="notes-field" value={experimentDraft.hypothesis} onChange={(event) => updateDraft(setExperimentDraft, "hypothesis", event.target.value)} />
            </Field>
            <Field label="Test Performed">
              <textarea className="notes-field" value={experimentDraft.testPerformed} onChange={(event) => updateDraft(setExperimentDraft, "testPerformed", event.target.value)} />
            </Field>
            <Field label="Result">
              <textarea className="notes-field" value={experimentDraft.result} onChange={(event) => updateDraft(setExperimentDraft, "result", event.target.value)} />
            </Field>
            <Field label="Conclusion">
              <textarea className="notes-field" value={experimentDraft.conclusion} onChange={(event) => updateDraft(setExperimentDraft, "conclusion", event.target.value)} />
            </Field>
            <Field label="Tags">
              <input value={experimentDraft.tags} onChange={(event) => updateDraft(setExperimentDraft, "tags", event.target.value)} />
            </Field>
            <button disabled={busy} onClick={() => run("Recording experiment...", createExperimentRecord)}>
              Record Experiment
            </button>
          </article>

          <article className="mini-form">
            <h3>Decision</h3>
            <Field label="Title">
              <input value={decisionDraft.title} onChange={(event) => updateDraft(setDecisionDraft, "title", event.target.value)} />
            </Field>
            <Field label="Decision">
              <textarea className="notes-field" value={decisionDraft.decision} onChange={(event) => updateDraft(setDecisionDraft, "decision", event.target.value)} />
            </Field>
            <Field label="Reason">
              <textarea className="notes-field" value={decisionDraft.reason} onChange={(event) => updateDraft(setDecisionDraft, "reason", event.target.value)} />
            </Field>
            <Field label="Tags">
              <input value={decisionDraft.tags} onChange={(event) => updateDraft(setDecisionDraft, "tags", event.target.value)} />
            </Field>
            <button disabled={busy} onClick={() => run("Recording decision...", createDecisionRecord)}>
              Record Decision
            </button>
          </article>

          <article className="mini-form">
            <h3>Locked Standard</h3>
            <Field label="Title">
              <input value={standardDraft.title} onChange={(event) => updateDraft(setStandardDraft, "title", event.target.value)} />
            </Field>
            <div className="two-col">
              <Field label="Domain">
                <input value={standardDraft.domain} onChange={(event) => updateDraft(setStandardDraft, "domain", event.target.value)} />
              </Field>
              <Field label="Standard Key">
                <input value={standardDraft.standardKey} onChange={(event) => updateDraft(setStandardDraft, "standardKey", event.target.value)} />
              </Field>
            </div>
            <Field label="Value JSON">
              <textarea className="notes-field" value={standardDraft.valueJson} onChange={(event) => updateDraft(setStandardDraft, "valueJson", event.target.value)} />
            </Field>
            <Field label="Rationale">
              <textarea className="notes-field" value={standardDraft.rationale} onChange={(event) => updateDraft(setStandardDraft, "rationale", event.target.value)} />
            </Field>
            <Field label="Tags">
              <input value={standardDraft.tags} onChange={(event) => updateDraft(setStandardDraft, "tags", event.target.value)} />
            </Field>
            <button disabled={busy} onClick={() => run("Locking standard...", createStandardRecord)}>
              Lock Standard
            </button>
          </article>

          <article className="mini-form">
            <h3>SOP Library</h3>
            <Field label="Workflow Name">
              <input value={sopDraft.workflowName} onChange={(event) => updateDraft(setSopDraft, "workflowName", event.target.value)} />
            </Field>
            <Field label="SOP Body">
              <textarea className="notes-field" value={sopDraft.bodyMarkdown} onChange={(event) => updateDraft(setSopDraft, "bodyMarkdown", event.target.value)} />
            </Field>
            <Field label="Checklist">
              <textarea className="notes-field" value={sopDraft.checklist} onChange={(event) => updateDraft(setSopDraft, "checklist", event.target.value)} />
            </Field>
            <Field label="Change Notes">
              <input value={sopDraft.changeNotes} onChange={(event) => updateDraft(setSopDraft, "changeNotes", event.target.value)} />
            </Field>
            <button disabled={busy} onClick={() => run("Recording SOP...", createSopRecord)}>
              Record SOP
            </button>
          </article>

          <article className="mini-form">
            <h3>Cost Tracking</h3>
            <Field label="Title">
              <input value={costDraft.title} onChange={(event) => updateDraft(setCostDraft, "title", event.target.value)} />
            </Field>
            <div className="two-col">
              <Field label="Provider">
                <input value={costDraft.provider} onChange={(event) => updateDraft(setCostDraft, "provider", event.target.value)} />
              </Field>
              <Field label="Model">
                <input value={costDraft.model} onChange={(event) => updateDraft(setCostDraft, "model", event.target.value)} />
              </Field>
            </div>
            <Field label="Operation">
              <select value={costDraft.operation} onChange={(event) => updateDraft(setCostDraft, "operation", event.target.value)}>
                <option value="LLM">LLM</option>
                <option value="IMAGE_GENERATION">Image Generation</option>
                <option value="UPSCALE">Upscale</option>
                <option value="PDF_RENDER">PDF Render</option>
                <option value="EPUB_EXPORT">EPUB Export</option>
                <option value="STORAGE">Storage</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <div className="two-col">
              <Field label="Quantity">
                <input type="number" step="0.0001" value={costDraft.quantity} onChange={(event) => updateDraft(setCostDraft, "quantity", trimNumber(event.target.value))} />
              </Field>
              <Field label="Cost USD">
                <input type="number" step="0.0001" value={costDraft.costUsd} onChange={(event) => updateDraft(setCostDraft, "costUsd", trimNumber(event.target.value))} />
              </Field>
            </div>
            <button disabled={busy} onClick={() => run("Recording cost...", createCostRecord)}>
              Record Cost
            </button>
          </article>

          <article className="mini-form">
            <h3>Print Review</h3>
            <Field label="Proof Name">
              <input value={printDraft.proofName} onChange={(event) => updateDraft(setPrintDraft, "proofName", event.target.value)} />
            </Field>
            <div className="two-col">
              <Field label="Vendor">
                <input value={printDraft.vendor} onChange={(event) => updateDraft(setPrintDraft, "vendor", event.target.value)} />
              </Field>
              <Field label="Format">
                <input value={printDraft.format} onChange={(event) => updateDraft(setPrintDraft, "format", event.target.value)} />
              </Field>
            </div>
            <Field label="Overall Status">
              <input value={printDraft.overallStatus} onChange={(event) => updateDraft(setPrintDraft, "overallStatus", event.target.value)} />
            </Field>
            <Field label="Tags">
              <input value={printDraft.tags} onChange={(event) => updateDraft(setPrintDraft, "tags", event.target.value)} />
            </Field>
            <button disabled={busy} onClick={() => run("Recording print review...", createPrintReviewRecord)}>
              Record Print Review
            </button>
          </article>

          <article className="mini-form">
            <h3>Lessons Learned</h3>
            <Field label="Title">
              <input value={lessonDraft.title} onChange={(event) => updateDraft(setLessonDraft, "title", event.target.value)} />
            </Field>
            <Field label="Lesson">
              <textarea className="notes-field" value={lessonDraft.lesson} onChange={(event) => updateDraft(setLessonDraft, "lesson", event.target.value)} />
            </Field>
            <Field label="Prevention">
              <textarea className="notes-field" value={lessonDraft.prevention} onChange={(event) => updateDraft(setLessonDraft, "prevention", event.target.value)} />
            </Field>
            <Field label="Applies To">
              <textarea className="notes-field" value={lessonDraft.appliesTo} onChange={(event) => updateDraft(setLessonDraft, "appliesTo", event.target.value)} />
            </Field>
            <Field label="Tags">
              <input value={lessonDraft.tags} onChange={(event) => updateDraft(setLessonDraft, "tags", event.target.value)} />
            </Field>
            <button disabled={busy} onClick={() => run("Recording lesson...", createLessonRecord)}>
              Record Lesson
            </button>
          </article>

          <article className="mini-form">
            <h3>Lineage Link</h3>
            <Field label="Source Item ID">
              <input value={linkDraft.sourceItemId} onChange={(event) => updateDraft(setLinkDraft, "sourceItemId", event.target.value)} />
            </Field>
            <Field label="Target Item ID">
              <input value={linkDraft.targetItemId} onChange={(event) => updateDraft(setLinkDraft, "targetItemId", event.target.value)} />
            </Field>
            <Field label="Relationship">
              <select value={linkDraft.relationType} onChange={(event) => updateDraft(setLinkDraft, "relationType", event.target.value)}>
                {RELATION_TYPES.map((relation) => (
                  <option key={relation} value={relation}>{relation}</option>
                ))}
              </select>
            </Field>
            <Field label="Note">
              <input value={linkDraft.note} onChange={(event) => updateDraft(setLinkDraft, "note", event.target.value)} />
            </Field>
            <button disabled={busy} onClick={() => run("Linking knowledge records...", createKnowledgeLink)}>
              Create Link
            </button>
          </article>
        </div>

        <div className="knowledge-list">
          <div className="section-head">
            <h3>Recent Knowledge Records</h3>
            <span className="hint">{intelligenceItems.length} visible</span>
          </div>
          <div className="table">
            {intelligenceItems.map((item) => (
              <div className="row knowledge-row" key={item.id}>
                <span>{item.type}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.summary || "No summary"} / {item.id}</small>
                </span>
                <span>{item.status}</span>
                <span>{item.scope}</span>
                <span>{item.tags?.join(", ") || "No tags"}</span>
                <span>
                  {item.type === "EXPERIMENT" ? (
                    <button disabled={busy} onClick={() => run("Promoting experiment...", () => promoteExperimentRecord(item.id))}>
                      Promote
                    </button>
                  ) : (
                    "Audit kept"
                  )}
                </span>
              </div>
            ))}
            {intelligenceItems.length === 0 && <p className="empty">No intelligence records loaded yet.</p>}
          </div>
        </div>
      </section>

      <section className="pipeline-grid">
        <section className="panel">
          <div className="section-head">
            <h2>2. Manuscript</h2>
            <div className="button-row">
              <label className="file-button">
                Load .md
                <input
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  onChange={(event) => uploadManuscriptFile(event.target.files?.[0])}
                />
              </label>
              <button disabled={busy || !activeProjectId} onClick={() => run("Uploading manuscript...", uploadManuscript)}>
                Upload
              </button>
              <button disabled={busy || !activeProjectId} onClick={() => run("Generating manifests...", generateManifests)}>
                Generate Manifests
              </button>
              <button disabled={busy || !activeProjectId} onClick={() => run("Planning pages...", planPages)}>
                Plan Pages
              </button>
            </div>
          </div>
          <textarea value={manuscript} onChange={(event) => setManuscript(event.target.value)} />
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>3. Manifest Output</h2>
            <button disabled={busy || !activeProjectId} onClick={() => run("Loading output...", () => loadArtifacts())}>
              Refresh
            </button>
          </div>
            <div className="output-grid">
            <div>
              <h3>Layout Library</h3>
              <div className="table">
                {layoutLibraryReport ? (
                  <>
                    <div className="row plan-row">
                      <span>{layoutLibraryReport.approvedTemplates}/{layoutLibraryReport.totalTemplates} approved</span>
                      <span>{layoutLibraryReport.readyForProduction ? "Production ready" : "Needs review"}</span>
                      <span>{layoutLibraryReport.issues?.length || 0} issue(s)</span>
                    </div>
                    {(layoutLibraryReport.issues || []).slice(0, 8).map((issue, index) => (
                      <div className={`row issue-row ${issue.severity.toLowerCase()}`} key={`${issue.templateId}-${issue.code}-${index}`}>
                        <span>{issue.templateId}</span>
                        <span>{issue.code}</span>
                        <span>{issue.severity}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="empty">No layout validation run yet.</p>
                )}
              </div>
            </div>
            <div>
              <h3>Pages</h3>
              <div className="table">
                {pages.map((page) => (
                  <div className="row" key={page.id}>
                    <span>{page.pageKey}</span>
                    <span>{page.layoutTemplate || "No layout"}</span>
                    <span>{page.status}</span>
                  </div>
                ))}
                {pages.length === 0 && <p className="empty">No pages yet.</p>}
              </div>
            </div>
            <div>
              <h3>Page Plan</h3>
              <div className="table">
                {plannedPages.map((page) => (
                  <div className="row plan-row" key={page.pageKey}>
                    <span>{page.pageKey}</span>
                    <span>{page.layoutTemplate}</span>
                    <span>{page.wordCount} words / {page.textFitStatus}</span>
                    <span>{page.capacity?.status || "capacity?"}</span>
                    <span>{page.blockers?.length || 0} blockers</span>
                    <span>{page.layoutInstructions?.textZone || "No text-zone note"}</span>
                  </div>
                ))}
                {plannedPages.length === 0 && <p className="empty">No page plan yet.</p>}
              </div>
            </div>
            <div>
              <h3>Manifests</h3>
              <div className="table">
                {manifests.map((manifest) => (
                  <div className="row" key={manifest.id}>
                    <span>{manifest.kind}</span>
                    <span>{manifest.externalId}</span>
                    <span>v{manifest.version}</span>
                  </div>
                ))}
                {manifests.length === 0 && <p className="empty">No manifests yet.</p>}
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="workspace-grid">
        <section className="panel setup-panel">
          <div className="section-head">
            <h2>1. Project Setup</h2>
            <div className="button-row">
              <button disabled={busy} onClick={() => run("Creating project...", createProject)}>
                Create Project
              </button>
              <button disabled={busy || !activeProjectId} onClick={() => run("Saving project configuration...", saveProjectConfig)}>
                Save Config
              </button>
            </div>
          </div>

          <div className="form-grid">
            <Field label="Title">
              <input value={projectConfig.title} onChange={(event) => setConfig(["title"], event.target.value)} />
            </Field>
            <Field label="Subtitle">
              <input value={projectConfig.subtitle} onChange={(event) => setConfig(["subtitle"], event.target.value)} />
            </Field>
            <Field label="Author / Imprint">
              <input value={projectConfig.authorName} onChange={(event) => setConfig(["authorName"], event.target.value)} />
            </Field>
            <Field label="Volume">
              <input
                type="number"
                min="1"
                value={projectConfig.volume}
                onChange={(event) => setConfig(["volume"], trimNumber(event.target.value))}
              />
            </Field>
            <Field label="Brand">
              <select value={projectConfig.brand} onChange={(event) => setConfig(["brand"], event.target.value)}>
                <option value="THE_WILDLANDS">THE_WILDLANDS</option>
              </select>
            </Field>
            <Field label="Audience">
              <select value={projectConfig.audience} onChange={(event) => setConfig(["audience"], event.target.value)}>
                <option value="ADULT">Adult</option>
              </select>
            </Field>
          </div>

          <div className="config-section">
            <h3>Output Profile</h3>
            <div className="form-grid compact">
              <Field label="Print Edition">
                <select
                  value={projectConfig.outputProfile.printEdition}
                  onChange={(event) => setConfig(["outputProfile", "printEdition"], event.target.value)}
                >
                  <option value="PREMIUM">Premium PDF, 8.5 x 11 full color</option>
                </select>
              </Field>
              <Field label="Ebook Edition">
                <select
                  value={projectConfig.outputProfile.ebookEdition}
                  onChange={(event) => setConfig(["outputProfile", "ebookEdition"], event.target.value)}
                >
                  <option value="KINDLE_EPUB">Kindle EPUB</option>
                </select>
              </Field>
              <Field label="PDF Engine">
                <select
                  value={projectConfig.outputProfile.renderEngine}
                  onChange={(event) => setConfig(["outputProfile", "renderEngine"], event.target.value)}
                >
                  <option value="PUPPETEER_PAGEDJS">Puppeteer + Paged.js</option>
                </select>
              </Field>
              <Field label="KDP Target">
                <input
                  value={projectConfig.outputProfile.pdfTarget}
                  onChange={(event) => setConfig(["outputProfile", "pdfTarget"], event.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="config-section">
            <h3>Page Geometry</h3>
            <div className="number-row">
              <Field label="Trim Width">
                <input
                  type="number"
                  step="0.125"
                  value={projectConfig.trimSize.widthIn}
                  onChange={(event) => setConfig(["trimSize", "widthIn"], trimNumber(event.target.value))}
                />
              </Field>
              <Field label="Trim Height">
                <input
                  type="number"
                  step="0.125"
                  value={projectConfig.trimSize.heightIn}
                  onChange={(event) => setConfig(["trimSize", "heightIn"], trimNumber(event.target.value))}
                />
              </Field>
              <Field label="Bleed">
                <input
                  type="number"
                  step="0.001"
                  value={projectConfig.trimSize.bleedIn}
                  onChange={(event) => setConfig(["trimSize", "bleedIn"], trimNumber(event.target.value))}
                />
              </Field>
            </div>
          </div>

          <div className="config-section">
            <h3>Typography</h3>
            <div className="form-grid compact">
              <Field label="Heading Font">
                <input
                  value={projectConfig.typography.headingFont}
                  onChange={(event) => setConfig(["typography", "headingFont"], event.target.value)}
                />
              </Field>
              <Field label="Body Font">
                <input
                  value={projectConfig.typography.bodyFont}
                  onChange={(event) => setConfig(["typography", "bodyFont"], event.target.value)}
                />
              </Field>
              <Field label="Caption Font">
                <input
                  value={projectConfig.typography.captionFont}
                  onChange={(event) => setConfig(["typography", "captionFont"], event.target.value)}
                />
              </Field>
              <Field label="Body Size">
                <input
                  type="number"
                  step="0.5"
                  value={projectConfig.typography.bodyPt}
                  onChange={(event) => setConfig(["typography", "bodyPt"], trimNumber(event.target.value))}
                />
              </Field>
              <Field label="Line Height">
                <input
                  type="number"
                  step="0.01"
                  value={projectConfig.typography.lineHeight}
                  onChange={(event) => setConfig(["typography", "lineHeight"], trimNumber(event.target.value))}
                />
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={projectConfig.typography.smallCaps}
                  onChange={(event) => setConfig(["typography", "smallCaps"], event.target.checked)}
                />
                Small-caps section labels
              </label>
            </div>
          </div>

          <div className="config-section">
            <h3>Color System</h3>
            <div className="swatch-grid">
              {Object.entries(projectConfig.colorPalette).map(([key, value]) => (
                <Field key={key} label={key}>
                  <div className="color-input">
                    <span className="swatch" style={{ backgroundColor: value }} />
                    <input value={value} onChange={(event) => setConfig(["colorPalette", key], event.target.value)} />
                  </div>
                </Field>
              ))}
            </div>
          </div>

          <div className="config-section">
            <h3>Image + Style Policy</h3>
            <div className="form-grid compact">
              <Field label="Master Style Block">
                <input
                  value={projectConfig.imageGeneration.masterStyleBlockVersion}
                  onChange={(event) => setConfig(["imageGeneration", "masterStyleBlockVersion"], event.target.value)}
                />
              </Field>
              <Field label="Style Name">
                <input
                  value={projectConfig.imageGeneration.styleName}
                  onChange={(event) => setConfig(["imageGeneration", "styleName"], event.target.value)}
                />
              </Field>
              <Field label="Master Style DNA">
                <textarea
                  className="prompt-template"
                  value={projectConfig.imageGeneration.masterStyleBlockText}
                  onChange={(event) => setConfig(["imageGeneration", "masterStyleBlockText"], event.target.value)}
                />
              </Field>
              <Field label="Image Model">
                <input
                  value={projectConfig.imageGeneration.imageModel}
                  onChange={(event) => setConfig(["imageGeneration", "imageModel"], event.target.value)}
                />
              </Field>
              <Field label="Upscale Model">
                <input
                  value={projectConfig.imageGeneration.upscaleModel}
                  onChange={(event) => setConfig(["imageGeneration", "upscaleModel"], event.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="config-section">
            <h3>Layout Reference Policy</h3>
            <div className="form-grid compact">
              <Field label="Reference Set">
                <input
                  value={projectConfig.layoutPolicy.layoutReferenceSet}
                  onChange={(event) => setConfig(["layoutPolicy", "layoutReferenceSet"], event.target.value)}
                />
              </Field>
              <Field label="Default Template">
                <select
                  value={projectConfig.layoutPolicy.defaultTemplate}
                  onChange={(event) => setConfig(["layoutPolicy", "defaultTemplate"], event.target.value)}
                >
                  {LAYOUT_TEMPLATES.map(([id, name]) => (
                    <option key={id} value={id}>{`${name} - ${id}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Long Text Template">
                <select
                  value={projectConfig.layoutPolicy.longTextTemplate}
                  onChange={(event) => setConfig(["layoutPolicy", "longTextTemplate"], event.target.value)}
                >
                  {LAYOUT_TEMPLATES.map(([id, name]) => (
                    <option key={id} value={id}>{`${name} - ${id}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Comparison Template">
                <select
                  value={projectConfig.layoutPolicy.comparisonTemplate}
                  onChange={(event) => setConfig(["layoutPolicy", "comparisonTemplate"], event.target.value)}
                >
                  {LAYOUT_TEMPLATES.map(([id, name]) => (
                    <option key={id} value={id}>{`${name} - ${id}`}</option>
                  ))}
                </select>
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={projectConfig.layoutPolicy.textFitFirst}
                  onChange={(event) => setConfig(["layoutPolicy", "textFitFirst"], event.target.checked)}
                />
                Text-fit preview before image spend
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={projectConfig.layoutPolicy.chapterByChapterRender}
                  onChange={(event) => setConfig(["layoutPolicy", "chapterByChapterRender"], event.target.checked)}
                />
                Render chapter by chapter
              </label>
            </div>
          </div>

          <div className="config-section">
            <h3>Layout Prompt Library</h3>
            <p className="hint">
              Each layout keeps its mockup image path and image prompt template together. The placeholders get filled
              after the text-fit mockup is approved.
            </p>
            <div className="layout-asset-grid">
              {projectConfig.layoutPromptAssets.map((asset, index) => (
                <article className="layout-asset-card" key={asset.templateId}>
                  <div className="layout-asset-head">
                    <strong>{asset.label}</strong>
                    <span>{asset.templateId}</span>
                  </div>
                  <Field label="Mockup Image Path">
                    <input
                      value={asset.mockupImagePath}
                      onChange={(event) => updateLayoutAsset(index, "mockupImagePath", event.target.value)}
                    />
                  </Field>
                  <Field label="Upload Mockup Image">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => uploadLayoutMockup(index, event.target.files?.[0])}
                    />
                  </Field>
                  <p className="filename-hint">Recommended name: {asset.mockupImagePath}</p>
                  {asset.mockupImageDataUrl ? (
                    <img className="layout-mockup-preview" src={asset.mockupImageDataUrl} alt={`${asset.label} mockup`} />
                  ) : (
                    <div className="layout-mockup-empty">No mockup uploaded</div>
                  )}
                  <Field label="Written Layout Description">
                    <textarea
                      className="notes-field"
                      value={asset.layoutDescription || ""}
                      onChange={(event) => updateLayoutAsset(index, "layoutDescription", event.target.value)}
                    />
                  </Field>
                  <Field label="Use Cases">
                    <textarea
                      className="notes-field"
                      value={(asset.useCases || []).join("\n")}
                      onChange={(event) =>
                        updateLayoutAsset(
                          index,
                          "useCases",
                          event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                        )
                      }
                    />
                  </Field>
                  <Field label="Avoid When">
                    <textarea
                      className="notes-field"
                      value={(asset.avoidWhen || []).join("\n")}
                      onChange={(event) =>
                        updateLayoutAsset(
                          index,
                          "avoidWhen",
                          event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                        )
                      }
                    />
                  </Field>
                  <Field label="Text Zone Description">
                    <textarea
                      className="notes-field"
                      value={asset.textZoneDescription || ""}
                      onChange={(event) => updateLayoutAsset(index, "textZoneDescription", event.target.value)}
                    />
                  </Field>
                  <Field label="Image Zone Description">
                    <textarea
                      className="notes-field"
                      value={asset.imageZoneDescription || ""}
                      onChange={(event) => updateLayoutAsset(index, "imageZoneDescription", event.target.value)}
                    />
                  </Field>
                  <div className="capacity-grid">
                    <Field label="Min Words">
                      <input
                        type="number"
                        value={asset.minWords}
                        onChange={(event) => updateLayoutAsset(index, "minWords", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Target Words">
                      <input
                        type="number"
                        value={asset.targetWords}
                        onChange={(event) => updateLayoutAsset(index, "targetWords", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Max Words">
                      <input
                        type="number"
                        value={asset.maxWords}
                        onChange={(event) => updateLayoutAsset(index, "maxWords", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Body Pt">
                      <input
                        type="number"
                        step="0.5"
                        value={asset.recommendedBodyPt}
                        onChange={(event) => updateLayoutAsset(index, "recommendedBodyPt", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Line Height">
                      <input
                        type="number"
                        step="0.01"
                        value={asset.recommendedLineHeight}
                        onChange={(event) => updateLayoutAsset(index, "recommendedLineHeight", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Capacity Status">
                      <select
                        value={asset.capacityTestStatus}
                        onChange={(event) => updateLayoutAsset(index, "capacityTestStatus", event.target.value)}
                      >
                        <option value="UNTESTED">Untested</option>
                        <option value="TESTING">Testing</option>
                        <option value="APPROVED">Approved</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Prompt Template">
                    <textarea
                      className="prompt-template"
                      value={asset.promptTemplate}
                      onChange={(event) => updateLayoutAsset(index, "promptTemplate", event.target.value)}
                    />
                  </Field>
                  <Field label="Placeholders">
                    <input
                      value={asset.placeholders.join(", ")}
                      onChange={(event) =>
                        updateLayoutAsset(
                          index,
                          "placeholders",
                          event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </Field>
                  <Field label="Text Fit Rule">
                    <input
                      value={asset.textFitRule}
                      onChange={(event) => updateLayoutAsset(index, "textFitRule", event.target.value)}
                    />
                  </Field>
                  <Field label="Image Slot Rule">
                    <input
                      value={asset.imageSlotDescription}
                      onChange={(event) => updateLayoutAsset(index, "imageSlotDescription", event.target.value)}
                    />
                  </Field>
                  <Field label="Capacity Notes">
                    <textarea
                      className="notes-field"
                      value={asset.capacityNotes || ""}
                      onChange={(event) => updateLayoutAsset(index, "capacityNotes", event.target.value)}
                    />
                  </Field>
                  <Field label="Operator / Agent Notes">
                    <textarea
                      className="notes-field"
                      value={asset.operatorNotes}
                      onChange={(event) => updateLayoutAsset(index, "operatorNotes", event.target.value)}
                    />
                  </Field>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside className="side-stack">
          <section className="panel preview-panel">
            <h2>Operator Preview</h2>
            <div className="book-preview" style={{ backgroundColor: projectConfig.colorPalette.paper }}>
              <p className="preview-kicker" style={{ color: projectConfig.colorPalette.accent }}>
                {projectConfig.brand} / {projectConfig.outputProfile.printEdition}
              </p>
              <h3 style={{ color: projectConfig.colorPalette.ink, fontFamily: projectConfig.typography.headingFont }}>
                {projectConfig.title}
              </h3>
              <p className="preview-subtitle">{projectConfig.subtitle}</p>
              <p
                className="preview-body"
                style={{
                  color: projectConfig.colorPalette.ink,
                  fontFamily: projectConfig.typography.bodyFont,
                  fontSize: `${projectConfig.typography.bodyPt}px`,
                  lineHeight: projectConfig.typography.lineHeight,
                }}
              >
                Chanterelle identification notes sit beside a cinematic naturalist illustration. Section labels use
                {projectConfig.typography.smallCaps ? " small caps" : " normal caps"}.
              </p>
              <div className="mock-art">subject art slot</div>
            </div>
            <div className="facts">
              <span>{projectConfig.trimSize.widthIn} x {projectConfig.trimSize.heightIn} in</span>
              <span>Bleed {projectConfig.trimSize.bleedIn} in</span>
              <span>{projectConfig.outputProfile.renderEngine}</span>
            </div>
          </section>

          <section className="panel">
            <h2>Active Project</h2>
            <select value={activeProjectId} onChange={(event) => setActiveProjectId(event.target.value)}>
              <option value="">No project selected</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title} - {project.status}
                </option>
              ))}
            </select>
            {selectedProject && <p className="meta">Selected: {selectedProject.id}</p>}
          </section>

          <section className="panel template-panel">
            <h2>16 Layout Templates</h2>
            {LAYOUT_TEMPLATES.map(([id, name, description]) => (
              <div className="template-row" key={id}>
                <strong>{name}</strong>
                <span>{description}</span>
              </div>
            ))}
          </section>
        </aside>
      </section>

    </main>
  );
}

export default App;
