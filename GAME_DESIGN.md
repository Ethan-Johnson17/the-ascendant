# THE ASCENDANT
## Game Design Document — Version 1.0

**Product type:** AI-powered educational role-playing game  
**Platform:** Responsive web application, designed for eventual iOS App Store deployment  
**Audience:** Lifelong learners and career-oriented adults  
**Business model:** Free MVP and closed/open beta; monetization not included in initial scope  
**Genre:** Single-player fantasy RPG / educational simulation

---

# 1. Product Vision

The Ascendant is a single-player educational RPG in which players develop real-world knowledge and competencies through an immersive fantasy adventure.

Players create a persistent D&D-inspired character and pursue multiple learning campaigns. Each campaign focuses on a subject, such as history, economics, anatomy, marketing, or business management.

The player's character progresses as the player demonstrates understanding, retention, and practical application.

The application combines:
- Traditional RPG character development.
- Adaptive AI tutoring.
- Structured educational curricula.
- Quest-based learning.
- Competency tracking.
- Tactical, knowledge-based boss encounters.
- Cinematic storytelling.

**Core philosophy:** The player should become more capable in the real world as their character becomes more powerful in the game.

The application must be a functional game supported by a real learning engine, not simply an AI chatbot with RPG-themed graphics.

# 2. Core Design Principles

1. Learning determines progression.
2. Demonstrated mastery is more valuable than time spent.
3. AI-generated educational content must be grounded in credible sources.
4. The player controls their learning journey.
5. Failure should encourage improvement, not discourage participation.
6. Game rules and progression calculations must be deterministic.
7. The world should feel immersive without interfering with educational clarity.
8. All major game systems should be modular and expandable.

# 3. Character System

Each player creates one persistent character.

Character creation includes:

- Name.
- Race/species.
- Class.
- Background.
- Appearance.
- Six core attributes.
- Personality, ideals, bonds, and motivations.
- Starting equipment.

## Initial races

Human, Elf, Dwarf, Halfling.

## Initial classes

Fighter, Ranger, Rogue, Wizard, Cleric.

## Initial backgrounds

Soldier, Scholar, Merchant, Artisan, Explorer.

Classes and backgrounds influence narrative options and gameplay abilities. They must not restrict which subjects a player can study.

## Six core attributes

Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma.

Attributes should remain consistent across campaigns.

However, their practical competencies and effects can vary by discipline.

Example for digital marketing:

- Strength: Strategic planning and competitive positioning.
- Dexterity: Execution and content production.
- Constitution: Consistency and project management.
- Intelligence: Research and analytics.
- Wisdom: Audience understanding and social media strategy.
- Charisma: Communication, persuasion, and advertising.

These mappings must be explicitly defined in each campaign's competency framework.

## Progression

Maintain separate progression records for:

1. Global character level.
2. Campaign level.
3. Individual competency mastery.
4. Equipment and abilities.
5. Achievements.

A player may be advanced in history and a beginner in anatomy while retaining one persistent character.

# 4. Campaign System

Players may maintain multiple active campaigns and switch between them freely.

Each campaign has:

- Subject and learning objectives.
- Curriculum.
- Historical or fictional narrative.
- Skill tree.
- Competency matrix.
- Quests.
- Assessments.
- Knowledge Codex entries.
- Weakness Bank.
- Boss encounters.
- Campaign XP.
- Completion achievements.

Campaigns must be pausable and resumable.

Progress in one campaign must not erase or reset progress in another.

## Campaign generation

The player selects a subject and defines their learning objective.

Example:

"I want to understand the history of ancient civilizations, including their political systems, economic structures, military development, and cultural influence."

The Learning Engine creates a structured campaign with learning objectives, prerequisite relationships, competencies, and assessment milestones.

The player can approve or modify the proposed learning pathway.

# 5. Learning Engine

The Learning Engine is the educational foundation of the product.

It must support:

- AI-generated lessons.
- Guided explanations.
- Interactive discussions.
- Multiple-choice questions.
- Written responses.
- Verbal response support where available.
- Practical scenarios.
- Simulations.
- Projects.
- Research assignments.
- Problem-solving exercises.
- Delayed retention assessments.

Every learning activity must connect to one or more defined competencies.

## Curriculum structure

Subject → Discipline → Topic → Learning objective → Activity → Assessment.

Example:

History
- Ancient civilizations
  - Mesopotamia
    - Geography and settlement
    - Agriculture and irrigation
    - City-states
    - Government and law
    - Trade
    - Religion and culture
    - Military development

## Educational source requirements

Every campaign must maintain a bibliography.

Prioritize:
- Academic publications.
- Universities.
- Established textbooks.
- Museums and historical institutions.
- Peer-reviewed research.
- Reputable professional organizations.
- Primary historical sources where appropriate.

The AI must distinguish:
- Established facts.
- Strong scholarly consensus.
- Competing historical interpretations.
- Uncertain or disputed claims.
- Speculation.

Citations should appear in relevant lessons and be accessible through a source panel.

