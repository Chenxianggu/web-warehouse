#!/bin/sh
set -eu
if [ -z "${PGPASSWORD:-}" ]; then
  echo "POSTGRES_PASSWORD is required for the one-off audit reader setup" >&2
  exit 1
fi
export GRAFANA_READER_PASSWORD="$(cat /run/secrets/audit_reader_password)"
exec psql -X -v ON_ERROR_STOP=1 -f /setup/init-reader.sql
