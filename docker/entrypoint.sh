#!/bin/sh
set -eu
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  node /opt/migrate/migrate.mjs
fi
cd /app
exec node server.js
