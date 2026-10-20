#!/bin/sh
set -eu
# Datasource provisioning expands environment variables, not grafana.ini file providers.
export AUDIT_READER_PASSWORD="$(cat /run/secrets/audit_reader_password)"
export ALERT_WEBHOOK_TOKEN="$(cat /run/secrets/alert_webhook_token)"
exec /run.sh "$@"
