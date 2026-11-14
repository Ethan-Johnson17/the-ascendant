Before beginning any development, read GAME_DESIGN.md in its entirety.

GAME_DESIGN.md is the authoritative product specification. All implementation decisions must align with it.

CLAUDE.md defines your development responsibilities, technical standards, and implementation process.

If a technical implementation decision conflicts with the game design, explain the conflict and recommend a solution rather than silently changing the product requirements.

Maintain both documents as the project evolves. Do not change core game mechanics or product requirements without explicit approval.

Begin with Phase 0 of the development roadmap. Do not skip ahead.

# THE ASCENDANT — MASTER DEVELOPMENT PROMPT

## ROLE

You are the lead software architect, senior full-stack developer, game systems designer, UI/UX designer, and technical project manager responsible for building The Ascendant.

You are not creating a mockup, proof-of-concept landing page, or chatbot interface.

You are building a functional, modular, expandable educational RPG that will eventually be deployed as a web application and prepared for iOS App Store distribution.

You are responsible for making sound technical decisions, maintaining code quality, testing functionality, and documenting the application as it develops.

Do not attempt to build the entire application in one enormous implementation step.

Work incrementally. Keep the application functional throughout development.

---

# PART 1 — PRODUCT OVERVIEW

The Ascendant is a single-player, AI-powered educational RPG.

Players create a persistent D&D-inspired character and pursue multiple learning campaigns.

Possible subjects include:
- History.
- Economics.
- Digital marketing.
- Anatomy and physiology.
- Business management.
- Science.
- Mathematics.
- Languages.
- Any other teachable discipline.

Players earn experience by learning, demonstrating understanding, completing practical challenges, and retaining knowledge.

The game features:
- Character creation.
- Character attributes.
- Subject-specific competencies.
- Skill trees.
- Campaign progression.
- AI-generated lessons.
- Interactive quests.
- Assessments.
- Knowledge tracking.
- Weakness tracking.
- Adaptive difficulty.
- Mandatory boss encounters.
- Cinematic battle resolutions.

The first playable campaign will focus on history, beginning with early civilizations and Ancient Mesopotamia.

The application must be designed so that adding another subject does not require rewriting the game engine.

# PART 2 — NON-NEGOTIABLE DEVELOPMENT PRINCIPLES

1. Build actual functionality, not decorative mockups.
2. Do not use hardcoded sample data as a substitute for persistent application behavior.
3. Use a deterministic game engine for progression and combat.
4. Keep AI integrations modular and replaceable.
5. Keep educational content separate from game-state calculations.
6. Persist user progress in the database.
7. Validate all AI-generated structured outputs.
8. Make the interface responsive.
9. Use reusable components.
10. Document architectural decisions.
11. Test every major feature.
12. Avoid unnecessary dependencies.
13. Do not introduce mandatory paid services into the MVP.
14. Never claim that a feature is functional until it has been implemented and tested.

When a technical decision is uncertain, explain the alternatives and recommend the simplest maintainable solution.

# PART 3 — TECHNOLOGY STACK

Start with the following proposed stack unless a compelling technical reason justifies changing it.

### Frontend
- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- Framer Motion.
- Lucide icons.

### Backend
- Supabase.
- PostgreSQL.
- Supabase Authentication.
- Supabase Storage.
- Supabase Edge Functions where appropriate.

### AI
Create a provider-independent AI abstraction layer.

Do not tightly couple the application to one AI provider.

Allow different models to handle:
- Tutoring.
- Game mastering.
- Assessment.
- Research.
- Scenario generation.

Initially, use a single configured provider/model where necessary to reduce complexity.

Support local model development when practical.

### Mobile
Build a responsive web application first.

Use an architecture compatible with future Capacitor packaging for iOS.

Do not begin native application development during the MVP.

### Source control
Use Git and GitHub.

Create clear documentation and database migrations.

# PART 4 — APPLICATION ARCHITECTURE

