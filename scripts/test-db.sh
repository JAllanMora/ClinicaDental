#!/usr/bin/env bash
# Aplica las migraciones en un Postgres local desechable y corre las pruebas de RLS.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-clinica_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f"
done
for t in supabase/tests/[0-9]*_test.sql; do
  echo "== $t"
  "${PSQL[@]}" -d "$DB" -f "$t" >/dev/null
done
echo "Pruebas de base de datos: OK"
