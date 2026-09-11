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