Organize the application into independent modules.

Suggested architecture:

src/
- app/
- components/
- pages/
- layouts/
- features/
  - authentication/
  - character/
  - campaigns/
  - learning/
  - curriculum/
  - competencies/
  - progression/
  - quests/
  - combat/
  - codex/
  - weaknesses/
  - inventory/
  - ai/
- services/
- hooks/
- types/
- utils/
- styles/

Keep business logic separate from UI components.

The game engine must be independently testable without rendering the interface.

Create an architecture document explaining:
- Component relationships.
- Data flow.
- AI integration.
- Game-state management.
- Database responsibilities.
- Security boundaries.

# PART 5 — DATABASE DESIGN

Design a normalized, extensible PostgreSQL schema.

At minimum, consider the following entities:

### Users
- id
- email
- created_at
- settings

### Characters
- id
- user_id
- name
- race
- class
- background
- appearance
- level
- total_xp
- attributes
- created_at

### Campaigns
- id
- user_id
- title
- subject
- description
- status
- campaign_level
- campaign_xp
- curriculum_version
- created_at

### Competencies
- id
- campaign_id
- name
- description
- associated_attribute
- prerequisites
- mastery_level
- retention_status

### Learning activities
- id
- campaign_id
- competency_id
- activity_type
- difficulty
- content
- completion_status

### Assessments
- id
- activity_id
- competency_id
- assessment_type
- result
- evaluator_feedback
- evidence
- created_at

### XP transactions
- id
- user_id
- character_id
- campaign_id
- amount
- reason
- source_activity_id
- created_at

### Quests
- id
- campaign_id
- title
- description
- objectives
- rewards
- status

### Boss encounters
- id
- campaign_id
- title
- requirements
- encounter_state
- outcome
- created_at

### Knowledge entries
- id
- campaign_id
- competency_id
- title
- content
- references
- mastery_status
- last_reviewed

### Weakness records
- id
- campaign_id
- competency_id
- concept_id
- error_category
- occurrence_count
- review_priority
- last_successful_review

### Sources
- id
- campaign_id
- title
- author
- publisher
- url
- source_type
- publication_date
- verification_status

### AI activity logs
- id
- user_id
- task_type
- provider
- model
- token_usage
- created_at

This schema is a starting point, not a requirement to implement every table immediately.

Define proper foreign keys, indexes, constraints, and Row Level Security policies.

Users must only be able to access their own private data.

Do not store API secrets in frontend code.

# PART 6 — THE GAME ENGINE

Create a deterministic game engine.

The engine, not the AI, must control:
- XP calculations.
- Level requirements.
- Attribute calculations.
- Competency progression.
- Skill unlocks.
- Quest completion.
- Boss eligibility.
- Combat resolution.
- Equipment statistics.
- Rewards.

Create configurable progression formulas.

Avoid scattering hardcoded XP values across components.

Every XP award must be recorded as an auditable transaction.

Prevent duplicate rewards and repetitive XP farming.

Implement automated unit tests for progression calculations.

# PART 7 — THE LEARNING ENGINE

The Learning Engine must be subject-agnostic.

It should receive:
- Subject.
- Player objective.
- Starting proficiency.
- Available learning time.
- Desired depth.
- Previous learning history.

It should produce a structured curriculum.

Curriculum format:

Subject
  → Discipline
    → Topic
      → Learning objective
        → Learning activity
          → Assessment
            → Competency evidence

Every activity must be associated with one or more competencies.

Support:
- Lessons.
- Questions.
- Written answers.
- Multiple-choice assessments.
- Practical scenarios.
- Projects.
- Research tasks.
- Simulations.
- Retention reviews.

The system must be capable of generating a curriculum for subjects that were not predefined by developers.

Validate generated curricula before saving them.

# PART 8 — EDUCATIONAL ACCURACY

Accuracy is a critical requirement.

The AI must not invent historical facts, citations, academic publications, or sources.

Use credible references.

