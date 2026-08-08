/**
 * SUBJECT-SELECTION POLICIES — what an illustration should be OF.
 *
 * Lives here, not in Style DNA. Style DNA answers "how does the art look"; these
 * answer "what do we draw, and when do we draw nothing". The same clear-line B&W
 * look can serve a diagram, an object, or a human figure — choosing between them
 * is an editorial decision about the book.
 */

import type { SubjectSelectionPolicy } from './types.js';

/** Field guide: the subject IS the species/terrain the entry is about. */
export const FIELD_GUIDE_SUBJECT_SELECTION: SubjectSelectionPolicy = {
  principle:
    'Every page is illustrated, and the illustration is the entry\'s own subject — the species, plant, fungus, or terrain feature the page describes.',
  preferences: [
    'Prefer the organism itself over its habitat when the entry names a species.',
    'Prefer a distinct secondary study on a continuation page over repeating the opener plate.',
    'Derive habitat/terrain subjects from the page body first, the chapter second.',
  ],
};

/**
 * B&W educational nonfiction for boys 9–14.
 *
 * Operator-agreed principle, recorded verbatim in intent: illustrations are
 * EXCEPTIONS earned by teaching value, and where a point lands equally well
 * without depicting a body, take the non-body framing. This is a preference, not
 * a prohibition — when depicting the body genuinely aids understanding, it is
 * allowed and expected to be handled well.
 */
export const BW_EDUCATIONAL_SUBJECT_SELECTION: SubjectSelectionPolicy = {
  principle:
    'An illustration must earn its place by improving explanation, pacing, comprehension, or reader engagement. Pages are not illustrated by default; most of this book is typeset text.',
  preferences: [
    'When the educational point can be communicated equally well through a timeline, comparison, object, diagram, or ordinary everyday scene, prefer that over unnecessary body depiction.',
    'When depicting the body is genuinely useful for understanding, age-appropriate educational body/anatomical illustration IS allowed — this is a preference for the clearer framing, never a prohibition on teaching the material.',
    'Prefer one clear idea per figure over a composite that teaches several things at once.',
    'Prefer a figure that answers a question the reader is actually asking at that point in the chapter.',
  ],
  sensitiveSubjects: [
    'Body and body-change subjects: respectful, neutral, non-gratuitous, and limited to the detail required to teach the concept. Nothing beyond what a school health text would show.',
    'Never frame a normal body change as embarrassing, shameful, abnormal, or in need of fixing.',
    'No comparison that implies a correct or ideal body.',
  ],
};
