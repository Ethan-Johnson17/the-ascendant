export type StepId = 'name' | 'race' | 'class' | 'background' | 'appearance' | 'story' | 'review';

export interface CreationStep {
  readonly id: StepId;
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
}

export const creationSteps: readonly CreationStep[] = [
  { id: 'name', eyebrow: 'Identity', title: 'Who are you?', intro: 'Choose the name your legend will carry. You can be anyone.' },
  { id: 'race', eyebrow: 'Lineage', title: 'Choose your people', intro: 'Your race grants a trait used in boss encounters. It never limits what you can learn.' },
  { id: 'class', eyebrow: 'Calling', title: 'Choose your class', intro: 'Your class grants one ability for boss encounters and colours how the world sees you.' },
  { id: 'background', eyebrow: 'History', title: 'Where do you come from?', intro: 'Your background decides your starting gear and which people will speak with you.' },
  { id: 'appearance', eyebrow: 'Heraldry', title: 'Raise your colours', intro: 'Choose the colour of your crest, and describe yourself if you wish.' },
  { id: 'story', eyebrow: 'Character', title: 'What drives you?', intro: 'Optional. The Game Master will use these to shape your story.' },
  { id: 'review', eyebrow: 'The oath', title: 'Review your character', intro: 'Check everything before you begin. Your attributes start at 1. Learning is how they grow.' },
];
