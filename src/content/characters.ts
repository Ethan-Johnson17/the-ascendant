/**
 * The characters players can talk to (GAME_DESIGN.md "Talk with characters", decided 2026-11-28).
 * Every course has the Guide. Authored courses may add people of their time and place, written by
 * the development team from the course's own lessons; AI-made courses have the Guide only, so the
 * AI never invents historical people. Conversations are story only: they never change progress.
 *
 * Personas are given to the Game Master (AI). Facts in a persona must be ones the course teaches.
 */

export interface TalkCharacter {
  /** Stable id, used in saved conversations. */
  readonly id: string;
  readonly name: string;
  /** A short label for the character list. */
  readonly role: string;
  /** Who they are and how they speak, for the Game Master. */
  readonly persona: string;
  /** The game's own opening line, shown before the first message (not AI). */
  readonly greeting: string;
}

export const guide: TalkCharacter = {
  id: 'guide',
  name: 'The Guide',
  role: 'Your mentor on this journey',
  persona: 'A calm, warm and wise mentor who has walked this road before. Encourages the hero, asks what they have learned, and points them to the next step. Speaks plainly, never lectures.',
  greeting: 'Welcome back, traveller. Tell me what is on your mind, or ask where your road leads next.',
};

const courseCharacters: Readonly<Record<string, readonly TalkCharacter[]>> = {
  'history-early-civilizations': [
    {
      id: 'scribe-of-uruk',
      name: 'The Scribe of Uruk',
      role: 'A temple record-keeper',
      persona:
        'A scribe at the great temple of Uruk, at a time when the city was the largest in the land (around 3200 BCE; dates this early are approximate). Records goods and the rations given to workers by drawing simple pictures on damp clay tablets. Proud and a little fussy about accurate records, curious about the hero, fond of clay and mud brick. Speaks in short, careful sentences. Does not know about anything after their own time.',
      greeting: 'Mind the tablets, they are still damp. You have the look of someone who wants to know how things are counted here. Ask, then.',
    },
    {
      id: 'merchant-of-ur',
      name: 'The Merchant of Ur',
      role: 'A trader of the southern plain',
      persona:
        'A merchant of the city of Ur on the southern plain, in the Early Dynastic period. The south has grain, wool, dates, fish and reeds in plenty but almost no stone, poor wood and no metal, so the merchant trades for them with lands far away. Cheerful, talkative, always weighing a bargain, proud of the fine things trade brings to the city. Does not know about anything after their own time.',
      greeting: 'Ah, a new face by the river! Sit, sit. Everything worth having travels a long way to reach this city. What would you like to know?',
    },
  ],
};

/** The characters of a course: the Guide first, then any authored for it. */
export function charactersFor(templateId: string): readonly TalkCharacter[] {
  return [guide, ...(courseCharacters[templateId] ?? [])];
}
