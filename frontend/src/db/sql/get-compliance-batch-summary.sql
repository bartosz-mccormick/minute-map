CREATE OR REPLACE MACRO get_compliance_summary_by_amenity_batch() AS TABLE
WITH base AS (
  SELECT *
  FROM compliance_batch
),


per_amenity_max AS (
  SELECT
    b.h3_cell,
    b.pop,
    b.class_b,
    max(b.compliance) AS max_compliance
  FROM base b
  GROUP BY
    b.h3_cell,
    b.pop,
    b.class_b
),

avg_comp AS (
  SELECT
    m.h3_cell,
    m.pop,
    sum(m.max_compliance * COALESCE(w.weight, 1.0))
      / nullif(sum(COALESCE(w.weight, 1.0)), 0) AS compliance_weighted_avg
  FROM per_amenity_max m
  LEFT JOIN weights w
    ON w.class_b = m.class_b
  GROUP BY
    m.h3_cell,
    m.pop
)


SELECT
  a.h3_cell,
  a.pop,
  a.compliance_weighted_avg,


FROM avg_comp a
GROUP BY
  a.h3_cell,
  a.pop,
  a.compliance_weighted_avg
ORDER BY
  a.h3_cell;