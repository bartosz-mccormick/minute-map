CREATE OR REPLACE MACRO get_compliance_batch_amenity_summary() AS TABLE
WITH base AS (
  SELECT *
  FROM compliance_batch
)
SELECT
  b.h3_cell,
  b.pop,
  b.class_b,
  max(b.n_total) AS max_n_total,
  min(b.min_travel_time) AS min_min_travel_time,
  max(b.compliance) AS max_compliance
FROM base b
GROUP BY
  b.h3_cell,
  b.pop,
  b.class_b
ORDER BY
  b.h3_cell;