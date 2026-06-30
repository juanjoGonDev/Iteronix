# Design

## Approach

The fix keeps the existing Workflows architecture and changes the smallest reliable seams.

## Web UI

- Add pure debug-state helpers for double-click detection and execution polling policy.
- Use pointer event `detail >= 2` in node pointer-down handling to open the modal before drag state is created.
- Add `executionAutoRefreshEnabled` to Workflows state and bind the history Auto refresh checkbox to it.
- Poll the catalog whenever auto-refresh is enabled, not only after an active execution is already present.

## Server

- Reuse existing runtime progress events to upsert partial execution rows.
- Return whether a runtime progress event changed the catalog and schedule serialized workspace saves during streaming.
- Flush queued saves before the final save at stream completion.
- Guard SSE writes and close calls when the client has disconnected.

## Risks

- More frequent workspace saves during execution; mitigated by serializing saves through a single queue and only scheduling after catalog progress events.
