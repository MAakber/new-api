# 跨阶段决策

状态为“待执行核实”的条目不能作为已经实现的事实。追加决定时记录日期、相关阶段、代码依据、替代方案、选定实现和验收证据。

| ID | 决策 | 当前状态 |
| --- | --- | --- |
| A01 | 固定上游 bdef117505247769268b209665fb3ad7554c3da7；后续上游增量另行登记 | 计划已确定 |
| A02 | 保留当前下游起点及 3 个未推送提交；新增本地下游工作也纳入保护 | 计划已确定 |
| A03 | 61/62/63/64 的既有渠道含义不变；TaskPlugin 新编号先核对所有映射和数据再确定 | 编号待 B14 核实 |
| A04 | 保留 /v1/messages/count_tokens；上游禁用补丁登记为兼容性保留 | 实现与最终验证待 B04 |
| A05 | compact/旧模型名采用兼容映射，不能仅按上游清理删除 | 具体映射待 B04 |
| A06 | 下游抓模流程按行为对照整合上游增量；不覆盖 c0ee46798 的能力 | 待 B07 |
| A07 | 钱包扩容和单请求 int32 饱和上限分离；不用跳过启动检查代替迁移 | 迁移待 B11 |
| A08 | 旧任务、旧视频价格和进行中操作必须保留或可审计迁移 | 方案待 B14 |
| A09 | 新安全中心、日志权限与本地邀请码/Passkey/头像/诊断共存 | 待 B08 |
| A10 | 项目标识、许可、下游版本机制与发布目标保留 | 待 B16 |
| A11 | 分批实现后真实合并上游历史，禁用 ours 策略伪造完整合并 | 计划已确定 |
| A12 | 测试缺失/跳过/供应商或数据库环境未具备不计为验证通过 | 计划已确定 |

新依赖要记录来源提交及调用关系，并更新 batches.json。若改变阶段归属，同步修改 upstream-ledger.json 与 batches.json 后运行结构检查。

保留与上游不同的行为时，需要确认没有遗漏新增功能；提交的“equivalent / preserved / superseded”不是默认免验标签。

## 2026-09-10T09:33:32.625Z — A13 test isolation

The user has production only. All migration and accounting tests will use new isolated local databases. Production connectivity, schema writes, deployment and real account operations are not implied by the merge authorization. Actual-version and sanitized-snapshot acceptance remains pending until supplied; continue independent work.

## 2026-09-10T10:59:41.213Z — A14 read-only production inventory

User explicitly authorized ssh nep to inspect database type/version. Scope is read-only deployment metadata and database version/schema inspection as needed; no production write, migration, deployment or account operation. Continue migration experiments only on isolated local databases.

## 2026-09-10T11:56:49.059Z — A15 stage versus final interoperability

B02.3 explicitly permits documenting unavailable runtime conditions. Its environment inventory is complete; real provider interoperability remains a required, pending B18 gate. Local protocol tests and stage verification do not satisfy that gate. This permits independent integration work to proceed without claiming provider acceptance or requesting production provider access.

## 2026-09-10T12:25:57.636Z — A16 options repair depends on B12 pricing management

4fc9d1f1fa77c0cfdd9719cb59ff9ecc9885d66a edits model/model_pricing_config.go, created by 0c76e4dae77a279e015329b7478e6f02d6b62edd (B12). Our downstream instead has model/pricing_options.go and service/pricing_options.go with canonical rows and CAS. Move the complete, still-pending commit from B06 to B12 to adapt both together, without adding a circular dependency or duplicating the pricing writer. Total remains 153 commits. B12 must preserve administrator prices under missing primary keys, duplicate rows, restarts and concurrent writes. MySQL 5.7.44 and MariaDB 11.4.4 reject atomic RENAME TABLE while LOCK TABLES is held (1192); do not infer the upstream advisory lock alone protects against other writers.

## 2026-09-10T18:58:08.005Z — A17 startup preservation fixes proven by real database failures

