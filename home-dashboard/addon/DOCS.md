# Home Dashboard (observe-only)

Reads state through the Supervisor proxy (no long-lived token needed), runs the engine, and logs what it
*would* do (`[dry-run] would ...`). It sends no service calls or notifications and persists nothing.
Start it manually (boot: manual) and read the add-on **Log** tab.

Option `timezone` (default `America/New_York`) drives evening/night rules.
