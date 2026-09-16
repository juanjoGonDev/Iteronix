# workflows-execution-debug Specification

## MODIFIED Requirements

### Requirement: Node modal opening

The Workflows canvas SHALL open the node editor/debug modal when a user double-clicks a node, even when node dragging is enabled.

#### Scenario: Double-click before drag starts

- **GIVEN** the workflow canvas is in edit mode
- **WHEN** the user double-clicks a node body
- **THEN** the node modal opens
- **AND** drag state is not started for that pointer interaction

### Requirement: Execution history auto-refresh

The execution history SHALL have a functional Auto refresh control that polls persisted workflow executions while enabled.

#### Scenario: Auto-refresh enabled after page reload

- **GIVEN** Auto refresh is enabled
- **WHEN** the Workflows screen loads or reloads
- **THEN** execution history polling starts even if the initial list does not yet contain an active row

#### Scenario: Auto-refresh disabled

- **GIVEN** Auto refresh is disabled
- **WHEN** the Workflows screen is visible
- **THEN** execution history polling stops

### Requirement: Live execution persistence

Workflow execution streams SHALL persist partial progress while running so active executions remain visible after a web UI reload.

#### Scenario: Running execution visible after web reload

- **GIVEN** a workflow execution is running
- **WHEN** the runtime emits queued/running/node progress events
- **THEN** a partial execution row is persisted
- **AND** reloading the web UI shows the execution as queued or running in history

### Requirement: SSE disconnect tolerance

Workflow execution streams SHALL tolerate browser disconnects without turning SSE write failures into execution-state loss.

#### Scenario: Browser reload during execution

- **GIVEN** a workflow execution stream is open
- **WHEN** the browser reloads and disconnects the SSE response
- **THEN** later progress persistence continues without throwing from SSE send or close calls
