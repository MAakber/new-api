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

1. **In progress:** Inventory upstream plugin changes, dependencies, and baseline checks; locate marketplace plugin fixtures.
2. **Pending:** Complete contract, submission streaming, model-specific usage metadata, and settlement integration.
3. **Pending:** Integrate gateway plugin bindings, selection, credentials, polling, and lifecycle management.
4. **Pending:** Integrate current plugin protocol extensions, frontend configuration, and API documentation.
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
