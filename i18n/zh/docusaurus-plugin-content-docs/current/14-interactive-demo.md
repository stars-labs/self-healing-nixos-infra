---
sidebar_position: 15
title: 交互式演示
---

import HealingWorkflow from '@site/src/components/HealingWorkflow';
import TerminalReplay from '@site/src/components/TerminalReplay';
import TierSimulator from '@site/src/components/TierSimulator';
import ContextTimeline from '@site/src/components/ContextTimeline';

# 交互式演示

通过交互式演示体验自愈 NixOS 基础设施的实际运作。这些演示将本教程中涵盖的核心概念可视化呈现。

## 自愈工作流

观察 OpenClaw 如何检测、分析和解决问题 —— 当出现故障时自动回滚。点击**播放**启动动画，并在**成功场景**和**失败回滚**场景之间切换。

<HealingWorkflow lang="zh" />

## 终端操作

模拟终端会话，展示快照管理、回滚操作和 OpenClaw AI 运维的真实命令。选择一个标签页并点击**播放**观看。

<TerminalReplay lang="zh" />

## OpenClaw 决策模拟器

探索 OpenClaw 如何将不同事件分类为不同的操作级别。点击一个场景，然后选择一个操作，查看 OpenClaw 会如何处理。

- **Tier 1（自治级）**：低风险操作，立即自动执行
- **Tier 2（监督级）**：中等风险，通知管理员并设有自动执行窗口
- **Tier 3（TOTP 审批级）**：高风险操作，需要明确的 TOTP 验证

<TierSimulator lang="zh" />

## 上下文管理

了解 OpenClaw 如何在多次操作之间维持上下文 —— 将事件关联为事件链、跟踪多步骤会话、学习模式用于主动预防。详细内容请参阅 [OpenClaw 上下文管理](./context-management)。

<ContextTimeline lang="zh" />

## 演示与教程章节对照

| 演示 | 相关章节 |
|---|---|
| 自愈工作流 | [架构概览](./architecture)、[AI 管理的基础设施](./ai-managed-infra)、[AI 安全与回滚](./ai-safety-and-rollback) |
| 终端：回滚 | [Btrfs 快照](./btrfs-snapshots)、[灾难恢复](./disaster-recovery) |
| 终端：OpenClaw | [安装 OpenClaw](./install-openclaw)、[AI 管理的基础设施](./ai-managed-infra) |
| 终端：快照 | [Btrfs 快照](./btrfs-snapshots)、[数据库快照策略](./database-snapshot-strategy) |
| 决策模拟器 | [AI 管理的基础设施](./ai-managed-infra)、[TOTP Sudo 防护](./totp-sudo-protection) |
| 上下文管理 | [OpenClaw 上下文管理](./context-management)、[AI 安全与回滚](./ai-safety-and-rollback) |

:::tip 试试各种场景
决策模拟器涵盖了 5 个真实运维场景。逐一体验，了解 OpenClaw 的分级系统如何在自动化速度与安全保障之间取得平衡。
:::
