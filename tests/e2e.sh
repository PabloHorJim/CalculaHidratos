#!/usr/bin/env bash
# End-to-end test: three browser sessions (headless Chrome) using the app against the
# Firebase emulators (auth + Firestore with firestore.rules). Nothing touches the real project.
#   npm run test:e2e        (needs Java for the emulators and Google Chrome / Chromium)
set -euo pipefail
cd "$(dirname "$0")/.."
WORK="$(mktemp -d)"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
PORTS="4174 8085 9099 9334"
# The emulators and the browser start child processes of their own: stop whatever is
# still listening on the test ports, not only the commands launched here.
cleanup() {
  kill $(jobs -p) 2>/dev/null || true
  sleep 1
  for port in $PORTS; do kill $(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null) 2>/dev/null || true; done
  rm -rf "$WORK" 2>/dev/null || true
}
trap cleanup EXIT
for port in $PORTS; do
  if lsof -ti "tcp:$port" -sTCP:LISTEN > /dev/null 2>&1; then
    echo "Port $port is in use (an earlier test run or 'npm run emulators'?). Stop it and try again."; exit 1
  fi
done

VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-carbcalc VITE_FIREBASE_API_KEY=fake-key \
VITE_FIREBASE_AUTH_DOMAIN=localhost VITE_FIREBASE_FIRESTORE_DATABASE_ID="(default)" \
  npx vite build --outDir "$WORK/dist" --emptyOutDir > "$WORK/build.log" 2>&1

npx -y firebase-tools@13 emulators:start --only firestore,auth --project demo-carbcalc > "$WORK/emulators.log" 2>&1 &
npx vite preview --outDir "$WORK/dist" --port 4174 --strictPort > "$WORK/preview.log" 2>&1 &
"$CHROME" --headless=new --remote-debugging-port=9334 --user-data-dir="$WORK/chrome" --no-first-run --disable-gpu about:blank > "$WORK/chrome.log" 2>&1 &

for _ in $(seq 1 90); do grep -q "All emulators ready" "$WORK/emulators.log" && break; sleep 1; done
grep -q "All emulators ready" "$WORK/emulators.log" || { echo "Emulators did not start"; tail -20 "$WORK/emulators.log"; exit 1; }

node tests/e2e.mjs | tee "$WORK/result.log"
grep -Eq "^([0-9]+)/\1 checks passed" "$WORK/result.log"
