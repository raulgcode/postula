-- Custom SQL migration file, put your code below! --
-- The panel's form saved each list as one entry with every line in it
-- (["Costa Rica\nLatin America"]), so nothing matched. Each entry is split by line, trimmed and
-- deduplicated in order, and the old default places lose "Americas", as 0004 meant to.
CREATE FUNCTION pg_temp.split_lines(list jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY first_at), '[]'::jsonb)
  FROM (
    SELECT item, min(at) AS first_at
    FROM (
      SELECT btrim(line, E' \t\r') AS item, entry.n * 100000 + part.m AS at
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(list) = 'array' THEN list ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS entry(value, n),
      regexp_split_to_table(entry.value, E'\n') WITH ORDINALITY AS part(line, m)
    ) AS lines
    WHERE item <> ''
    GROUP BY item
  ) AS unique_lines
$$;
--> statement-breakpoint
UPDATE "job_search"
SET "criteria" = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          "criteria",
          '{titles,values}',
          pg_temp.split_lines("criteria"->'titles'->'values')
        ),
        '{keywords,include}',
        pg_temp.split_lines("criteria"->'keywords'->'include')
      ),
      '{keywords,exclude}',
      pg_temp.split_lines("criteria"->'keywords'->'exclude')
    ),
    '{regions,values}',
    CASE
      WHEN pg_temp.split_lines("criteria"->'regions'->'values')
        = '["Costa Rica", "Latin America", "Americas", "Anywhere"]'::jsonb
        THEN '["Costa Rica", "Latin America", "Anywhere"]'::jsonb
      ELSE pg_temp.split_lines("criteria"->'regions'->'values')
    END
  ),
  '{excludedCompanies}',
  pg_temp.split_lines("criteria"->'excludedCompanies')
),
"updated_at" = now()
WHERE "criteria" ? 'titles' AND "criteria" ? 'keywords' AND "criteria" ? 'regions';