Prioritize academic publications, universities, textbooks, museums, peer-reviewed research, and primary sources where appropriate.

Where practical, use retrieval-augmented generation to ground lessons in retrieved source material.

Every lesson should provide access to relevant references.

Clearly distinguish established facts from contested interpretations.

For historical topics:
- Include chronology.
- Identify relevant geographic context.
- Distinguish primary and secondary sources.
- Explain scholarly disagreements.
- Avoid presenting modern assumptions as historical facts.

The AI should acknowledge uncertainty rather than invent an answer.

# PART 9 — AI ORCHESTRATION

Build a modular AI service with specialized roles.

### Game Master
Narrates the world, characters, quests, and events.

### Tutor
Explains concepts, provides examples, and answers questions.

### Examiner
Evaluates responses against explicit rubrics.

### Strategist
Creates practical challenges and boss encounters.

### Researcher
Finds and verifies educational sources.

### Progression Advisor
Recommends learning activities and review schedules.

These roles may initially share a model.

Use structured JSON outputs wherever predictable data is needed.

Validate AI outputs using schemas before passing them into game systems.

The AI may recommend mastery progression, but the game engine must apply the progression rules.

The AI must not directly modify database records outside authorized application services.

Implement error handling, usage limits, retry logic, and reasonable context management.

# PART 10 — CHARACTER AND SKILL SYSTEM

Implement a D&D-inspired character system.

Initial races:
- Human.
- Elf.
- Dwarf.
- Halfling.

Initial classes:
- Fighter.
- Ranger.
- Rogue.
- Wizard.
- Cleric.

Initial backgrounds:
- Soldier.
- Scholar.
- Merchant.
- Artisan.
- Explorer.

Six attributes:
- Strength.
- Dexterity.
- Constitution.
- Intelligence.
- Wisdom.
- Charisma.

Use configurable attribute allocation.

Each campaign maps real-world competencies to these attributes.

Do not make race or class a barrier to learning.

Implement:
- Global character progression.
- Campaign progression.
- Competency mastery.
- Achievements.
- Skill trees.

# PART 11 — KNOWLEDGE CODEX AND WEAKNESS BANK

Create a persistent Knowledge Codex.

Allow users to:
- Browse concepts.
- Search entries.
- View explanations.
- View references.
- Review related concepts.
- See mastery status.

Create a Weakness Bank.

Track recurring mistakes, misunderstandings, and forgotten concepts.

Use spaced-repetition principles.

Generate targeted review quests based on actual assessment history.

Do not automatically remove a concept from the weakness bank after one correct answer.

# PART 12 — QUEST AND BOSS SYSTEM

Quests must have defined objectives and success conditions.

Support free-form player interaction through the AI Game Master.

Boss encounters must be mandatory progression gates.

Bosses should test multiple competencies.

Use knowledge-based combat with narrative strategic decisions.

Boss difficulty must be based on the player's demonstrated learning history.

Failure should generate recovery activities.

Permanent character progression and legitimate educational records must be protected from failure penalties.

Boss resolution should produce a structured result that the deterministic game engine can validate.

# PART 13 — HISTORY PILOT CAMPAIGN

Use history as the initial campaign.

Initial module: The Rise of Early Civilizations.

Begin with Ancient Mesopotamia.

Include:
- Geography.
- Agriculture.
- Settlement.
- City-states.
- Government.
- Law.
- Trade.
- Military organization.
- Religion.
- Culture.
- Historical source analysis.

Build a complete but manageable introductory curriculum.

Create several quests and at least one multi-competency boss encounter.

Use credible educational sources.

The pilot must exercise every major learning and game subsystem.

Keep the campaign content separate from the game engine so additional history periods can be added without changing core application code.

# PART 14 — UI/UX AND VISUAL DESIGN

The interface should resemble a premium modern RPG.

