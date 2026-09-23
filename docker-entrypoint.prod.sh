#!/bin/sh
set -eu

user="${POSTGRES_USER:-warehouse}"
db="${POSTGRES_DB:-warehouse}"
encoded_password="$(node -e 'process.stdout.write(encodeURIComponent(process.env.POSTGRES_PASSWORD || ""))')"

export DATABASE_URL="postgresql://${user}:${encoded_password}@db:5432/${db}?schema=public&connect_timeout=30"

if [ "${1:-start}" = "start" ]; then
  npx prisma migrate deploy
  exec node server.js
fi

exec "$@"
