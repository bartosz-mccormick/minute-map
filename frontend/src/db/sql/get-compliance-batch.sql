-- Indicators
-- [X] n under time and cost constraint
-- [ ] n under time constraint
-- [ ] n under cost constraint 

-- [X] min time to reach 1
-- [ ] min time to reach X
-- [ ] min time to reach X (under cost constraint)

-- [ ] min cost to reach 1
-- [ ] min cost to reach X
-- [ ] min cost to reach X (under time constraint)

-- Proximity cost: cost to reach (X) the fastest


CREATE OR REPLACE MACRO get_compliance_batch() AS TABLE
WITH cells AS (
  SELECT DISTINCT
    g.h3_cell,
    round(g.pop) AS pop
  FROM grid_src g
  WHERE g.admin_name IS NOT NULL
),
universe AS (
  SELECT
    c.h3_cell,
    c.pop,
    r.class_b,
    r.mode_config,
    r.B,
    r.T,
    r.X
  FROM cells c
  CROSS JOIN req r
),
ga_req AS (
  SELECT
    ga.h3_cell,
    ga.travel_time,
    ga.travel_time_mm,
    CASE
      WHEN ga.mode_config = 'mm'
        THEN COALESCE(ga.travel_time_mm, 0) * mm_config.c_min + mm_config.c_unlock
      ELSE NULL
    END AS cost,
    ga.class_b,
    ga.n,
    ga.mode_config,
    r.T,
    r.X,
    r.B
  FROM grid_access_src ga
  CROSS JOIN mm_config
  JOIN req r
   ON ga.class_b = r.class_b
   AND ga.mode_config = r.mode_config
),
summary AS (
  SELECT
    h3_cell,
    class_b,
    mode_config,
    T,
    B,
    X,

    min(travel_time) AS min_travel_time,

    sum(
      CASE
        WHEN travel_time <= T AND (B IS NULL OR cost <= B) THEN n
        ELSE 0
      END
    ) AS n_total

  FROM ga_req
  GROUP BY
    h3_cell,
    class_b,
    mode_config,
    T,
    B,
    X
)


SELECT
  u.h3_cell,
  u.pop,
  u.class_b,
  u.mode_config,
  u.T,
  u.X,
  u.B,
  s.min_travel_time,
  COALESCE(s.n_total, 0) AS n_total,
  CASE
    WHEN COALESCE(s.n_total, 0) > 0
      THEN least(
        COALESCE(s.n_total, 0)::DOUBLE / u.X,
        1.0
      )
    ELSE 0.0
  END AS compliance
FROM universe u
LEFT JOIN summary s
  ON s.h3_cell = u.h3_cell
 AND s.class_b = u.class_b
 AND s.mode_config = u.mode_config
 AND s.T = u.T
 AND s.B IS NOT DISTINCT FROM u.B
 AND s.X = u.X
ORDER BY
  u.h3_cell,
  u.class_b,
  u.mode_config,
  u.T,
  u.B,
  u.X;