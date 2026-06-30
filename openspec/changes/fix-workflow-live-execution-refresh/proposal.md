# Fix workflow live execution refresh

## Why

Workflow debugging currently loses live execution context after reloading the web UI because running execution snapshots are not durably saved during SSE progress. The execution history auto-refresh control is not stateful, and node double-clicks can be swallowed by drag pointer handling before the editor modal opens.

## What changes

- Open the node modal from pointer double-click before starting drag movement.
- Make execution history auto-refresh an actual stateful control that polls while enabled.
- Persist workflow execution progress snapshots during SSE streams, including queued/running state.
- Make SSE sends safe when the browser disconnects so background execution progress can keep being persisted.

## Impact

Workflows debugging becomes reload-safe and closer to n8n: active executions remain visible, history refreshes while enabled, and node editing opens consistently.
