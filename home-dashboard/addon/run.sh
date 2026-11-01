#!/bin/sh
# Observe-only by construction: LIVE is never set here, and there is no add-on option to set it.
set -u
cd /app
TZ="$(node -p "require('/data/options.json').timezone || 'America/New_York'")"
export TZ
# Opt-in: publish the home screen state to sensor.home_dashboard_state (one entity; no services are called).
if [ "$(node -p "require('/data/options.json').publish_state === true")" = "true" ]; then
  export HOME_DASHBOARD_PUBLISH=1
  export HA_REST_URL="http://supervisor/core"
fi
export HA_WS_URL="ws://supervisor/core/websocket"
export HA_TOKEN="${SUPERVISOR_TOKEN:?SUPERVISOR_TOKEN missing (homeassistant_api must be enabled)}"
unset HOME_DASHBOARD_LIVE HA_NOTIFY_SERVICE HA_URL
# The app exits when the HA connection drops (it never acts on stale data); restart it for a fresh sync.
while true; do
  node_modules/.bin/tsx src/main.ts
  echo "home-dashboard exited; restarting in 10s"
  sleep 10
done
