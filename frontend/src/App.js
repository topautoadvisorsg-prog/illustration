import { useEffect, useMemo, useRef, useState } from "react";
import "@/App.css";

// Pre-fill the live backend so the admin page is ready to test without hunting for
// the URL. REACT_APP_BACKEND_URL (set in Railway) overrides this when present.
const DEFAULT_BACKEND_URL = "https://wildlandsbackend-production.up.railway.app";
const configuredBackend = process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL;

// Pipeline phases you can "talk to" in the operator console.
const PHASES = ["Manuscript", "Breakdown", "Page Plan", "Text-Fit", "Images", "Review", "Render", "Export"];
const PAID_ACTION_WARNING = "This calls a paid external API. Continue?";
const DEV_ISSUES_KEY = "wildlands_dev_issues";
const ACTIVE_PROJECT_KEY = "wildlands_active_project_id";
const ACTIVE_PHASE_KEY = "wildlands_active_phase";
const SELECTED_PAGE_PREFIX = "wildlands_selected_page:";
const MANUSCRIPT_CACHE_PREFIX = "wildlands_manuscript:";
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

function loadStoredString(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function storeString(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable - keep in memory only */
  }
}

function manuscriptCacheKey(projectId) {
  return `${MANUSCRIPT_CACHE_PREFIX}${projectId}`;
}

function selectedPageKey(projectId) {
  return `${SELECTED_PAGE_PREFIX}${projectId}`;
}

function fileNameFromPath(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean).pop() || "";
}

function loadManuscriptCache(projectId) {
  if (!projectId) return null;
  try {
    return JSON.parse(localStorage.getItem(manuscriptCacheKey(projectId)) || "null");
  } catch {
    return null;
  }
}

