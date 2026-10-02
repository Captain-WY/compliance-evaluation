#!/bin/sh
set -eu
# Executed only by PostgreSQL's entrypoint when this project's volume is empty.
for spec in "common_app:platform_common:$COMMON_DB_PASSWORD" "case_app:case_business:$CASE_DB_PASSWORD" "compliance_app:compliance_business:$COMPLIANCE_DB_PASSWORD" "casdoor_app:casdoor:$CASDOOR_DB_PASSWORD"; do
  role=${spec%%:*}; rest=${spec#*:}; database=${rest%%:*}; password=${rest#*:}
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres --set=role="$role" --set=database="$database" --set=password="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role') WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'database') \gexec
SQL
done