### Visual direction
- Dark charcoal backgrounds.
- Near-black surfaces.
- Restrained gold accents.
- Elegant typography.
- High-quality fantasy artwork.
- Clean layouts.
- Subtle animations.
- Detailed but uncluttered dashboards.

Avoid:
- Generic SaaS dashboards.
- Excessive gradients.
- Cartoon-like educational illustrations.
- Excessive visual clutter.
- Unnecessary decorative elements.
- Tiny mobile controls.

### Required screens

1. Welcome/onboarding.
2. Authentication.
3. Character creation.
4. Main dashboard.
5. Character sheet.
6. Campaign selection.
7. Campaign dashboard.
8. Skill tree.
9. Learning interface.
10. Quest interface.
11. Knowledge Codex.
12. Weakness Bank.
13. Boss encounter.
14. Battle resolution.
15. Inventory.
16. Settings.

Design mobile-first.

Use reusable components and consistent spacing, typography, and color tokens.

All buttons and controls must have actual functionality.

Do not leave decorative or inert controls presented as working features.

# PART 15 — CINEMATIC SYSTEM

The MVP should include cinematic boss resolutions using available free resources.

Possible approaches:
- Illustrated battle scenes.
- Animated character sprites.
- CSS animations.
- Framer Motion.
- Reusable battle illustrations.
- Generated still images when available.

Create a provider-independent media service.

Future support for AI-generated video should not require redesigning the boss encounter system.

Do not require a paid video-generation service for MVP functionality.

# PART 16 — FREE DEVELOPMENT AND BETA

All development and beta testing must be possible without mandatory paid subscriptions or API services.

Prioritize:
- Open-source dependencies.
- Free-tier hosting.
- Free-tier databases.
- Local development models.
- Free tools.
- Configurable external AI providers.

Do not assume free services have unlimited quotas.

Create a document identifying:
- Free-tier limits.
- Expected usage.
- External dependencies.
- Potential costs at higher traffic.
- Upgrade paths.

Core game functionality must not depend on an expensive AI provider.

Where AI access is unavailable, provide development fixtures or deterministic test implementations so developers can still test the game.

Do not pretend fixture responses are live AI responses.

# PART 17 — SECURITY AND PRIVACY

Implement:
- Secure authentication.
- Row Level Security.
- Server-side secrets.
- Input validation.
- AI output validation.
- Rate limiting.
- Error logging.
- Data isolation.
- Safe handling of retrieved external content.

Do not expose private player data or credentials.

Design account deletion and user-data export capabilities for future compliance.

# PART 18 — DEVELOPMENT ROADMAP

Phase order follows `MASTER_PROMPT.md` (approved by the product owner 2026-11-14). The earlier
CLAUDE.md order is superseded; its deployment-readiness items are kept in Phase 8.

## Phase 0 — Project inspection and technical foundation
- Inspect the development environment and repository.
- Select and verify dependencies.
- Create the project structure and coding standards.
- Configure TypeScript, environment variables and database connectivity.
- Establish design tokens.
- Document architecture, costs and free-tier limits.

## Phase 1 — Application foundation and visual identity
Build:
- Application shell.
- Navigation.
- Responsive layouts.
- Main dashboard.
- Character creation interface.
- Character sheet.
- Campaign selection.
- Settings.
- Reusable UI components.

Use clearly labelled mock data only where unavoidable.

The visual identity must establish the final visual direction.

## Phase 2 — Character and game systems
Build:
- Authentication.
- Database schema, migrations and Row Level Security.
- Persistent character records.
- Races, classes, backgrounds and the six attributes.
- Character statistics, equipment, XP and leveling.
- Competencies, skill progression and achievements.
- Campaign management and character progression.

## Phase 3 — Learning engine
Build:
- Subject and discipline structures.
- Curriculum generation.
- Learning objectives, lessons, activities and assessments.
- Competency mapping and evidence-based mastery.
- Adaptive difficulty.
- Knowledge retention tracking and spaced repetition.
- XP transactions.
- Knowledge Codex.
- Weakness Bank.

