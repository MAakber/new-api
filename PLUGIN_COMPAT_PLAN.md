# Plugin compatibility integration — 2026-09-28

## Objective

Integrate the complete plugin contract and its execution dependencies from the pinned upstream revision while preserving this fork's behavior. TypeSafe is one acceptance example, not a special-case implementation. Future unknown capabilities remain rejected until implemented.

## Pinned state

- Main: `dfb62bb738a0cd1d574e6a8951d558bf81128c24`.
- Starting sandbox: `72e0e85727b5f7477636f2760a9c3d6ce8027075`.
- Upstream target: `789c970199ea527e6a26e071915f4a4cd2c64178`.
- Worktree: `D:/10178/Projects/new-api-plugin-compat`.
- Branch: `codex/plugin-compat-2026-09-28`.
- Main contains unrelated uncommitted authentication UI changes; preserve them.

## Stages

1. **Completed:** Inventory upstream plugin changes, dependencies, and baseline checks; locate marketplace plugin fixtures.
2. **Implemented, focused tests pass:** Complete contract, submission streaming, model-specific usage metadata, and settlement integration. Full integration gates remain in stage 5.
3. **Completed:** Integrate gateway plugin bindings, selection, credentials, polling, and lifecycle management. Focused lifecycle and permission tests pass.
4. **Completed:** Integrate current plugin protocol extensions, frontend configuration, and API documentation. TypeSafe uses the resulting generic contract; no TypeSafe-only host branch was added.
5. **Completed with noted environment gates:** Focused and integration tests, real database compatibility checks, independent relaykit build, frontend checks, and downstream regression checks are complete.
6. **Completed:** Reviewed the final diff, committed the verified branch as `e39f68be3`, and merged it into `main` as `5e8b5e806` while preserving the pre-existing auth UI worktree changes.

## Preservation rules

- Compare each upstream change with its parent and this fork; never resolve by whole-file ours/theirs or a fake merge.
- Preserve local channel numbers: New API 60; Codex 61; Claude Code 62; CodeBuddy 63; Vercel 64; task plugins 65.
- Preserve candidate-only plugin filters, alias lookup, pinned generation/identity, channel pin/retry behavior, and ordinary gateway traffic.
- Preserve existing billing expression semantics, administrator prices, bounds, saturation audit, pre-consumption, settlement, and refund guarantees.
- Preserve existing plugin overrides, versions, permissions, and runtime source validation.
- Reuse existing channel UI, shared selection components, probe store, and model-fetch workflow.
- Keep relaykit independent. Database behavior changes require real SQLite, MySQL, and PostgreSQL validation.
- Unknown fields/capabilities remain fail-closed; advertised capabilities must be executable.

## Confirmed gaps at baseline

- The second reported slice was not present in the clean sandbox; its required backend behavior is now integrated semantically on this branch.
- `ChannelFilter.TaskPluginKeys` remains a request candidate set; persisted settings now add `task_extend_plugin_keys` while retaining the fork's task-plugin channel type 65.
- `usageProfiles`, submission streaming, model-specific usage validation, settlement, gateway routing, retainResult, and plugin source sync are integrated and covered by focused tests.
- The upstream `FilterResponsesWebSocket` symbol remains absent locally; no unrelated WebSocket implementation was imported.
- TypeSafe 1.0.0 is pinned as an official marketplace fixture under `controller/testdata/marketplace/` with SHA-256 verification; tests use local HTTP fixtures only.

## Resume

Read this file, inspect `git status --short --branch`, `git diff --name-only --diff-filter=U`, recent commits, and saved evidence before continuing. Do not infer completion from an old package-level test result. Record commands, results, pending dependencies, and the next concrete step below.

## Checkpoints

