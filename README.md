# Agent Insights

GitHub-installable OpenCode `/insights` plugin with a portable analysis core.

## Security Considerations

### Model Provider Data Handling

When `small_model` is configured for enrichment, the plugin sends redacted code excerpts to the configured model provider. Review your provider's data handling policies before enabling this feature.

### Local SQLite Execution

DB-backed ingestion executes the local `sqlite3` binary from `PATH`. This assumes a trusted local environment—ensure your `PATH` is secure and only contains verified binaries.

## Local Development Install

DB-backed OpenCode ingestion requires the local `sqlite3` CLI to be installed and available on your `PATH`.

During local development, point OpenCode at the repo path:

```json
{
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "../../Projects/agent-insights"
  ]
}
```

## GitHub Install

After publishing, use a trusted repo and pinned git ref (e.g., commit hash or tag) rather than a branch:

Replace `acme/agent-insights` with your real published GitHub repo URL before copying this example.

Replace `acme/agent-insights` with your real published GitHub repo URL before copying this example.

```json
{
  "plugin": [
    "agent-insights@git+https://github.com/acme/agent-insights.git"
  ]
}
```

## Test Command

```bash
node --test "test/**/*.test.js"
```
