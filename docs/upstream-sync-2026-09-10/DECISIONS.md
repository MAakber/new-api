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
