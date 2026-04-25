# Agent Insights Security Fixes Design

**Date:** 2026-04-24

## Goal

Fix the two confirmed security findings in `agent-insights` before the first commit:

- prevent raw historical transcript content from being sent to the configured model provider during enrichment
- prevent path traversal when reading message files from directory-backed OpenCode state

Then tighten the install and packaging surface as a follow-up in the same implementation pass.

## Approved Decisions

- Keep enrichment enabled when `small_model` is configured.
- Redact transcript content before it is used to build any enrichment prompt.
- Validate `session.id` as a safe message-file token before using it in a file path.
- Follow up by tightening install and packaging docs after the code fixes land.

## Scope

### In Scope

- Redaction of transcript-derived prompt content before model egress
- Redaction of directory metadata used by temporary enrichment sessions
- Defensive validation of directory-backed `session.id` values
- Regression tests for both security fixes
- README hardening for model egress, trusted git install, and `sqlite3` trust assumptions
- Packaging hardening via an explicit published-file allowlist

### Out of Scope

- Replacing enrichment with a fully local model
- Building configurable user-defined redaction policies in v1
- Reworking the broader report UX or analysis model
- Cryptographic signing, sandboxing, or remote attestation for plugin installation

## Problem Summary

### Finding 1: Transcript Egress

Today, `runInsights()` calls `enrichSessions()` whenever `small_model` is configured. `enrichSessions()` builds a prompt from raw transcript text, and `promptSession()` sends that prompt and the session directory to the OpenCode client. This can export pasted secrets, proprietary code, or customer data to the configured provider without any filtering.

### Finding 2: Path Traversal

Directory-backed ingestion reads session JSON from `stateRoot/sessions`, then uses `session.id` to build a path under `stateRoot/messages`. Because `session.id` is currently unvalidated, a crafted on-disk session file can traverse outside the messages directory and cause arbitrary local JSON reads.

## Design

### 1. Redaction Before Enrichment Egress

Add a focused sanitization layer in `src/core/analyze/enrich-sessions.js` that transforms transcript content before prompt construction.

The sanitization step should:

- operate on the transcript excerpt already used for enrichment rather than on the full session object
- mask common secret shapes such as API keys, bearer tokens, private-key headers, long opaque tokens, and obvious credential assignments
- collapse file-system paths and home-directory-like strings into redacted placeholders where they would reveal local environment details
- normalize whitespace and truncate aggressively so the egress payload stays small
- preserve enough semantic context for lightweight labeling tasks like sentiment, failure taxonomy, and task category

This keeps the feature while materially reducing the chance that raw secrets or environment details leave the local machine.

### 2. Redacted Directory Metadata

`promptSession()` currently passes `directory` into OpenCode session creation and prompt calls. That value should be sanitized through the same redaction policy before it is sent across the client boundary.

Behavior:

- use the original local directory for local control flow when needed
- send only a redacted directory string to the remote-facing prompt call path
- if redaction removes the value entirely, omit `directory` from the prompt payload rather than sending raw data

This narrows metadata leakage without changing the public `/insights` command.

### 3. Strict Session ID Validation

Add a small validator in `src/core/ingest/load-insight-sessions.js` for directory-backed message lookup.

Allowed `session.id` shape:

- ASCII filename token only
- alphanumeric plus `_` and `-`
- no path separators
- no `.` segments
- no whitespace

If a session ID fails validation, the loader should treat it the same way it treats a missing messages file today: no messages loaded for that session. It should not attempt any fallback path resolution, normalization, or best-effort traversal cleanup.

This is the smallest safe behavior change because it preserves successful ingestion for normal session IDs and fails closed for malformed state.

### 4. Install and Packaging Follow-Up

After the code fixes:

- update `README.md` to warn that enrichment sends redacted excerpts to the configured model provider when `small_model` is set
- recommend using a trusted repo and pinned git ref for plugin install examples
- document that DB-backed ingestion executes the local `sqlite3` binary from `PATH` and therefore assumes a trusted local environment
- add a `files` allowlist to `package.json` so published/installable package contents are intentionally limited to runtime files plus README

## Alternatives Considered

### Option A: Opt-in Only Enrichment

Pros:

- strongest default protection against data egress

Cons:

- changes current behavior more significantly
- adds configuration or UX friction

Rejected because the approved direction is to keep enrichment enabled and reduce risk through redaction.

### Option B: Remove Enrichment Entirely

Pros:

- fully removes transcript egress risk

Cons:

- removes an existing feature rather than securing it

Rejected because it is more disruptive than necessary for this pass.

### Option C: Normalize Traversal Inputs to Stay In-Tree

Pros:

- could salvage malformed IDs in some cases

Cons:

- more complex and easier to get wrong
- still accepts attacker-controlled path-like input

Rejected in favor of strict validation and fail-closed behavior.

## Testing Strategy

Use TDD for both fixes.

Required tests:

- `enrichSessions()` test that proves raw secrets in transcript text are absent from the prompt payload after redaction
- `promptSession()` or adapter-level test that proves redacted or omitted directory metadata is sent across the client boundary instead of the raw path
- directory-ingest test that proves traversal-style `session.id` values do not trigger reads outside `messages/`
- existing full-suite test run to confirm no regressions

## Risks and Guardrails

### Risks

- over-redaction may make enrichment too lossy to be useful
- under-redaction may leave recognizable secrets in prompt text
- strict ID validation may skip malformed historic data that previously loaded by accident

### Guardrails

- keep the redaction logic small, deterministic, and test-covered
- prefer masking patterns over heuristic rewriting of arbitrary prose
- fail closed on invalid session IDs
- verify both targeted tests and the full suite after changes

## Success Criteria

This work is complete when all of the following are true:

- raw secrets and obvious sensitive path details no longer appear in enrichment prompt payloads in tests
- traversal-style `session.id` inputs cannot read files outside `stateRoot/messages`
- README clearly documents model egress and install trust boundaries
- published package contents are intentionally limited via `package.json`
- full test suite passes after the changes
