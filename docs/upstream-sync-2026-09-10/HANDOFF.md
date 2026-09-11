# 本地合并交付与剩余验收

固定上游的 153 个提交已全部整合，含钱包和任务插件；120 个下游提交、26 类保护功能已完成最终候选的本地代码及契约复核。实际 main 接入 SHA 以 `state.json.final_downstream_commit` 和 B19 证据为准。完整计划仍须等待两项外部验收，不能据本页部署生产。

| 内容 | 结果 |
| --- | --- |
| 固定上游 | `bdef117505247769268b209665fb3ad7554c3da7` |
| 原始下游 | `403f7d9dffc6a99728ede5d8f72770efc61f7b83` |
| 真实双亲合并 | `d46dec4abad83d575d7a7d74558508c898b0193b` |
| 最终本地验证代码 | `33398851f677845f450b9cf6f7af546d5a218e0c` |
| 候选与合并提交的业务代码差异 | 无；只修正两个 controller 测试夹具 |
| 集成分支 | `codex/upstream-sync-2026-09-10` |
| 权威台账 | `D:/10178/Projects/new-api-upstream-sync/docs/upstream-sync-2026-09-10` |

## 本地验收

- 前端 210 个文件、1531 项测试通过；类型、lint、格式、构建、版权和改动文案的七语键检查通过。89 个保护测试文件均存在，33 个前端保护文件均被发现，无遗漏。
- Go 根模块的 49 个通过包结果与 controller 最终运行、定点复查组合验收。controller 最终运行有 432 个顶层测试通过，另两项仅因 Windows TempDir 清理失败，随后同候选定点复查通过。没有单条全根命令完全绿；原失败日志保留，断言未关闭或弱化。
- `relaykit` 在 `GOWORK=off` 下独立构建与测试通过。
- SQLite、MariaDB 11.4.4、MySQL 5.7.44、PostgreSQL 9.6.24 已有隔离的新装/旧库升级/重复启动、账务及插件演练。B18 按源码等价性和最终回归复用这些结果，不把缺 DSN 的 skip 算作数据库验收。
- 浏览器已验证双渠道编辑窗口的独立保存、拖动和层级、已保存的预热配置关闭后保留、下游渠道控件、安全中心入口、主题、移动布局和键盘。真实 Passkey/OAuth、图片生成、支付与供应商调用未在此浏览器验收中执行；新装的合规开关保留原状。
- Windows NSIS/portable 的 B16 构建证明保持不变的打包配置；B18 独立程序包含最终前端。B16 安装器不是最终候选安装器。macOS/Linux 桌面产物未在本机重建。

详细结果：[本地验收](evidence/B18-local-acceptance.json)、[保护功能逐项复核](evidence/B18-preservation-review.json)、[浏览器验收](evidence/B18-browser-acceptance.json)、[源码等价性](evidence/B18-source-equivalence.json)、[后端组合结果](evidence/B18-backend-regression.json)。

## 下游兼容边界

渠道 61/62/63/64 的 Codex、Claude Code、CodeBuddy、Vercel 含义保持；TaskPlugin 单独使用 65。旧任务适配器、原生路由、视频价格和在途任务保留，不能仅按未知来源的数字 61 自动改成插件。多窗口、预热、自定义余额、邀请码/订阅码、用户 RPM、诊断、头像、主题、聊天搜索、绘图及单请求饱和审计均有对应本地回归。

## 仍需完成的两项验收

1. **脱敏生产副本迁移与回退演练。** 生产只通过已授权的 `ssh nep` 只读确认了 MariaDB 11.4.4；没有导出生产数据或执行生产迁移。在隔离副本核对真实 schema、账户与凭据、渠道配置、在途任务、定价和精确账务，连续启动并演练保留迁移后交易的回退。参考 [钱包迁移](WALLET-MIGRATION.md) 和 [时间规则复核](B05-TIME-RULE-MIGRATION.md)。旧库日内 OR 时间表达式需要逐条核实业务意图，不能自动全改或据本轮声称已修正生产配置。
2. **真实配置的供应商联调。** 在提供获准使用的测试配置及调用范围后，验证适用渠道的流式/非流式、工具、图片、多轮、错误、取消、count_tokens 和插件完整生命周期。现有本地协议测试不代表第三方在线行为已经确认。

在这两项有真实通过证据前，总状态维持 `code_complete`；B18/B19 不标为完整 verified，`verify-plan.mjs --final` 的非零退出是预期结果。上线、push、发布或付费请求须作为后续明确授权的动作处理。

## 上线前配置和回退要求

- 如启用 Telegram 登录，配置 OAuth Client ID、Client Secret 和回调地址；旧绑定 ID 保留，但旧 widget 配置不能直接替代新 OIDC 流程。
- 所有服务节点先具备 bcrypt/Argon2id 及旧 RSA/新长密码 envelope 的双读能力；滚动过渡可先保持 `ACCOUNT_PASSWORD_HASH_ALGORITHM=bcrypt`，再切换新写格式。前后端统一登录挑战版本须协调；Passkey 设备须支持用户验证。
- 钱包保留有符号 BIGINT 和新范围保护。不得直接降回原始基线二进制、缩列或覆盖迁移后账务。B11 的兼容回退样本只证明当批钱包方案，不能当作最终插件/配置版本的回退程序；最终回退组合仍须在生产副本演练中确认。
- 保留旧任务处理与插件执行快照，逐项检查未完成任务及重复回调/退款。生产回退不能仅靠 Git revert。
- 支付、兑换和奖励功能的合规确认须由有权人员完成；本轮没有代为勾选任何法律确认。
- B18 程序版本为 `v20260911-d46dec4a`，最终两次测试夹具提交没有改变运行源码。正式发布应按所选发布版本重新打包，而非把 B16 安装器作为本次最终产物。

## 恢复

从 [RESUME.md](RESUME.md) 开始，运行 `node docs/upstream-sync-2026-09-10/verify-plan.mjs` 及 `--validate`。先核对 `state.json.blockers`、最新 HEAD 和未提交文件，再补外部验收；不要重做已完成的合并和未变化的测试。原 main 的计划副本在 B19 前另行校验备份，`output/` 保留原位；不得用 reset/clean 清理用户工作区。
