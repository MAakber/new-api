**上游提交逐项清单（2026-09-10）**

比较方向：QuantumNous/new-api 的 upstream/main → MAakber/new-api 的本地 main。

本表风险是相对当前下游实现的集成风险。单提交模拟使用该提交的父提交作为三方合并基线；缺少前置提交也可能导致冲突。无文本冲突不等于功能已验证。

50 个单提交模拟无冲突（其中 2 个为空），103 个有冲突。标记“21 项组合”表示该补丁已纳入临时快照的构建/测试验证，不表示已逐功能完成真实供应商联调。

**低 · 开发镜像构建修复**

处理建议：可优先引入。Dockerfile.dev 补上 relaykit/go.mod，修复本地模块依赖解析；不改变线上业务。已纳入临时验证组合，尚未执行 Docker 镜像构建。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [7037ac15b](https://github.com/QuantumNous/new-api/commit/7037ac15bd8a29f8ee3e2b74e784bcdb75d67d22) | fix(docker): add relaykit go.mod to dev build context (#7072) | 1 | 无文本冲突 | 21 项组合 |

**低 · 小型交互和展示修复**

处理建议：可优先引入。包括搜索防抖、登录后刷新 Turnstile、日志筛选防密码自动填充、如实显示仅订阅偏好、AQBot 预设和导航字号。除导航字号外均纳入临时组合验证；订阅提交只修显示，不改扣费规则。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [aa7d0d39a](https://github.com/QuantumNous/new-api/commit/aa7d0d39a4a783fe1a9358fee4fed8d093cd1e02) | style: use text-sm for public header nav links to match other nav components (#6557) | 1 | 无文本冲突 | 未运行 |
| [7dd1000a1](https://github.com/QuantumNous/new-api/commit/7dd1000a190d1c810fa0d5723770341106742a1b) | perf(web): debounce server and large-list searches (#6727) | 10 | 无文本冲突 | 21 项组合 |
| [ffeb1b24e](https://github.com/QuantumNous/new-api/commit/ffeb1b24ef85ee98c048649a554136f9fe9d43cf) | fix(web): refresh Turnstile token after login attempt (#6764) | 1 | 无文本冲突 | 21 项组合 |
| [2d8e50bf3](https://github.com/QuantumNous/new-api/commit/2d8e50bf36e94200b809dfb39e73624ec48b1e23) | refactor(web): prevent credential autofill in usage log filters (#6966) | 2 | 无文本冲突 | 21 项组合 |
| [b5b94bc68](https://github.com/QuantumNous/new-api/commit/b5b94bc685fd2251551df826dab3575ab262f6dc) | fix(subscription): 无有效订阅时前端如实显示「仅用订阅」偏好 (#6222) (#7086) | 8 | 无文本冲突 | 21 项组合 |
| [8454082f9](https://github.com/QuantumNous/new-api/commit/8454082f930f44593e92791c2581ffc63eb30a59) | feat(chat): add AQBot preset (#7079) | 2 | 无文本冲突 | 21 项组合 |

**低 · 独立渠道缺陷修复**

处理建议：可优先引入。分别复用 OpenAI 图片 multipart 转换、保留阿里未传 top_p 的默认行为、修正火山模型列表路径。三项均纳入临时组合验证；真实供应商调用仍需联调。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [8461e5339](https://github.com/QuantumNous/new-api/commit/8461e5339d483f3c0699fb009567be9cec25846d) | fix(relay): preserve multipart image edits for New API channels (#6559) | 1 | 无文本冲突 | 21 项组合 |
| [2399de97d](https://github.com/QuantumNous/new-api/commit/2399de97daf6ac76e5378a7c7c244ff0628a8186) | fix(ali): stop injecting top_p into requests that omit it (#6674) | 2 | 无文本冲突 | 21 项组合 |
| [876903a8e](https://github.com/QuantumNous/new-api/commit/876903a8eb22c44e395c03da38f6701c650651ae) | fix: 修正火山方舟渠道获取模型列表的端点路径 (#7203) | 1 | 无文本冲突 | 21 项组合 |

**低 · DOMPurify 补丁升级**

处理建议：可优先引入，但需重建锁文件。package.json 同时修改依赖与 overrides。原提交未更新 bun.lock，不能仅修改版本号就视为升级完成；该版本升级不在本次临时快照验证范围。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [f250f3b58](https://github.com/QuantumNous/new-api/commit/f250f3b589c836764954f646448084e93873798b) | chore(deps): bump dompurify from 3.4.11 to 3.4.13 in /web (#6735) | 1 | 无文本冲突 | 未运行 |

**中低 · 供应商协议和图片兼容增强**

处理建议：可按供应商分批引入。DeepSeek/GLM Responses、Ollama 推理与工具上下文及 Claude/Responses 透传、阿里映射后图片协议和 response_format。阿里两项按 93d2df85f → 0bee5d441 引入可消除测试文件冲突。六项均纳入临时组合；Ollama 透传需确认部署版本确实支持相应端点。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [9724ef1b2](https://github.com/QuantumNous/new-api/commit/9724ef1b248a436ea47270bb5b394a0fdb013a6c) | feat: deepseek responses api (#6562) | 1 | 无文本冲突 | 21 项组合 |
| [8ad159a3b](https://github.com/QuantumNous/new-api/commit/8ad159a3bbc2da9f7432848a58c99bc2dafee227) | fix(ollama): preserve reasoning and tool-call context (#6605) | 4 | 无文本冲突 | 21 项组合 |
| [93d2df85f](https://github.com/QuantumNous/new-api/commit/93d2df85f824e4343a114e1f18dde4f795e2d55b) | fix(ali): 修复阿里图片模型映射后仍使用原始模型名判断协议的问题 (#6772) | 2 | 无文本冲突 | 21 项组合 |
| [cae3676ec](https://github.com/QuantumNous/new-api/commit/cae3676ec6f46ee5ef596443256f78c4e9b34ceb) | feat: glm chanel /v1/responses (#7050) | 1 | 无文本冲突 | 21 项组合 |
| [ba2e9287b](https://github.com/QuantumNous/new-api/commit/ba2e9287bb7a8002116c03daa4c457a330054871) | feat(ollama): passthrough Claude Messages and OpenAI Responses (#7051) | 1 | 无文本冲突 | 21 项组合 |
| [0bee5d441](https://github.com/QuantumNous/new-api/commit/0bee5d4410296e972bf0076414ade786c2c799c8) | fix(ali): honor image response format (#5513) (#7048) | 2 | 1 个冲突文件 | 21 项组合 |

**中低 · 请求解压、错误状态和 Gemini 模型列表**

处理建议：可分批引入。新增 zstd 解压、无效参数返回 HTTP 400 且不重试、正确处理 Gemini 风格 /v1/models 鉴权及列表。均纳入临时组合。影响公共请求入口，仍需检查坏压缩包、大小边界和客户端错误处理。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [0f9f668c6](https://github.com/QuantumNous/new-api/commit/0f9f668c6076214680f87e89a88a426cb08228ad) | feat: support zstd request decompression (#6545) | 2 | 无文本冲突 | 21 项组合 |
| [0f2a2075a](https://github.com/QuantumNous/new-api/commit/0f2a2075ab072ea7e20ffa5dd5d58dbf1b6b5b22) | fix(relay): 请求参数校验错误返回 HTTP 400 (#6774) | 1 | 无文本冲突 | 21 项组合 |
| [3d5dc36f1](https://github.com/QuantumNous/new-api/commit/3d5dc36f1d85ccae8d5cb2864764011795b559b5) | fix: 修复 Gemini 风格 /v1/models 列表请求 (#6199) | 3 | 无文本冲突 | 21 项组合 |

**中低 · 参数覆写上下文与 vLLM 字段透传**

处理建议：上下文可优先；vLLM 字段做小范围适配。下游已有 UserId/UserGroup/TokenGroup/UsingGroup 字段，85feb7a34 已通过组合测试。vLLM thinking_token_budget 的独立模拟在 DTO 文件有冲突，宜仅移植新增字段并验证缺省及显式零值。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [85feb7a34](https://github.com/QuantumNous/new-api/commit/85feb7a345d2d94d3ed4df89eb67ac504e0c1560) | feat(relay): expose user and group context to parameter overrides (#6534) | 2 | 无文本冲突 | 21 项组合 |
| [8f6961c67](https://github.com/QuantumNous/new-api/commit/8f6961c675932f406260ff0c218bc2aa0603e9b2) | feat: vllm thinking_token_budget (#7027) | 1 | 1 个冲突文件 | 未运行 |

**中低 · Claude 工具与 Responses 参数保真**

处理建议：基础工具修复可引入，其余适配后引入。空 tools 和无参数工具修复已纳入组合并通过 relaykit 独立构建。presence/frequency penalty 的冲突在下游 Codex 测试文件；prompt_cache_key 需处理前序转换测试依赖。不能为消除冲突覆盖下游 Codex 回归用例。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [4442bb302](https://github.com/QuantumNous/new-api/commit/4442bb302898fef9763c91dab8c638ae2b27fbe7) | fix(relay): stop injecting empty tools into Claude requests | 2 | 无文本冲突 | 21 项组合 |
| [3dda1d50c](https://github.com/QuantumNous/new-api/commit/3dda1d50c6d4a35edf1c74200fcb02d46d0fd075) | fix(relaykit): preserve parameterless tools in Claude conversion (#6862) | 4 | 无文本冲突 | 21 项组合 |
| [7d09c6954](https://github.com/QuantumNous/new-api/commit/7d09c6954ef3e6d65a37840ed3a566eb9acedaaa) | fix: prompt_cache_key openai chat -> openai responses (#6861) | 2 | 1 个冲突文件 | 未运行 |
| [253a74dd1](https://github.com/QuantumNous/new-api/commit/253a74dd1b47e2bde6dd6027c6aa1b5e0ee67827) | fix(relay): preserve presence/frequency penalty in Responses conversion (#6654) | 8 | 1 个冲突文件 | 未运行 |

**中低 · 独立前端体验调整**

处理建议：可另开小批次验证。手机侧栏、流式文字淡入及编辑器、首页引导、刷新后重查安装状态，独立模拟均无文本冲突。本次未对这些补丁做组合运行验证；要保护浮窗层级、绘图工作区和登录导航。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [4eaeefbdf](https://github.com/QuantumNous/new-api/commit/4eaeefbdf5b979fb777884df24090740bd2a3ef3) | fix: mobile sidebar (#6760) | 4 | 无文本冲突 | 未运行 |
| [137d1171f](https://github.com/QuantumNous/new-api/commit/137d1171f2b4b24cd7fb14bcef212de303fa963e) | feat(web): fade in streamed response words and harden playground editor (#6895) | 13 | 无文本冲突 | 未运行 |
| [521cebf58](https://github.com/QuantumNous/new-api/commit/521cebf585efc2e782dd9fb93d0f66752c8d3c32) | fix(dashboard): simplify completed setup guide | 3 | 无文本冲突 | 未运行 |
| [98d50d538](https://github.com/QuantumNous/new-api/commit/98d50d5383a33432ff6c30b129461b170e5cbffc) | fix(web): recheck setup status after page reload (#6968) | 1 | 无文本冲突 | 未运行 |

**中低 · 请求深拷贝性能优化**

处理建议：可独立验证后引入。用批量复制替代逐字节反射，保留 RawMessage 存储隔离。文本可直接合入，但 DeepCopy 是共享工具，必须验证重试隔离、显式零值和多协议 DTO；本轮未执行该提交测试。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [2cf177ac4](https://github.com/QuantumNous/new-api/commit/2cf177ac487e62c627c7d423b65735ba2481ef4f) | perf(common): 批量复制 RawMessage，优化请求深拷贝 (#7221) | 2 | 无文本冲突 | 未运行 |

**中低 · MySQL 后台任务锁状态修复**

处理建议：可独立验证后引入。无变化 UPDATE 返回零行时再次核实锁，避免误判锁丢失；无 schema 迁移。文本无冲突，需覆盖真实 MySQL changed-rows 语义及过期锁。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [b7017c251](https://github.com/QuantumNous/new-api/commit/b7017c251badaacaab840646a959635d00665e2d) | fix(model): do not treat no-op system task state writes as lock loss (#7135) | 2 | 无文本冲突 | 未运行 |

**中低 · 输入长度及 Qwen TTS 分类修复**

处理建议：小范围移植。长度校验文件含下游公告逻辑；TTS 分类提交依赖上游新 model-categories.ts，而下游已经使用自己的分类流程。移植对应规则，不覆盖整个文件。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [d49160f0e](https://github.com/QuantumNous/new-api/commit/d49160f0e5433a2b87e1431c0b7bf01d8e429e75) | fix: backend length validation (#5548) | 1 | 1 个冲突文件 | 未运行 |
| [823e26304](https://github.com/QuantumNous/new-api/commit/823e26304a396854ace30b52b98ec497c2dd9c36) | fix(channels): classify Qwen TTS models correctly (#6711) | 1 | 1 个冲突文件 | 未运行 |

**中 · OAuth 局部安全、绑定与敏感操作保护**

处理建议：按行为适配后引入。外部 opener 误判、绑定覆盖用户状态、绑定响应字段、管理员解绑、敏感接口限流及令牌轮换确认。需兼容下游注册邀请码、OAuth 头像、多 Passkey 与每用户 RPM；不要直接替换整段认证流程。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [e78e1db1e](https://github.com/QuantumNous/new-api/commit/e78e1db1e4ed7d65e37c2527826f290c0c63b041) | fix(oauth): stop treating a foreign window.opener as a bind flow (#6425) | 4 | 1 个冲突文件 | 未运行 |
| [0cd9dc85e](https://github.com/QuantumNous/new-api/commit/0cd9dc85e334018d15c5a480e39753d0866e2035) | Merge commit from fork | 4 | 1 个冲突文件 | 未运行 |
| [d7992672a](https://github.com/QuantumNous/new-api/commit/d7992672a606c3e97257ed411d77adecf22559c0) | fix(oauth): avoid overwriting user state when binding | 11 | 1 个冲突文件 | 未运行 |
| [116255f07](https://github.com/QuantumNous/new-api/commit/116255f076a3e9d92b0c9a85303daae73997b55e) | fix(oauth): align custom binding response fields in frontend (#6818) | 14 | 7 个冲突文件 | 未运行 |
| [692e8d6ee](https://github.com/QuantumNous/new-api/commit/692e8d6ee6a9a1620c2d731cb51a1e3154a7042b) | fix(web): restore admin unbinding for built-in providers (#6987) | 2 | 无文本冲突 | 未运行 |
| [1da23d6b3](https://github.com/QuantumNous/new-api/commit/1da23d6b33421daf88a1a15a6821d6304940691a) | feat(rate-limit): add user critical rate limit middleware for access token and aff transfer routes | 2 | 1 个冲突文件 | 未运行 |
| [9c97e78ac](https://github.com/QuantumNous/new-api/commit/9c97e78aced572d540f227007a675d7d007666ac) | fix(web): require confirmation before rotating access token (#6749) | 9 | 7 个冲突文件 | 未运行 |

**中 · 日志和额度展示增强**

处理建议：以功能移植为主。流式状态、使用统计精度、移动日志、可搜索分组、API key 和用户额度展示。新版表格/额度组件存在前序依赖；需保留下游日志头像、日期筛选及诊断权限。小型列宽补丁不能脱离父组件重构单独复制。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [84834eee8](https://github.com/QuantumNous/new-api/commit/84834eee859fd69ed6b8ab3c848f86f1ff98b992) | feat(logs): expose stream status to log owners (#6558) | 2 | 无文本冲突 | 未运行 |
| [8c8c4153d](https://github.com/QuantumNous/new-api/commit/8c8c4153d4b80d54352d21593de41aa9a6178f7e) | fix(log): preserve quota in usage statistics (#7108) | 1 | 无文本冲突 | 未运行 |
| [a5e41a893](https://github.com/QuantumNous/new-api/commit/a5e41a893379e49bd9e1d025e775c04df8961c95) | feat(usage-logs): refine mobile layout and keep quick actions visible | 20 | 3 个冲突文件 | 未运行 |
| [8f72ecbbf](https://github.com/QuantumNous/new-api/commit/8f72ecbbfd86ded5ee15373921533eed3d334a9a) | feat(usage-logs): add searchable group filter | 5 | 3 个冲突文件 | 未运行 |
| [2bec37062](https://github.com/QuantumNous/new-api/commit/2bec370629aa72d74d3f598b953a4d33b8bcbf7d) | feat(web): refine API key and user quota displays | 28 | 15 个冲突文件 | 未运行 |
| [551bb63ed](https://github.com/QuantumNous/new-api/commit/551bb63edf4007d7c4b0930504faf6db87012d73) | fix(keys): show desktop quota amounts side by side | 2 | 2 个冲突文件 | 未运行 |
| [bd22e45a7](https://github.com/QuantumNous/new-api/commit/bd22e45a740a7c02c328704dc419d8795237cb74) | style(keys): widen the desktop quota column | 1 | 1 个冲突文件 | 未运行 |
| [950644c9d](https://github.com/QuantumNous/new-api/commit/950644c9d54445bdd8796643e4e2e18e13167a4c) | fix(keys): preserve spacing after desktop quota content | 3 | 2 个冲突文件 | 未运行 |
| [ea7cb0ba4](https://github.com/QuantumNous/new-api/commit/ea7cb0ba4e0f82e2bfa5e55752eb68bdf902f71b) | refactor(web): unify table cells and quota details | 17 | 12 个冲突文件 | 未运行 |

**中 · 渠道测试与高级路由增量**

处理建议：在下游现有实现上增加功能。可增加仅自动禁用模式、测试并发、网关字段透传开关及高级路由编辑。下游测试链已包含兼容渠道、能力诊断和排队预热；高级路由还涉及自定义余额与浮窗，不能整段覆盖。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [b941253ae](https://github.com/QuantumNous/new-api/commit/b941253aea6b9bccf1bc8de503bf3477caafebfe) | fix: test Claude/Gemini endpoints with native request format (#6698) | 1 | 1 个冲突文件 | 未运行 |
| [5d3423bec](https://github.com/QuantumNous/new-api/commit/5d3423bec13f6da2498bdc5b288c9ee2507fd3ef) | feat(channels): add auto-disable-only channel test mode (#6728) | 13 | 9 个冲突文件 | 未运行 |
| [4add708eb](https://github.com/QuantumNous/new-api/commit/4add708ebe3b74e02dcf141887da2c81cb9b1526) | feat: channel test (#6917) | 17 | 15 个冲突文件 | 未运行 |
| [e90a7c48e](https://github.com/QuantumNous/new-api/commit/e90a7c48e5e47aab3b93ce663e5f1cda0964de11) | feat: add field passthrough controls for gateway channels (#6847) | 3 | 2 个冲突文件 | 未运行 |
| [2b0efd848](https://github.com/QuantumNous/new-api/commit/2b0efd8484cc1e20b6de64f8600586fe61dee867) | refactor: advanced custom channel route editor (#6865) | 21 | 8 个冲突文件 | 未运行 |
| [bdef11750](https://github.com/QuantumNous/new-api/commit/bdef117505247769268b209665fb3ad7554c3da7) | fix: restore add split button in advanced custom routes (#7289) | 1 | 1 个冲突文件 | 未运行 |

**中 · 抓取模型工作流**

处理建议：已有同类能力，优先检查缺口。下游 c0ee46798 已重做抓取模型、分类、选择同步及保存流程，并有对应测试。上游旧弹窗提交均发生冲突，不能仅凭标题重复引入。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [c9bc03864](https://github.com/QuantumNous/new-api/commit/c9bc038649d1d1f6f1fe9d6bca3b09f842cdcf6b) | feat(channels): refine fetched model categorization (#6632) | 3 | 1 个冲突文件 | 未运行 |
| [15cfdedde](https://github.com/QuantumNous/new-api/commit/15cfdeddef464d109a60992c802e17d9d1e4a3b4) | fix(web): keep fetched model selection in sync with form (#6841) | 2 | 2 个冲突文件 | 未运行 |

**中 · 模型健康小时序列**

处理建议：适配 API 契约后引入。返回字段从 recent_success_rates 切换为 recent_success_series，下游可用性榜单已有消费者。必须兼容旧字段或同步更新所有消费者，不能只合后端。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [5c7cca015](https://github.com/QuantumNous/new-api/commit/5c7cca015525212a7ac2741da7f3b51fa2e30db0) | fix(perf): return hourly success-rate series for model health bar | 5 | 3 个冲突文件 | 未运行 |

**中 · 匿名公开内容缓存与 status 去重**

处理建议：按依赖顺序适配。219c9e063 → 36dbbf0f7 的双提交组合无冲突；随后 status 去重仍在 use-system-config 与用户绑定组件发生冲突。需核对用户切换、公告、全局主题和登录态缓存失效。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [219c9e063](https://github.com/QuantumNous/new-api/commit/219c9e06341f1b100e2c572a5f97c45f151fd280) | 优化匿名冷启动与公开内容接口的重复回源请求 (#7166) | 12 | 无文本冲突 | 未运行 |
| [36dbbf0f7](https://github.com/QuantumNous/new-api/commit/36dbbf0f77e710455e745048f4a32e8120ad3fd2) | fix: keep ETag valid across different JSON packages | 3 | 2 个冲突文件 | 未运行 |
| [c79b74b68](https://github.com/QuantumNous/new-api/commit/c79b74b68358180c68440057596bdc34a99cc649) | fix(frontend): deduplicate /api/status requests (#7189) | 11 | 3 个冲突文件 | 未运行 |

**中 · 计费编辑器局部修复**

处理建议：建议较早安排，单独验证金额语义。兑换码额度精度、普通时段错误生成恒真 OR 条件、日志展示命中倍率。当前下游 billing-expr.ts 仍有该时间条件问题。处理现有错误表达式需要复查并重新保存，代码升级不会自动纠正已存表达式。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [e926e5cac](https://github.com/QuantumNous/new-api/commit/e926e5cacee22fc838d94e8b95b438e825508e11) | fix: 修复兑换码额度精度损失 (#6685) | 5 | 2 个冲突文件 | 未运行 |
| [ac381acf4](https://github.com/QuantumNous/new-api/commit/ac381acf4bf41204b97bb26b4c58c83275877a2e) | fix(billing): 修复时间规则恒真表达式导致倍率全天生效 (#6934) | 10 | 1 个冲突文件 | 未运行 |
| [4cf9107f0](https://github.com/QuantumNous/new-api/commit/4cf9107f043709b3364a48f7a7bacc5f8ca80928) | feat(billing): highlight matched conditional multipliers in logs (#6561) | 12 | 1 个冲突文件 | 未运行 |

**中 · 兑换码批量删除及 TXT/Markdown 导出**

处理建议：保留下游扩展后移植。下游已有 CSV 导出、订阅奖励及可多次使用的注册邀请码；上游新增批量软删除和生成后文件保存有价值，但还调用新审计接口。需明确不同码类型的删除与导出行为，避免遗漏本地字段。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [524455fac](https://github.com/QuantumNous/new-api/commit/524455fac3c438321df4ae9ed4ffd11bc635cc4f) | feat(redemptions): add batch deletion and optional file exports | 23 | 13 个冲突文件 | 未运行 |

**中 · 连接资源、HTTP 重放和推理日志**

处理建议：分组适配并做协议回归。Bedrock 取消传播、响应头等待超时、HTTP/2 请求体重放及推理强度日志。重放基础与重构应成组；超时默认 1800 秒，要核对下游排队预热。即使文本无冲突，也涉及重试、取消和账单统计。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [bd585d78e](https://github.com/QuantumNous/new-api/commit/bd585d78efd418aaf7baa7e34fa48c5536581868) | fix(aws): cancel Bedrock requests on client disconnect (#6589) | 4 | 无文本冲突 | 未运行 |
| [b518d0033](https://github.com/QuantumNous/new-api/commit/b518d0033b670f5518b8a2f1cf8ea0142a9d1b8d) | fix(relay): bound the wait for upstream response headers (fixes unbounded heap growth → OOM) (#6949) | 5 | 无文本冲突 | 未运行 |
| [d6b5ce99d](https://github.com/QuantumNous/new-api/commit/d6b5ce99de4930f348cda8dd3bb14f739ac38e22) | fix(relay): set Request.GetBody so the HTTP/2 transport can transparently retry after an upstream stream reset (#6249) | 20 | 2 个冲突文件 | 未运行 |
| [ea4f02101](https://github.com/QuantumNous/new-api/commit/ea4f021012cddc52126123ab4ed8ced3df260b85) | refactor(relay): move replay metadata onto request bodies | 20 | 18 个冲突文件 | 未运行 |
| [eab18a835](https://github.com/QuantumNous/new-api/commit/eab18a83579187f880139894dd9e7f06d1a492ce) | fix: record reasoning effort consistently in usage logs (#6641) | 10 | 3 个冲突文件 | 未运行 |

**高 · 扣费、充值、退款一致性修复**

处理建议：必要但作为独立账务批次。跨组重试预扣与结算、充值原子性和额度上限、并发更新、任务退款 used_quota、Responses 缓存用量。df43f8015 → cfaba1dd6 已验证双提交文本可组合，其余有依赖和本地订阅/兑换码冲突；本轮未验证账务运行结果。必须覆盖三库、缓存以及预扣/补扣/退款对账。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [df43f8015](https://github.com/QuantumNous/new-api/commit/df43f801536b348b00bfa4da7639b42c2c036821) | fix(billing): settle tiered retries with final group (#6518) | 6 | 无文本冲突 | 未运行 |
| [cfaba1dd6](https://github.com/QuantumNous/new-api/commit/cfaba1dd6754d4238e1360247c198a64a313e96c) | fix(billing): harden tiered retry group-switch billing (#6570) | 4 | 3 个冲突文件 | 未运行 |
| [50e5377ea](https://github.com/QuantumNous/new-api/commit/50e5377ea5feec326c416450e4e8bcc0bdfe7749) | fix(topup): settle recharge orders atomically | 7 | 1 个冲突文件 | 未运行 |
| [ccd535ef8](https://github.com/QuantumNous/new-api/commit/ccd535ef8e50cf6e5846a59278c40b7ff59d1b7d) | fix: harden concurrent quota and status updates | 14 | 4 个冲突文件 | 未运行 |
| [58d4e9bd3](https://github.com/QuantumNous/new-api/commit/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a) | fix(billing): 异步任务退款时同步减少 used_quota (#6795) | 9 | 1 个冲突文件 | 未运行 |
| [2a0ce3475](https://github.com/QuantumNous/new-api/commit/2a0ce3475c2df51ef5fd725f1eb0249822eb1c35) | fix(topup): reject uncreditable orders before payment (#6845) | 6 | 无文本冲突 | 未运行 |
| [47ba9d2c6](https://github.com/QuantumNous/new-api/commit/47ba9d2c63d6dcbf3a183ee421b136ee1b1331ed) | fix(topup): guard wallet quota during recharge | 8 | 8 个冲突文件 | 未运行 |
| [f11641428](https://github.com/QuantumNous/new-api/commit/f116414284162ad15d8925f7bca494c109b83e93) | fix: settle Responses cached token usage (#6892) | 2 | 无文本冲突 | 未运行 |

**高 · 令牌自定义自动分组**

处理建议：独立移植。57 个文件，独立模拟 7 个冲突。增加令牌自动分组而非仅全站默认分组，贯穿模型列表、路由、额度和前端表单；需要与下游每用户 RPM、渠道规则及分组计费一起验证。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [0ab020206](https://github.com/QuantumNous/new-api/commit/0ab02020603d22e5613bc4cf46bfab06f8567769) | Feat/auto group (#6590) | 57 | 7 个冲突文件 | 未运行 |

**高 · 日志特权元数据隔离**

处理建议：值得引入，但需完整适配权限模型。由普通 map 改为 LogOther 的 public/admin/root/audit 投影，影响多个记录和读取入口。下游另有完整请求体诊断和头像；需要逐角色证明敏感字段不泄漏且管理员仍可排错。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [057f71c23](https://github.com/QuantumNous/new-api/commit/057f71c2336c3981187b732a9d06f65490e9a946) | fix(logs): isolate privileged metadata | 25 | 14 个冲突文件 | 未运行 |
| [9f506dd7f](https://github.com/QuantumNous/new-api/commit/9f506dd7f905c288b4a119a8197cd64b77eb4a3f) | refactor(logs): simplify LogOther projection and dedupe sensitive keys | 6 | 6 个冲突文件 | 未运行 |

**高 · 核心协议转换、模型修饰符与 JSON 基础层**

处理建议：分模块设计移植，不整批挑拣。包含托管工具、用量保真、显式 @ 修饰符、canonical billing model、模型能力表、Kimi K3 动态工具和可注入 JSON codec。与下游 Codex/Claude Code/CodeBuddy 参数、模型名和请求重写高度交叉，且 relaykit 必须保持独立。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [0ed497f06](https://github.com/QuantumNous/new-api/commit/0ed497f066a68613375124303ef54f220267b334) | feat(relay): hosted-tool conversion fidelity, reasoning normalization, and billing usage integrity (#7137) | 149 | 18 个冲突文件 | 未运行 |
| [bbd97446c](https://github.com/QuantumNous/new-api/commit/bbd97446c26092f2e7250af429096064b9e0f899) | fix(relay): follow-up billing integrity and conversion completions (#7170) | 18 | 11 个冲突文件 | 未运行 |
| [7c044d7c5](https://github.com/QuantumNous/new-api/commit/7c044d7c5c2d2beadf16b21910950f8f593bc3ef) | feat(relay): explicit @ model modifiers and canonical billing identity | 46 | 38 个冲突文件 | 未运行 |
| [6b659fd61](https://github.com/QuantumNous/new-api/commit/6b659fd61c50e35d559c41520a0fff7b8aea56a4) | fix(relay): preserve reasoning effort without implicit remapping | 11 | 9 个冲突文件 | 未运行 |
| [49ec46966](https://github.com/QuantumNous/new-api/commit/49ec4696682530781a036eab1ac195f0b04706c0) | fix(relay): apply model-specific OpenAI chat capabilities (#7211) | 4 | 1 个冲突文件 | 未运行 |
| [6e10f9bc9](https://github.com/QuantumNous/new-api/commit/6e10f9bc927a4eae889864a6ef601359d53526b9) | fix(relay): preserve Kimi K3 dynamic tool loading messages | 7 | 2 个冲突文件 | 未运行 |
| [7bbe85bcb](https://github.com/QuantumNous/new-api/commit/7bbe85bcb09546e0b89572bf97198fc94889be3d) | refactor(json): route JSON helpers through a host-injectable codec | 5 | 3 个冲突文件 | 未运行 |

**高 · 模型管理与定价体系重构**

处理建议：独立功能迁移。新模型/供应商管理、目录可见性、站点货币、动态表达式预览、按次表达式和内置模型价格。后续小 UI 修复依赖新 model-pricing 组件和后端配置接口；需配套 options 写入修复，并保持内部美元额度语义。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [0c76e4dae](https://github.com/QuantumNous/new-api/commit/0c76e4dae77a279e015329b7478e6f02d6b62edd) | feat(models): rework model/vendor management and pricing | 122 | 40 个冲突文件 | 未运行 |
| [75e533209](https://github.com/QuantumNous/new-api/commit/75e533209490a8ef3a8b5e3d93e4dac03ba19bcf) | feat(pricing): support site currency in pricing editors | 18 | 12 个冲突文件 | 未运行 |
| [0e0ba152b](https://github.com/QuantumNous/new-api/commit/0e0ba152bdcc6891f6053047ccf14d41b3cad60a) | feat(pricing): improve pricing editors and log display | 29 | 18 个冲突文件 | 未运行 |
| [71c1fd7ca](https://github.com/QuantumNous/new-api/commit/71c1fd7caad738db4d13aabbf28eeadb293d0cfe) | feat(models): improve model listing, pricing and visibility filters | 36 | 23 个冲突文件 | 未运行 |
| [bee45b58a](https://github.com/QuantumNous/new-api/commit/bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1) | fix(web): switch the pricing card grid to three columns at xl | 3 | 3 个冲突文件 | 未运行 |
| [d52bdc0b4](https://github.com/QuantumNous/new-api/commit/d52bdc0b4087d50d87eb06387e86b2be53e85cd4) | feat(billing): add time-based pricing editor and expression previews | 48 | 25 个冲突文件 | 未运行 |
| [7cf9b473f](https://github.com/QuantumNous/new-api/commit/7cf9b473f61eb7dc09f6f0782192f17595140a08) | fix(web): keep model pricing content in one scroll area | 2 | 2 个冲突文件 | 未运行 |
| [064ed943e](https://github.com/QuantumNous/new-api/commit/064ed943e1ac40e3eaca1b58ffb7fa5dacb3fde3) | feat(billing): support fixed per-request expression pricing | 54 | 42 个冲突文件 | 未运行 |
| [eb99ab1b4](https://github.com/QuantumNous/new-api/commit/eb99ab1b40343c3317bb47981cccdbb2b159a5fa) | feat(billing): add built-in expression pricing for gpt-6-astra | 5 | 2 个冲突文件 | 未运行 |

**高 · 可选密码传输加密**

处理建议：成组移植。首个提交增加加密，后续改成可配置开关，涉及前后端、密钥持久化及启动顺序。需兼容下游登录代理和现有注册流程；不能只取前半组。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [b80d633cf](https://github.com/QuantumNous/new-api/commit/b80d633cf586b001cfbb4200bae93e65abe57c2b) | feat(auth): encrypt password login transport | 10 | 1 个冲突文件 | 未运行 |
| [918427d8a](https://github.com/QuantumNous/new-api/commit/918427d8ab41f6adaa4113d0496f1f8621855b70) | feat(auth): make password encryption opt-in #6743 | 9 | 4 个冲突文件 | 未运行 |

**高 · 统一安全中心、访问令牌和账户审计**

处理建议：独立迁移项目。会话绑定验证、统一 Telegram OAuth、访问令牌管理、密码/绑定/删号与审计是连续依赖链。与本地多 Passkey、注册邀请码、头像和登录代理冲突明显，需覆盖旧会话与已有账户的升级行为。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [d8cb17744](https://github.com/QuantumNous/new-api/commit/d8cb177440ceaae422d5bfd96c258d47af4e0f1d) | feat(security): add access token management and audit logs | 129 | 29 个冲突文件 | 未运行 |
| [45c3fbe8a](https://github.com/QuantumNous/new-api/commit/45c3fbe8aeb049f03c13e14298a40b87aea5bd87) | fix(security): bind verification proofs to sessions and actions | 74 | 32 个冲突文件 | 未运行 |
| [3e84ec0ab](https://github.com/QuantumNous/new-api/commit/3e84ec0ab8239cf2277f8a10d45566630a9c10fa) | feat(auth): migrate Telegram to unified OAuth | 49 | 28 个冲突文件 | 未运行 |
| [a8729b5c3](https://github.com/QuantumNous/new-api/commit/a8729b5c3709cc01d88fc3f2db5b91347fc9129e) | feat(security): require verification for access token management | 12 | 12 个冲突文件 | 未运行 |
| [0973dc2b8](https://github.com/QuantumNous/new-api/commit/0973dc2b8f550de71b75fdd3805576d3ce6ccf42) | feat(security): harden account binding and password changes | 61 | 42 个冲突文件 | 未运行 |
| [3f8a50cf8](https://github.com/QuantumNous/new-api/commit/3f8a50cf8877683669cd812240a0beaf7b171c32) | feat(audit): complete token and quota operation records | 33 | 24 个冲突文件 | 未运行 |
| [6f2333990](https://github.com/QuantumNous/new-api/commit/6f2333990613bf3e9dd36f541fc380148c7b5175) | feat(auth): unify login verification and secure account deletion | 55 | 38 个冲突文件 | 未运行 |

**高 · 前端测试、弹层与全局通知重构**

处理建议：暂缓整批引入，按需取局部修复。下游已有独立 channels/playground/drawing Vitest 配置和浮窗。全局错误通知提交涉及 174 文件、独立模拟 91 个冲突；统一测试和弹层也需对齐现有运行环境。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [e2c7aa7b1](https://github.com/QuantumNous/new-api/commit/e2c7aa7b102c2075eae2377df3508658d45e88dc) | test(web): standardize frontend tests on Vitest (#6569) | 37 | 10 个冲突文件 | 未运行 |
| [387a40914](https://github.com/QuantumNous/new-api/commit/387a40914853310d69adc2f52474134ced5f4811) | fix(web): keep drawer popups interactive and shim storage in tests | 6 | 2 个冲突文件 | 未运行 |
| [12be9975c](https://github.com/QuantumNous/new-api/commit/12be9975c0bf01fa175a2bb3360607767c8ba5fb) | fix(web): unify server error notifications | 174 | 91 个冲突文件 | 未运行 |

**高 · 数据库驱动、约束和迁移修复**

处理建议：按实际数据库问题单独引入。包括 PostgreSQL pooler/simple protocol、JSON Valuer、SQLite WAL/立即事务、GORM/驱动配套及预填组/token/options 约束迁移。会影响启动和存量数据；缺少生产 schema 信息，不能仅凭无冲突给出可直接上线结论。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [66031a09d](https://github.com/QuantumNous/new-api/commit/66031a09d99f2ac4e0b94e2c41f04ed691a79304) | fix(model): disable PostgreSQL prepared statements for pooler compatibility | 5 | 无文本冲突 | 未运行 |
| [1751f43ee](https://github.com/QuantumNous/new-api/commit/1751f43ee07edc9eb0c56fd9b23586861b43df46) | fix(sqlite): enable WAL + working busy timeout + _txlock=immediate to stop concurrent write lockouts (#7030) | 1 | 无文本冲突 | 未运行 |
| [6eb6f35ed](https://github.com/QuantumNous/new-api/commit/6eb6f35ed211b7459cae3b9f13286b9c93fc1bd6) | fix(model): return string from JSON column Valuers for pg simple protocol | 5 | 无文本冲突 | 未运行 |
| [74158715c](https://github.com/QuantumNous/new-api/commit/74158715cde6d7b767ead23d9a2af64b7b58a588) | fix initialize database | 2 | 2 个冲突文件 | 未运行 |
| [2b6f1dfef](https://github.com/QuantumNous/new-api/commit/2b6f1dfefbe217fed31fc0726717cc7de6958e8e) | fix(model): drop leftover prefill_groups unique constraints before AutoMigrate | 4 | 1 个冲突文件 | 未运行 |
| [27ff6a876](https://github.com/QuantumNous/new-api/commit/27ff6a8767e728f879d52770c273d4f73214a430) | fix(model): migrate legacy token key constraints | 3 | 1 个冲突文件 | 未运行 |
| [9a8674425](https://github.com/QuantumNous/new-api/commit/9a8674425c5a43435a259b58bb928a55d26be990) | fix(db): avoid redundant schema migrations on restart | 7 | 1 个冲突文件 | 未运行 |
| [4fc9d1f1f](https://github.com/QuantumNous/new-api/commit/4fc9d1f1fa77c0cfdd9719cb59ff9ecc9885d66a) | fix(options): rebuild options table primary key and stop pricing writes resetting rows | 3 | 1 个冲突文件 | 未运行 |

**高 · 全仓 Go 语法与约定整理**

处理建议：不作为本轮功能同步目标。214 文件、独立模拟 94 个冲突，主要收益是代码风格统一。会显著增加后续功能补丁冲突成本，适合在业务迁移之后单独评估。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [ebe4c368f](https://github.com/QuantumNous/new-api/commit/ebe4c368f28787919ea478c0abf1ea7101978179) | refactor: modernize Go code conventions | 214 | 94 个冲突文件 | 未运行 |

**极高 · 64 位钱包额度迁移**

处理建议：暂缓，先设计数据迁移。不仅是 Go 类型变更：增加 MaxWalletQuota 与启动 schema 检查，旧 MySQL/PostgreSQL users 额度列不是 bigint 时会拒绝启动，且明确不自动升级旧表。单请求计费仍保留 int32 饱和上限，不能一并放大。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [a073f74b3](https://github.com/QuantumNous/new-api/commit/a073f74b38a33bb154821089c097658cbdcc0fbe) | refactor: deprecate int32 (#7025) | 35 | 13 个冲突文件 | 未运行 |

**极高 · 任务插件系统、市场和新视频模型**

处理建议：暂缓整批引入，需独立迁移方案。基础提交涉及 336 文件、独立模拟 31 个冲突，替换内置任务适配器。上游 TaskPlugin=61 与下游 CodexCompatibility=61 直接冲突，需分配不冲突的编号并核对存量数据。MiniMax-H3、Wan3、Sora 查询等均依赖插件基础。上游 rc.36 仍明确标记实验性，并要求旧版本升级者重配视频价格。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [eb48396d5](https://github.com/QuantumNous/new-api/commit/eb48396d5fe97d27772d0cd5e3ca8aa5caa4f3e9) | feat(task): replace built-in task adaptors with a sandboxed JS plugin system (#7076) | 336 | 31 个冲突文件 | 未运行 |
| [6c22550ea](https://github.com/QuantumNous/new-api/commit/6c22550ea325d4fea0e0ece52412cb1e4449291c) | feat(task): resolve channel-mapped aliases and case variants for plugin models | 23 | 20 个冲突文件 | 未运行 |
| [dc4732cfe](https://github.com/QuantumNous/new-api/commit/dc4732cfed712b004d3d3d94a414d3ff127a93cc) | feat(web): factory task plugins update only with the system | 11 | 11 个冲突文件 | 未运行 |
| [aece11d2f](https://github.com/QuantumNous/new-api/commit/aece11d2f7f095a33052696c5d28d3656609a99e) | feat(plugin): add MiniMax-H3 /v2 video generation to the hailuo task … (#7168) | 7 | 7 个冲突文件 | 未运行 |
| [73afad588](https://github.com/QuantumNous/new-api/commit/73afad588ca7af07134fa423e8a33fdea6c855b2) | fix(plugin): account for MiniMax-H3 input media usage (#7171) | 2 | 2 个冲突文件 | 未运行 |
| [9df450fe5](https://github.com/QuantumNous/new-api/commit/9df450fe54e1a874a5339b7c38a61014217f02c3) | feat(task): give polling hooks a real query context, host HTTP classification, and bounded poll failures | 36 | 32 个冲突文件 | 未运行 |
| [32c261923](https://github.com/QuantumNous/new-api/commit/32c261923a9786c64d2af087327ef057e7bde7e3) | fix(task): explain 503 when a plugin-claimed model has no channel | 6 | 2 个冲突文件 | 未运行 |
| [3b4652269](https://github.com/QuantumNous/new-api/commit/3b4652269a6a6d9e2c8650a84ee8c4e447e6473b) | feat(ali): support wan3.0 all-in-one video models | 2 | 1 个冲突文件 | 未运行 |
| [6298b0f32](https://github.com/QuantumNous/new-api/commit/6298b0f3238461b9629dfc1c00866f8325123aa1) | fix(plugin): suppress factory layer when disabling an overridden task plugin | 2 | 2 个冲突文件 | 未运行 |
| [92bc7ff73](https://github.com/QuantumNous/new-api/commit/92bc7ff73c5ef215496d09d3e4b5769c9e35006b) | fix(plugins): make sunoapi alias-safe and lock alias echo across built-ins | 3 | 3 个冲突文件 | 未运行 |
| [210734bb7](https://github.com/QuantumNous/new-api/commit/210734bb73bc3c6e37548af90360aa4226566fe2) | refactor(task): remove the custom-plugin layer switch | 12 | 12 个冲突文件 | 未运行 |
| [99974a814](https://github.com/QuantumNous/new-api/commit/99974a814f00a26dfa7431beb313e487529bbeed) | feat(plugins): extend plugin metadata and icon support | 29 | 28 个冲突文件 | 未运行 |
| [984330920](https://github.com/QuantumNous/new-api/commit/984330920061e014159c7581b8fcdb726de2c247) | feat(web): improve plugin management and marketplace | 43 | 29 个冲突文件 | 未运行 |
| [eb76b136b](https://github.com/QuantumNous/new-api/commit/eb76b136b85ecba9d6ad19c714c5781e51815530) | feat(channels): improve plugin channel setup and icons | 12 | 5 个冲突文件 | 未运行 |
| [9bf328d97](https://github.com/QuantumNous/new-api/commit/9bf328d9749751757d5d6b74088d514813a618bd) | fix: preserve provider fields in Sora video queries | 5 | 5 个冲突文件 | 未运行 |
| [a20574136](https://github.com/QuantumNous/new-api/commit/a20574136b2746e9afc4b268c99cf99b3f6cc68b) | fix(alibaba): correct Wan model protocols and usage accounting | 3 | 3 个冲突文件 | 未运行 |

**暂不纳入 · 会削减下游现有协议能力的提交**

处理建议：不直接引入。下游已实现 /messages/count_tokens，3a9f41ee8 会禁用它；移除 compact 模型后缀的提交需要另行确认旧模型名兼容，不能当作无副作用清理。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [bb234ff41](https://github.com/QuantumNous/new-api/commit/bb234ff4186140091db0defab250763861de2b45) | refactor(responses): remove compact model suffix handling (#6770) | 10 | 2 个冲突文件 | 未运行 |
| [3a9f41ee8](https://github.com/QuantumNous/new-api/commit/3a9f41ee85cc369f5b8d7fe6e62ff4e7bf3a9ec8) | fix: temp disable /messages/count_tokens | 2 | 2 个冲突文件 | 未运行 |

**暂不纳入 · 已撤回或无内容的补丁**

处理建议：跳过。69a41eead 已被 2bf0820f4 撤回，应评估后来的 2b6f1dfef；e5efc73cd 是空内容提交。对当前 HEAD，后两项模拟结果为空。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [69a41eead](https://github.com/QuantumNous/new-api/commit/69a41eeadc81adb08d04346512c76d62fd6203db) | fix(model): drop leftover prefill_groups unique constraints before AutoMigrate (#7100) | 2 | 无文本冲突 | 未运行 |
| [2bf0820f4](https://github.com/QuantumNous/new-api/commit/2bf0820f4b89530acf14d389ba3e8229211933fa) | Revert "fix(model): drop leftover prefill_groups unique constraints before Au…" (#7101) | 2 | 空变更 | 未运行 |
| [e5efc73cd](https://github.com/QuantumNous/new-api/commit/e5efc73cdb49f60e513f760ded4d3268a4304645) | chore(deps-dev): bump tar from 7.5.16 to 7.5.22 in /electron (#6468) | 0 | 空变更 | 未运行 |

**暂不纳入 · 文档、治理与发布流程**

处理建议：按需另行同步。不是业务功能；README 链接可单独修，AGENTS/PR 模板按下游规范处理。发布同步与版本生成不能覆盖下游已有的日期/commit 版本流程。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [5c3abffe8](https://github.com/QuantumNous/new-api/commit/5c3abffe8572aa8a49f15c3916707d2019d66af4) | CI: enhance release synchronization workflow with optional file syncing | 1 | 无文本冲突 | 未运行 |
| [e468b7391](https://github.com/QuantumNous/new-api/commit/e468b73915e5028e9849de62c5018a0faa203012) | docs: update PR template and remove PR Check workflow (#7053) | 10 | 无文本冲突 | 未运行 |
| [d8ca0ed0b](https://github.com/QuantumNous/new-api/commit/d8ca0ed0bb596e910e1955461e7691e40d224d70) | chore: let owners use human PR templates | 1 | 1 个冲突文件 | 未运行 |
| [d5803532b](https://github.com/QuantumNous/new-api/commit/d5803532bdccde3a2b1583291f51e92d3519b1c6) | docs: require expression pricing and consolidated tests | 1 | 无文本冲突 | 未运行 |
| [fff0635bb](https://github.com/QuantumNous/new-api/commit/fff0635bb14b8ec5f10df9e582a83591df841902) | docs: update project architecture and Go conventions | 1 | 无文本冲突 | 未运行 |
| [67a0585d0](https://github.com/QuantumNous/new-api/commit/67a0585d0f252dfca445c11b7600971b7eeb8eea) | fix(docs): correct Video API links across localized READMEs (#7116) | 6 | 无文本冲突 | 未运行 |
| [8f5ab8e40](https://github.com/QuantumNous/new-api/commit/8f5ab8e4048a90d88b20ae1e6d5228b04233d3b8) | fix(ci): resolve release version from trigger tag | 1 | 1 个冲突文件 | 未运行 |

**暂不纳入 · Electron 依赖和 Bun 构建版本**

处理建议：按实际构建目标另行升级。Electron 补丁主要作用于桌面打包；锁文件存在前序依赖，宜用包管理器成组更新。Bun 版本更新需对齐 CI、Docker 与本机，不作为业务功能合并的前置条件。

| 提交 | 内容 | 文件数 | 单独模拟 | 运行验证范围 |
| --- | --- | ---: | --- | --- |
| [626058075](https://github.com/QuantumNous/new-api/commit/626058075524f61bfaf38d7b478d3501144be14e) | chore(deps): bump builder-util-runtime and electron-builder in /electron (#6467) | 2 | 无文本冲突 | 未运行 |
| [53a8739ee](https://github.com/QuantumNous/new-api/commit/53a8739eedbf69decd621c1a8313cc0b8b367dee) | chore(deps-dev): bump fast-uri from 3.1.4 to 3.1.5 in /electron (#6846) | 1 | 1 个冲突文件 | 未运行 |
| [cf38105a9](https://github.com/QuantumNous/new-api/commit/cf38105a9946f041890ed404a8b81f63bee2568f) | chore(deps-dev): bump js-yaml from 4.3.0 to 4.3.1 in /electron (#6704) | 1 | 1 个冲突文件 | 未运行 |
| [bbf67df04](https://github.com/QuantumNous/new-api/commit/bbf67df0499c4881779c7fdd04761f5b09567fdb) | chore(deps-dev): bump electron from 39.8.5 to 39.8.10 in /electron (#6705) | 2 | 2 个冲突文件 | 未运行 |
| [8c25eee71](https://github.com/QuantumNous/new-api/commit/8c25eee71ba03ea19851dcc4f12ee4ecfcfb0808) | chore(build): upgrade Bun to 1.4.0 | 4 | 无文本冲突 | 未运行 |

**模拟方法与原始证据**

命令：`git merge-tree --write-tree --name-only --merge-base=<upstream-commit>^ <downstream-HEAD> <upstream-commit>`。连续组合时以前一结果树作为下一次 ours，未更新任何业务分支、索引或主工作区源码。

- [提交、文件和冲突详情](<./inventory.json>)
- [完整上游合入的 131 个冲突文件](<./full-merge-simulation.json>)
- [候选组合及依赖试验](<./batch-simulations.json>)
- [临时快照验证结果](<./validation.json>)
