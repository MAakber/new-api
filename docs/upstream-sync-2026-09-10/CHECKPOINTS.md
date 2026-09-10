# 检查点日志

按时间追加，不覆盖旧记录。每次恢复先看最后记录，再核对 state.json 与 Git。

## 2026-09-10 · 计划建立

- 当前状态：planned；B00.1 尚未执行。
- 下游 HEAD：403f7d9dffc6a99728ede5d8f72770efc61f7b83。
- 固定上游：bdef117505247769268b209665fb3ad7554c3da7。
- 已完成：计划书、恢复入口、20 阶段台账、153 上游提交清单、120 下游提交映射、26 类保护能力与原评估证据持久副本。
- 正式合并进度：0/153；下游最终验收：0/120。原评估的 21 项临时测试不能计为已合并。
- 活动 Git 操作：无；未切换分支，未修改业务源码。
- 下一步：执行 B00.1，核对固定引用并保存 Git bundle、未跟踪计划与证据；随后建立独立工作树。
- 当前需后续补齐的条件：三库与供应商实际验收环境、插件编号决策、存量钱包/任务迁移方案、现有测试配置以外的覆盖盘点。
- 计划文件验证：8 项检查通过，覆盖完整台账、真实恢复入口、漏项、依赖循环、下游保护缺失、无证据完成、移除验收门槛和未合并时拒绝最终完成；语法与文档链接检查通过。证据见 evidence/plan-validation.json。这不改变正式合并进度。

## 后续追加模板

- 时间与时区：
- 阶段/单元：
- 工作树、操作前 HEAD：
- 活动操作与上游 SHA：
- 已保存的冲突/未提交文件：
- 代码提交：
- 验证命令、被测提交、结果、证据路径：
- 台账提交：
- 未完成项与下一步：

## B00.1 — backup intent

- Time: 2026-09-10T17:00:35.2285650+08:00 (local offset included).
- Worktree: D:/10178/Projects/new-api; HEAD: 403f7d9dffc6a99728ede5d8f72770efc61f7b83.
- User authorized execution of the complete merge plan with downstream functionality first.
- No active merge/cherry-pick/rebase; tracked source is clean. Untracked docs/upstream-sync-2026-09-10 and output will be copied separately from Git objects.
- Pinned upstream exists: bdef117505247769268b209665fb3ad7554c3da7. Main is ahead of origin/main by 9befcf1e6, 208f7c91e and 403f7d9df.
- Both status and structural plan verification passed (exit 0). Toolchain: Go 1.25.5 windows/amd64, Bun 1.3.14, Node 22.15.0.
- Next action: create a new backup directory, bundle all Git refs, verify bundle, copy untracked artifacts, and verify SHA256/length before creating the integration worktree.

## B00.1 verified / B00.2 applying — isolated integration created

- Time: 2026-09-10T17:03:01.8829106+08:00.
- Backup: D:/10178/Projects/new-api-upstream-sync-backup-2026-09-10. Verified 52 separately copied files by SHA256; baseline.bundle is 58,575,391 bytes, bundle verification exit 0, both fixed heads present. Evidence: evidence/runs/B00-001/.
- Created protected branch codex/upstream-sync-base-2026-09-10 at 403f7d9dffc6a99728ede5d8f72770efc61f7b83.
- Created codex/upstream-sync-2026-09-10 at the same commit in D:/10178/Projects/new-api-upstream-sync. Main remains unchanged.
- This worktree now owns the writable plan/ledger. The original checkout redirects here through verify-plan.mjs.
- B00.2 next: commit this plan, review the 120 mappings against actual commit paths, install this worktree's dependencies, then record baseline tests and coverage gaps. No upstream patches have been applied.

## 2026-09-10T09:33:32.625Z — B00.2 verified, B00.3 verifying

- Reviewed all 120 mappings against Git diff-tree: all archived path lists matched. Reviewed the 28 entries without a direct source anchor and added concrete current source paths to their preservation features. Mapping acceptance only; all feature/final acceptance remains pending.
- Isolated Bun frozen-lockfile install passed (1,146 packages). Frontend build/typecheck, three existing Vitest suites, and independent relaykit build/test passed at 0353ebeb59dd4947cf465b455f52e105cf3f7370. Root baseline is running.
- Existing full frontend lint, format and copyright checks failed before any upstream/source edits; keep logs and fix by final acceptance.
- User clarified only production exists. We will build isolated local databases. Production migration and upgrades are not authorized or attempted.
- Next: inventory and execute legacy node:test files missing from the three scripts, then consolidate the baseline and start B01.

## 2026-09-10T09:45:31.234Z — B00 complete — baseline and all existing test entry points recorded