Do not fabricate references. If a claim cannot be verified, disclose the uncertainty.

## Adaptive difficulty

The Learning Engine should adjust difficulty based on demonstrated performance.

Consider:
- Accuracy.
- Explanation quality.
- Independent application.
- Time since last successful demonstration.
- Retention.
- Previous mistakes.
- Confidence calibration.

Players may request more or less difficulty.

# 6. Character Progression and XP

Three systems must remain separate.

**Character XP:** Overall participation and demonstrated development.

**Competency mastery:** Actual skill development within a subject.

**Knowledge retention:** The player's ability to recall and apply previously learned concepts.

XP should be awarded for meaningful educational activities.

Examples:
- Completing a lesson: small reward.
- Correctly explaining a concept: moderate reward.
- Solving an applied problem: substantial reward.
- Completing a practical project: substantial reward.
- Defeating a boss: major reward.

XP values, thresholds, and reward multipliers must be configurable.

The game engine, not the AI, calculates XP and determines level progression.

Prevent repetitive farming through activity identifiers, idempotent reward transactions, and repeat-activity rules.

# 7. Skill Matrix

Every campaign has a competency matrix.

Each competency includes:
- Name.
- Description.
- Associated core attribute.
- Prerequisite competencies.
- Mastery level.
- Assessment history.
- Retention status.
- Related knowledge entries.
- Related quests.
- Related boss mechanics.

Suggested mastery stages:

1. Novice.
2. Apprentice.
3. Competent.
4. Proficient.
5. Advanced.
6. Expert.

Progression must be based on evidence of competence rather than XP alone.

# 8. Knowledge Codex

The Knowledge Codex is the player's persistent educational journal.

Each entry contains:
- Concept.
- Explanation.
- Examples.
- Practical applications.
- Related concepts.
- References.
- Mastery status.
- Last review date.
- Assessment history.

The player can search, browse, and revisit entries.

The Codex must support cross-campaign relationships where appropriate.

# 9. Weakness Bank and Retention

The Weakness Bank stores concepts the player frequently misunderstands or forgets.

Each record should include:
- Concept identifier.
- Campaign.
- Associated competency.
- Incorrect responses.
- Error category.
- Correct explanation.
- Number of attempts.
- Last successful demonstration.
- Review priority.

Error categories may include:
- Misremembered facts.
- Conceptual misunderstanding.
- Incorrect application.
- Confusion between related concepts.
- Incomplete explanation.

Use spaced-repetition principles to schedule reviews.

Previously mastered knowledge can require reassessment, but the game should not permanently erase earned progress.

# 10. Quest System

Quest types include:

- Learning quests.
- Research quests.
- Exploration quests.
- Practical application quests.
- Investigation quests.
- Strategic decision quests.
- Review quests.
- Boss prerequisites.

Each quest must have:
- Objective.
- Relevant competencies.
- Difficulty.
- Success conditions.
- Available hints.
- XP reward.
- Narrative context.
- Completion record.

Players should have freedom to interact with the AI and NPCs while the underlying quest objectives remain structured.

# 11. Boss Battles

Boss battles are mandatory progression milestones.

Bosses represent complex problems requiring the application of multiple competencies.

Examples:
- History: A kingdom facing invasion, succession disputes, or economic collapse.
- Economics: A merchant kingdom experiencing inflation and trade disruption.
- Marketing: A failing business facing a competitive market.
- Anatomy: A complex physiological challenge requiring accurate systems knowledge.

Boss battles primarily use knowledge-based encounters with narrative strategic elements.

Combat mechanics may include:
- Player decisions.
- Knowledge checks.
- Tactical choices.
- Character attributes.
- Competency bonuses.
- Limited resources.
- Consequences for incorrect decisions.

Boss difficulty must reflect actual campaign mastery.

The boss is generated based on the player's curriculum, accomplishments, and known weaknesses.

## Boss rules

- Mandatory progression gates.
- Explicit unlock requirements.
- Multiple competency checks.
- Meaningful consequences.
- Failure is possible.
- Remedial quests on failure.
- Retry opportunities.
- Victory cinematic.

The AI evaluates responses and submits structured results. The game engine validates and applies combat outcomes.

The AI must not independently award victories or alter character statistics.

# 12. Failure and Recovery

Use a hybrid RPG/educational approach.

Players may:
- Lose encounters.
- Lose temporary resources.
- Receive injuries or temporary setbacks.
- Miss immediate objectives.
- Need additional preparation.

Players must never permanently lose educational knowledge, earned character levels, or legitimate mastery records because of a failed encounter.

Failure should create personalized recovery quests.

# 13. AI Architecture

Use specialized AI roles behind a model-agnostic orchestration layer.

### Game Master
Controls narrative, NPCs, world events, and quest presentation.

### Tutor
Teaches concepts and adapts explanations to the player.

### Examiner
Evaluates responses and identifies knowledge gaps.

### Strategist
Creates scenarios and boss encounters.

### Researcher
Finds and verifies credible educational sources.