Full startup tests exposed downstream Passkey index churn on all databases, model/vendor active-name index churn on MySQL/MariaDB, and MariaDB JSON alias churn. The corrections preserve the existing custom migration order and JSON validation. Baseline-source test binaries seed the old schemas before current binaries upgrade them; artifact hashes and exact source commits are recorded. B06-database-matrix.json contains passing evidence and retained earlier failures. B12 options repair remains pending under A16.

## 2026-09-10T22:27:56.643Z — A06 B07 downstream preservation

The upstream channel improvements are adapted into the existing classifier, session-safe model picker, dedicated test settings and custom balance path. All eight units passed local stage checks; D01-D10 and final browser/provider acceptance remain subject to the final candidate gates. See evidence/B07-acceptance.json.

## 2026-09-11T00:10:06.783Z — A18 Telegram deployment configuration

Upstream 3e84ec0ab8239cf2277f8a10d45566630a9c10fa replaces legacy Telegram widget authentication with PKCE and verified OpenID Connect ID tokens. Existing Telegram user IDs and linked accounts are retained. A deployment with Telegram login enabled must configure its OAuth Client ID and Client Secret and redirect URI before rollout; add this prerequisite to final release acceptance. No production configuration was changed. Local transport and existing-identity tests passed.

## 2026-09-11T00:10:06.783Z — A19 ClickHouse audit compatibility

The documented docker-compose.yml uses ClickHouse 24.8. Native JSON in new audit table creation fails on this default version, as B08-clickhouse-audit shows. Store validated JSON text in String, matching the existing usage-log storage, while retaining typed AuditOther and exact numeric metadata in APIs. Do not require experimental server settings or silently raise the supported log-database version. Verify fresh/upgrade startup, repeat initialization, historical usage rows, cleanup/TTL independence and role projections against 24.8.14.39. This integration has not been deployed; there is no released native-JSON audit schema to migrate.

## 2026-09-11T00:24:14.541Z — A20 password format rollout and rollback

0973dc2b8f550de71b75fdd3805576d3ce6ccf42 reads historical bcrypt hashes and new Argon2id hashes; long encrypted passwords use v2 RSA-OAEP/AES-GCM envelopes while legacy RSA ciphertext remains readable. There is no bulk password rewrite. For a rolling deployment, first deploy the dual-format readers to every serving instance with ACCOUNT_PASSWORD_HASH_ALGORITHM=bcrypt, then enable Argon2id writes. Once new hashes exist, a rollback build must retain both hash readers and both envelope readers; the original baseline alone is no longer a valid password-format rollback. Record this in B18 release acceptance. The downstream registration-code flow also uses the new hash writer but still creates accounts only after atomic code consumption. Production remains unchanged.

## 2026-09-11T00:27:07.184Z — A21 quota audit requires B10/B11

Pending upstream 3f8a50cf8877683669cd812240a0beaf7b171c32 introduces AdjustUserQuota using common.MaxWalletQuota, WalletQuotaFromDecimalStrict and ErrWalletQuotaLimitExceeded from B11 a073f74b; it also patches model/quota_reserve.go and Token.AutoGroups from B10. Those APIs/files do not exist at the current B08 checkpoint. Move the entire unstarted commit to B11 immediately after wallet integration instead of introducing temporary accounting semantics or a dependency cycle. B08 6f233399 does not depend on these quota/token audit additions and can proceed. Total remains 153; all token, audit UI and quota behavior stays required.

## 2026-09-11T00:47:00.276Z — A22 unified login contract rollout

6f233399 unifies second-factor login challenges and scoped deletion. The frontend and all backend nodes must deploy together; the temporary legacy 2fa_login flow is not interchangeable with login_verification. Existing issued sessions remain supported. Preserve registration-code handoff separately from second-factor verification. All Passkey ceremonies now require user verification. Before any future rollout, verify supported authenticators can provide UV and document the coordinated version boundary. No production operation is included in local integration.

