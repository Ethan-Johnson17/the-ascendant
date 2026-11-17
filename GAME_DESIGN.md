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

## Attribute scores (product owner decision, 2026-11-13)

- Every attribute starts at **1** for every character. There is no point-buy, standard array or rolling.
- An attribute rises only when the player **demonstrates** real-world knowledge in a competency mapped
  to that attribute (per the campaign's competency framework). Attributes measure real knowledge.
- Race, class and background **never** change attribute scores.
- The exact growth formula (how much mastery evidence raises a score, and the maximum score) is a
  configurable engine rule to be defined in Phase 2–3 and approved by the product owner.

## Attribute sub-skills and growth (product owner decision, 2026-11-14)

- Every subject (campaign) defines **six sub-skills, one per attribute**. Each competency in the
  campaign belongs to exactly one sub-skill, and therefore to exactly one attribute.
- Attributes are shared across subjects: Intelligence earned in History and in Economics adds together.
- **Default growth rule (tunable configuration):** each competency earns points by mastery stage
  (Novice 0, Apprentice 1, Competent 2, Proficient 3, Advanced 4, Expert 5). An attribute's score is
  1 + ⌊points from all competencies tied to it ÷ 3⌋, capped at 20.

History pilot sub-skills (Ancient Mesopotamia):

| Attribute | Sub-skill | Pilot competencies |
|---|---|---|
| STR | Power and conflict | Political organization, military development, law and institutions |
| DEX | Working with evidence | Historical source analysis |
| CON | Time and continuity | Historical chronology |
| INT | Societies and economies | Geography and environment, agriculture and settlement, economics and trade |
| WIS | Applying history | Cause-and-effect reasoning |
| CHA | Culture and belief | Religion and culture |

## Accounts (product owner decision, 2026-11-14)

- An account is required to play. On first sign-in, a character previously saved in the browser can
  be brought into the account. The sample adventurer preview works without an account.
- Sign-in uses **Supabase Auth with email and password**. Google sign-in may be added later.
  Before outside beta testers join, a free email-delivery service is connected so confirmation and
  password-reset emails arrive reliably (Supabase's built-in email is for testing only).

## Race, class and background effects (product owner decision, 2026-11-13)

Rule: these choices shape boss-encounter tactics and story only. They never change XP rates, mastery,
attribute scores, or which subjects a player may study. Encounter traits and abilities take effect
when boss encounters are built (Phase 5).

| Race | Trait (in boss encounters) |
|---|---|
| Human | **Adaptable:** once per boss, answer a check with a different competency the player has mastered |
| Elf | **Keen Insight:** one free hint per boss |
| Dwarf | **Stalwart:** +1 Resolve (staying power) per encounter |
| Halfling | **Lucky:** once per boss, retry a failed check with a new question |

| Class | Signature attributes (story flavour only) | Ability (once per boss) |
|---|---|---|
| Fighter | STR, CON | **Second Wind:** a correct answer restores 1 Resolve |
| Ranger | DEX, WIS | **Scout Ahead:** preview which competencies the next phase tests |
| Rogue | DEX, CHA | **Gambit:** skip a question and face it later |
| Wizard | INT, WIS | **Arcane Recall:** open one Codex entry mid-battle |
| Cleric | WIS, CHA | **Sanctuary:** the first wrong answer costs no Resolve |

| Background | Starting gear (cosmetic in MVP) | Story effect |
|---|---|---|
| Soldier | Worn spear, campaign map | Military and strategy dialogue options |
| Scholar | Quill, wax tablet | Scribe and archivist contacts |
| Merchant | Trade ledger, coin purse | Trade and caravan dialogue options |
| Artisan | Craft tools | Workshop and guild contacts |
| Explorer | Walking staff, star chart | Traveller and geography dialogue options |

Note: the originally proposed race attribute bonuses (e.g. Elf +2 DEX) were dropped because they
conflict with the all-start-at-1 rule above (confirmed by the product owner 2026-11-14; may be
revisited in future). Classes' signature attributes have no numeric effect.

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

## Learning rules (product owner decision, 2026-11-14)

All numbers below are tunable configuration (`src/engine/learning/config.ts`), not hardcoded.

- **Mastery stages are earned by evidence, never by XP.** To move up one stage in a competency, the
  player must pass a check written for that next stage (score 80% or more) on **two different days**
  (at least 20 hours apart, so a late-night pass and a just-after-midnight pass do not count as two
  days). Stages advance one at a time.
- Checks the game can mark itself (multiple choice, ordering, matching) can raise a competency as
  far as **Proficient**. Advanced and Expert require applied evidence (written answers, scenarios,
  projects), which arrives with the AI Examiner (Phase 4) and quests (Phase 5).
- **Weakness Bank exit:** a wrong answer creates (or reopens) a weakness record for that concept. It
  leaves the bank (marked resolved, never deleted) only after **three correct answers given when the
  review is due**, roughly 1, 3 and 7 days after the mistake. A correct answer before the review is
  due does not count; another mistake restarts the count.
- **Repeat rewards:** XP is paid the **first time** a lesson is completed or a check is passed.
  Repeating them pays nothing. The exception is a **retention review the game has scheduled**: a
  pass while that review is due earns the review reward once.
- **Retention:** after a competency is demonstrated, the game schedules reviews at growing intervals
  (1, 3, 7, 14, 30, 60, 120 days). Failing a due review shortens the interval and marks the
  competency "needs review", but **never lowers an earned mastery stage**.
- **Difficulty** adapts per competency: strong recent accuracy moves questions up a level, weak
  accuracy moves them down, and many open weaknesses hold difficulty at standard. The player can ask
  for easier or harder questions in each campaign.
- **Checks are issued by the server.** The server picks the questions when a check starts and marks
  the answers when it is submitted; the answer key never reaches the player's browser before then.
- **Starter lessons** for the History pilot are written by the development team (not AI), checked
  against museum and university sources, and marked for product-owner review.

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

## AI rules (product owner decision, 2026-11-16)

- **Provider:** Groq's free tier (open model `gpt-oss-120b`) through a provider-independent layer, so
  switching provider or model is a configuration change. Development and automated tests use
  deterministic fixture answers, always labelled "Development fixture" and never presented as AI.
- **Build order:** Tutor first; then the Examiner (written answers) and Progression Advisor; then the
  Researcher and AI-generated curricula for any subject. Game Master and Strategist formats are built
  in Phase 4 and used by quests and bosses in Phase 5.
- **Written answers** count toward mastery exactly like checks (a pass on two different days), but
  only when the Examiner reports high confidence. A low-confidence marking does not count either way
  and costs the player nothing.
- **Daily limit:** 30 AI requests per player per day (configurable). When the limit or the shared
  free quota is reached, AI features pause with a clear message; lessons, checks, the Codex and the
  Weakness Bank keep working without AI.
- **Written questions (decided 2026-11-16):** every existing knowledge check includes one written
  "explain in your own words" question per attempt, and new **Advanced** checks, made only of written
  questions, unlock the Advanced stage once a competency is Proficient. The Examiner marks each
  written answer against a rubric; the game engine, not the AI, adds up the rubric points and
  decides pass or fail.
- **Unsure marking:** if the Examiner is not highly confident about any written answer in an
  attempt, the whole attempt does not count: no pass, fail, XP or Weakness Bank change. The player
  still sees the feedback and can try again.
- **Without the Examiner** (no AI set up, or the player's AI limit used up), checks up to Proficient
  are issued without their written question so learning never stops; Advanced checks wait until the
  Examiner is available.
- **Progression Advisor:** the dashboard always shows the game's own next steps (reviews due, weak
  spots, next lesson or check). An "Explain my plan" button asks the AI for a friendly explanation
  and uses one of the player's daily AI requests.
- **New subjects (decided 2026-11-16):** AI-written lessons are grounded in source text the server
  fetches itself: the relevant Wikipedia article (labelled as an encyclopedia, not an academic or
  primary source), plus academic, museum or university sources the Researcher finds once the server
  has verified them. Unverified sources are never cited.
- **AI-made subjects** follow the same mastery, XP and attribute rules as authored courses. Every
  AI-written lesson is labelled "AI-generated, not reviewed by a person", and players can report a
  mistake.
- **Building a subject** counts against the same 30-a-day AI allowance: about one request for the
  outline, then about two per lesson (lesson and check), built as the player reaches each lesson.
- **New-subject courses (decided 2026-11-16):** a first AI-made course is **short: 4 lessons**, each
  with its knowledge check (about 9 AI requests in all, built as the player goes). The game refuses
  **harmful topics** (for example weapons, self-harm, hate or sexual content); health, law and money
  courses are allowed and marked "for learning, not personal advice". **"Report a mistake"** saves the
  player's report for review and flags the lesson ("A player reported a possible mistake here");
  nothing is deleted. A player may have **3 AI-made subjects at a time**. A player frees a slot by
  **closing** a subject, not deleting it: deleting would also remove the XP earned in it, and earned
  progress is permanent. A closed subject keeps its XP and Codex entries.
- **The Tutor** answers only from the lesson's own text, Codex entries and checked sources. It may cite
  only sources already in the campaign's source list; any other citation is removed and the claim is
  flagged as unsupported. It says when it does not know rather than guessing.

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

### Artwork sourcing (product owner decision, 2026-11-14)

1. **Free-licence art first** — artwork whose licence allows use in a free and, later, a commercial
   app (e.g. public domain / CC0, or CC BY with attribution).
2. **AI-generated still images as the backup** where suitable free-licence art does not exist.
3. Every asset's source, author and licence is recorded, and required attributions are shown in the
   app. Art with unclear or non-commercial-only licences is not used.
4. Until real art is in place, the heraldic crest placeholders remain.

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