- Protected downstream main remains at 403f7d9dffc6a99728ede5d8f72770efc61f7b83. Integration test runner commit: 8152abd51576cd39265ad1fcc319315889c1dbe3.
- Root build/test and independent relaykit build/test passed. Four actual tests were skipped because dedicated MySQL/PostgreSQL DSNs are absent; no database acceptance claimed.
- All 30 Vitest files (168 unique tests) and all 71 legacy files (236 tests) passed. Frontend build/typecheck passed.
- Existing lint (298 errors), six-file formatting and missing-header failures assigned to explicit B15/B16 units.
- Fixed recovery verifier self-reference: later descendant commits changing only the plan may follow last_observed_head; business-code or ancestry drift still requires reconciliation.
- B00 evidence: evidence/runs/B00-002/baseline-summary.json. Next: B01 small upstream units, with functional preservation first.

## 2026-09-10T09:51:14.444Z — B01.1-docker applying 7037ac15b

- Before HEAD: ae41b291e6bbdaf4b110f52a16b3d0891d38bbf2.
- Upstream: 7037ac15bd8a29f8ee3e2b74e784bcdb75d67d22 — fix(docker): add relaykit go.mod to dev build context (#7072).
- Reviewed paths: Dockerfile.dev.
- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.

## 2026-09-10T09:51:14.697Z — B01.1-docker implemented

- Result: exit 0; HEAD da282eba311a7d9a71bf7e2d0c87449d86f6174d.
- Conflicts: none.
- Evidence: evidence/runs/B01.1-docker-7037ac15b/result.json.
- Next: B01.1-docker: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.

## 2026-09-10T10:00:05.154Z — B01.1-providers regression intent

- Before HEAD: da282eba311a7d9a71bf7e2d0c87449d86f6174d.
- Add actual HTTP model-list endpoint/auth coverage and NewAPI multipart edit/Playground group isolation coverage, run them against the unfixed baseline, then cherry-pick 876903a8e, 2399de97d, 8461e5339.
- Docker archive build is isolated at da282eba3; legacy builder retry omits the unsupported --progress flag.
- Source tests: controller/channel_upstream_volcengine_test.go and relay/channel/newapi/image_edit_test.go. Validation: go test on affected packages and downstream controller/relay/middleware suites.

## 2026-09-10T10:02:14.958Z — B01.1-providers applying 876903a8e

- Before HEAD: f7a2b2e937b6fb4470541332765599f51b052b65.
- Upstream: 876903a8eb22c44e395c03da38f6701c650651ae — fix: 修正火山方舟渠道获取模型列表的端点路径 (#7203).
- Reviewed paths: controller/channel_upstream_update.go.
- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.

## 2026-09-10T10:02:15.200Z — B01.1-providers implemented

- Result: exit 0; HEAD d66fa73144d2c3e42ddd0fb6611413fa9e444cdc.
- Conflicts: none.
- Evidence: evidence/runs/B01.1-providers-876903a8e/result.json.
- Next: B01.1-providers: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.

## 2026-09-10T10:02:15.605Z — B01.1-providers applying 2399de97d

- Before HEAD: d66fa73144d2c3e42ddd0fb6611413fa9e444cdc.
- Upstream: 2399de97daf6ac76e5378a7c7c244ff0628a8186 — fix(ali): stop injecting top_p into requests that omit it (#6674).
- Reviewed paths: relay/channel/ali/text.go, relay/channel/ali/text_test.go.
- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.

## 2026-09-10T10:02:15.835Z — B01.1-providers implemented

- Result: exit 0; HEAD 2d998e60d8f504cb0d4824d093ce47b4904bbc81.
- Conflicts: none.
- Evidence: evidence/runs/B01.1-providers-2399de97d/result.json.
- Next: B01.1-providers: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.

## 2026-09-10T10:02:16.242Z — B01.1-providers applying 8461e5339

- Before HEAD: 2d998e60d8f504cb0d4824d093ce47b4904bbc81.
- Upstream: 8461e5339d483f3c0699fb009567be9cec25846d — fix(relay): preserve multipart image edits for New API channels (#6559).
- Reviewed paths: relay/channel/newapi/adaptor.go.
- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.

## 2026-09-10T10:02:16.476Z — B01.1-providers implemented

- Result: exit 0; HEAD b6ac8fcf88b7511d8cf13bc4ec3063577eb04464.
- Conflicts: none.
- Evidence: evidence/runs/B01.1-providers-8461e5339/result.json.
- Next: B01.1-providers: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.

## 2026-09-10T10:33:17.669Z — B01 provider unit verified; frontend unit starting

- Go regression passed at b6ac8fcf88b7511d8cf13bc4ec3063577eb04464, including controller, relay/... and middleware/...; three upstream rows verified for this stage, final review pending.
- Next: login CAPTCHA must be refreshed after a submission or expiry; billing searches must debounce and ignore stale responses; persisted subscription-only preference must remain displayed honestly.
- Docker build has twice failed during base-image transport with short-read/EOF; no Docker success claimed. Continue independent B01 code work.

## 2026-09-10T10:39:06.817Z — B01.1-web applying 2d8e50bf3

- Before HEAD: 33025596842fc286a69a1455254fc590f14dafae.
- Upstream: 2d8e50bf36e94200b809dfb39e73624ec48b1e23 — refactor(web): prevent credential autofill in usage log filters (#6966).
- Reviewed paths: web/src/features/usage-logs/components/common-logs-filter-bar.tsx, web/src/features/usage-logs/components/logs-filter-toolbar.tsx.
- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.

## 2026-09-10T10:39:07.091Z — B01.1-web implemented

- Result: exit 0; HEAD 2fc8ce77db5a7dbd4192edc52cf618f2a9c5c190.
- Conflicts: none.
- Evidence: evidence/runs/B01.1-web-2d8e50bf3/result.json.
- Next: B01.1-web: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.

## 2026-09-10T10:39:07.521Z — B01.1-web applying ffeb1b24e

- Before HEAD: 2fc8ce77db5a7dbd4192edc52cf618f2a9c5c190.
- Upstream: ffeb1b24ef85ee98c048649a554136f9fe9d43cf — fix(web): refresh Turnstile token after login attempt (#6764).
- Reviewed paths: web/src/features/auth/sign-in/components/user-auth-form.tsx.
- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.

## 2026-09-10T10:39:07.782Z — B01.1-web implemented

- Result: exit 0; HEAD 43632cf08a666ede11fc468d629d28d3e07f9c67.
- Conflicts: none.
- Evidence: evidence/runs/B01.1-web-ffeb1b24e/result.json.
- Next: B01.1-web: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.

## 2026-09-10T10:39:08.223Z — B01.1-web applying 7dd1000a1

- Before HEAD: 43632cf08a666ede11fc468d629d28d3e07f9c67.
- Upstream: 7dd1000a190d1c810fa0d5723770341106742a1b — perf(web): debounce server and large-list searches (#6727).
- Reviewed paths: web/src/features/keys/components/api-keys-table.tsx, web/src/features/models/components/deployments-table.tsx, web/src/features/models/components/dialogs/upstream-conflict-dialog.tsx, web/src/features/models/components/models-table.tsx, web/src/features/pricing/hooks/use-filters.ts, web/src/features/redemption-codes/components/redemptions-table.tsx, web/src/features/system-settings/models/channel-selector-dialog.tsx, web/src/features/system-settings/models/model-ratio-visual-editor.tsx, web/src/features/system-settings/models/upstream-ratio-sync-table.tsx, web/src/features/wallet/hooks/use-billing-history.ts.
- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.

## 2026-09-10T10:39:08.562Z — B01.1-web implemented

- Result: exit 0; HEAD c57d432b46177d6af0e84ac41ab9b9c346976217.
- Conflicts: none.
- Evidence: evidence/runs/B01.1-web-7dd1000a1/result.json.
- Next: B01.1-web: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.

## 2026-09-10T10:40:58.840Z — B01.1-subscription applying

- Before HEAD c57d432b46177d6af0e84ac41ab9b9c346976217; upstream b5b94bc685fd2251551df826dab3575ab262f6dc.
- All six new frontend regressions failed on the intended pre-fix behavior, with no fixture or compilation failure.
- Apply component-only diff manually and script the seven reviewed source translations. Final behavior and locale checks follow the code commit.

## 2026-09-10T10:47:46.590Z — B01 subscription adaptation recovered

- Reconciled committed source 94859d2a7451a726b8b973599dd5d8b518936d91; no patch reapplied.
- Seven locales each have exactly one new key through the required translation workflow.
- Next: test current frontend fixes; remaining AQBot and Docker verification.

## 2026-09-10T10:51:02.428Z — B01.1-aqbot applying 8454082f9

- Before HEAD: 6c333a2a7d5cc5fa68eca6f857f7bf58c5f46911.
- Upstream: 8454082f930f44593e92791c2581ffc63eb30a59 — feat(chat): add AQBot preset (#7079).
- Reviewed paths: setting/chat.go, web/src/features/chat/lib/chat-links.ts.
- Next: cherry-pick -x, inspect result, run affected regressions before acceptance.

## 2026-09-10T10:51:02.731Z — B01.1-aqbot implemented

- Result: exit 0; HEAD f76efe4d575930e1f916635e152864ba9cd53809.
- Conflicts: none.
- Evidence: evidence/runs/B01.1-aqbot-8454082f9/result.json.
- Next: B01.1-aqbot: validate the applied patch and downstream contracts; do not mark verified until recorded checks pass.

## 2026-09-10T10:54:50.967Z — B01 source behavior verified; Docker still running

- 10 new frontend tests and 71 legacy files / 236 tests pass, plus typecheck and touched-file lint.
- B01 nine patches implemented; Docker build runs from immutable df7a7ea2f snapshot and still has no completed result.
- Next: finish image build; prepare isolated databases and review B06 while waiting.

## 2026-09-10T10:59:41.213Z — B01 stage verified

- All nine upstream rows verified for this stage; final review remains pending.
- Actual Dockerfile.dev image built: codex-new-api-sync-20260910:dev-b01, image 89b0004f0e02, source df7a7ea2f.
- Next: prioritize B05 billing condition fix and continue B02; read-only production version inspection authorized by user.
