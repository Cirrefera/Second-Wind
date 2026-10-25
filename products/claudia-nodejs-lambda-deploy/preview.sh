#!/bin/sh
set -eu
# Run only after npm install from the package directory. This performs a real local Claudia pack; it does not deploy AWS resources.
command -v claudia >/dev/null 2>&1 || { echo '{"ok":false,"status":"blocked","diagnostic_codes":["claudia_cli_missing"]}'; exit 2; }
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
claudia pack --output "$tmp" --force >/dev/null
bytes=$(wc -c < "$tmp" | tr -d ' ')
printf '{"ok":true,"status":"local_package_created","artifact_bytes":%s}
' "$bytes"