- Initial: created isolated worktree from the existing contract slice; fetched and pinned upstream. No implementation changes yet.
- Marketplace cloned at `D:/10178/Projects/new-api-plugin-compat-evidence/marketplace`, revision `b42cc99a6bd1998d0cc1581270bd46798ce00ad6`. TypeSafe 1.0.0 is present and uses vendor/new_api upstream modes, synchronous results, and actual input-token settlement.
- Baseline `go test -count=1 ./pkg/jsplugin ./relay/channel/task/jsplugin ./plugins` passed. Frontend baseline `bun run typecheck` passed; dependencies installed with frozen lockfile.
- Ported the backend execution/usage/pricing portions of 74629e29f. Retained canonical CAS pricing writer, profile-independent quantity bounds, saturation propagation, and deterministic selected-channel decoding. New plugin-specific prices use the same canonical rows and locked validation as existing prices. Conflict rationale is recorded in external `stage2-decisions.json` and `stage2b-decisions.json`.
- `stage2-final-focused`: 418 tests passed, 0 failed, 4 external-DB cases skipped; covers controller, relay, service, model, middleware, adaptor, plugins, and billing settings. Evidence is in `D:/10178/Projects/new-api-plugin-compat-evidence/*.jsonl` and `*.summary.txt`.
- Real DB matrix: MySQL 5.7.44 and PostgreSQL 9.6.24 passed. SQLite 3.50.4 assertions passed but its Windows TempDir cleanup failed (directory not empty). Changing TEMP did not fix cleanup; this is an outstanding gate, not a full matrix pass. Broader controller run also encountered Windows SQLite cleanup failures in existing security tests; baseline targeted security tests passed.
- Test databases are isolated Docker containers in WSL `Ubuntu-SF3D`, names `newapi-plugin-compat-mysql-20260928` and `newapi-plugin-compat-postgres-20260928`, loopback ports 13306/15432. WSL must remain alive; an active docker-log-follow process currently keeps it running. Do not affect unrelated containers. Stop these two test containers when final verification is complete.
- Security guidance consulted before binding/credential changes: OWASP ASVS 5.0.0 (https://owasp.org/projects/asvs), Authorization, Authentication, and Session Management cheat sheets. Applicable controls: server-side permission checks on every binding mutation, fail-closed validation, existing session protection, and no usable credentials in audit output. This is scoped guidance, not a whole-application compliance claim.
- Follow-up upstream plugin commits `129f21b69`, `a8ed7f7c5`, `03563a4a7`, `65d3a2171`, `47713bcb1`, `474ed66fb`, `c0cff23a3`, `2c175190c`, `d61d6be75`, and terminal metrics `3abbb8198` are integrated selectively. Image protocol, large source storage, source-hash sync, 2xx submission statuses, and terminal metrics are covered by focused tests.
- Stage 3: 4c34f25a4 backend integrated with fork-specific channel selection. No channel IDs changed. Preserved candidate-only filters and unbound gateway traffic; model rewriting now happens only after a plugin actually claims a request. Regression reproduced the ordinary-model rewrite bug before fixing it.
- Binding permission test exposed pointer aliasing in the existing sparse channel update: decoding into a shallow copy also changed the original settings used for permission comparison. Replaced that with an independent JSON copy, preserving non-JSON revision/guard/key metadata. Both original sparse-patch authorization tests and new gateway permission tests pass.
- Gateway drivers now reject execution when a plugin does not declare gateway support. Unbinding reads and updates settings inside a row-locked transaction. Cache refresh also runs when a later cascade step fails after a successful unbind.
- `stage3-final-focused`: 328 tests passed, 0 failed, 0 skipped. Independent `GOWORK=off go build ./...` and `go test -count=1 ./dto` in relaykit passed. Earlier `stage3-gateway-fixed` passed 34 middleware tests.
- `stage4-backend-verified`: 1,051 focused tests passed across plugin runtime, perf metrics, task adaptor, built-ins, controller, router, relay, service, middleware, and model packages. Official TypeSafe install/submit/settlement passed on SQLite, MySQL 5.7.44, and PostgreSQL 9.6.24. Large source/icon upgrade round-trip passed on all three. Official marketplace manifest/source digest verification passed.
- `stage4-frontend`: `bun run typecheck` passed; changed-file `oxlint` passed; gateway drawer save interaction passed; gateway helper, icon, pricing, plugin detail, and usage schema tests passed. Broad frontend test run was started but remains slow; its final result must be recorded before completion.
- Full affected frontend run passed: 84 test files and 651 tests. Full affected Go package run passed for plugin/runtime, perf metrics, adaptor, built-ins, router, relay, service, middleware, and model; the controller package had only existing Windows SQLite TempDir cleanup failures in unrelated security/quota tests. Targeted controller tests passed.
- `go build ./...` cannot run in this checkout because `main.go` embeds missing `web/dist`; independent `GOWORK=off go build ./...` and tests in `relaykit` passed. The Linux Docker retry was blocked only by uncached Go modules and network timeout; Windows MySQL/PostgreSQL TypeSafe and source-upgrade runs passed.
- The broad frontend run emitted only Happy DOM `scrollTo()` not-implemented notices; all 84 files and 651 tests passed. Changed-file lint and typecheck passed.
- Merged into `main` as `5e8b5e806` (`merge: integrate upstream plugin contract and gateway support`); `e39f68be3` is an ancestor of `main`. Main's unrelated auth UI files remain uncommitted and untouched. No remote push or deployment was performed.
