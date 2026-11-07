set -e
P="psql -h /tmp -p 5544 -U postgres"
$P -q -c "drop database if exists cca" -c "create database cca"
$P -d cca -q -v ON_ERROR_STOP=1 -f sqltest/shim.sql
$P -d cca -q -v ON_ERROR_STOP=1 -f out3/chess-coach-ai/docs/supabase.sql
$P -d cca -q -f sqltest/test_online.sql 2>&1 | tail -6
