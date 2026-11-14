-- The Ascendant — authored content (Phase 2)
--
-- Must match src/content/** exactly; supabase/tests/content-sync.test.ts fails if they drift.

insert into public.races (id, name) values
  ('human', 'Human'), ('elf', 'Elf'), ('dwarf', 'Dwarf'), ('halfling', 'Halfling');

insert into public.classes (id, name) values
  ('fighter', 'Fighter'), ('ranger', 'Ranger'), ('rogue', 'Rogue'), ('wizard', 'Wizard'), ('cleric', 'Cleric');

insert into public.backgrounds (id, name) values
  ('soldier', 'Soldier'), ('scholar', 'Scholar'), ('merchant', 'Merchant'), ('artisan', 'Artisan'), ('explorer', 'Explorer');

insert into public.tinctures (id, name) values
  ('or', 'Or'), ('argent', 'Argent'), ('gules', 'Gules'), ('azure', 'Azure'), ('vert', 'Vert'), ('purpure', 'Purpure');

insert into public.items (id, name) values
  ('worn-spear', 'Worn spear'), ('campaign-map', 'Campaign map'),
  ('quill', 'Quill'), ('wax-tablet', 'Wax tablet'),
  ('trade-ledger', 'Trade ledger'), ('coin-purse', 'Coin purse'),
  ('craft-tools', 'Craft tools'),
  ('walking-staff', 'Walking staff'), ('star-chart', 'Star chart');

insert into public.background_starting_items (background_id, item_id) values
  ('soldier', 'worn-spear'), ('soldier', 'campaign-map'),
  ('scholar', 'quill'), ('scholar', 'wax-tablet'),
  ('merchant', 'trade-ledger'), ('merchant', 'coin-purse'),
  ('artisan', 'craft-tools'),
  ('explorer', 'walking-staff'), ('explorer', 'star-chart');

insert into public.achievements (id, name, description) values
  ('character-created', 'The Oath Is Sworn', 'Create your character.'),
  ('first-campaign', 'First Steps', 'Begin your first campaign.');

-- History pilot (GAME_DESIGN.md §3 and §15). Curriculum version 0 = outline only (Phase 6 authors it).
insert into public.campaign_templates (id, subject, title, module, version) values
  ('history-early-civilizations', 'History', 'The Rise of Early Civilizations', 'Ancient Mesopotamia', 0);

insert into public.campaign_sub_skills (template_id, attribute, name) values
  ('history-early-civilizations', 'str', 'Power and conflict'),
  ('history-early-civilizations', 'dex', 'Working with evidence'),
  ('history-early-civilizations', 'con', 'Time and continuity'),
  ('history-early-civilizations', 'int', 'Societies and economies'),
  ('history-early-civilizations', 'wis', 'Applying history'),
  ('history-early-civilizations', 'cha', 'Culture and belief');

insert into public.competency_definitions (id, template_id, key, name, attribute) values
  ('history-early-civilizations/chronology', 'history-early-civilizations', 'chronology', 'Historical chronology', 'con'),
  ('history-early-civilizations/geography', 'history-early-civilizations', 'geography', 'Geography and environment', 'int'),
  ('history-early-civilizations/agriculture', 'history-early-civilizations', 'agriculture', 'Agriculture and settlement', 'int'),
  ('history-early-civilizations/political-organization', 'history-early-civilizations', 'political-organization', 'Political organization', 'str'),
  ('history-early-civilizations/economics-trade', 'history-early-civilizations', 'economics-trade', 'Economics and trade', 'int'),
  ('history-early-civilizations/law-institutions', 'history-early-civilizations', 'law-institutions', 'Law and institutions', 'str'),
  ('history-early-civilizations/military', 'history-early-civilizations', 'military', 'Military development', 'str'),
  ('history-early-civilizations/religion-culture', 'history-early-civilizations', 'religion-culture', 'Religion and culture', 'cha'),
  ('history-early-civilizations/source-analysis', 'history-early-civilizations', 'source-analysis', 'Historical source analysis', 'dex'),
  ('history-early-civilizations/cause-effect', 'history-early-civilizations', 'cause-effect', 'Cause-and-effect reasoning', 'wis');