### Progression Advisor
Recommends learning activities and review schedules.

Initially, these roles may share one model. The architecture must allow different providers and models later.

## AI safeguards

- Validate structured AI outputs.
- Keep AI-generated content separate from authoritative game state.
- Use deterministic progression calculations.
- Require evidence for mastery decisions.
- Verify educational references.
- Prevent prompt injection from retrieved sources.
- Maintain user campaign context.
- Keep provider credentials on the server.

# 14. Visual Design

Use a premium, modern RPG interface.

### Visual identity
- Charcoal and near-black backgrounds.
- Muted gold accents.
- Restrained fantasy ornamentation.
- High-quality character artwork.
- Elegant typography.
- Parchment and illustrated elements where appropriate.
- Smooth, restrained animations.
- Clear dashboard hierarchy.

Avoid cluttered traditional fantasy interfaces.

The experience should feel like a premium modern game, not a generic educational dashboard.

### Primary screens

1. Login and onboarding.
2. Character creation.
3. Main character dashboard.
4. Campaign selection.
5. Campaign dashboard.
6. Skill tree.
7. Learning interface.
8. Quest interface.
9. NPC interaction.
10. Knowledge Codex.
11. Weakness Bank.
12. Boss battle.
13. Victory/defeat cinematic.
14. Character inventory.
15. Settings and account.

Design mobile-first and desktop-responsive.

# 15. First Campaign: History

History is the first pilot discipline.

The pilot should demonstrate the complete learning loop, including research, curriculum generation, lessons, practical scenarios, competency progression, retention, and boss battles.

Recommended initial content: The Rise of Early Civilizations, with Ancient Mesopotamia as the initial playable module.

Potential competencies:
- Historical chronology.
- Geography and environment.
- Agriculture and settlement.
- Political organization.
- Economics and trade.
- Law and institutions.
- Military development.
- Religion and culture.
- Historical source analysis.
- Cause-and-effect reasoning.

Potential boss encounters:
- The Challenge of the Floodplain.
- The Rival City-States.
- The Crisis of the Kingdom.
- The Fall of an Empire.

These encounters should be grounded in historically plausible circumstances, not presented as literal historical events unless supported by evidence.

The curriculum should be expandable into other periods and regions.

# 16. Technical Architecture

Recommended initial stack:

- React and TypeScript.
- Vite for the frontend build system.
- Tailwind CSS for styling.
- Framer Motion for animations.
- Supabase for PostgreSQL, authentication, and storage.
- Server-side API/Edge Functions for AI orchestration.
- Provider abstraction for AI models.
- Capacitor as a possible future iOS packaging layer.
- GitHub for source control.

Use a modular application architecture.

Suggested modules:
- Authentication.
- Character management.
- Campaign management.
- Learning engine.
- Curriculum management.
- Competency engine.
- Progression engine.
- Quest engine.
- Combat engine.
- AI orchestration.
- Source management.
- Media management.

Use versioned database migrations and maintain a clear data model.

# 17. Free MVP Requirements

All development and closed/open beta testing should be possible without mandatory paid services.

Prioritize:
- Open-source libraries.
- Free development tools.
- Local development.
- Free-tier hosting.
- Free-tier database services.
- Free or locally hosted AI models where practical.
- Generated or reusable placeholder artwork.
- No mandatory paid API dependencies for core testing.

Clearly identify service quotas and limitations.

Do not assume unlimited free AI inference, video generation, storage, or hosting.

Design interfaces that permit paid infrastructure to be introduced later without architectural replacement.

# 18. MVP Acceptance Criteria

The MVP is not complete until a player can:

1. Create an account.
2. Create a character.
3. Start a history campaign.
4. Receive a structured curriculum.
5. Complete interactive lessons.
6. Participate in multiple assessment formats.
7. Earn XP.
8. Improve competencies.
9. View their character sheet.
10. View their skill matrix.
11. Access the Knowledge Codex.
12. Review the Weakness Bank.
13. Receive adaptive learning recommendations.
14. Unlock a mandatory boss.
15. Participate in and potentially fail a boss encounter.
16. Complete recovery quests.
17. Defeat the boss.
18. View a cinematic result.
19. Close the application and return without losing progress.

All progression must persist in the database.

The application must work on mobile browsers and desktop browsers.

# 19. Future Roadmap

Potential future capabilities:
- AI-generated battle videos.
- More races, classes, and equipment.
- Additional historical campaigns.
- Economics and business campaigns.
- Anatomy and science campaigns.
- Custom campaign creator.
- Voice interaction.
- Native iOS application.
- Offline learning support.
- Additional cinematic effects.
- Optional multiplayer and cooperative encounters.

These are not MVP requirements.

# 20. Product Success Criteria

The product should ultimately measure:
- Learning objective completion.
- Competency improvement.
- Long-term retention.
- Practical application performance.
- Campaign completion.
- User engagement.
- Return learning sessions.

Session time and XP accumulation alone are not measures of educational success.

**Final product principle: The player's real-world knowledge is the source of their character's power.**
