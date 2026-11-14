/**
 * Achievement definitions — content. The database grants them (see the core schema triggers);
 * this list is what the app shows. Must match supabase/migrations/*_content_seed.sql.
 */
export interface AchievementInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const achievements: readonly AchievementInfo[] = [
  { id: 'character-created', name: 'The Oath Is Sworn', description: 'Create your character.' },
  { id: 'first-campaign', name: 'First Steps', description: 'Begin your first campaign.' },
];

export function findAchievement(id: string): AchievementInfo | undefined {
  return achievements.find((a) => a.id === id);
}
