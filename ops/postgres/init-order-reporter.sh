#!/bin/sh
set -eu
if [ -z "${PGPASSWORD:-}" ]; then
  echo "POSTGRES_PASSWORD is required for the one-off report reader setup" >&2
  exit 1
fi
export ORDER_REPORTER_PASSWORD="$(cat /run/secrets/order_reporter_password)"
exec psql -X -v ON_ERROR_STOP=1 -f /setup/init-order-reporter.sql