## 2026-09-11T02:49:41.155Z — A23 subscription transaction preservation

Real B10 PostgreSQL testing reproduced a refund balance update committed outside its idempotency-record transaction. MySQL 5.7 testing also reproduced a downstream subscription redemption reading a stale plan snapshot and granting beyond the per-user cap. Refund quota and record now share one transaction; purchase-cap inspection uses a locking current read after the user lock. Four-engine regressions pass; evidence/B10-database-matrix.json retains pre-fix failures.

## 2026-09-11T03:54:06.635Z — A24 wallet schema is measured, not inferred

The original released binary creates signed BIGINT wallet columns on all three local external engines even though its Go tags say type:int. Earlier assumptions that those tags alone imply a 32-bit database or an automatic shrink were not established. Actual column metadata is authoritative. Keep explicit BIGINT tags to state the intended contract, and separately test genuine legacy INT schemas, partial migration and unsigned/missing columns. Already-compatible released databases need no ALTER. The original baseline is still not the selected rollback because it lacks the new wallet validation and authentication-format support; a335f0dd is built and rehearsed as the B11 compatible version. Production snapshot acceptance remains pending.

## 2026-09-11T04:29:32.761Z — A25 configured pricing versus effective defaults

The downstream /api/option read feeds expected-value CAS patches. Substituting a display-only builtin into those stored maps would make a first edit claim an existing database value and fail CAS. Preserve raw option reads, while B12 model_pricing exposes the upstream configured/effective distinction and versioned editing. Keep explicit zero and administrator prices, and route both existing patch clients and new model/vendor operations through the same canonical option transaction. New defaults are never persisted by merely opening an editor.

## A26 — B12 metadata and pricing compatibility

- Legacy imports reuse an existing active model/vendor without overwriting metadata. Repeated single metadata-only deletion is harmless; versioned or multi-record destructive operations still reject stale selections and referenced vendors.
- Both pricing APIs share the ordered canonical row transaction; SQL original-value checks, missing-row failures, zero prices and committed runtime publication remain mandatory. Built-in display snapshots do not change raw option CAS values (A25).
- Searchable single selection delegates normal opening/closing to Base UI so focus restoration cannot reopen a popup and hide its chosen value. Downstream custom-value behavior and floating channel editor remain.
- Pure task-pricing frontend prerequisites and exact remaining backend/plugin deltas are in evidence/B12-plugin-pricing-deferred.json. B14 must complete these before plugin acceptance.

## A27 — Focus validation on changed behavior

- User requested faster integration and fewer unnecessary checks on 2026-09-11. Per-unit verification is limited to affected behavior and known failures. Full regressions are consolidated at stage and final acceptance boundaries.
- Retain mandatory independent relaykit builds for API/module changes, billing/accounting boundary regressions, migration/rollback checks, and downstream preservation. Do not repeat a passed check on unchanged behavior merely to increase evidence counts.

## A28 — Preserve legacy options under repair and concurrent writes

Repair options in place while holding database writer locks, preserving table identity and a complete backup. Identical duplicates can be removed; conflicting values, null values and null/empty keys stop startup before unrelated schema changes. No unordered last-row winner is inferred. MySQL/MariaDB add a full unique key under LOCK TABLES on one connection; SQLite/PostgreSQL repair transactionally. Worker-node seeding requires uniqueness and verifies all canonical rows. Four-engine evidence is in B12-options-sqlite/mariadb/mysql/postgres at f1c662f061f8ea6481fb748a1b81a33c63747f99.

## A29 — Expression preview dependencies

The B12 simulator depends on real trace semantics from B13 4cf9107f0 and task usage expression functions from B14 eb48396d5. Their reviewed engine implementation and tests are pulled forward, retaining saturation and retry invariants. The B13 row remains pending until its complete behavior is reconciled; backend plugin execution and schema validation remain B14. The billing option audit fixture is entirely plugin-dependent and is moved to B14, with its audit-table prerequisite retained.

