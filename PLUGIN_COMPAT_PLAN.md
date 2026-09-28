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
3. **Implemented, focused tests pass:** Integrate gateway plugin bindings, selection, credentials, polling, and lifecycle management. Full database/lifecycle gates remain in stage 5.
4. **In progress:** Integrate current plugin protocol extensions, frontend configuration, and API documentation.
5. **Pending:** Run focused and integration tests, real database compatibility checks, independent relaykit build, frontend checks, and downstream regression checks.
6. **Pending:** Review final diff and evidence, commit verified changes, and integrate into main only after the required gates pass.

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

- The second reported slice is not present in the clean sandbox.
- `ChannelFilter.TaskPluginKeys` is a request candidate set; persisted channel settings still have one `TaskPluginKey`.
- `submit-sse-delta@1` is advertised, but the adaptor has no submission SSE execution path.
- `UsageForModel` is implemented in the registry but not consumed by execution/validation.
- The upstream `FilterResponsesWebSocket` symbol is absent locally; do not import unrelated upstream context as if already implemented.
- TypeSafe source/version has not yet been identified.

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
- Next: port 4c34f25a4 backend and tests using semantic three-way comparison, then adapt type-60 binding to this fork's channel-first endpoint selection. Follow-up upstream plugin commits include 129f21b69, a8ed7f7c5, 03563a4a7, 65d3a2171, 47713bcb1, 474ed66fb, c0cff23a3, 2c175190c, d61d6be75; examine relevant task metrics change 3abbb8198 as well.
- Stage 3: 4c34f25a4 backend integrated with fork-specific channel selection. No channel IDs changed. Preserved candidate-only filters and unbound gateway traffic; model rewriting now happens only after a plugin actually claims a request. Regression reproduced the ordinary-model rewrite bug before fixing it.
- Binding permission test exposed pointer aliasing in the existing sparse channel update: decoding into a shallow copy also changed the original settings used for permission comparison. Replaced that with an independent JSON copy, preserving non-JSON revision/guard/key metadata. Both original sparse-patch authorization tests and new gateway permission tests pass.
- Gateway drivers now reject execution when a plugin does not declare gateway support. Unbinding reads and updates settings inside a row-locked transaction. Cache refresh also runs when a later cascade step fails after a successful unbind.
- `stage3-final-focused`: 328 tests passed, 0 failed, 0 skipped. Independent `GOWORK=off go build ./...` and `go test -count=1 ./dto` in relaykit passed. Earlier `stage3-gateway-fixed` passed 34 middleware tests.
- Next concrete step: integrate the follow-up JSON/usage fixes and 03563a4a7 image host protocol plus retainResult support; preserve the fork's legacy Ali image adaptor/billing path while adding plugin image support. Then frontend changes from 74629e29f/4c34f25a4 and remaining pinned-upstream plugin fixes. No merge to main or remote publication has occurred.
