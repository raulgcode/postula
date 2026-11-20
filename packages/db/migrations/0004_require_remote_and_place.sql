-- Custom SQL migration file, put your code below! --
-- Searches made before remote and the place were required: a remote search now sets aside what
-- isn't remote or doesn't hire from its places. The old default list also loses "Americas",
-- which boards use for jobs that only hire in the United States and Canada.
UPDATE "job_search"
SET "criteria" = jsonb_set(
  jsonb_set("criteria", '{remote,required}', 'true'::jsonb),
  '{regions}',
  jsonb_build_object(
    'values',
    CASE
      WHEN "criteria"->'regions'->'values' = '["Costa Rica", "Latin America", "Americas", "Anywhere"]'::jsonb
        THEN '["Costa Rica", "Latin America", "Anywhere"]'::jsonb
      ELSE COALESCE("criteria"->'regions'->'values', '[]'::jsonb)
    END,
    'required',
    jsonb_array_length(COALESCE("criteria"->'regions'->'values', '[]'::jsonb)) > 0
  )
),
"updated_at" = now()
WHERE "criteria"->'remote'->>'value' = 'remote';
