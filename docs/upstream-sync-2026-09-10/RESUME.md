# 中断恢复入口

本目录的 state.json 是任务进度入口；Git 是代码状态入口。先核对再继续。此文件适用于同一会话继续、换新会话、进程退出和机器重启。

当前本地交付摘要见 [HANDOFF.md](HANDOFF.md)。B17 已创建真实双亲合并；最终本地验证代码是 `33398851f677845f450b9cf6f7af546d5a218e0c`。不要重新挑拣 153 个提交，也不要重复已经完成的全量测试。A33 允许先接入本地 main，但生产副本演练及真实供应商联调仍未通过；`code_complete` 不等于完整计划完成或可以发布。

## 可直接发给下一次会话的指令

> 请继续执行 D:/10178/Projects/new-api/docs/upstream-sync-2026-09-10/PLAN.md。先读同目录 RESUME.md、state.json、CHECKPOINTS.md 和 DECISIONS.md，并运行 verify-plan.mjs。若已经建立 D:/10178/Projects/new-api-upstream-sync，以它里面的计划和台账为准。核对 Git 当前操作、未提交改动、最后验证提交和当前单元，再继续第一项未完成工作。目标是完整整合固定上游 bdef117505247769268b209665fb3ad7554c3da7，保留下游 403f7d9dffc6a99728ede5d8f72770efc61f7b83 的全部功能。不要重复已完成补丁，不删除冲突半成品，不把跳过验证当作完成；每个单元及时写检查点。

## 1. 先运行只读检查

在当前可用仓库中：

    node docs/upstream-sync-2026-09-10/verify-plan.mjs
    git status --short --branch
    git log -8 --oneline
    git worktree list --porcelain
    git diff --name-only --diff-filter=U
    git diff --stat
    git diff --cached --stat

结构检查（不会启动合并、测试或网络访问）：

    node docs/upstream-sync-2026-09-10/verify-plan.mjs --validate

最终完成检查：

    node docs/upstream-sync-2026-09-10/verify-plan.mjs --final

退出码：0 表示所请求检查通过；1 表示计划数据无效或最终门槛未满足；2 表示存在必须核对的 Git/检查点差异。0 不是测试通过证明，普通状态检查也不等于可以发布。工具只读，不会帮你“自动修复”状态。

## 2. 根据实际状态恢复

| 实际情况 | 应做的事 |
| --- | --- |
| 尚未创建工作树，state 为 planned | 从 B00 开始；当前没有需要恢复的补丁 |
| 已创建工作树但原目录台账仍为 planned | 切换到工作树中的台账；如果尚未复制计划，先保存并完成 B00 |
| Git 正在 cherry-pick 且有冲突 | 核对 CHERRY_PICK_HEAD 与活动单元 SHA，逐个恢复冲突处理；解决并 stage 后才执行 cherry-pick --continue |
| cherry-pick 停在空提交 | 检查补丁是否已等价落地；记录理由后决定 --skip，不能机械跳过 |
| Git 正在 merge | 核对 MERGE_HEAD 必须是记录的目标，恢复文件级冲突台账；清理冲突并完成 merge 提交后再验收 |
| Git 正在 revert/rebase，计划没有记录 | 先确认是否来自用户或其他工作；不擅自 continue/abort，不开始新的补丁 |
| 代码有未提交改动且没有 Git 操作 | 对比 current_unit、文件列表与日志，继续该单元；不要重跑同一补丁 |
| 代码已提交但台账没更新 | 从 git log、提交内的上游 SHA 和实际 diff 找回结果；补齐检查点，不重复挑拣 |
| 台账写通过但日志缺失/进程中断 | 将该验证恢复为未完成，在同一代码上重新执行缺失检查 |
| HEAD 变化仅涉及本计划文件 | 保留已验证代码 SHA，同时记录新的台账 HEAD |
| HEAD 业务代码与最后验证提交不同 | 找出新增变更，补验受影响项；最终验收必须重新覆盖最终代码 |
| state.json 损坏或残留临时文件 | 备份损坏文件，读取最后一个已提交检查点，结合 Git 状态重建；不直接提升临时文件为真相 |
| 总状态为 code_complete，main 已包含 final_downstream_commit | 读取 HANDOFF.md 和 blockers，只补齐尚缺的环境验收；不要重做本地合并，不要改成 completed 来消除 --final 的预期失败 |
| 上游 main 已向前 | 本轮仍使用固定 SHA；新增内容登记后续增量 |
| 下游 main 已向前 | 保留新提交，更新保护清单并整合到集成分支；不重置 main |
| 数据迁移进行一半 | 按迁移日志和数据库实际 schema 恢复；不靠 Git abort 或重跑所有 DDL |
| 运行环境或凭据缺失 | blocked 项写清缺少什么；继续不依赖它的工作；不得最终标记完成 |

