/**
 * The free, first check on a new-subject request (GAME_DESIGN.md "New-subject courses"): refuses
 * clearly harmful requests before any AI request is spent, and spots health, law and money courses
 * so they are labelled "for learning, not personal advice". Deliberately narrow: history of wars,
 * pharmacology or computer security are fine. The course planner (AI) makes the final call on
 * anything this misses.
 */

export type AdviceArea = 'none' | 'health' | 'law' | 'money';

export type TopicDecision = { allowed: true; adviceArea: AdviceArea } | { allowed: false; reason: string };

const make = String.raw`(?:how\s+to\s+)?(?:make|making|build|building|synthes[iy][sz]e?|synthesi[sz]ing|manufactur(?:e|ing)|cook(?:ing)?|brew(?:ing)?|3d[\s-]*print(?:ing)?|assembl(?:e|ing))`;

const harmful: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: new RegExp(String.raw`\b${make}\s+(?:an?\s+|your\s+own\s+)?(?:bombs?|explosives?|ied|napalm|thermite|pipe\s*bombs?|guns?|firearms?|ghost\s*guns?|silencers?|suppressors?|weapons?|nerve\s+agents?|sarin|ricin|poisons?|bioweapons?|chemical\s+weapons?|meth(?:amphetamine)?|fentanyl|heroin|cocaine|lsd|mdma|malware|ransomware|keyloggers?|botnets?)\b`, 'i'),
    reason: 'The game can’t build a course on making weapons, drugs, poisons or malicious software.',
  },
  {
    pattern: /\b(?:suicide|self[\s-]*harm)\s+(?:methods?|techniques?|ways)\b|\bhow\s+to\s+(?:kill|hurt|harm|starve)\s+(?:myself|yourself|oneself)\b/i,
    reason: 'The game can’t build that course. If you are struggling, please talk to someone you trust or a local support line.',
  },
  {
    pattern: /\b(?:porn(?:ography)?|erotic[a]?|sexual\s+(?:techniques?|positions?)|sex\s+(?:techniques?|positions?|tips))\b/i,
    reason: 'The game doesn’t build courses with sexual content.',
  },
  {
    pattern: /\b(?:why\s+(?:\w+\s+){0,2}(?:are|is)\s+(?:inferior|subhuman)|white\s+(?:power|supremacy)\s+(?:for\s+beginners|guide|101)|how\s+to\s+(?:harass|stalk|dox|groom))\b/i,
    reason: 'The game can’t build courses that promote hatred or harming people.',
  },
];

const advice: readonly { area: Exclude<AdviceArea, 'none'>; pattern: RegExp }[] = [
  { area: 'health', pattern: /\b(?:health|medic\w*|anatomy|physiolog\w*|nutrition|diet\w*|disease\w*|illness\w*|symptom\w*|pharmac\w*|drugs?|mental\s+health|psychiatr\w*|nursing|first\s+aid|fitness|exercise)\b/i },
  { area: 'law', pattern: /\b(?:law|laws|legal|lawyers?|contracts?|court\w*|litigation|tenan\w*|immigration|criminal\s+justice|constitution\w*)\b/i },
  { area: 'money', pattern: /\b(?:invest\w*|stocks?|shares|trading|crypto\w*|bitcoin|tax(?:es)?|mortgages?|loans?|personal\s+finance|budget\w*|retirement|pensions?|financ\w*|money)\b/i },
];

/** Checks the player's own words: the subject and the goal. */
export function checkTopic(subject: string, objective: string): TopicDecision {
  const text = `${subject}\n${objective}`.normalize('NFKC');
  for (const h of harmful) if (h.pattern.test(text)) return { allowed: false, reason: h.reason };
  return { allowed: true, adviceArea: adviceAreaOf(text) };
}

export function adviceAreaOf(text: string): AdviceArea {
  return advice.find((a) => a.pattern.test(text))?.area ?? 'none';
}

/** The stricter of two labels: if either the check or the planner sees an advice topic, label it. */
export function combineAdvice(a: AdviceArea, b: AdviceArea): AdviceArea {
  return a !== 'none' ? a : b;
}