function saveManuscriptCache(projectId, cache) {
  if (!projectId || !cache?.markdown) return;
  try {
    localStorage.setItem(manuscriptCacheKey(projectId), JSON.stringify(cache));
  } catch {
    /* A manuscript can exceed browser storage; backend state remains source of truth. */
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

const LAYOUT_LABELS = Object.fromEntries(LAYOUT_TEMPLATES.map(([id, name]) => [id, name]));

const WORKFLOW_STAGES = [
  { key: "project", label: "Project Setup", action: "Create or select the book project." },
  { key: "manuscript", label: "Upload Manuscript", action: "Store the master manuscript." },
  { key: "breakdown", label: "Review Breakdown", action: "Confirm chapters and pages." },
  { key: "plan", label: "Review Page Plan", action: "Confirm layout and page flow." },
  { key: "textfit", label: "Run Text-Fit", action: "Check readability before images." },
  { key: "layout", label: "Approve Layouts", action: "Lock text-safe chapter layouts." },
  { key: "images", label: "Manage Images", action: "Generate, reuse, approve art." },
  { key: "proof", label: "Render Proofs", action: "Review chapter and page PDFs." },
  { key: "export", label: "Export Book", action: "Save final production output." },
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

Generate clean artwork only. The illustration must contain ZERO readable text of any kind: no subject names, labels, captions, titles, headings, paragraphs, article text, fake encyclopedia text, page numbers, headers, reference notes, measurements, callouts, or annotations. Do not draw arrows, leader lines, or pointer marks with text. All labels, names, annotations, arrows, and typography are added later by the layout/composition system - never by the image model.

Do not generate readable text by default. If a future prompt explicitly supplies an explicit subject-name label, render exactly that supplied label, large and legible, with no extra words. This planner currently supplies no such label text.

Use minimal annotation only when structurally necessary. Limit callouts to 0-2 major, obvious educational features per subject. Avoid dense labeling systems, technical breakdowns, scientific poster layouts, and small-detail callouts.

Do not build scientific-poster layouts, dense labeling systems, or technical breakdowns. The image is pure subject artwork; the educational markup is overlaid afterward.

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
  return (value || "").trim().replace(/\/+$/, "");
}

function layoutName(templateId) {
  return LAYOUT_LABELS[templateId] || templateId || "No layout";
}

function normalizeStatus(value) {
  return String(value || "pending").replace(/_/g, " ").toLowerCase();
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function safeManifestContent(manifest) {
  return manifest?.content && typeof manifest.content === "object" ? manifest.content : {};
}

function latestActiveVersion(images = []) {
  return images.find((image) => image.active) || images[0] || null;
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
    trimSize: { widthIn: 7, heightIn: 10, bleedIn: 0.125 },
    typography: {
      headingFont: "Cormorant Garamond",
      bodyFont: "EB Garamond",
      captionFont: "EB Garamond",
      bookTitlePt: 52,
      chapterTitlePt: 32,
      entryTitlePt: 26,
      sectionHeadingPt: 13,
      subsectionHeadingPt: 12.5,
      bodyPt: 11,
      captionPt: 9,
      labelPt: 8.5,
      lineHeight: 1.4,
      smallCaps: true,
    },
    colorPalette: {
      paper: "#F5EDD6",
      ink: "#2C1A0E",
      accent: "#3A5C3A",
      warning: "#8B2020",
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
    layoutApprovals: {},
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
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
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
  const [activeProjectId, setActiveProjectId] = useState(() => loadStoredString(ACTIVE_PROJECT_KEY));
  const [projectConfig, setProjectConfig] = useState(defaultProjectConfig);
  // Start empty so the operator never accidentally uploads demo text. They must
  // drop a file or paste their real manuscript before Upload is meaningful.
  const [manuscript, setManuscript] = useState("");
  const [manuscriptName, setManuscriptName] = useState("");
  const [manuscriptSummary, setManuscriptSummary] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const manuscriptInputRef = useRef(null);
  const [manifests, setManifests] = useState([]);
  const [pages, setPages] = useState([]);
  const [plannedPages, setPlannedPages] = useState([]);
  const [layoutLibraryReport, setLayoutLibraryReport] = useState(null);
  const [textFitPreview, setTextFitPreview] = useState(null);
  const [layoutApprovals, setLayoutApprovals] = useState({});
  const [pageImages, setPageImages] = useState({});
  const [imageLibrary, setImageLibrary] = useState({ total: 0, assets: [] });
  const [imageLibraryFilter, setImageLibraryFilter] = useState({ q: "", status: "", layout: "", chapter: "" });
  const [selectedPageId, setSelectedPageId] = useState("");
  const [imageInstruction, setImageInstruction] = useState("");
  const [pdfPreview, setPdfPreview] = useState({ title: "", url: "", meta: "" });
  const [renderedChapterNumber, setRenderedChapterNumber] = useState(null);
  const [chapterIntelligence, setChapterIntelligence] = useState(null);
  const [productionDashboard, setProductionDashboard] = useState(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [agents, setAgents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [commandInput, setCommandInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatPanelRef = useRef(null);
  const chatLogRef = useRef(null);
  const chatInputRef = useRef(null);
  const [phase, setPhase] = useState(() => {
    const stored = loadStoredString(ACTIVE_PHASE_KEY, PHASES[0]);
    return PHASES.includes(stored) ? stored : PHASES[0];
  });
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
  const bookManifest = useMemo(
    () => safeManifestContent(manifests.find((manifest) => manifest.kind === "BOOK")),
    [manifests],
  );
  const chapterManifests = useMemo(
    () =>
      manifests
        .filter((manifest) => manifest.kind === "CHAPTER")
        .map((manifest) => safeManifestContent(manifest))
        .sort((a, b) => Number(a.chapterNumber || 0) - Number(b.chapterNumber || 0)),
    [manifests],
  );
  const pageManifests = useMemo(
    () =>
      manifests
        .filter((manifest) => manifest.kind === "PAGE")
        .map((manifest) => safeManifestContent(manifest))
        .sort((a, b) => Number(a.pageNumber || 0) - Number(b.pageNumber || 0)),
    [manifests],
  );
  const pageByKey = useMemo(() => new Map(pages.map((page) => [page.pageKey, page])), [pages]);
  const pagePlanByKey = useMemo(() => new Map(plannedPages.map((page) => [page.pageKey, page])), [plannedPages]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) || pages[0] || null;
  const selectedPageManifest = selectedPage ? pageManifests.find((page) => page.pageId === selectedPage.pageKey) : null;
  const selectedPagePlan = selectedPage ? pagePlanByKey.get(selectedPage.pageKey) : null;
  const selectedChapterNumber =
    selectedPageManifest?.chapterNumber || selectedPage?.chapterNumber || chapterManifests[0]?.chapterNumber || null;
  const reviewChapterNumber = renderedChapterNumber || selectedChapterNumber || chapterManifests[0]?.chapterNumber || null;
  const reviewChapterPages = reviewChapterNumber
    ? pageManifests.filter((page) => page.chapterNumber === reviewChapterNumber).sort((a, b) => Number(a.pageNumber || 0) - Number(b.pageNumber || 0))
    : [];
  const selectedChapterApproval = selectedChapterNumber ? layoutApprovals[String(selectedChapterNumber)] : null;
  const selectedImages = selectedPage ? pageImages[selectedPage.id] || [] : [];
  const activeImage = latestActiveVersion(selectedImages);
  const libraryLayouts = useMemo(
    () => Array.from(new Set(imageLibrary.assets.map((asset) => asset.source.layoutTemplate).filter(Boolean))).sort(),
    [imageLibrary.assets],
  );
  const approvedChapterCount = useMemo(
    () => chapterManifests.filter((chapter) => layoutApprovals[String(chapter.chapterNumber)]).length,
    [chapterManifests, layoutApprovals],
  );
  const hasTextFitProof = Boolean(
    textFitPreview || selectedChapterApproval?.textFitSummary || Object.values(layoutApprovals).some((approval) => approval?.textFitSummary),
  );
  const plannedPageCount = pages.filter((page) => page.layoutTemplate && page.imagePrompt && page.imagePromptSha256).length;
  const imagePageCount = pages.filter((page) => ["REVIEW", "APPROVED", "PRINT_READY"].includes(page.status)).length;
  const approvedImagePageCount = pages.filter((page) => ["APPROVED", "PRINT_READY"].includes(page.status)).length;
  const operatorGuidance = useMemo(() => {
    if (busy) {
      return {
        stageKey: "system",
        stageLabel: "System Working",
        status: "Waiting on system",
        nextAction: "Let the current operation finish, then review the result in the log or preview.",
        afterAction: "After it finishes, the board will move the next incomplete stage to Next.",
        buttonLabel: "Working...",
        actionKey: null,
        helpPrompt: "What is the system doing right now, and what should I check when it finishes?",
      };
    }
    if (!activeProjectId) {
      return {
        stageKey: "project",
        stageLabel: "Project Setup",
        status: "Waiting on you",
        nextAction: "Create a new project or select an existing book project.",
        afterAction: "After that, upload the master manuscript for this book.",
        buttonLabel: "+ New Project",
        actionKey: "create-project",
        helpPrompt: "Help me start a new Wildlands book project.",
      };
    }
    if (!selectedProject?.manuscriptPath && !manuscript.trim()) {
      return {
        stageKey: "manuscript",
        stageLabel: "Upload Manuscript",
        status: "Waiting on you",
        nextAction: "Choose the master manuscript file so the system can store it on the project.",
        afterAction: "After the file is loaded, click Upload Manuscript.",
        buttonLabel: "Choose Manuscript",
        actionKey: "choose-manuscript",
        helpPrompt: "Where do I upload the manuscript, and what happens after upload?",
      };
    }
    if (!selectedProject?.manuscriptPath && manuscript.trim()) {
      return {
        stageKey: "manuscript",
        stageLabel: "Upload Manuscript",
        status: "Waiting on you",
        nextAction: "Upload the loaded manuscript to the selected project.",
        afterAction: "After upload, generate the chapter and page breakdown.",
        buttonLabel: "Upload Manuscript",
        actionKey: "upload-manuscript",
        helpPrompt: "Check whether this manuscript is ready to upload.",
      };
    }
    if (pageManifests.length === 0) {
      return {
        stageKey: "breakdown",
        stageLabel: "Review Breakdown",
        status: "Waiting on you",
        nextAction: "Generate the deterministic chapter and page breakdown, then confirm it looks right.",
        afterAction: "After the breakdown is correct, generate the page plan.",
        buttonLabel: "Start Breakdown",
        actionKey: "breakdown",
        helpPrompt: "Explain the manuscript breakdown step and what I should review.",
      };
    }
    if (plannedPageCount < pages.length || pages.length === 0) {
      return {
        stageKey: "plan",
        stageLabel: "Review Page Plan",
        status: "Waiting on you",
        nextAction: "Generate the page plan so every page has a layout, text flow, and image prompt.",
        afterAction: "After page planning, run Text-Fit before approving layouts.",
        buttonLabel: "Generate Page Plan",
        actionKey: "plan",
        helpPrompt: "Review the page plan and tell me what needs attention.",
      };
    }
    if (!hasTextFitProof) {
      return {
        stageKey: "textfit",
        stageLabel: "Run Text-Fit",
        status: "Waiting on you",
        nextAction: "Run Text-Fit to check readability before approving layouts or spending on images.",
        afterAction: "After Text-Fit passes, approve the selected chapter layout.",
        buttonLabel: "Run Text-Fit",
        actionKey: "textfit",
        helpPrompt: "Review text-fit and tell me whether the chapter is readable.",
      };
    }
    if (!selectedChapterApproval) {
      return {
        stageKey: "layout",
        stageLabel: "Approve Layouts",
        status: "Waiting on you",
        nextAction: "Approve the selected chapter layout once text-fit has no blocking readability issues.",
        afterAction: "After layout approval, render a chapter proof with placeholders.",
        buttonLabel: "Approve Layout",
        actionKey: "approve-layout",
        helpPrompt: "Should I approve this chapter layout, or is anything still risky?",
      };
    }
    if (!pdfPreview.url) {
      return {
        stageKey: "proof",
        stageLabel: "Render Proofs",
        status: "Ready for review",
        nextAction: "Render the selected chapter with placeholders, then click pages to inspect text and layout flow.",
        afterAction: "After the proof reads cleanly, move into image generation and approval.",
        buttonLabel: "Render Chapter",
        actionKey: "render-chapter",
        helpPrompt: "What should I look for when reviewing this chapter proof?",
      };
    }
    if (imagePageCount < pages.length || approvedImagePageCount < imagePageCount) {
      return {
        stageKey: "images",
        stageLabel: "Manage Images",
        status: "Waiting on review",
        nextAction: "If the text/layout proof is acceptable, generate, reuse, approve, or reject image assets page by page.",
        afterAction: "After all images are approved and print-ready, run final proof/export checks.",
        buttonLabel: "Check Assets",
        actionKey: "images",
        helpPrompt: "Which images are missing or need approval, and what should I do next?",
      };
    }
    return {
      stageKey: "export",
      stageLabel: "Export Book",
      status: "Waiting on final proof",
      nextAction: "Run final proof checks before exporting the production file.",
      afterAction: "After export, review the saved artifact and record proof findings.",
      buttonLabel: "Ask Agent",
      actionKey: "ask-agent",
      helpPrompt: "Is this book ready to export, and what remains unfinished?",
    };
  }, [
    activeProjectId,
    approvedImagePageCount,
    busy,
    hasTextFitProof,
    imagePageCount,
    manuscript,
    pageManifests.length,
    pages.length,
    pdfPreview.url,
    plannedPageCount,
    selectedChapterApproval,
    selectedProject?.manuscriptPath,
  ]);

  function chapterApproval(chapterNumber) {
    return layoutApprovals[String(chapterNumber)] || null;
  }

  function chapterPages(chapterNumber) {
    return pages.filter((page) => page.chapterNumber === chapterNumber);
  }

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
      /* localStorage unavailable - keep in memory only */
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
      (i) => `- [${i.phase}] (project ${i.projectId}${i.status ? `, status ${i.status}` : ""}) ${i.message} - ${i.time}`,
    );
    const report = `## Wildlands operator feedback for the developer\nBackend: ${apiUrl || "(unset)"}\nGenerated: ${new Date().toISOString()}\n\n${lines.join("\n")}\n`;
    try {
      await navigator.clipboard.writeText(report);
      setMessage(`Copied ${devIssues.length} issue(s) - paste this to the developer.`);
    } catch {
      setMessage("Copy failed; the report is logged below - copy it manually.");
      appendLog("issue", report);
    }
  }

  function clearDevIssues() {
    setDevIssues([]);
    persistDevIssues([]);
    setMessage("Cleared flagged developer issues.");
  }

  function focusAgentChat(prompt = operatorGuidance.helpPrompt) {
    setChatInput(prompt || "What should I do next?");
    chatPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => chatInputRef.current?.focus(), 120);
  }

  function scrollToWorkspaceSection(selector, block = "start") {
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block });
  }

  function executeOperatorNextStep() {
    switch (operatorGuidance.actionKey) {
      case "create-project":
        createNamedProject();
        break;
      case "choose-manuscript":
        openManuscriptPicker();
        break;
      case "upload-manuscript":
        run("Uploading manuscript...", uploadManuscript);
        break;
      case "breakdown":
        run("Generating manifests...", generateManifests);
        break;
      case "plan":
        run("Generating page plan...", planPages);
        break;
      case "textfit":
        run("Running text-fit preview...", runTextFitPreview);
        break;
      case "approve-layout":
        run(`Approving Chapter ${selectedChapterNumber || "?"} layout...`, () => approveChapterLayout(selectedChapterNumber));
        break;
      case "render-chapter":
        run("Rendering chapter preview...", () => renderChapterPreview(reviewChapterNumber));
        break;
      case "images":
        run("Loading image library...", () => loadImageLibrary());
        break;
      default:
        focusAgentChat();
        break;
    }
  }

  function operatorReviewStage() {
    if (operatorGuidance.stageKey === "plan") return "plan";
    if (operatorGuidance.stageKey === "textfit" || operatorGuidance.stageKey === "layout") return "textfit";
    if (operatorGuidance.stageKey === "images") return "images";
    if (operatorGuidance.stageKey === "proof" || operatorGuidance.stageKey === "export") return "render";
    return "breakdown";
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
        // Only declare a JSON body when one is actually sent. Fastify rejects
        // an empty body when Content-Type is application/json, which broke
        // bodyless POSTs like Generate Manifests and Plan Pages.
        ...(options.body != null ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    return readJson(response);
  }

  async function callPdf(path, options = {}) {
    if (!apiUrl) {
      throw new Error("Set REACT_APP_BACKEND_URL in Railway or enter the backend URL here.");
    }
    const response = await fetch(`${apiUrl}${path}`, { ...options });
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const data = await response.json();
        message = data.message || message;
      } catch {
        /* PDF endpoint returned non-JSON error text */
      }
      throw new Error(message);
    }
    return {
      blob: await response.blob(),
      headers: response.headers,
    };
  }

  function setPreviewBlob(title, blob, meta = "") {
    setPdfPreview((current) => {
      if (current.url) URL.revokeObjectURL(current.url);
      return { title, url: URL.createObjectURL(blob), meta };
    });
  }

  function requireSelectedPage() {
    if (!selectedPage) throw new Error("Select a page first.");
    return selectedPage;
  }

  function confirmPaidAction(message = PAID_ACTION_WARNING) {
    return window.confirm(message);
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
    const list = data.projects || [];
    setProjects(list);
    if (list.length === 0) {
      setActiveProjectId("");
      return;
    }

    const activeStillExists = activeProjectId && list.some((project) => project.id === activeProjectId);
    if (!activeStillExists) {
      // Prefer the most recently updated project that actually has a manuscript,
      // so the operator lands on real work instead of an empty draft.
      const withManuscript = list.filter((p) => p.manuscriptPath);
      const pick = (withManuscript.length ? withManuscript : list).reduce((newest, p) =>
        new Date(p.updatedAt || p.createdAt) > new Date(newest.updatedAt || newest.createdAt) ? p : newest,
      );
      setActiveProjectId(pick.id);
    }
  }

  async function refreshAgents() {
    const data = await call("/api/agents");
    setAgents(data.agents || []);
  }

  async function sendChat(event) {
    if (event) event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    if (!activeProjectId) {
      setChatMessages((m) => [
        ...m,
        { role: "user", content: text },
        {
          role: "assistant",
          content: `${operatorGuidance.stageLabel}: ${operatorGuidance.nextAction}\n\n${operatorGuidance.afterAction}`,
        },
      ]);
      setChatInput("");
      return;
    }
    const next = [...chatMessages, { role: "user", content: text }];
    setChatMessages(next);
    setChatInput("");
    setChatBusy(true);
    try {
      const recentLog = operatorLog.slice(0, 20).map((e) => e.text);
      const data = await call(`/api/projects/${activeProjectId}/chat`, {
        method: "POST",
        body: JSON.stringify({
          messages: next.slice(-20).map((m) => ({ role: m.role, content: m.content })),
          recentLog,
        }),
      });
      setChatMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setChatMessages((m) => [...m, { role: "assistant", content: `⚠️ ${err.message}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  // Per-stage "Review": ask the agent to QA its own output for a step. The verdict
  // shows in the chat panel so the operator gets a real check without inspecting by hand.
  async function reviewStage(stage) {
    if (!activeProjectId) {
      setChatMessages((m) => [...m, { role: "assistant", content: "Select a project first so I can review its work." }]);
      return;
    }
    if (chatBusy) return;
    setChatMessages((m) => [...m, { role: "user", content: `Review the ${stage} step and verify it's done right.` }]);
    setChatBusy(true);
    appendLog("running", `Agent reviewing ${stage}...`);
    try {
      const data = await call(`/api/projects/${activeProjectId}/review`, { method: "POST", body: JSON.stringify({ stage }) });
      setChatMessages((m) => [...m, { role: "assistant", content: `🔍 ${stage.toUpperCase()} REVIEW\n\n${data.review}` }]);
      appendLog("success", `Agent review of ${stage} complete (see chat).`);
    } catch (err) {
      setChatMessages((m) => [...m, { role: "assistant", content: `⚠️ ${err.message}` }]);
      appendLog("error", `Review failed: ${err.message}`);
    } finally {
      setChatBusy(false);
    }
  }

  function selectProject(id) {
    setActiveProjectId(id);
    setSelectedPageId("");
    setTextFitPreview(null);
    setPageImages({});
    setChapterIntelligence(null);
    setProductionDashboard(null);
    setPlannedPages([]);
    setLayoutApprovals({});
    setPdfPreview((current) => {
      if (current.url) URL.revokeObjectURL(current.url);
      return { title: "", url: "", meta: "" };
    });
    const cached = loadManuscriptCache(id);
    if (cached?.markdown) {
      setManuscript(cached.markdown);
      setManuscriptName(cached.filename || "");
      setManuscriptSummary(cached.summary || null);
    } else {
      setManuscript("");
      setManuscriptName("");
      setManuscriptSummary(null);
    }
    if (id) run(`Loading project ${id.slice(0, 8)}...`, () => loadArtifacts(id));
  }

  async function deleteProjectById(id, label) {
    if (!id) return;
    if (!window.confirm(`Permanently delete "${label}" and all its pages/images? This cannot be undone.`)) return;
    await call(`/api/projects/${id}`, { method: "DELETE" });
    appendLog("issue", `Deleted project ${id.slice(0, 8)}.`);
    if (id === activeProjectId) {
      setActiveProjectId("");
      setSelectedPageId("");
      setPlannedPages([]);
      setChapterIntelligence(null);
      setProductionDashboard(null);
      setLayoutApprovals({});
      setManifests([]);
      setPages([]);
    }
    await refreshProjects();
  }

  async function createProject(titleOverride) {
    const title = (typeof titleOverride === "string" && titleOverride.trim()) || projectConfig.title;
    const config = { ...projectConfig, title };
    const data = await call("/api/projects", {
      method: "POST",
      body: JSON.stringify({ config }),
    });
    setConfig(["title"], title); // keep the Project Setup form in sync with the new name
    setProjects((current) => [data.project, ...current.filter((project) => project.id !== data.project.id)]);
    setActiveProjectId(data.project.id);
    setMessage(`Project created: ${data.project.title}`);
    appendLog("success", `Project ready: ${data.project.title}`);
    return data.project.id;
  }

  // Ask for a name first, then create. Used by the "+ New Project" buttons.
  function createNamedProject() {
    const name = window.prompt("Name this project / book:", projectConfig.title || "Untitled Book");
    if (name === null) return; // cancelled — do nothing
    run("Creating new project...", () => createProject(name.trim() || "Untitled Book"));
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
    if (!manuscript.trim()) {
      if (selectedProject?.manuscriptPath) {
        const cached = loadManuscriptCache(projectId);
        if (cached?.markdown) {
          setManuscript(cached.markdown);
          setManuscriptName(cached.filename || "");
          setManuscriptSummary(cached.summary || null);
        }
        setMessage("Manuscript is already uploaded for this project. Continue with Breakdown / Page Plan.");
        appendLog("success", "Manuscript already exists on the selected project; upload skipped.");
        return;
      }
      throw new Error("The manuscript box is empty. Drop your .md/.txt file on it or paste your text first.");
    }
    const data = await call(`/api/projects/${projectId}/manuscript`, {
      method: "POST",
      body: JSON.stringify({ filename: manuscriptName || "manuscript.md", markdown: manuscript }),
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setManuscriptSummary(data.manuscript);
    saveManuscriptCache(projectId, {
      filename: manuscriptName || "manuscript.md",
      markdown: manuscript,
      summary: data.manuscript,
      cachedAt: new Date().toISOString(),
    });
    setMessage(`Manuscript uploaded: ${data.manuscript.sizeBytes} bytes.`);
    appendLog("success", `Manuscript uploaded: ${data.manuscript.totalChapters} chapter(s), ${data.manuscript.totalEntries} entries (each entry may render across multiple pages).`);
  }

  async function loadArtifacts(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const [manifestData, pageData] = await Promise.all([
      call(`/api/projects/${projectId}/manifests`),
      call(`/api/projects/${projectId}/pages`),
    ]);
    setManifests(manifestData.manifests || []);
    const incomingPages = pageData.pages || [];
    setPages(incomingPages);
    setLayoutApprovals(pageData.layoutApprovals || {});
    const cached = loadManuscriptCache(projectId);
    if (cached?.markdown && !manuscript.trim()) {
      setManuscript(cached.markdown);
      setManuscriptName(cached.filename || "");
      setManuscriptSummary(cached.summary || null);
    }
    setSelectedPageId((current) =>
      incomingPages.some((page) => page.id === current)
        ? current
        : incomingPages.find((page) => page.id === loadStoredString(selectedPageKey(projectId)))?.id || incomingPages[0]?.id || "",
    );
    setMessage("Loaded manifests and pages.");
    loadProductionDashboard(projectId).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      appendLog("issue", `Production dashboard not loaded yet: ${message}`);
    });
  }

  async function loadProductionDashboard(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${projectId}/production-dashboard`);
    setProductionDashboard(data);
    appendLog("success", `Production dashboard refreshed: ${data.status}.`);
    return data;
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
    const existing = await call(`/api/projects/${projectId}/manifests`);
    if (existing.manifests?.some((manifest) => manifest.kind === "PAGE")) {
      await loadArtifacts(projectId);
      setMessage("Breakdown already exists for this project. Loaded chapters/pages from the backend.");
      appendLog("success", "Breakdown already exists; loaded saved manifests/pages.");
      return;
    }

    let data;
    try {
      data = await call(`/api/projects/${projectId}/manifests`, {
        method: "POST",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already has manifests/pages")) {
        await loadArtifacts(projectId);
        setMessage("Breakdown already exists for this project. Loaded chapters/pages from the backend.");
        appendLog("success", "Breakdown already exists; loaded saved manifests/pages.");
        return;
      }
      if (message.includes("Stored manuscript file is missing")) {
        const cached = loadManuscriptCache(projectId);
        if (cached?.markdown) {
          appendLog("running", "Stored manuscript file was missing on the server; restoring it from browser cache.");
          const upload = await call(`/api/projects/${projectId}/manuscript`, {
            method: "POST",
            body: JSON.stringify({ filename: cached.filename || "manuscript.md", markdown: cached.markdown }),
          });
          setProjects((current) => current.map((project) => (project.id === upload.project.id ? upload.project : project)));
          setManuscript(cached.markdown);
          setManuscriptName(cached.filename || "");
          setManuscriptSummary(upload.manuscript);
          data = await call(`/api/projects/${projectId}/manifests`, { method: "POST" });
        } else {
          throw new Error("The server lost the stored manuscript file and this browser has no cached copy. Choose the manuscript file once to restore it.");
        }
      } else {
        throw err;
      }
    }
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setMessage(`Broke down into ${data.summary.totalPages} entries, ${data.summary.manifestsWritten} manifest row(s).`);
    appendLog("success", `Breakdown wrote ${data.summary.totalPages} entries (rendered page count is determined at render time as text flows).`);
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

  async function runTextFitPreview(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${projectId}/text-fit-preview`, {
      method: "POST",
    });
    setTextFitPreview(data);
    const overflow = data.totals?.overflow || 0;
    appendLog(overflow > 0 ? "error" : "success", `Text-fit preview complete: ${data.totals?.fits || 0} fit, ${overflow} overflow.`);
    setMessage(`Text-fit preview: ${data.readyForImageSpend ? "ready for image spend" : "needs review"}.`);
  }

  async function approveChapterLayout(chapterNumber = selectedChapterNumber, projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    if (!chapterNumber) throw new Error("Select a chapter or page first.");
    const data = await call(`/api/projects/${projectId}/chapters/${chapterNumber}/layout-approval`, {
      method: "POST",
    });
    setLayoutApprovals(data.layoutApprovals || {});
    appendLog("success", `Approved Chapter ${chapterNumber} layout for image spend.`);
    await loadArtifacts(projectId);
    setMessage(`Chapter ${chapterNumber} layout approved. Image generation is now unlocked for that chapter.`);
  }

  async function loadPageImages(pageId = selectedPageId) {
    if (!pageId) throw new Error("Select a page first.");
    const data = await call(`/api/pages/${pageId}/images`);
    setPageImages((current) => ({ ...current, [pageId]: data.images || [] }));
    appendLog("success", `Loaded ${data.images?.length || 0} image version(s) for selected page.`);
  }

  async function loadImageLibrary(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const params = new URLSearchParams();
    if (imageLibraryFilter.q.trim()) params.set("q", imageLibraryFilter.q.trim());
    if (imageLibraryFilter.status) params.set("status", imageLibraryFilter.status);
    if (imageLibraryFilter.layout) params.set("layout", imageLibraryFilter.layout);
    if (imageLibraryFilter.chapter) params.set("chapter", imageLibraryFilter.chapter);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const data = await call(`/api/projects/${projectId}/image-library${suffix}`);
    setImageLibrary(data);
    appendLog("success", `Loaded ${data.total || 0} image asset(s) from the project library.`);
  }

  async function loadChapterIntelligence(chapterNumber = reviewChapterNumber, projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    if (!chapterNumber) throw new Error("Select a chapter first.");
    const data = await call(`/api/projects/${projectId}/chapters/${chapterNumber}/operator-intelligence`);
    setChapterIntelligence(data);
    appendLog(data.status === "BLOCKED" ? "issue" : "success", `Chapter ${chapterNumber} intelligence: ${data.status}.`);
    return data;
  }

  async function refreshChapterIntelligenceAfterRender(chapterNumber) {
    try {
      await loadChapterIntelligence(chapterNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendLog("issue", `Rendered proof, but chapter intelligence could not refresh: ${message}`);
    }
  }

  async function reuseImageAsset(sourceImageId) {
    const page = requireSelectedPage();
    const data = await call(`/api/pages/${page.id}/images/reuse`, {
      method: "POST",
      body: JSON.stringify({ sourceImageId }),
    });
    appendLog("success", `Reused library asset as ${page.pageKey} version ${data.version}.`);
    await loadPageImages(page.id);
    await loadArtifacts(activeProjectId);
  }

  async function generateSelectedPageImage() {
    const page = requireSelectedPage();
    if (!confirmPaidAction("Generate an image for this page using OpenAI? This may spend API credits.")) return;
    const data = await call(`/api/pages/${page.id}/generate-image`, { method: "POST" });
    appendLog("success", `Generated image version ${data.image.version} for ${page.pageKey}.`);
    await loadPageImages(page.id);
    await loadImageLibrary(activeProjectId);
    await loadArtifacts(activeProjectId);
  }

  async function approveImageVersion(version) {
    const page = requireSelectedPage();
    await call(`/api/pages/${page.id}/images/${version}/approve`, { method: "POST" });
    appendLog("success", `Approved ${page.pageKey} image version ${version}.`);
    await loadPageImages(page.id);
    await loadArtifacts(activeProjectId);
  }

  async function rejectImageVersion(version) {
    const page = requireSelectedPage();
    const note = imageInstruction.trim() || "Rejected by operator.";
    await call(`/api/pages/${page.id}/images/${version}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
    appendLog("issue", `Rejected ${page.pageKey} image version ${version}: ${note}`);
    await loadPageImages(page.id);
  }

  async function regenerateSelectedPageImage() {
    const page = requireSelectedPage();
    const addendum = imageInstruction.trim();
    if (!addendum) throw new Error("Write the change request before regenerating.");
    if (!confirmPaidAction("Regenerate this page image with your instruction? This may spend API credits.")) return;
    const data = await call(`/api/pages/${page.id}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ promptAddendum: addendum }),
    });
    appendLog("success", `Regenerated ${page.pageKey} image version ${data.image.version}.`);
    setImageInstruction("");
    await loadPageImages(page.id);
    await loadImageLibrary(activeProjectId);
    await loadArtifacts(activeProjectId);
  }

  async function upscaleSelectedPageImage() {
    const page = requireSelectedPage();
    if (!confirmPaidAction("Upscale the approved image through Replicate? This may spend API credits.")) return;
    const data = await call(`/api/pages/${page.id}/upscale`, { method: "POST" });
    appendLog(data.passed ? "success" : "error", `Upscale ${data.passed ? "passed" : "failed"}: ${data.dpiW}x${data.dpiH} DPI.`);
    await loadPageImages(page.id);
    await loadArtifacts(activeProjectId);
  }

  async function renderChapterPreview(chapterNumber) {
    if (!activeProjectId) throw new Error("Create or select a project first.");
    const { blob, headers } = await callPdf(`/api/projects/${activeProjectId}/chapters/${chapterNumber}/render`, {
      method: "POST",
    });
    setRenderedChapterNumber(chapterNumber);
    setPreviewBlob(`Chapter ${chapterNumber} PDF Preview`, blob, `${headers.get("x-total-pages") || "?"} rendered page(s)`);
    appendLog("success", `Rendered chapter ${chapterNumber} preview.`);
    await refreshChapterIntelligenceAfterRender(chapterNumber);
  }

  async function renderPagePreview(pageKey) {
    if (!activeProjectId) throw new Error("Create or select a project first.");
    const page = pageManifests.find((candidate) => candidate.pageId === pageKey);
    const { blob, headers } = await callPdf(`/api/projects/${activeProjectId}/pages/${encodeURIComponent(pageKey)}/render`, {
      method: "POST",
    });
    const row = pageByKey.get(pageKey);
    if (row?.id) setSelectedPageId(row.id);
    setRenderedChapterNumber(page?.chapterNumber || renderedChapterNumber);
    setPreviewBlob(`${pageKey} Page Proof`, blob, `${headers.get("x-total-pages") || "?"} rendered page(s) for ${page?.entryTitle || "selected page"}`);
    appendLog("success", `Rendered page proof for ${pageKey}.`);
    if (page?.chapterNumber) await refreshChapterIntelligenceAfterRender(page.chapterNumber);
  }

  async function renderBookPreview() {
    if (!activeProjectId) throw new Error("Create or select a project first.");
    const { blob, headers } = await callPdf(`/api/projects/${activeProjectId}/render-book`, {
      method: "POST",
    });
    setPreviewBlob("Full Book PDF Preview", blob, `${headers.get("x-page-count") || "?"} page(s), preflight ${headers.get("x-preflight-passed") || "unknown"}`);
    appendLog("success", "Rendered full book PDF preview.");
  }

  async function renderCoverPreview() {
    if (!activeProjectId) throw new Error("Create or select a project first.");
    const { blob } = await callPdf(`/api/projects/${activeProjectId}/render-cover`, { method: "POST" });
    setPreviewBlob("Cover Preview (full wrap + spine)", blob, "Print-ready cover; spine width from page count");
    appendLog("success", "Rendered cover preview.");
  }

  async function renderBookReport() {
    if (!activeProjectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${activeProjectId}/render-book?format=json`, {
      method: "POST",
    });
    appendLog(data.ok ? "success" : "error", `Book render report: ${data.pageCount} page(s), preflight ${data.ok ? "passed" : "failed"}.`);
    setMessage(`Book render report stored at ${data.storedPath || "unknown path"}.`);
  }

  async function uploadManuscriptFile(file) {
    if (!file) return;
    const text = await readFileAsText(file);
    setManuscript(text);
    setManuscriptName(file.name || "manuscript.md");
    appendLog("success", `Loaded local manuscript file: ${file.name} (${text.length.toLocaleString()} chars)`);
  }

  function openManuscriptPicker() {
    const el = manuscriptInputRef.current;
    if (!el) return;
    // Chrome's modern, reliable way to open the file dialog. Falls back to
    // .click() for older browsers. A display:none input can refuse to open,
    // so the input is visually hidden (rendered) instead.
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch (err) {
      /* showPicker can throw outside a user gesture - fall through to click */
    }
    el.click();
  }

  function handleManuscriptDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadManuscriptFile(file);
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
    } else if (normalized.includes("text") && normalized.includes("fit")) {
      await run("Running text-fit preview...", runTextFitPreview);
    } else if (normalized.includes("show") && normalized.includes("prompt")) {
      setAdvancedMode(true);
      appendLog("system", "Advanced mode enabled. Prompt details are available in the selected page panel.");
    } else if (normalized.includes("generate") && normalized.includes("image")) {
      await run("Generating selected page image...", generateSelectedPageImage);
    } else if (normalized.includes("regenerate")) {
      await run("Regenerating selected page image...", regenerateSelectedPageImage);
    } else if (normalized.includes("upscale") || normalized.includes("enhance")) {
      await run("Upscaling selected page image...", upscaleSelectedPageImage);
    } else if (normalized.includes("image") || normalized.includes("proof")) {
      await run("Loading selected page images...", () => loadPageImages());
    } else if (normalized.includes("render") || normalized.includes("preview")) {
      const chapter = chapterManifests[0]?.chapterNumber || 1;
      await run("Rendering chapter preview...", () => renderChapterPreview(chapter));
    } else if (normalized.includes("export")) {
      await run("Rendering full book preview...", renderBookPreview);
    } else if (normalized.includes("refresh") || normalized.includes("output")) {
      await run("Loading output...", () => loadArtifacts());
    } else if (normalized.includes("intelligence") || normalized.includes("knowledge") || normalized.includes("standards")) {
      await run("Refreshing Publishing Intelligence...", refreshIntelligence);
    } else if (normalized.includes("run") || normalized.includes("start")) {
      await run("Running manuscript intake...", runManuscriptIntake);
    } else {
      appendLog("system", "Try: upload manuscript, start breakdown, create page plan, run text-fit, show prompts, generate image, load proof images, render preview, or export.");
    }
  }

  function workflowStageState(key) {
    if (key === operatorGuidance.stageKey) return "current";
    if (key === "project") return activeProjectId ? "done" : "current";
    if (key === "manuscript") return selectedProject?.manuscriptPath || manuscriptSummary ? "done" : activeProjectId ? "current" : "";
    if (key === "breakdown") return pageManifests.length > 0 ? "done" : selectedProject?.manuscriptPath ? "current" : "";
    if (key === "plan") return plannedPages.length > 0 || pages.some((page) => page.layoutTemplate) ? "done" : pageManifests.length > 0 ? "current" : "";
    if (key === "textfit") return hasTextFitProof ? "done" : pages.length > 0 ? "current" : "";
    if (key === "layout") return selectedChapterApproval ? "done" : hasTextFitProof ? "current" : "";
    if (key === "images") return imagePageCount > 0 ? (approvedImagePageCount === imagePageCount ? "done" : "open") : selectedChapterApproval ? "open" : "";
    if (key === "proof") return pdfPreview.url ? "done" : selectedChapterApproval ? "open" : "";
    if (key === "export") return selectedProject?.status === "EXPORTED" ? "done" : pdfPreview.url ? "current" : "";
    return "";
  }

  useEffect(() => {
    if (!apiUrl) return;
    run("Checking backend...", async () => {
      await refreshHealth();
      await Promise.all([refreshProjects(), refreshAgents()]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    storeString(ACTIVE_PROJECT_KEY, activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    storeString(ACTIVE_PHASE_KEY, phase);
  }, [phase]);

  // When the agent responds (chat reply or a Review verdict), bring the chat
  // panel into view and scroll to the newest message so the operator always
  // sees the answer instead of hunting for it.
  useEffect(() => {
    if (!chatMessages.length) return;
    const last = chatMessages[chatMessages.length - 1];
    if (last?.role !== "assistant") return;
    chatPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (activeProjectId && selectedPageId) {
      storeString(selectedPageKey(activeProjectId), selectedPageId);
    }
  }, [activeProjectId, selectedPageId]);

  useEffect(() => {
    if (!apiUrl || !activeProjectId || !projects.some((project) => project.id === activeProjectId)) return;
    loadArtifacts(activeProjectId).catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      appendLog("error", `Could not restore project output: ${errorMessage}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, activeProjectId, projects]);

  const storedManuscriptName = fileNameFromPath(selectedProject?.manuscriptPath);
  const manuscriptStatusText = manuscript.trim()
    ? `Loaded: ${manuscriptName || "pasted text"} (${manuscript.length.toLocaleString()} chars)`
    : selectedProject?.manuscriptPath
      ? `Stored on project: ${storedManuscriptName || "manuscript"}`
      : "Nothing loaded yet";
  const manuscriptFileLabel = manuscriptName || storedManuscriptName;
  const workflowSnapshot = WORKFLOW_STAGES.map((stage, index) => ({
    ...stage,
    index: index + 1,
    state: workflowStageState(stage.key),
  }));
  const completedWorkflowSteps = workflowSnapshot.filter((stage) => stage.state === "done").length;
  const workflowProgressPercent = Math.round((completedWorkflowSteps / WORKFLOW_STAGES.length) * 100);
  const dashboardChapterTotal = productionDashboard?.totals?.chapters || chapterManifests.length || bookManifest.totalChapters || 0;
  const dashboardPageTotal =
    productionDashboard?.totals?.pages || pageManifests.length || pages.length || manuscriptSummary?.totalEntries || bookManifest.totalEntries || 0;
  const dashboardPagePlanned = productionDashboard?.totals?.pagesPlanned || plannedPageCount || plannedPages.length || 0;
  const dashboardImagesGenerated = productionDashboard?.totals?.pagesWithImages || imagePageCount || imageLibrary.total || 0;
  const dashboardImagesApproved = productionDashboard?.totals?.pagesWithApprovedImages || approvedImagePageCount || 0;
  const dashboardWordCount = manuscriptSummary?.totalWords || null;
  const dashboardTitle = selectedProject?.title || projectConfig.title || "Wildlands Book Project";
  const dashboardStatus = normalizeStatus(selectedProject?.status || "Not Started");
  const printFormatLabel = projectConfig.outputProfile.pdfTarget?.toLowerCase().includes("paperback")
    ? "Paperback"
    : projectConfig.outputProfile.pdfTarget?.toLowerCase().includes("hardcover")
      ? "Hardcover"
      : "Print edition";
  const ebookFormatLabel = projectConfig.outputProfile.ebookEdition === "KINDLE_EPUB" ? "Kindle ebook" : "Digital edition";
  const colorFormatLabel = projectConfig.outputProfile.printEdition === "PREMIUM" ? "Premium color" : "Standard print";
  const operatorFormatSummary = `${printFormatLabel} + ${ebookFormatLabel}`;
  const sidebarStatusLabel = {
    done: "Complete",
    current: "Now",
    open: "Open",
    "": "Locked",
  };
  const systemReadyItems = [
    { label: health?.ok ? "Backend online" : "Backend unchecked", ok: Boolean(health?.ok) },
    { label: activeProjectId ? "Project selected" : "No project selected", ok: Boolean(activeProjectId) },
    { label: selectedProject?.manuscriptPath || manuscript.trim() ? "Manuscript ready" : "Manuscript needed", ok: Boolean(selectedProject?.manuscriptPath || manuscript.trim()) },
    { label: pageManifests.length > 0 ? "Breakdown available" : "Breakdown pending", ok: pageManifests.length > 0 },
  ];

  return (
    <main className="app-shell">
      <aside className="app-sidebar" aria-label="Publishing workspace navigation">
        <div className="sidebar-brand">
          <span className="brand-mark">WL</span>
          <div>
            <strong>Wildlands</strong>
            <small>Publishing Platform</small>
          </div>
        </div>
        <button type="button" className="sidebar-primary active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Dashboard
        </button>
        <div className="sidebar-section">
          <span>Publishing Workflow</span>
          <div className="sidebar-workflow">
            {workflowSnapshot.map((stage) => (
              <button
                type="button"
                className={`sidebar-stage ${stage.state || "locked"}`}
                key={stage.key}
                onClick={() => scrollToWorkspaceSection(".review-board")}
              >
                <em>{stage.index}</em>
                <strong>{stage.label}</strong>
                <small>{sidebarStatusLabel[stage.state]}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-section">
          <span>Resources</span>
          <button type="button" className="sidebar-link" onClick={() => scrollToWorkspaceSection(".asset-library-panel")}>
            Asset Desk
          </button>
          <button type="button" className="sidebar-link" onClick={() => scrollToWorkspaceSection(".upload-dropzone", "center")}>
            Project Files
          </button>
          <button type="button" className="sidebar-link" onClick={() => scrollToWorkspaceSection(".operator-log", "center")}>
            Activity Log
          </button>
          <button
            type="button"
            className="sidebar-link"
            onClick={() => {
              setAdvancedMode(true);
              window.setTimeout(() => scrollToWorkspaceSection(".intelligence-panel"), 80);
            }}
          >
            Settings
          </button>
        </div>
        <div className="sidebar-help">
          <strong>Need Help?</strong>
          <span>The Publishing Agent knows this project state.</span>
          <button type="button" onClick={() => focusAgentChat()}>
            Ask Agent
          </button>
        </div>
      </aside>

      <div className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Wildlands Publishing Workspace</p>
          <h1>Project Dashboard</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="secondary" onClick={() => focusAgentChat()}>
            Ask Agent
          </button>
          <label className="advanced-toggle">
            <input type="checkbox" checked={advancedMode} onChange={(event) => setAdvancedMode(event.target.checked)} />
            Advanced
          </label>
          <div className={`status ${health?.ok ? "ok" : "warn"}`}>{health?.ok ? "Backend online" : "Backend unchecked"}</div>
        </div>
      </section>

      {advancedMode && (
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
      )}

      {(message || error) && <section className={`notice ${error ? "error" : ""}`}>{error || message}</section>}

      <section className="dashboard-hero">
        <div className="project-cover-card" aria-hidden="true">
          <span>New England</span>
          <strong>Wildlands</strong>
        </div>
        <div className="dashboard-project">
          <p className="eyebrow">Current Project</p>
          <h2>{dashboardTitle}</h2>
          <div className="dashboard-current-step">
            <span>{dashboardStatus}</span>
            <strong>{operatorGuidance.stageLabel}</strong>
            <small>{operatorGuidance.nextAction}</small>
          </div>
        </div>
        <div className="dashboard-progress">
          <p className="eyebrow">Overall Progress</p>
          <strong>{workflowProgressPercent}%</strong>
          <div className="progress-track" aria-label={`${workflowProgressPercent}% workflow complete`}>
            <span style={{ width: `${workflowProgressPercent}%` }} />
          </div>
          <small>{completedWorkflowSteps} of {WORKFLOW_STAGES.length} steps complete</small>
        </div>
        <div className="dashboard-metrics">
          <div>
            <strong>{dashboardChapterTotal}</strong>
            <span>chapters</span>
          </div>
          <div>
            <strong>{dashboardPageTotal}</strong>
            <span>pages mapped</span>
          </div>
          <div>
            <strong>{dashboardPagePlanned}</strong>
            <span>pages planned</span>
          </div>
          <div>
            <strong>{dashboardWordCount ? dashboardWordCount.toLocaleString() : "pending"}</strong>
            <span>words</span>
          </div>
        </div>
        <div className="dashboard-images">
          <p className="eyebrow">Images</p>
          <strong>{dashboardImagesGenerated} / {dashboardPageTotal || 0}</strong>
          <span>{dashboardImagesApproved} approved</span>
          <button type="button" className="secondary" disabled={!activeProjectId} onClick={() => scrollToWorkspaceSection(".asset-library-panel")}>
            View Assets
          </button>
        </div>
      </section>

      <section className="operator-grid">
        <section className="panel command-panel">
          <div className="section-head">
            <div>
              <h2>Project Intake + Activity Log</h2>
              <p className="hint">Select the book project, upload the manuscript, and watch system activity. Use Chat with the Agent for questions and changes.</p>
            </div>
            <span className="mode-pill">{busy ? "Running" : "Ready"}</span>
          </div>
          <div className="phase-row project-row">
            <label htmlFor="project-select">Project</label>
            <div className="project-picker" id="project-select" role="listbox" aria-label="Projects">
              {projects.map((p) => (
                <div className="project-item" key={p.id}>
                  <button
                    type="button"
                    className={p.id === activeProjectId ? "picker-button active" : "picker-button"}
                    onClick={() => selectProject(p.id)}
                  >
                    <strong>{p.title || "Untitled"}</strong>
                    <span>{p.id.slice(0, 8)} · {p.manuscriptPath ? "✓ manuscript" : "no manuscript"} · {p.status}</span>
                    <span>{p.createdAt ? new Date(p.createdAt).toLocaleString() : ""}</span>
                  </button>
                  <button
                    type="button"
                    className="project-delete"
                    title="Delete this project permanently"
                    disabled={busy}
                    onClick={() => run("Deleting project...", () => deleteProjectById(p.id, p.title || p.id.slice(0, 8)))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {projects.length === 0 && <span className="empty-inline">No projects yet</span>}
            </div>
            <button type="button" disabled={busy} onClick={createNamedProject}>
              + New Project
            </button>
            <span className="hint">{projects.length} project{projects.length === 1 ? "" : "s"}</span>
          </div>
          <div className="quick-actions">
            <button disabled={busy} onClick={() => run("Checking backend...", refreshHealth)}>Check Backend</button>
            <button disabled={busy} onClick={openManuscriptPicker}>Choose File</button>
            <button disabled={busy || !activeProjectId} onClick={() => run("Uploading manuscript...", uploadManuscript)}>
              Upload Manuscript
            </button>
          </div>
          <div
            className={isDragging ? "upload-dropzone dragging" : "upload-dropzone"}
            onClick={openManuscriptPicker}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleManuscriptDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openManuscriptPicker();
            }}
          >
            <strong>{isDragging ? "Drop your manuscript file" : "Drag & drop your manuscript here"}</strong>
            <span>or click to choose a .md / .txt file</span>
            <span className="file-name-loaded">{manuscriptStatusText}</span>
          </div>
          <input
            ref={manuscriptInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }}
            tabIndex={-1}
            onChange={(event) => {
              uploadManuscriptFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
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
          <h2>Agent Workflow</h2>
          <div className="flow-steps">
            {WORKFLOW_STAGES.map((stage, index) => (
              <div className={`flow-step ${workflowStageState(stage.key)}`} key={stage.key}>
                <strong>{index + 1}. {stage.label}</strong>
                <span>{stage.action}</span>
              </div>
            ))}
          </div>
          {advancedMode && (
          <div className="agent-roster">
            <h3>Pipeline Agents</h3>
            {agents.map((agent) => (
              <article className="agent-card" key={agent.id}>
                <strong>{agent.name}</strong>
                <span>{agent.mission}</span>
                <small>{agent.expertFrame}</small>
              </article>
            ))}
            {agents.length === 0 && <p className="empty">Agent roster not loaded yet.</p>}
          </div>
          )}
        </section>
      </section>

      <section className="panel chat-panel" ref={chatPanelRef}>
        <div className="section-head">
          <h2>💬 Chat with the Agent</h2>
          <span className="hint">Ask what happened, what's wrong, or what to do next — it knows this project's live state. Review verdicts appear here too.</span>
        </div>
        <div className="chat-log" ref={chatLogRef}>
          {chatMessages.length === 0 && (
            <p className="empty">Ask me anything about this project — e.g. “what’s the status?”, “what do I click next?”, “why did that fail?”</p>
          )}
          {chatMessages.map((m, i) => (
            <div className={`chat-msg ${m.role}`} key={i}>
              <strong>{m.role === "user" ? "You" : "Agent"}</strong>
              <p>{m.content}</p>
            </div>
          ))}
          {chatBusy && (
            <div className="chat-msg assistant">
              <strong>Agent</strong>
              <p>…thinking</p>
            </div>
          )}
        </div>
        <form className="chat-form" onSubmit={sendChat}>
          <input
            ref={chatInputRef}
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={activeProjectId ? "Message the agent about this project..." : "Ask how to get started..."}
            disabled={chatBusy}
          />
          <button type="submit" disabled={chatBusy || !chatInput.trim()}>Send</button>
        </form>
      </section>

      <section className="panel review-board">
        <div className="section-head">
          <div>
            <p className="eyebrow">Operator Review Mode</p>
            <h2>Publishing Workflow Board</h2>
            <p className="hint">Work left to right: confirm the book map, approve text-safe layouts, manage art assets, then render proofs.</p>
          </div>
          <div className="button-row">
            <button disabled={busy || !activeProjectId} onClick={() => run("Running manuscript intake...", runManuscriptIntake)}>
              Run Agent Intake
            </button>
            <button disabled={busy || !activeProjectId || pages.length === 0} onClick={() => run("Running text-fit preview...", runTextFitPreview)}>
              Run Text-Fit
            </button>
          </div>
        </div>

        <div className="stage-strip">
          {WORKFLOW_STAGES.map((stage, index) => (
            <div className={`stage-card ${workflowStageState(stage.key)}`} key={stage.key}>
              <div className="stage-card-top">
                <span>{index + 1}</span>
                <em>
                  {workflowStageState(stage.key) === "done"
                    ? "Done"
                    : workflowStageState(stage.key) === "current"
                      ? "Next"
                      : workflowStageState(stage.key) === "open"
                        ? "Open"
                        : "Locked"}
                </em>
              </div>
              <strong>{stage.label}</strong>
              <small>{stage.action}</small>
            </div>
          ))}
        </div>

        <section className={`operator-guidance ${operatorGuidance.stageKey}`}>
          <div className="guidance-main">
            <span className="mode-pill">{operatorGuidance.status}</span>
            <h3>{operatorGuidance.stageLabel}</h3>
            <p>{operatorGuidance.nextAction}</p>
            <small>{operatorGuidance.afterAction}</small>
          </div>
          <div className="guidance-actions">
            <button disabled={busy || !operatorGuidance.actionKey} onClick={executeOperatorNextStep}>
              {operatorGuidance.buttonLabel}
            </button>
            <button type="button" className="secondary" onClick={() => focusAgentChat()}>
              Ask Agent What To Do
            </button>
            <button
              type="button"
              className="review-button"
              disabled={chatBusy || !activeProjectId}
              onClick={() => reviewStage(operatorReviewStage())}
            >
              Audit Current Stage
            </button>
          </div>
          <div className="guidance-status-grid">
            <div>
              <strong>{pageManifests.length}</strong>
              <span>pages mapped</span>
            </div>
            <div>
              <strong>{plannedPageCount}</strong>
              <span>pages planned</span>
            </div>
            <div>
              <strong>{approvedChapterCount}/{chapterManifests.length || 0}</strong>
              <span>chapters approved</span>
            </div>
            <div>
              <strong>{imagePageCount}</strong>
              <span>pages with art</span>
            </div>
          </div>
          <p className="agent-help-note">Need changes or fixes? Use chat for project questions, Audit Current Stage for a structured review, and the page/image controls inside each stage for direct edits.</p>
        </section>

        <section className="production-dashboard">
          <div className="section-head compact">
            <div>
              <p className="eyebrow">Production Dashboard</p>
              <h3>{productionDashboard?.status ? productionDashboard.status.replaceAll("_", " ") : "Not Loaded"}</h3>
              <p className="hint">{productionDashboard?.nextAction || "Refresh the dashboard to see book-wide blockers, queues, and chapter readiness."}</p>
            </div>
            <div className="button-row">
              <button disabled={busy || !activeProjectId} onClick={() => run("Refreshing production dashboard...", () => loadProductionDashboard())}>
                Refresh Dashboard
              </button>
              <button type="button" className="secondary" disabled={!activeProjectId} onClick={() => focusAgentChat("Read the production dashboard and tell me what to do next.")}>
                Ask About Dashboard
              </button>
            </div>
          </div>
          {productionDashboard ? (
            <>
              <div className="production-metrics">
                <div>
                  <strong>{productionDashboard.totals.layoutApprovedChapters}/{productionDashboard.totals.chapters}</strong>
                  <span>chapters approved</span>
                </div>
                <div>
                  <strong>{productionDashboard.totals.pagesPlanned}/{productionDashboard.totals.pages}</strong>
                  <span>pages planned</span>
                </div>
                <div>
                  <strong>{productionDashboard.totals.pagesWithImages}</strong>
                  <span>pages with art</span>
                </div>
                <div>
                  <strong>{productionDashboard.totals.pagesWithApprovedImages}</strong>
                  <span>approved art</span>
                </div>
                <div>
                  <strong>{productionDashboard.totals.pagesPrintReady}</strong>
                  <span>print ready</span>
                </div>
                <div>
                  <strong>{productionDashboard.totals.exportsReady}</strong>
                  <span>ready exports</span>
                </div>
              </div>
              <div className="production-queues">
                <div>
                  <strong>Waiting On Operator</strong>
                  {productionDashboard.waitingOnOperator.map((item) => (
                    <p key={item.label}><span>{item.count}</span> {item.label}: {item.action}</p>
                  ))}
                  {productionDashboard.waitingOnOperator.length === 0 && <p className="empty">No operator queue items.</p>}
                </div>
                <div>
                  <strong>Waiting On System</strong>
                  {productionDashboard.waitingOnSystem.map((item) => (
                    <p key={item.label}><span>{item.count}</span> {item.label}: {item.action}</p>
                  ))}
                  {productionDashboard.waitingOnSystem.length === 0 && <p className="empty">No system queue items.</p>}
                </div>
                <div>
                  <strong>Current Blockers</strong>
                  {productionDashboard.blockers.slice(0, 5).map((finding, index) => (
                    <p key={`${finding.message}-${index}`}><span>{finding.severity}</span> {finding.message} {finding.recommendedAction}</p>
                  ))}
                  {productionDashboard.blockers.length === 0 && <p className="empty">No blockers detected.</p>}
                </div>
              </div>
              <div className="production-exports">
                <strong>Recent Exports</strong>
                {productionDashboard.recentExports.map((item, index) => (
                  <p key={`${item.kind}-${item.createdAt}-${index}`}>
                    <span>{item.status}</span> {item.kind} {item.filePath ? `- ${item.filePath}` : ""} <small>{new Date(item.createdAt).toLocaleString()}</small>
                  </p>
                ))}
                {productionDashboard.recentExports.length === 0 && <p className="empty">No exports recorded yet.</p>}
              </div>
              <div className="production-chapter-table">
                <div className="production-chapter-row header">
                  <span>Chapter</span>
                  <span>Status</span>
                  <span>Layout</span>
                  <span>Art</span>
                  <span>Next Action</span>
                </div>
                {productionDashboard.chapters.map((chapter) => (
                  <div className={`production-chapter-row ${chapter.status.toLowerCase().replace("_", "-")}`} key={chapter.chapterNumber}>
                    <span>{chapter.chapterNumber}. {chapter.chapterTitle}</span>
                    <span>{chapter.status.replace("_", " ")}</span>
                    <span>{chapter.layoutApproved ? "approved" : "pending"} / {chapter.pagesPlanned}/{chapter.pages} planned</span>
                    <span>{chapter.pagesWithApprovedImages}/{chapter.pages} approved, {chapter.missingImages} missing</span>
                    <span>{chapter.nextAction}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="empty">No production dashboard loaded yet.</p>
          )}
        </section>

        <div className="operator-checkpoints">
          <div>
            <strong>1. Book map</strong>
            <span>Chapters and pages exist in the right order.</span>
          </div>
          <div>
            <strong>2. Layout gate</strong>
            <span>Text-fit has no overflow before paid image work.</span>
          </div>
          <div>
            <strong>3. Asset desk</strong>
            <span>Generate, reuse, approve, and upscale images as publishing assets.</span>
          </div>
          <div>
            <strong>4. Proof</strong>
            <span>Render page-shaped PDFs and inspect readability.</span>
          </div>
        </div>

        <div className="review-grid">
          <section className="review-card">
            <div className="section-head">
              <div>
                <h3>1. Manuscript Breakdown</h3>
                <p className="hint">Confirm the manuscript became the right chapter/page map. Layout approval happens in Page Plan.</p>
              </div>
              <div className="button-row">
                <button disabled={busy || !activeProjectId} onClick={() => run("Generating manifests...", generateManifests)}>
                  Start Breakdown
                </button>
                <button type="button" className="review-button" disabled={chatBusy || !activeProjectId} onClick={() => reviewStage("breakdown")}>
                  Audit with Agent
                </button>
              </div>
            </div>
            <div className="metric-row">
              <span>{manuscriptSummary?.totalChapters ?? bookManifest.totalChapters ?? 0} chapters</span>
              <span>{manuscriptSummary?.totalEntries ?? bookManifest.totalEntries ?? 0} entries</span>
              <span>{manuscriptSummary?.totalWords ? `${manuscriptSummary.totalWords.toLocaleString()} words` : "word count pending"}</span>
            </div>
            <div className="chapter-tree">
              {chapterManifests.map((chapter) => (
                <article className="chapter-card" key={chapter.chapterNumber}>
                  <strong>Chapter {chapter.chapterNumber}: {chapter.chapterTitle}</strong>
                  <p className="review-note">{chapter.pageKeys?.length || 0} planned page(s). Select a page here, then inspect layout and text-fit in Page Plan.</p>
                  {(chapter.pageKeys || []).map((pageKey) => {
                    const page = pageManifests.find((candidate) => candidate.pageId === pageKey);
                    return (
                      <button
                        type="button"
                        className={selectedPage?.pageKey === pageKey ? "page-chip active" : "page-chip"}
                        key={pageKey}
                        onClick={() => setSelectedPageId(pageByKey.get(pageKey)?.id || "")}
                      >
                        {pageKey} / {page?.entryTitle || "Untitled page"}
                      </button>
                    );
                  })}
                </article>
              ))}
              {chapterManifests.length === 0 && <p className="empty">No chapter breakdown yet. Upload the manuscript, then start breakdown.</p>}
            </div>
          </section>

          <section className="review-card">
            <div className="section-head">
              <div>
                <h3>2. Page Plan Review</h3>
                <p className="hint">This is the spend gate: layout, text capacity, and prompt readiness before images.</p>
              </div>
              <div className="button-row">
                <button disabled={busy || !activeProjectId || pageManifests.length === 0} onClick={() => run("Planning pages...", planPages)}>
                  Generate Page Plan
                </button>
                <button type="button" className="review-button" disabled={chatBusy || !activeProjectId} onClick={() => reviewStage("plan")}>
                  Audit with Agent
                </button>
                <button disabled={busy || !activeProjectId || pages.length === 0} onClick={() => run("Running text-fit preview...", runTextFitPreview)}>
                  Text-Fit
                </button>
              </div>
            </div>
            {textFitPreview && (
              <div className={`fit-summary ${textFitPreview.readyForImageSpend ? "ok" : "warn"}`}>
                <strong>{textFitPreview.readyForImageSpend ? "Ready for image spend" : "Text-fit needs review"}</strong>
                <span>{textFitPreview.totals?.fits || 0} fit / {textFitPreview.totals?.tight || 0} tight / {textFitPreview.totals?.overflow || 0} overflow</span>
              </div>
            )}
            {!textFitPreview && pages.length > 0 && (
              <div className="fit-summary warn">
                <strong>Text-fit not loaded in this browser session</strong>
                <span>Run Text-Fit to replace pending labels with fit, tight, underfilled, or overflow.</span>
              </div>
            )}
            {selectedChapterNumber && (
              <div className={`layout-approval-panel ${selectedChapterApproval ? "ok" : "warn"}`}>
                <div>
                  <strong>Chapter {selectedChapterNumber} layout checkpoint</strong>
                  <span>
                    {selectedChapterApproval
                      ? `Approved ${new Date(selectedChapterApproval.approvedAt).toLocaleString()}`
                      : "Approve this chapter layout before any image generation spend."}
                  </span>
                </div>
                <button
                  disabled={busy || !activeProjectId || chapterPages(selectedChapterNumber).length === 0}
                  onClick={() => run(`Approving Chapter ${selectedChapterNumber} layout...`, () => approveChapterLayout(selectedChapterNumber))}
                >
                  {selectedChapterApproval ? "Re-approve Layout" : "Approve Chapter Layout"}
                </button>
              </div>
            )}
            <div className="page-plan-list">
              {pageManifests.map((page) => {
                const row = pageByKey.get(page.pageId);
                const plan = pagePlanByKey.get(page.pageId);
                const fit = textFitPreview?.pages?.find((candidate) => candidate.pageKey === page.pageId);
                const allocation = fit?.allocation;
                const artBrief = plan?.artBrief;
                const approval = chapterApproval(page.chapterNumber);
                return (
                  <article className={selectedPage?.pageKey === page.pageId ? "page-plan-card active" : "page-plan-card"} key={page.pageId}>
                    <button type="button" className="select-page-button" onClick={() => setSelectedPageId(row?.id || "")}>
                      <strong>{page.pageId} / {page.entryTitle}</strong>
                      <span>{layoutName(row?.layoutTemplate || plan?.layoutTemplate || page.layoutTemplate)}</span>
                    </button>
                    <div className="page-plan-meta">
                      <span>{plan?.wordCount ?? "?"} words</span>
                      <span>{normalizeStatus(row?.status)}</span>
                      <span>{fit?.fit?.status ? normalizeStatus(fit.fit.status) : normalizeStatus(plan?.textFitStatus || "fit pending")}</span>
                      <span>{approval ? "layout approved" : "layout pending"}</span>
                      {allocation && <span>{allocation.estimatedRenderedPages} rendered page(s)</span>}
                      <span>{plan?.blockers?.length || 0} blocker(s)</span>
                    </div>
                    {allocation && (
                      <div className="layout-allocation">
                        <div>
                          <strong>{allocation.openingPageTextPercent}% text</strong>
                          <span>{allocation.textPlacement}</span>
                        </div>
                        <div>
                          <strong>{allocation.openingPageImagePercent}% image</strong>
                          <span>{allocation.imagePlacement}</span>
                        </div>
                      </div>
                    )}
                    {advancedMode && (
                      <details className="advanced-details">
                        <summary>Prompt + layout internals</summary>
                        <p><strong>Purpose:</strong> {plan?.contentTypePurpose || page.contentType || "No purpose loaded"}</p>
                        <p><strong>Coverage:</strong> {formatPercent(plan?.coverage)} / {plan?.architecture || "architecture pending"}</p>
                        <p><strong>Text zone:</strong> {plan?.layoutInstructions?.textZone || "No text-zone note"}</p>
                        {allocation && <p><strong>Continuation:</strong> {allocation.continuationPageTextPercent}% text / {allocation.continuationPageImagePercent}% image after the opening page.</p>}
                        {artBrief?.artBox && (
                          <p>
                            <strong>Art brief:</strong> {artBrief.imagePercent}% image / {artBrief.textPercent}% text, {artBrief.artBox.widthIn}in x {artBrief.artBox.heightIn}in slot, minimum {artBrief.artBox.recommendedWidthPx} x {artBrief.artBox.recommendedHeightPx}px.
                          </p>
                        )}
                        <p><strong>Prompt hash:</strong> {row?.imagePromptSha256 || plan?.promptSha256 || "No prompt hash"}</p>
                        {row?.imagePrompt && <textarea readOnly className="prompt-template" value={row.imagePrompt} />}
                      </details>
                    )}
                  </article>
                );
              })}
              {pageManifests.length === 0 && <p className="empty">No page manifests yet. Start the breakdown first.</p>}
            </div>
          </section>

          <section className="review-card">
            <div className="section-head">
              <div>
                <h3>3. Image Proofing</h3>
                <p className="hint">Asset desk for the selected page: generate only when layouts are approved, then reuse, approve, reject, or upscale.</p>
              </div>
              <div className="button-row">
                <button disabled={busy || !selectedPage} onClick={() => run("Loading selected page images...", () => loadPageImages())}>
                  Load Images
                </button>
                <button type="button" className="review-button" disabled={chatBusy || !activeProjectId} onClick={() => reviewStage("images")}>
                  Audit with Agent
                </button>
              </div>
            </div>
            <div className="field">
              <span>Selected Page</span>
              <div className="page-picker" role="listbox" aria-label="Pages">
                {pages.map((page) => (
                  <button
                    type="button"
                    className={page.id === selectedPageId ? "picker-button active" : "picker-button"}
                    key={page.id}
                    onClick={() => setSelectedPageId(page.id)}
                  >
                    <strong>{page.pageKey}</strong>
                    <span>{normalizeStatus(page.status)}</span>
                  </button>
                ))}
                {pages.length === 0 && <span className="empty-inline">No pages yet</span>}
              </div>
            </div>
            {selectedPage && (
              <div className="selected-page-summary">
                <strong>{selectedPage.pageKey} / {selectedPageManifest?.entryTitle || "Untitled"}</strong>
                <span>{layoutName(selectedPage.layoutTemplate || selectedPagePlan?.layoutTemplate)} / {normalizeStatus(selectedPage.status)}</span>
                <span>{selectedChapterApproval ? "chapter layout approved" : "chapter layout pending"}</span>
                <span>{selectedPagePlan?.promptReady ? "prompt ready" : selectedPage.imagePrompt ? "prompt stored" : "prompt pending"}</span>
              </div>
            )}
            <div className="button-row">
              <button disabled={busy || !selectedPage || !selectedChapterApproval || !(selectedPage?.imagePrompt || selectedPagePlan?.promptReady)} onClick={() => run("Generating selected page image...", generateSelectedPageImage)}>
                Generate Image
              </button>
              <button disabled={busy || !selectedPage || selectedPage?.status !== "APPROVED"} onClick={() => run("Upscaling selected page image...", upscaleSelectedPageImage)}>
                Enhance / Upscale
              </button>
            </div>
            <details className="asset-library-panel" open>
              <summary>Project Image Library</summary>
              <div className="library-controls">
                <input
                  value={imageLibraryFilter.q}
                  onChange={(event) => setImageLibraryFilter((current) => ({ ...current, q: event.target.value }))}
                  placeholder="Search subject, page, prompt, tags..."
                />
                <select value={imageLibraryFilter.status} onChange={(event) => setImageLibraryFilter((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">Any status</option>
                  <option value="GENERATED">Generated</option>
                  <option value="REVIEW">Review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PRINT_READY">Print ready</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="FAILED">Failed</option>
                </select>
                <select value={imageLibraryFilter.layout} onChange={(event) => setImageLibraryFilter((current) => ({ ...current, layout: event.target.value }))}>
                  <option value="">Any layout</option>
                  {libraryLayouts.map((layout) => (
                    <option key={layout} value={layout}>{layoutName(layout)}</option>
                  ))}
                </select>
                <select value={imageLibraryFilter.chapter} onChange={(event) => setImageLibraryFilter((current) => ({ ...current, chapter: event.target.value }))}>
                  <option value="">Any chapter</option>
                  {chapterManifests.map((chapter) => (
                    <option key={chapter.chapterNumber} value={chapter.chapterNumber}>Chapter {chapter.chapterNumber}</option>
                  ))}
                </select>
                <button disabled={busy || !activeProjectId} onClick={() => run("Loading image library...", () => loadImageLibrary())}>
                  Load Library
                </button>
              </div>
              <div className="asset-library-summary">
                <strong>{imageLibrary.total || 0} asset(s)</strong>
                <span>generated and reusable inside this project</span>
              </div>
              <div className="asset-library-grid">
                {imageLibrary.assets.map((asset) => (
                  <article className="asset-card" key={asset.imageId}>
                    <img
                      src={`${apiUrl}${asset.previewUrl}`}
                      alt={`${asset.source.pageKey} version ${asset.version}`}
                      loading="lazy"
                    />
                    <div className="asset-card-body">
                      <strong>{asset.source.pageKey} v{asset.version}</strong>
                      <span>{asset.source.entryTitle}</span>
                      <small>{normalizeStatus(asset.status)} / {asset.widthPx || "?"} x {asset.heightPx || "?"} px</small>
                      <small>{layoutName(asset.source.layoutTemplate)}</small>
                      <div className="asset-tags">
                        {asset.compatibility.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                      </div>
                    </div>
                    <div className="button-row">
                      <button disabled={busy || !selectedPage || asset.source.pageId === selectedPage.id} onClick={() => run("Reusing image asset...", () => reuseImageAsset(asset.imageId))}>
                        Reuse on Selected Page
                      </button>
                    </div>
                    {advancedMode && (
                      <details className="advanced-details">
                        <summary>Asset details</summary>
                        <p>Created: {new Date(asset.createdAt).toLocaleString()}</p>
                        <p>Generated: {asset.generatedPath || "not stored"}</p>
                        <p>Upscaled: {asset.upscaledPath || "not upscaled"}</p>
                        <p>Prompt hash: {asset.promptSha256}</p>
                      </details>
                    )}
                  </article>
                ))}
                {imageLibrary.assets.length === 0 && <p className="empty">No library assets loaded yet.</p>}
              </div>
            </details>
            <Field label="Correction Request">
              <textarea
                className="notes-field"
                value={imageInstruction}
                onChange={(event) => setImageInstruction(event.target.value)}
                placeholder="Tell the image agent what to fix before rejecting or regenerating."
              />
            </Field>
            <div className="image-version-list">
              {selectedImages.map((image) => (
                <article className={image.active ? "image-version active" : "image-version"} key={image.version}>
                  {selectedPage && image.generatedPath && (
                    <img
                      className="image-version-preview"
                      src={`${apiUrl}/api/pages/${selectedPage.id}/image?v=${image.version}`}
                      alt={`Version ${image.version} illustration`}
                      loading="lazy"
                    />
                  )}
                  <div>
                    <strong>Version {image.version}</strong>
                    <span>{normalizeStatus(image.status)}{image.active ? " / active" : ""}</span>
                    <small>{image.widthPx || "?"} x {image.heightPx || "?"} px</small>
                  </div>
                  <div className="button-row">
                    <button disabled={busy || image.status === "REJECTED"} onClick={() => run("Approving image...", () => approveImageVersion(image.version))}>
                      Approve
                    </button>
                    <button disabled={busy} onClick={() => run("Rejecting image...", () => rejectImageVersion(image.version))}>
                      Reject
                    </button>
                  </div>
                  {advancedMode && (
                    <details className="advanced-details">
                      <summary>File details</summary>
                      <p>Generated: {image.generatedPath || "not stored"}</p>
                      <p>Upscaled: {image.upscaledPath || "not upscaled"}</p>
                    </details>
                  )}
                </article>
              ))}
              {selectedImages.length === 0 && <p className="empty">No image versions loaded for this page yet.</p>}
            </div>
            <button disabled={busy || !selectedPage || !imageInstruction.trim()} onClick={() => run("Regenerating selected page image...", regenerateSelectedPageImage)}>
              Regenerate With Correction
            </button>
          </section>

          <section className="review-card preview-review-card">
            <div className="section-head">
              <div>
                <h3>4. Render Preview + Export</h3>
                <p className="hint">Open a large PDF proof before final output. Rendering uses placeholders until approved art exists.</p>
              </div>
              <div className="button-row">
                <button disabled={busy || !reviewChapterNumber} onClick={() => run("Rendering chapter preview...", () => renderChapterPreview(reviewChapterNumber))}>
                  Render Selected Chapter
                </button>
                <button disabled={busy || !reviewChapterNumber} onClick={() => run("Checking chapter intelligence...", () => loadChapterIntelligence(reviewChapterNumber))}>
                  Check Chapter
                </button>
                <button disabled={busy || chapterManifests.length === 0} onClick={() => run("Rendering full book preview...", renderBookPreview)}>
                  Render Book PDF
                </button>
                <button disabled={busy || chapterManifests.length === 0} onClick={() => run("Rendering cover...", renderCoverPreview)}>
                  Render Cover
                </button>
                <button type="button" className="review-button" disabled={chatBusy || !activeProjectId} onClick={() => reviewStage("render")}>
                  Audit with Agent
                </button>
              </div>
            </div>
            <div className="chapter-render-row">
              {chapterManifests.map((chapter) => (
                <button
                  key={chapter.chapterNumber}
                  className={reviewChapterNumber === chapter.chapterNumber ? "active" : ""}
                  disabled={busy}
                  onClick={() => {
                    setRenderedChapterNumber(chapter.chapterNumber);
                    setChapterIntelligence(null);
                    run(`Rendering chapter ${chapter.chapterNumber}...`, () => renderChapterPreview(chapter.chapterNumber));
                  }}
                >
                  Chapter {chapter.chapterNumber}
                </button>
              ))}
            </div>
            <div className={`chapter-intelligence ${chapterIntelligence?.status ? chapterIntelligence.status.toLowerCase().replace("_", "-") : ""}`}>
              <div className="chapter-intelligence-head">
                <div>
                  <strong>Chapter Intelligence</strong>
                  <p className="hint">Production checks for the selected chapter before final image spend or export.</p>
                </div>
                <span>{chapterIntelligence?.status ? chapterIntelligence.status.replace("_", " ") : "not checked"}</span>
              </div>
              {chapterIntelligence ? (
                <>
                  <p className="next-action">{chapterIntelligence.nextAction}</p>
                  <div className="chapter-intelligence-metrics">
                    <div>
                      <strong>{chapterIntelligence.summary.pages}</strong>
                      <span>pages</span>
                    </div>
                    <div>
                      <strong>{chapterIntelligence.summary.pagesPlanned}</strong>
                      <span>planned</span>
                    </div>
                    <div>
                      <strong>{chapterIntelligence.summary.pagesWithImages}</strong>
                      <span>with art</span>
                    </div>
                    <div>
                      <strong>{chapterIntelligence.summary.pagesWithApprovedImages}</strong>
                      <span>approved art</span>
                    </div>
                    <div>
                      <strong>{chapterIntelligence.summary.placeholderPages}</strong>
                      <span>placeholders</span>
                    </div>
                  </div>
                  <div className="chapter-findings">
                    {chapterIntelligence.findings.slice(0, 8).map((finding, index) => (
                      <div className={`chapter-finding ${finding.severity.toLowerCase()}`} key={`${finding.pageKey || finding.scope}-${finding.category}-${index}`}>
                        <strong>{finding.severity}</strong>
                        <span>{finding.pageKey ? `${finding.pageKey}: ` : ""}{finding.message}</span>
                        <small>{finding.recommendedAction}</small>
                      </div>
                    ))}
                    {chapterIntelligence.findings.length === 0 && <p className="empty">No issues detected for this chapter gate.</p>}
                    {chapterIntelligence.findings.length > 8 && <p className="hint">{chapterIntelligence.findings.length - 8} more finding(s) hidden to keep this review readable.</p>}
                  </div>
                </>
              ) : (
                <p className="empty">Run Check Chapter to see layout, image, and proof-readiness blockers for this chapter.</p>
              )}
            </div>
            <div className="render-page-review-list">
              <div className="section-head compact">
                <div>
                  <strong>Review Chapter {reviewChapterNumber || "?"} Pages</strong>
                  <p className="hint">Click a page to render a focused proof for text flow and layout inspection.</p>
                </div>
              </div>
              <div className="chapter-render-row">
                {reviewChapterPages.map((page) => (
                  <button
                    key={page.pageId}
                    disabled={busy}
                    className={selectedPage?.pageKey === page.pageId ? "active" : ""}
                    onClick={() => run(`Rendering ${page.pageId} page proof...`, () => renderPagePreview(page.pageId))}
                    title={page.entryTitle}
                  >
                    {page.pageId}
                  </button>
                ))}
                {reviewChapterPages.length === 0 && <span className="empty-inline">No pages available for this chapter.</span>}
              </div>
            </div>
            {pdfPreview.url ? (
              <div className="pdf-preview-frame">
                <div className="section-head">
                  <div>
                    <strong>{pdfPreview.title}</strong>
                    <p className="hint">{pdfPreview.meta}</p>
                  </div>
                  <div className="preview-actions">
                    <a className="download-link secondary" href={pdfPreview.url} target="_blank" rel="noreferrer">Open PDF</a>
                    <a className="download-link" href={pdfPreview.url} download="wildlands-preview.pdf">Download PDF</a>
                  </div>
                </div>
                <p className="pdf-preview-note">If the embedded preview appears blank, open or download the same rendered proof. The iframe uses a temporary browser PDF blob.</p>
                <iframe title={pdfPreview.title} src={pdfPreview.url} />
              </div>
            ) : (
              <p className="empty">No PDF preview rendered yet.</p>
            )}
            <div className="button-row">
              <button disabled={busy || chapterManifests.length === 0} onClick={() => run("Rendering book report...", renderBookReport)}>
                Save Export Report
              </button>
              <button disabled title="Backend EPUB export endpoint is not exposed yet.">
                EPUB Export Not Wired
              </button>
            </div>
          </section>
        </div>
      </section>

      {advancedMode && (
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
                <option key={value || "all"} value={value} label={label} />
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
                  <option key={relation} value={relation} label={relation} />
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
      )}

      <section className="pipeline-grid">

        {advancedMode && (
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
        )}
      </section>

      <section className="workspace-grid">
        <section className="panel setup-panel">
          <div className="section-head">
            <h2>1. Project Setup</h2>
            <div className="button-row">
              <button disabled={busy} onClick={createNamedProject}>
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

          <div className="config-section operator-format-section">
            <h3>Book Format</h3>
            <div className="format-summary-grid">
              <div>
                <strong>{printFormatLabel}</strong>
                <span>{colorFormatLabel} print proof</span>
              </div>
              <div>
                <strong>{ebookFormatLabel}</strong>
                <span>Digital reading edition</span>
              </div>
              <div>
                <strong>Standards applied</strong>
                <span>Production standards are preconfigured for this book.</span>
              </div>
            </div>
            <p className="hint">Use Advanced only when you need to change production standards.</p>
          </div>

          {advancedMode && (
          <>
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
                    <option key={id} value={id} label={`${name} - ${id}`} />
                  ))}
                </select>
              </Field>
              <Field label="Long Text Template">
                <select
                  value={projectConfig.layoutPolicy.longTextTemplate}
                  onChange={(event) => setConfig(["layoutPolicy", "longTextTemplate"], event.target.value)}
                >
                  {LAYOUT_TEMPLATES.map(([id, name]) => (
                    <option key={id} value={id} label={`${name} - ${id}`} />
                  ))}
                </select>
              </Field>
              <Field label="Comparison Template">
                <select
                  value={projectConfig.layoutPolicy.comparisonTemplate}
                  onChange={(event) => setConfig(["layoutPolicy", "comparisonTemplate"], event.target.value)}
                >
                  {LAYOUT_TEMPLATES.map(([id, name]) => (
                    <option key={id} value={id} label={`${name} - ${id}`} />
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

          {advancedMode && (
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
          )}
          </>
          )}
        </section>

        <aside className="side-stack">
          <section className="panel preview-panel">
            <h2>Operator Preview</h2>
            <div className="book-preview" style={{ backgroundColor: projectConfig.colorPalette.paper }}>
              <p className="preview-kicker" style={{ color: projectConfig.colorPalette.accent }}>
                {projectConfig.authorName} / {operatorFormatSummary}
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
              <span>{printFormatLabel}</span>
              <span>{ebookFormatLabel}</span>
              <span>{colorFormatLabel}</span>
              {advancedMode && (
                <>
                  <span>{projectConfig.trimSize.widthIn} x {projectConfig.trimSize.heightIn} in</span>
                  <span>Bleed {projectConfig.trimSize.bleedIn} in</span>
                  <span>{projectConfig.outputProfile.renderEngine}</span>
                </>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>Active Project</h2>
            <div className="project-picker compact" role="listbox" aria-label="Active project">
              {projects.map((project) => (
                <button
                  type="button"
                  className={project.id === activeProjectId ? "picker-button active" : "picker-button"}
                  key={project.id}
                  onClick={() => selectProject(project.id)}
                >
                  <strong>{project.title}</strong>
                  <span>{normalizeStatus(project.status)}</span>
                </button>
              ))}
              {projects.length === 0 && <span className="empty-inline">No project selected</span>}
            </div>
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

      </div>

      <aside className="agent-rail" aria-label="Publishing agent and guidance">
        <section className="rail-card publishing-agent-card">
          <p className="eyebrow">Publishing Agent</p>
          <div className="agent-avatar" aria-hidden="true">AI</div>
          <strong>Ready to help</strong>
          <p>Ask for status, next steps, layout fixes, regeneration, or a production recommendation.</p>
          <button type="button" onClick={() => focusAgentChat()}>
            Ask Me Anything
          </button>
        </section>
        <section className="rail-card">
          <p className="eyebrow">Tips & Guidance</p>
          <div className="rail-tip">
            <strong>Where am I?</strong>
            <span>{operatorGuidance.stageLabel}</span>
          </div>
          <div className="rail-tip">
            <strong>What do I do next?</strong>
            <span>{operatorGuidance.nextAction}</span>
          </div>
          <div className="rail-tip">
            <strong>What happens after that?</strong>
            <span>{operatorGuidance.afterAction}</span>
          </div>
          <div className="rail-tip">
            <strong>How do I ask for help?</strong>
            <span>Use Ask Agent here or the chat panel in the workspace.</span>
          </div>
        </section>
        <section className="rail-card">
          <p className="eyebrow">System Status</p>
          <div className="system-list">
            {systemReadyItems.map((item) => (
              <span className={item.ok ? "ok" : "warn"} key={item.label}>
                {item.label}
              </span>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}

export default App;
