#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_USER:?Need POSTGRES_USER}"
: "${POSTGRES_DB:?Need POSTGRES_DB}"
: "${AUTHENTICATOR_POSTGRES_PASSWORD:?Need AUTHENTICATOR_POSTGRES_PASSWORD}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=auth_pw="$AUTHENTICATOR_POSTGRES_PASSWORD" <<'SQL'
-- Ensure PostGIS (no-op if present)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create roles idempotently (no password here)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE app_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
END
$$;

-- Set/refresh authenticator password (psql substitutes :'auth_pw' safely)
ALTER ROLE authenticator WITH PASSWORD :'auth_pw';

-- Allow PostgREST to SET ROLE anon
GRANT anon TO authenticator;


-- Minimal API schema + seed & grants
CREATE SCHEMA IF NOT EXISTS api;
CREATE SCHEMA IF NOT EXISTS api_data;

CREATE TABLE IF NOT EXISTS api.hello_world (
  id  SERIAL PRIMARY KEY,
  msg text
);

INSERT INTO api.hello_world (msg)
SELECT 'hi from postgrest!' WHERE NOT EXISTS (SELECT 1 FROM api.hello_world);

-- anon gets no table access
GRANT USAGE ON SCHEMA api TO anon;

-- app_owner gets read access to tables in api_data
GRANT USAGE ON SCHEMA api TO app_owner;
GRANT USAGE ON SCHEMA api_data TO app_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA api_data TO app_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA api_data
  GRANT SELECT ON TABLES TO app_owner;
SQL
