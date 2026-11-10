#!/bin/sh
# Kontrola migrací a funkcí databáze na lokálním Postgresu v Dockeru (živé databáze se nedotkne).
#   sh supabase/tests/run.sh          – založí databázi, pustí migrace a všechny *.test.sql, uklidí
#   sh supabase/tests/run.sh keep     – totéž, ale kontejner nechá běžet (ladění: docker exec -it fooslab-db-test psql -U postgres)
HERE=$(cd "$(dirname "$0")" && pwd)
NAME=fooslab-db-test
run() { docker exec -i "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null || exit 1
i=0
until docker exec "$NAME" psql -U postgres -c 'select 1' >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -gt 80 ] && { echo "Postgres nenaběhl"; exit 1; }; sleep 0.5
done
sleep 1

status=0
run < "$HERE/bootstrap.sql" >/dev/null 2>"$HERE/.err" || { echo "FAIL bootstrap"; cat "$HERE/.err"; status=1; }
if [ $status -eq 0 ]; then
  for f in "$HERE"/../migrations/*.sql; do
    run < "$f" >/dev/null 2>"$HERE/.err" || { echo "FAIL migrace $(basename "$f")"; cat "$HERE/.err"; status=1; break; }
  done
fi
if [ $status -eq 0 ]; then
  # Podruhé: každá migrace se musí dát spustit opakovaně.
  for f in "$HERE"/../migrations/*.sql; do
    run < "$f" >/dev/null 2>"$HERE/.err" || { echo "FAIL opakované spuštění $(basename "$f")"; cat "$HERE/.err"; status=1; break; }
  done
fi
if [ $status -eq 0 ]; then
  run < "$HERE/helpers.sql" >/dev/null 2>"$HERE/.err" || { echo "FAIL helpers"; cat "$HERE/.err"; status=1; }
fi
if [ $status -eq 0 ]; then
  for t in "$HERE"/*.test.sql; do
    if run -o /dev/null < "$t" >"$HERE/.out" 2>&1; then
      echo "ok   $(basename "$t") ($(grep -c '^NOTICE:  ok ' "$HERE/.out") kontrol)"
    else
      echo "FAIL $(basename "$t")"; grep -v '^NOTICE:  ok ' "$HERE/.out" | head -20; status=1
    fi
  done
fi
rm -f "$HERE/.err" "$HERE/.out"
[ "$1" = keep ] || docker rm -f "$NAME" >/dev/null 2>&1
exit $status