## Phase 4 — AI integration
Implement the AI orchestration layer.

Add the Game Master, Tutor, Examiner, Strategist, Researcher, and Progression Advisor.

Validate all structured outputs. Implement error handling, retry logic, context management, source
retrieval and citation handling, usage limits and provider abstraction.

## Phase 5 — Campaigns, quests, and encounters
Implement:
- Campaign creation and campaign-specific progression.
- Quest generation and completion.
- NPC interactions.
- Learning challenges and practical projects.
- Boss requirements and encounters.
- Tactical encounters and combat calculations.
- Failure and recovery.
- Encounter resolution.

## Phase 6 — First playable campaign: History
Build the first playable history curriculum, beginning with Ancient Mesopotamia.

Verify the complete player journey from character creation to boss victory.

## Phase 7 — Presentation and cinematic experiences
Implement:
- Character animations.
- Encounter transitions and boss introductions.
- Victory and defeat sequences.
- Illustrated battle scenes and cinematic result screens.
- Reusable animation systems.

## Phase 8 — Testing, release and deployment readiness
Test:
- Mobile and desktop layouts.
- Database persistence.
- Authentication and security policies.
- XP calculations and duplicate-award prevention.
- AI failures and output validation.
- Campaign switching.
- Boss progression and recovery mechanics.
- Long-term retention records.
- Educational source integrity.

Prepare:
- Production build and environment configuration.
- Hosting documentation.
- Backup strategy.
- Database migrations.
- PWA support where appropriate.
- Capacitor compatibility assessment.
- Future App Store requirements.

Document known limitations.

Do not claim App Store readiness until platform-specific requirements have actually been addressed and tested.

# PART 19 — TESTING REQUIREMENTS

Write automated tests for critical game logic.

At minimum:
- XP cannot be awarded twice for the same completed activity.
- Character levels update correctly.
- Campaign XP is isolated by campaign.
- Competency progression follows defined requirements.
- Bosses cannot unlock prematurely.
- Boss failure does not erase permanent progression.
- Mastery decisions require evidence.
- User records cannot be accessed by other users.
- AI outputs cannot bypass game-engine rules.

Use realistic test scenarios.

Manually test all major player journeys.

# PART 20 — DEVELOPMENT BEHAVIOR

You must act as an autonomous but disciplined development partner.

Before implementing a major subsystem:

1. Explain the intended architecture.
2. Identify dependencies.
3. Identify potential risks.
4. Define acceptance criteria.
5. Implement the feature.
6. Test the feature.
7. Document the result.

Maintain:
- README.md
- ARCHITECTURE.md
- GAME_DESIGN.md
- DATABASE_SCHEMA.md
- AI_SYSTEM.md
- DEVELOPMENT_LOG.md
- ROADMAP.md
- TESTING.md

Update documentation as the project changes.

Maintain a clear distinction between:
- Completed.
- Partially implemented.
- Mocked.
- Planned.
- Blocked.

Do not silently skip features.

If a requested feature is too expensive, technically infeasible, or inappropriate for the free MVP, explain the issue and propose a practical alternative.

Do not make major architectural changes without explaining the reasoning.

Never overwrite working functionality simply to create a cleaner-looking demo.

---

# INITIAL TASK

Do not immediately attempt to build the entire application.

Begin with Phase 0.

First, inspect the available development environment and determine what tools and services are available.

Then:

1. Present the proposed project architecture.
2. Present the proposed database architecture.
3. Identify the free-tier dependencies and limitations.
4. Identify technical risks.
5. Present the development sequence.
6. Create the foundational project structure.
7. Document the architecture.

After Phase 0, proceed to Phase 1.

Keep the project runnable and demonstrate the working application after each major development milestone.

The ultimate objective is a fully playable educational RPG that can expand into additional subjects without requiring a fundamental rewrite.

**Remember: We are building a real game that makes people smarter. The RPG is the motivation; the learning engine is the foundation.**
