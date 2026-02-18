# StatSync Technical Specification – Diagrams

All diagrams are defined in **PlantUML** (`.puml`). The main spec references `.png` versions so they render in Markdown viewers.

## Generating PNGs

**Option 1 – VS Code**  
Install the "PlantUML" extension, open a `.puml` file, then use "Export Current Diagram" (or right-click → Export) to save as PNG in this folder.

**Option 2 – Command line**  
If you have [PlantUML](https://plantuml.com/) installed (e.g. `plantuml` on PATH):

```bash
cd Tech_Spec/diagrams
plantuml *.puml
```

This creates a `.png` next to each `.puml`.

**Option 3 – Online**  
Paste the contents of a `.puml` file into [PlantUML Server](https://www.plantuml.com/plantuml/uml) and export as PNG, then save into this folder with the same base name (e.g. `erd.png` for `erd.puml`).

## Diagram list

| File | Description |
|------|-------------|
| `context_diagram.puml` | System context (actors, StatSync boundary) |
| `deployment_architecture.puml` | Deployment: client, Django, Node, PostgreSQL, Redis |
| `component_overview.puml` | Components and data flow |
| `erd.puml` | Entity-relationship diagram |
| `auth_sequence.puml` | Login, refresh, authenticated request |
| `event_logging_sequence.puml` | Event logging → DB, Redis, WebSocket |
| `join_team_sequence.puml` | Join team by code |
| `realtime_chat_sequence.puml` | Chat persistence and broadcast |
| `match_lifecycle_state.puml` | Match state machine |
| `security_architecture.puml` | Trust boundaries and security layers |
| `api_request_flow.puml` | Generic API request path |
