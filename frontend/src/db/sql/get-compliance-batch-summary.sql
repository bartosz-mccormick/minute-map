CREATE OR REPLACE MACRO get_compliance_batch_summary() AS TABLE
WITH base AS (
  SELECT *
  FROM compliance_batch_amenity_summary
)

SELECT
  b.h3_cell,
  b.pop,
  sum(b.max_compliance * COALESCE(w.weight, 1.0))
    / nullif(sum(COALESCE(w.weight, 1.0)), 0) AS compliance_weighted_avg
FROM base b
LEFT JOIN weights w
  ON w.class_b = b.class_b
GROUP BY
  b.h3_cell,
  b.pop
ORDER BY
  b.h3_cell;