## A30 — Task plugins coexist with downstream and legacy channels

Allocate TaskPlugin=65 after inspecting the complete backend/frontend enums, base-URL indexing, dispatcher and relaykit identity mappings. Keep 57/61/62/63/64 unchanged. Do not translate a bare 61 imported from an unknown source. Preserve built-in task adaptors, legacy request/query routes, existing configured video prices and in-flight tasks; newly bound plugin channels use explicit plugin metadata. Old data migration is verified with released-baseline fixtures; production snapshot remains a separate rollout gate. Inventory: evidence/B14-channel-id-inventory.json.

## 2026-09-11T08:42:42.692Z — B14 coexistence integration

- TaskPlugin uses 65; all downstream IDs and legacy native routes remain stable. Shared Responses/video endpoints select a channel before plugin parsing; explicit plugin retries remain bound to that plugin. Origin-task pins discovered by the parser reuse channel authorization before relay metadata is generated.
- Legacy Suno/Kling/Jimeng routes retain their adapters and precede matching built-in plugin declarations; the plugins remain accessible through generic and supported shared host protocols. Overlapping native paths are served by the legacy routes.
- Legacy tasks poll through their original adapters; plugin execution snapshots keep polling identity separate. Public responses are emitted only after persistence and billing.
- Canonical pricing CAS, fixed-price task rejection, quota saturation, scoped logs, avatars and downstream pricing parsers are retained. Alias pricing integration and consolidated B14 validation remain pending.
- Core development probes ran on the dirty tree and are not acceptance evidence. No production state was changed.

## A31 — Preserve administrator chat embedding during lint cleanup

The existing administrator-configured chat iframe requires its original script, origin storage, OAuth, downloads and media capabilities. Preserve that contract with one explicit element-scoped iframe lint exception rather than imposing an incompatible sandbox. Global lint rules stay enabled. The general URL-preview component currently has no consumers; its sandbox now isolates origin while retaining script execution. Full lint has no errors; warnings remain recorded.

## A32 — Preserve release and desktop build contracts

Local builds retain UTC date and eight-character revision; release builds use the exact triggering tag. Windows worktree paths are converted only in WSL, and both frontend and Go executable embed the resulting version. Existing platform targets and license resources are retained. Windows packaging used a task-local cache to avoid a host EXDEV cache failure, and reused the checksum-verified installed Electron runtime. No publishing, deployment, global toolchain change or unrelated process termination was performed.

## 2026-09-11T14:46:20.521Z — A33 Local main integration after local acceptance

The user requested continued merging with fewer unnecessary checks. Reuse only passing unchanged inputs with explicit B18 equivalence, and preserve every failed receipt. All 153 upstream, 120 downstream and 26 protection rows now have final-candidate local code/contract review at 33398851f677845f450b9cf6f7af546d5a218e0c. Their scope does not certify production data or third-party services. B19.1/B19.2 may precede the unavailable external portion of B18; this is reversible local source integration only. Keep the original B18 dependency for full B19 completion, retain both blockers, and use code_complete after main receives the result. Do not mark completed or alter verify-plan --final to hide missing gates. No push, publication, paid request or production write is authorized.

## 2026-09-11T15:23:22.529Z — A34 Production metadata preflight before deployment

The user is preparing server deployment and asked whether further tests are needed. Reuse completed local regressions; inspect production only under existing A14 read-only authority. The observed MariaDB wallet columns already satisfy signed BIGINT, so do not issue unnecessary wallet ALTER. Options uniqueness/data-shape checks pass and Telegram login is disabled. The environment-file inspection does not establish inherited overrides; the final code defaults to Argon2id when the write algorithm is absent. An explicit temporary bcrypt rollout is an operator option, with its password-length limitation, not a guarantee that the original binary is a full rollback target. Backups, production-copy migration/rollback and authorized real-provider checks remain open. No production file, configuration, database row, service or paid request was changed.
