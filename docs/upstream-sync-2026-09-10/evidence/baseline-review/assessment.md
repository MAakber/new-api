**上游功能向下游同步评估 · 2026-09-10**

结论：可以分批引入。优先处理独立修复和供应商协议补充；渠道管理、账务、安全中心和插件系统需要不同程度的下游适配。当前不适合直接整分支合并。

本次方向明确为 **QuantumNous/new-api → MAakber/new-api**。评估没有修改 main 的源码、索引或提交；只刷新了远端引用，生成评估文件，并在临时快照中验证候选组合。

**比较范围**

| 项目 | 本次确认的状态 |
| --- | --- |
| 下游本地 main | `403f7d9df`，包含 3 个尚未推送到 origin/main 的 Playground 修复 |
| 下游 origin/main | `c0ee46798` |
| 上游 upstream/main | `bdef11750`，2026-09-09；已重新 fetch |
| 最近共同祖先 | `66ee6b8f9`，2026-07-29 |
| 分叉后的提交 | 下游独有 120，上游独有 153 |
| 上游相对共同祖先 | 1,285 个文件，新增 163,826 行、删除 32,639 行；这是上游侧累计差异，不是最终合并补丁大小 |
| 整分支模拟 | 131 个冲突文件 |
| 单提交模拟 | 50 个无文本冲突，其中 2 个为空变更；103 个存在冲突 |

单提交冲突数量既包含下游改动冲突，也包含缺少上游前置提交造成的冲突。风险综合考虑运行行为、依赖、下游定制、数据迁移和回滚成本，不只看 Git 能否自动合并。

中断后续查通过已认证的 GitHub API 核对了上下游 main，远端与本地 HEAD 均未变化。153 个提交全部归入 37 个功能组，没有漏项或重复。原验证快照的 2,305 个文件已与候选结果树逐一核对；27 个文件仅有 CRLF/LF 差异，没有实质内容差异。

**从低到高的排序**

| 风险 | 提交数 | 主要内容 | 建议 |
| --- | ---: | --- | --- |
| 低 | 11 | 火山模型列表、阿里 top_p、New API 图片编辑、搜索防抖、Turnstile 刷新、订阅偏好显示、日志自动填充、AQBot、DOMPurify、开发镜像 | 优先挑拣；其中 9 项已进入本次验证组合 |
| 中低 | 23 | DeepSeek/GLM Responses、Ollama 兼容、zstd、参数上下文、Claude 工具转换、独立 UI 修复、深拷贝优化 | 按功能小批次引入；其中 12 项已进入本次验证组合 |
| 中 | 37 | 渠道测试增量、高级路由、日志和额度 UI、状态缓存、模型健康序列、兑换码批量操作、计费编辑器局部修复 | 在下游现有实现上适配，避免覆盖定制功能 |
| 高 | 48 | 账务一致性、令牌自动分组、日志权限、新模型定价管理、统一安全中心、核心协议重构、数据库约束与全局重构 | 单独设计迁移批次并做针对性回归 |
| 极高 | 17 | 64 位钱包额度、任务插件系统及依赖它的新视频模型 | 暂缓整批引入，先解决编号和数据迁移 |
| 暂不纳入 | 17 | 会削减本地能力的提交、撤回/空补丁、文档治理、发布与桌面构建更新 | 跳过或按实际需要另行评估 |

提交数量用于完整覆盖审查范围，不表示独立功能数量。逐项归类见 [153 个提交清单](<./commit-inventory.md>)。

**建议第一批：以下 9 项低风险候选**

这些提交已经在保留当前下游全部已提交改动的临时快照中组合验证。正式引入时仍建议按小功能分别提交，便于审查和回退。

续查另行模拟了仅包含这 9 项的首批组合，结果无文本冲突。已核对的顺序为 `7037ac15b → 876903a8e → 2399de97d → 8461e5339 → 2d8e50bf3 → ffeb1b24e → 7dd1000a1 → b5b94bc68 → 8454082f9`。运行检查针对下文的 21 项完整组合，不能据此声称 9 项独立快照也完成了同样的运行检查。

