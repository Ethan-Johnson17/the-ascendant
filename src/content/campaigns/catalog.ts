/**
 * Campaign catalogue — authored campaign templates players can begin.
 *
 * Content, not engine code. Phase 6 replaces the outline below with the full, sourced History
 * curriculum; Phase 3–4 adds player-generated campaigns for any subject. Adding a template here
 * requires no engine or UI changes.
 */
export interface CampaignTemplate {
  readonly id: string;
  readonly subject: string;
  readonly title: string;
  readonly module: string;
  readonly era: string;
  readonly region: string;
  readonly description: string;
  readonly curriculumVersion: number;
  /**
   * Planned competency outline from GAME_DESIGN.md §15. Names only: definitions, attribute
   * mappings, lessons and sources are authored in Phase 6 and verified before release.
   */
  readonly plannedCompetencies: readonly string[];
  /** Planned boss encounters from GAME_DESIGN.md §15. */
  readonly plannedBosses: readonly string[];
}

export const campaignTemplates: readonly CampaignTemplate[] = [
  {
    id: 'history-early-civilizations',
    subject: 'History',
    title: 'The Rise of Early Civilizations',
    module: 'Ancient Mesopotamia',
    era: 'From the first cities to 539 BCE',
    region: 'Tigris–Euphrates river valleys',
    description:
      'Walk the floodplains between two rivers, where irrigation, writing, written law and some of the world’s earliest cities took shape. ' +
      'Learn how geography shaped settlement, how city-states governed and traded, and how historians read the evidence left behind.',
    curriculumVersion: 0,
    plannedCompetencies: [
      'Historical chronology',
      'Geography and environment',
      'Agriculture and settlement',
      'Political organization',
      'Economics and trade',
      'Law and institutions',
      'Military development',
      'Religion and culture',
      'Historical source analysis',
      'Cause-and-effect reasoning',
    ],
    plannedBosses: ['The Challenge of the Floodplain', 'The Rival City-States', 'The Crisis of the Kingdom', 'The Fall of an Empire'],
  },
];

export function findTemplate(id: string): CampaignTemplate | undefined {
  return campaignTemplates.find((t) => t.id === id);
}