每次恢复先读当前阶段的 depends_on、units、对应上游行和保护行。阶段编号不是无条件可执行顺序。

## 3. B00 准备指引

以下为执行阶段的命令模板，计划编写时未执行。先检查引用/路径不存在或指向同一基线；如已存在直接核对复用，不覆盖。

    git show --no-patch 403f7d9dffc6a99728ede5d8f72770efc61f7b83
    git show --no-patch bdef117505247769268b209665fb3ad7554c3da7
    git branch codex/upstream-sync-base-2026-09-10 403f7d9dffc6a99728ede5d8f72770efc61f7b83
    git worktree add -b codex/upstream-sync-2026-09-10 D:/10178/Projects/new-api-upstream-sync 403f7d9dffc6a99728ede5d8f72770efc61f7b83

先在已确认的备份目录保存 Git bundle，并单独复制本计划和原 output 证据；bundle 不保存未跟踪文件。核对 bundle 可读且包含固定上下游提交。备份路径不得引用临时目录，不能把凭据和真实请求体带入版本管理。

新工作树起点尚无未提交计划文件：使用 PowerShell 原生命令将完整计划目录复制过去，确认目标位于新工作树内。只在集成分支提交这些计划文件；避免 git add . 将其他文件一并加入。把 state.integration.created、current_unit 和下一步写入新工作树台账，再开始业务变更。

## 4. 每个执行单元的记录格式

在操作前追加：

- 时间（含时区）与阶段/单元 ID。
- 操作前 HEAD、工作树路径、活动操作类型、上游完整 SHA。
- 当前单元预期改动的文件、保护能力 ID 和验证命令。
- 下一条明确行动。

在操作后追加：

- 操作结果、冲突文件和解决理由。
- 代码提交 SHA；验证日志路径、命令、环境、退出码、通过/失败/跳过摘要。
- 台账变更、仍未完成的项目和下次可直接执行的动作。

先写入 applying 再调用 Git；先记录 verifying 再启动长测试。日志保存到唯一运行目录，例如 evidence/runs/B07-001/。每次验证都记录被测代码 SHA；没有完整输出和退出码，不写 verified。

若中断发生在两个写入之间，Git 与已保存日志可用于补录。不为使 JSON 数字“好看”而提前增加完成计数。

## 5. 状态约定

上游行 status 可为 pending、applying、conflicts、implemented、verifying、verified、blocked。只有 verified 才是闭环，且必须有 resolution、resolution_commits、evidence 及最终复核。

resolution 可为 applied、adapted、equivalent、superseded、preserved。最后三种必须说明对应实现/替代提交/保留理由，不能用它们隐藏未实现的新增功能。

下游提交与保护能力 status 为 pending、verifying、verified 或 blocked；同样需要验证证据。阶段 status 为 pending、in_progress、verified 或 blocked。

计划的 aggregate 状态为 planned、in_progress、blocked、code_complete 或 completed。blocked 是进度事实，不自动授权更改需求；有可独立推进的任务时继续推进。

最终复核字段 final_review.commit 统一指向 state.last_verified_code_commit。状态脚本只检查记录是否齐全和代码一致性，不能替代读测试日志与真实功能验收。

## 6. 真实合并与交付命令的边界

B17 前先确认阶段依赖、已提交工作、完整台账与基线引用，然后在集成工作树执行：

    git merge --no-ff --no-commit bdef117505247769268b209665fb3ad7554c3da7

这条命令可能停在冲突。此时只解决、审查、保存当前 merge，不能再发起另一轮 merge/cherry-pick。不要用 -s ours 跳过内容。

完成合并并验收后检查：

    git merge-base --is-ancestor bdef117505247769268b209665fb3ad7554c3da7 HEAD
    git merge-base --is-ancestor 403f7d9dffc6a99728ede5d8f72770efc61f7b83 HEAD

B19 向当前下游 main 合入集成分支时保留历史。检查 main 是否前进、是否有未提交用户文件及评估 output；先核对再执行实际合并。不要为简化操作清空用户工作区。

A33 的本地先行交付只开放 B19.1/B19.2；B18.2/B18.3 及 B19.3 的完整完成仍受全部外部门槛约束。原 main 未跟踪的计划副本须在独立备份目录校验并移存，output 保留原位。main 接入采用 fast-forward，保留 B17 的双亲历史；不使用 squash、reset 或 clean。

任何代码、数据库、外部发布或用户新要求引起的范围变化都追加 DECISIONS.md，并更新当前单元。不要修改本轮固定上游 SHA 来隐式换目标。
