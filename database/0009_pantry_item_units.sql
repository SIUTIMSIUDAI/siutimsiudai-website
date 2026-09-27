-- Pantry rows can carry real-world count units (box, bottle, ...) as well as g / ml / piece.
-- pantry_items.unit leaves the shared canonical_unit enum (recipes and grocery lists keep it) and
-- becomes text limited to the pantry's own list. Every existing value is in the new list, so the
-- cast keeps every row. MUST stay in lockstep with PANTRY_UNITS in constants/pantryUnits.ts.
--
-- One transaction, so the type change and the check land together or not at all. The closing
-- notify makes PostgREST reload its schema cache at commit: the app's pantry backup inserts through
-- PostgREST and swallows errors, so a stale cache still typing the column as the old enum would
-- reject the first "box" row silently.
begin;

alter table pantry_items alter column unit drop default;
alter table pantry_items alter column unit type text using unit::text;
alter table pantry_items alter column unit set default 'piece';
alter table pantry_items add constraint pantry_items_unit_check check (unit in
  ('piece', 'box', 'carton', 'bottle', 'jar', 'can', 'pack', 'bag', 'bunch', 'loaf', 'g', 'ml'));

notify pgrst, 'reload schema';

commit;
