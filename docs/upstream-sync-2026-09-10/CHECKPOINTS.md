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
