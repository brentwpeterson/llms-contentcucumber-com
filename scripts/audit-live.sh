#!/usr/bin/env bash
# Audit the live llms.contentcucumber.com mirror.
#
#   ./scripts/audit-live.sh            # audit production
#   SITE=http://localhost:4321 ./scripts/audit-live.sh   # audit a local preview
#
# Checks, for every URL in sitemap.xml:
#   - HTTP 200
#   - HTML pages: canonical -> contentcucumber.com present; .md alternate link
#   - .md twins: served as text/markdown, non-empty
#   - NO defect markers anywhere ([object Object], undefined, NaN)
#   - llms.txt / llms-full.txt / robots.txt reachable
# Exits non-zero if any hard check fails. Read-only; changes nothing.

set -uo pipefail
SITE="${SITE:-https://llms.contentcucumber.com}"
CANON="https://contentcucumber.com"
fail=0
pages=0
mds=0

say() { printf '%s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*"; fail=$((fail + 1)); }

say "== Auditing $SITE =="

sitemap="$(curl -s -m 30 "$SITE/sitemap.xml")"
if [ -z "$sitemap" ]; then bad "sitemap.xml empty/unreachable"; exit 1; fi
locs="$(printf '%s' "$sitemap" | grep -oE '<loc>[^<]*</loc>' | sed -E 's|</?loc>||g')"
say "sitemap: $(printf '%s\n' "$locs" | grep -c .) URLs"

while IFS= read -r url; do
  [ -z "$url" ] && continue
  body="$(curl -s -m 25 "$url")"
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 25 "$url")"
  ctype="$(curl -sI -m 25 "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')"

  [ "$code" = "200" ] || bad "$url -> HTTP $code"

  # Defect markers — fatal anywhere.
  if printf '%s' "$body" | grep -qE '\[object Object\]|(^|[^a-zA-Z])undefined([^a-zA-Z]|$)|\bNaN\b'; then
    bad "$url contains a defect marker ([object Object]/undefined/NaN)"
  fi

  case "$url" in
    *.md)
      mds=$((mds + 1))
      case "$ctype" in *text/markdown*) ;; *) bad "$url content-type=$ctype (want text/markdown)";; esac
      [ "$(printf '%s' "$body" | wc -c)" -gt 100 ] || bad "$url markdown suspiciously short"
      ;;
    *llms.txt|*llms-full.txt|*robots.txt) ;;  # presence already checked via 200
    *)
      pages=$((pages + 1))
      printf '%s' "$body" | grep -qi "rel=[\"']canonical[\"'][^>]*$CANON" \
        || bad "$url missing canonical -> $CANON"
      printf '%s' "$body" | grep -qi 'rel=[\"'"'"']alternate[\"'"'"'][^>]*text/markdown' \
        || bad "$url missing .md alternate link"
      ;;
  esac
done <<< "$locs"

say ""
say "Audited: $pages HTML page(s), $mds markdown twin(s)"
if [ "$fail" -eq 0 ]; then
  say "RESULT: PASS — all checks clean"
  exit 0
else
  say "RESULT: $fail FAILURE(S)"
  exit 1
fi