| 功能 | 上游提交 | 价值和边界 |
| --- | --- | --- |
| 修复火山方舟获取模型列表 | [876903a8e](https://github.com/QuantumNous/new-api/commit/876903a8eb22c44e395c03da38f6701c650651ae) | 默认端点改为 `/api/v3/models`；特殊平台地址仍走现有分支 |
| 阿里未传 top_p 时保留默认行为 | [2399de97d](https://github.com/QuantumNous/new-api/commit/2399de97daf6ac76e5378a7c7c244ff0628a8186) | 避免强行注入近零值，边界值按平台可接受精度处理 |
| New API 渠道图片编辑保留 multipart | [8461e5339](https://github.com/QuantumNous/new-api/commit/8461e5339d483f3c0699fb009567be9cec25846d) | 复用现有 OpenAI 图片转换器，改动集中 |
| 搜索防抖 | [7dd1000a1](https://github.com/QuantumNous/new-api/commit/7dd1000a190d1c810fa0d5723770341106742a1b) | 减少列表重复请求，账单搜索同时防止旧响应覆盖新结果 |
| 登录尝试后刷新 Turnstile | [ffeb1b24e](https://github.com/QuantumNous/new-api/commit/ffeb1b24ef85ee98c048649a554136f9fe9d43cf) | 避免重复使用已消费的验证码 token |
| 日志筛选防密码自动填充 | [2d8e50bf3](https://github.com/QuantumNous/new-api/commit/2d8e50bf36e94200b809dfb39e73624ec48b1e23) | 调整输入属性和遮罩方式，不改日志查询协议 |
| 如实显示“仅订阅”偏好 | [b5b94bc68](https://github.com/QuantumNous/new-api/commit/b5b94bc685fd2251551df826dab3575ab262f6dc) | 无有效订阅时显示请求会被拒绝，不再误导为自动使用钱包 |
| AQBot 预设 | [8454082f9](https://github.com/QuantumNous/new-api/commit/8454082f930f44593e92791c2581ffc63eb30a59) | 补充客户端配置链接，沿用现有 API key 获取和显式打开流程 |
| 开发 Docker 构建修复 | [7037ac15b](https://github.com/QuantumNous/new-api/commit/7037ac15bd8a29f8ee3e2b74e784bcdb75d67d22) | 在 go mod download 前复制 relaykit/go.mod；本轮未构建 Docker 镜像 |

同档还有导航字号 `aa7d0d39a` 和 DOMPurify `f250f3b58`，二者未进入上述运行验证。DOMPurify 原提交只改 package.json；正式升级还必须用 Bun 更新锁文件并验证实际安装版本。

**建议第二批：同样进入验证组合的 12 项中低风险候选**

| 功能 | 上游提交 | 需要保留的验证重点 |
| --- | --- | --- |
| DeepSeek Responses | `9724ef1b2` | URL、reasoning 后缀和用量；当前该适配器没有自身测试文件，仅得到编译验证 |
| GLM /v1/responses | `cae3676ec` | 平台基础 URL 与真实响应协议；当前该适配器没有自身测试文件 |
| Ollama 推理与工具上下文 | `8ad159a3b` | 多轮 tool call ID、reasoning、显式 stream=false |
| Ollama Claude/Responses 透传 | `ba2e9287b` | 与上一项分开审查；部署的 Ollama 版本必须支持对应原生端点 |
| 阿里图片使用映射后的模型判断协议 | `93d2df85f` | 生成/编辑路径和同步/异步协议 |
| 阿里图片 response_format | `0bee5d441` | 放在上一项之后；两项成组模拟无冲突，URL/base64 分支需保留测试 |
| zstd 请求解压 | `0f9f668c6` | 压缩格式错误、解压后大小边界和流关闭 |
| 参数校验错误返回 400 | `0f2a2075a` | 400、413 的区别及不再重试无效请求 |
| Gemini 风格模型列表 | `3d5dc36f1` | query key/header key 鉴权及正确列表响应 |
| 按用户与分组做参数覆写 | `85feb7a34` | 下游已有所需上下文字段；确保跨组重试读取实际 using_group |
| 不向 Claude 注入空 tools | `4442bb302` | 不改变无工具请求的语义 |
| Claude 无参数工具转换 | `3dda1d50c` | 保留 parameterless 工具的有效 schema；续查已补跑 Chat/Responses 及 relayconvert 测试 |

这里的“已验证”指组合通过前端类型检查、相关 Go 构建和已列出的自动化测试，不能替代每项供应商 API 的真实联调或前端生产构建。

**中风险以上值得引入的功能**

| 风险 | 功能 / 代表提交 | 下游适配重点 |
| --- | --- | --- |
| 中 | 渠道仅自动禁用、测试并发：`5d3423bec`、`4add708eb` | 下游已有 scheduled_all/passive_recovery、Codex 请求规则、能力诊断和排队预热；补齐新模式与并发能力 |
| 中 | 高级路由编辑器与网关字段透传：`2b0efd848`、`e90a7c48e` | 与浮动编辑窗、自定义余额、渠道图标和表单上下文整合；最新按钮修复 `bdef11750` 依赖前置编辑器 |
| 中 | 公开接口缓存和 status 去重：`219c9e063`、`36dbbf0f7`、`c79b74b68` | 前两项成组无冲突；第三项仍需适配 use-system-config 和用户绑定，检查主题、公告和会话失效 |
| 中 | 日志分组搜索、移动布局、额度显示 | 新组件存在依赖链，保留本地头像、诊断、日期筛选；不能孤立复制列宽等后续补丁 |
| 中 | 模型健康小时序列：`5c7cca015` | 接口字段改名会影响下游已有榜单，应保留兼容字段或同步改完消费者 |
| 中 | 兑换码批量删除和文件保存：`524455fac` | 下游已有 CSV 导出、订阅码和多次使用注册邀请码；新增删除必须保留这些类型及其审计语义 |
| 中 | 时间段计费条件修复：`ac381acf4` | 当前下游仍用 OR 生成普通日内范围，应优先修复；要复查已有表达式，升级代码不会自动修正存量配置 |
| 高 | 跨组重试账务：`df43f8015` → `cfaba1dd6` | 两项成组模拟无冲突；必须验证免费→付费、付费→免费、重试预扣与最终结算一致 |
| 高 | 原子充值、并发额度、退款和缓存计费 | 按 `50e5377ea`、`ccd535ef8`、`2a0ce3475`、`47ba9d2c6`、`58d4e9bd3`、`f11641428` 的实际依赖处理，覆盖钱包/订阅/兑换码、缓存和三种数据库 |
| 高 | 令牌自定义自动分组：`0ab020206` | 57 文件、单提交模拟 7 个冲突；联动模型可见性、分组计费和下游每用户 RPM |
| 高 | 日志权限隔离：`057f71c23`、`9f506dd7f` | 由 map 改为 public/admin/root/audit 投影；需保护下游请求体诊断和逐角色权限 |
| 高 | 模型/定价管理：`0c76e4dae` 及后续 | 新 model-pricing 组件、可见性、站点货币、时间表达式预览、按次表达式是连续改造，还需配套 options 写入修复 |
| 高 | 统一安全中心：`d8cb17744` 及后续 | 涉及会话证明、Telegram OAuth、访问令牌、密码、删号和审计；必须保留多 Passkey、注册邀请码、OAuth 头像和登录代理 |
| 高 | 显式 @ 模型修饰符及核心转换：`7c044d7c5`、`0ed497f06` 等 | 下游客户端伪装、请求重写、模型映射和计费身份均需同步适配，不能覆盖 Codex/Claude Code/CodeBuddy 处理 |
| 高 | 数据库驱动和约束修复 | PostgreSQL pooler、JSON Valuer、SQLite WAL、token/prefill/options 迁移应按实际问题单独验证，不能只凭 Git 无冲突判断 |

账务补丁风险高不代表价值低。建议在第一批完成后，尽早安排时间条件和账务一致性修复，并为它们保留独立验证与回退边界。

**两项最高风险的具体原因**

任务插件系统 `eb48396d5` 的基础提交涉及 336 个文件，单独模拟有 31 个冲突。更关键的是渠道编号：上游 `ChannelTypeTaskPlugin = 61`，下游 [constant/channel.go:61](<../../../../constant/channel.go:61>) 已定义 `ChannelTypeCodexCompatibility = 61`。直接沿用上游值会改变已有渠道类型的含义；还要保留下游 62/63/64 三类渠道。MiniMax-H3、Wan3、插件市场和 Sora 查询修复均依赖这套基础，不能视作几个独立适配器直接复制。

上游 [v1.0.0-rc.36 发布说明](https://github.com/QuantumNous/new-api/releases/tag/v1.0.0-rc.36) 仍明确说明插件系统处于实验阶段、不推荐生产使用，并要求从 rc.26 或更早版本升级者重新配置视频价格。该标签指向 `ea7cb0ba4`；本次比较还包括其后的 2026-09-09 main 提交。

64 位钱包变更 `a073f74b3` 增加启动前 schema 检查，旧 MySQL/PostgreSQL `users.quota/used_quota/aff_quota/aff_history` 不是 bigint 时会拒绝启动，代码明确不自动升级旧表。必须先核实存量列类型和迁移方案。它仍保留单请求 int32 计费饱和保护，不能将钱包上限与单请求计费上限混为一谈。

**不建议直接取的内容**

- `3a9f41ee8` 会临时禁用 `/messages/count_tokens`，而下游 [router/relay-router.go:102](<../../../../router/relay-router.go:102>) 已实现该路由；不引入这个回退。
- `c9bc03864`、`15cfdedde` 的模型抓取和选择同步，下游已由 `c0ee46798` 重做。应检查具体遗漏，不重复覆盖旧弹窗。
- `524455fac` 的导出不能简单替换下游 CSV 导出与注册/订阅码扩展。
- `69a41eead` 已撤回，评估后续 `2b6f1dfef`；`e5efc73cd` 是无内容提交。
- `ebe4c368f` 的全仓 Go 风格整理和 `12be9975c` 的全局错误通知，独立模拟分别有 94、91 个冲突，不适合作为首批功能同步。
- 发布工作流、版本生成、AGENTS 和 PR 模板按下游规范单独评估，保留下游日期/commit 版本机制。

**本次验证证据与边界**

21 项候选使用 `git merge-tree` 连续生成临时结果树，全部无文本冲突，再提取为独立快照进行验证，没有切换或提交主分支。

| 检查 | 结果 |
| --- | --- |
| 前端 `bun run typecheck` | 通过 |
| 受影响前端文件 lint（续查补充） | 15 文件通过；0 error、1 条 `parseFloat` 规范 warning |
| 下游渠道回归 `bun run test:channels` | 11 文件、90 测试通过 |
| 下游 Playground 回归 `bun run test:playground` | 19 文件、78 测试通过 |
| `go test`：ali、ollama、relay/common、router | 通过 |
| newapi、deepseek、zhipu_4v 包 | 编译通过；包内没有测试文件 |
| `relaykit`：`GOWORK=off go build ./...` | 独立构建通过 |
| `relaykit` Claude 转换测试（续查补充） | `GOWORK=off` 下 relayconvert、oai_chat、oai_responses 测试通过；shared/claude 编译通过，无独立测试文件 |

本轮没有调用真实上游供应商，没有执行三库迁移、充值支付、Docker 构建或前端生产构建；也没有对全部 153 个提交运行回归。前端使用下游现有 node_modules，DOMPurify 升级未包含在验证组合中。高风险组的结论来自差异、接口和依赖审查，不是运行验收结论。

临时快照位于 `C:\Users\10178\AppData\Local\Temp\new-api-upstream-review-lets37\snapshot-python`，精确结果树与组合顺序保存在下方证据文件。

- [完整 153 项风险清单](<./commit-inventory.md>)
- [提交、改动文件、单提交冲突与原始消息](<./inventory.json>)
- [整分支合并模拟](<./full-merge-simulation.json>)
- [连续组合模拟和依赖顺序](<./batch-simulations.json>)
- [构建与测试输出](<./validation.json>)
- [续查：引用核对、全量归类、快照一致性与首批 9 项模拟](<./resume-verification.json>)
- [续查：前端 lint 与 Claude 转换测试输出](<./resume-validation.json>)
