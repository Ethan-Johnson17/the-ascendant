import type { AttributeId } from '../../engine/character/attributes.ts';

/**
 * Campaign catalogue — authored campaign templates players can begin.
 *
 * Content, not engine code. Phase 6 replaces the outline below with the full, sourced History
 * curriculum; Phase 3–4 adds player-generated campaigns for any subject. Adding a template here
 * requires no engine or UI changes.
 */
export interface CompetencyOutline {
  /** Stable key, unique within the template; used as the database id suffix. */
  readonly key: string;
  readonly name: string;
  readonly attribute: AttributeId;
}

export interface CampaignTemplate {
  readonly id: string;
  readonly subject: string;
  readonly title: string;
  readonly module: string;
  readonly era: string;
  readonly region: string;
  readonly description: string;
  readonly curriculumVersion: number;
  /** Six sub-skills, one per attribute (GAME_DESIGN.md §3, decided 2026-11-14). */
  readonly subSkills: Readonly<Record<AttributeId, string>>;
  /**
   * Competency outline from GAME_DESIGN.md §15, each tied to one sub-skill (attribute).
   * Descriptions, lessons and sources are authored in Phase 6 and verified before release.
   */
  readonly competencies: readonly CompetencyOutline[];
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
    curriculumVersion: 3,
    subSkills: {
      str: 'Power and conflict',
      dex: 'Working with evidence',
      con: 'Time and continuity',
      int: 'Societies and economies',
      wis: 'Applying history',
      cha: 'Culture and belief',
    },
    competencies: [
      { key: 'chronology', name: 'Historical chronology', attribute: 'con' },
      { key: 'geography', name: 'Geography and environment', attribute: 'int' },
      { key: 'agriculture', name: 'Agriculture and settlement', attribute: 'int' },
      { key: 'political-organization', name: 'Political organization', attribute: 'str' },
      { key: 'economics-trade', name: 'Economics and trade', attribute: 'int' },
      { key: 'law-institutions', name: 'Law and institutions', attribute: 'str' },
      { key: 'military', name: 'Military development', attribute: 'str' },
      { key: 'religion-culture', name: 'Religion and culture', attribute: 'cha' },
      { key: 'source-analysis', name: 'Historical source analysis', attribute: 'dex' },
      { key: 'cause-effect', name: 'Cause-and-effect reasoning', attribute: 'wis' },
    ],
    plannedBosses: ['The Challenge of the Floodplain', 'The Rival City-States', 'The Crisis of the Kingdom', 'The Fall of an Empire'],
  },
];

export function findTemplate(id: string): CampaignTemplate | undefined {
  return campaignTemplates.find((t) => t.id === id);
}
