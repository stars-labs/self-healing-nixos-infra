---
sidebar_position: 11
title: AI 安全与回滚
---

# AI 安全与回滚

最终章定义了安全运行 AI 管理基础设施的操作程序。它涵盖防护栏、回滚工作流、故障预算，以及在受益于 AI 自动化的同时保持人类控制的原则。

## 安全模型

```
┌─────────────────────────────────────────────────────────┐
│                    安全层                                 │
│                                                         │
│  第 5 层：人类监督                                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  所有破坏性操作需要 TOTP 批准                       │  │
│  │  紧急停止文件以停止所有 AI 操作                    │  │
│  │  审计日志审查                                      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  第 4 层：策略引擎                                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  分层分类（自主/监督/门禁）                         │  │
│  │  速率限制（每小时/每天最大操作数）                  │  │
│  │  允许操作白名单                                    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  第 3 层：变更前快照                                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  每次变更前自动拍摄 Btrfs 快照                      │  │
│  │  用提案 ID 标记以便追踪                             │  │
│  │  健康检查失败时自动回滚                            │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  第 2 层：NixOS 保证                                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  原子系统激活 (switch-to-configuration)           │  │
│  │  之前的代数在 GRUB 中始终可用                      │  │
│  │  声明式 — 无隐藏状态变更                           │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  第 1 层：文件系统安全                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Btrfs COW — 原始数据在释放前保留                 │  │
│  │  校验和 — 检测静默损坏                             │  │
│  │  子卷隔离 — 爆炸半径受限                          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## AI 防护栏

### 1. 操作白名单

OpenClaw 只能执行策略中明确列出的操作。默认拒绝未列入白名单的任何操作：

```nix
# 只允许这些操作 — 其他一切都被阻止
services.openclaw.settings.policy.autonomous.allowedActions = [
  "restart-failed-service"
  "rotate-logs"
  "clean-temp-files"
  "collect-metrics"
  "check-certificates"
];
```

:::tip 默认拒绝
策略引擎以默认拒绝模型运行。如果操作不在白名单中，OpenClaw 无法执行它 — 即使 LLM 建议它。这是基本的安全属性。
:::

### 2. 速率限制

防止失控的自动化：

```nix
services.openclaw.settings.policy.safety = {
  maxActionsPerHour = 5;          # 所有层级的总操作数
  maxChangesPerDay = 20;          # 总状态变更操作数
  maxRestartsPerServicePerHour = 3; # 每个服务重启限制
  cooldownAfterFailure = "15m";   # 任何失败操作后暂停
};
```

### 3. 爆炸半径containment

每个操作都有定义的范围。OpenClaw 不能将多个操作组合成单一操作：

```
允许：
  - 重启 nginx（单个服务，定义的范围）
  - 更新一个软件包（针对性变更）
  - 添加防火墙规则（特定修改）

不允许：
  - 立即重启所有服务
  - 运行任意 shell 命令
  - 在一个操作中修改多个配置文件
  - 链接操作而不单独批准
```

### 4. 回滚预算

定义在 OpenClaw 自动暂停之前可接受多少次回滚：

```nix
services.openclaw.settings.policy.safety = {
  # 如果 OpenClaw 在 24 小时内触发 3 次回滚，暂停自主操作
  maxRollbacksPerDay = 3;
  suspendOnRollbackBudgetExceeded = true;

  # 需要人工审查才能恢复
  resumeRequiresTotp = true;
};
```

## 回滚工作流

每个 AI 发起的变更都遵循此顺序：

```
步骤 1：提议
  OpenClaw 生成变更提案
  ├── Nix 配置差异
  ├── 影响评估
  ├── 风险分类
  └── 回滚计划

步骤 2：批准（第 2 层或第 3 层）
  ├── 第 2 层：通知 + 倒计时
  └── 第 3 层：需要 TOTP 验证码

步骤 3：快照
  拍摄 Btrfs 快照：
  ├── snapper -c root create --type pre
  ├── snapper -c db create --type pre  （如果数据库受影响）
  └── 快照 ID 记录在提案中

步骤 4：应用
  safe-rebuild switch（或针对性操作）
  ├── NixOS 构建新配置
  ├── 激活新系统配置文件
  └── 记录退出代码

步骤 5：验证
  运行健康检查：
  ├── 所有 systemd 服务健康？
  ├── 网络连接正常？
  ├── 应用端点响应？
  ├── 数据库接受连接？
  └── 自定义健康检查通过？

步骤 6a：提交（如果健康）
  ├── 创建后快照 (snapper --type post)
  ├── 更新审计日志（状态：成功）
  └── 提案标记为完成

步骤 6b：回滚（如果不健康）
  ├── snapper -c root undochange $PRE_SNAP..0
  ├── snapper -c db undochange $DB_SNAP..0  （如果数据库受影响）
  ├── 重启服务
  ├── 重新运行健康检查以确认恢复
  ├── 更新审计日志（状态：已回滚）
  └── 发送警报给运维人员
```

### 回滚实现

```nix title="modules/auto-rollback.nix"
{ config, pkgs, ... }:
let
  autoRollback = pkgs.writeShellScriptBin "auto-rollback" ''
    set -euo pipefail

    PRE_SNAP_NUM="''${1:?Usage: auto-rollback <pre-snapshot-number>}"
    HEALTH_TIMEOUT="''${2:-120}"

    echo "=== Post-Change Health Check ==="
    echo "Pre-snapshot: #$PRE_SNAP_NUM"
    echo "Timeout: ''${HEALTH_TIMEOUT}s"
    echo ""

    HEALTHY=true

    # 检查 1：失败的 systemd 服务
    FAILED=$(systemctl --failed --no-legend | wc -l)
    if [ "$FAILED" -gt 0 ]; then
      echo "FAIL: $FAILED failed systemd units"
      systemctl --failed --no-legend
      HEALTHY=false
    else
      echo "PASS: No failed systemd units"
    fi

    # 检查 2：SSH 仍然可访问
    if systemctl is-active --quiet sshd; then
      echo "PASS: SSH daemon running"
    else
      echo "FAIL: SSH daemon not running"
      HEALTHY=false
    fi

    # 检查 3：网络连接
    if ping -c 1 -W 5 1.1.1.1 > /dev/null 2>&1; then
      echo "PASS: Network connectivity OK"
    else
      echo "FAIL: No network connectivity"
      HEALTHY=false
    fi

    # 检查 4：磁盘空间
    DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
    if [ "$DISK_USAGE" -lt 95 ]; then
      echo "PASS: Disk usage at ''${DISK_USAGE}%"
    else
      echo "FAIL: Disk usage critical at ''${DISK_USAGE}%"
      HEALTHY=false
    fi

    # 检查 5：PostgreSQL（如果启用）
    if systemctl is-enabled --quiet postgresql 2>/dev/null; then
      if sudo -u postgres psql -c "SELECT 1;" > /dev/null 2>&1; then
        echo "PASS: PostgreSQL responding"
      else
        echo "FAIL: PostgreSQL not responding"
        HEALTHY=false
      fi
    fi

    echo ""

    if [ "$HEALTHY" = true ]; then
      echo "All health checks passed. Change committed."
      exit 0
    else
      echo "╔══════════════════════════════════════════╗"
      echo "║  HEALTH CHECK FAILED — ROLLING BACK     ║"
      echo "╚══════════════════════════════════════════╝"
      echo ""
      echo "Rolling back to snapshot #$PRE_SNAP_NUM..."

      sudo snapper -c root undochange "''${PRE_SNAP_NUM}..0"

      echo "Rollback complete. Restarting services..."
      sudo systemctl daemon-reload

      echo "Verifying rollback..."
      sleep 5
      NEW_FAILED=$(systemctl --failed --no-legend | wc -l)
      if [ "$NEW_FAILED" -gt 0 ]; then
        echo "WARNING: Still have $NEW_FAILED failed units after rollback"
        echo "Manual intervention required"
        exit 2
      fi

      echo "Rollback verified. System is healthy."
      exit 1
    fi
  '';
in
{
  environment.systemPackages = [ autoRollback ];
}
```

## 操作程序

### 日常操作

```
早晨审查（5 分钟）：
  1. 检查 OpenClaw 审计日志中的隔夜操作
     $ sudo tail -50 /var/log/openclaw/audit.jsonl | jq -r '.timestamp + " " + .action + " " + .status'

  2. 审查任何待处理的第 2 层提案
     $ sudo openclaw pending-proposals

  3. 验证快照健康
     $ sudo snapper -c root list | tail -10
     $ sudo snapper -c db list | tail -10

  4. 检查磁盘使用
     $ sudo btrfs filesystem usage /
```

### 每周操作

```
每周审查（30 分钟）：
  1. 审查完整审计日志中的模式
     - 某些操作是否反复失败？
     - OpenClaw 是否进行太多/太少变更？
     - LLM 是否有任何可疑提案？

  2. 测试快照恢复（非破坏性）
     $ sudo btrfs subvolume snapshot /.snapshots/root/latest /tmp/restore-test
     $ ls /tmp/restore-test/etc/nixos/
     $ sudo btrfs subvolume delete /tmp/restore-test

  3. 验证远程备份是最新的
     $ ssh backup-server "ls -la /backups/$(hostname)/ | tail -5"

  4. 更新 NixOS flake（先在测试环境中）
     $ nix flake update
     $ nixos-rebuild dry-build
```

### 每月操作

```
每月审查（2 小时）：
  1. 完整灾难恢复演练
     - 从备份恢复到测试服务器
     - 验证所有服务启动
     - 测试 TOTP 身份验证
     - 记录任何问题

  2. 审查和更新 OpenClaw 策略
     - 分层分类是否仍然正确？
     - 是否有应该列入白名单的新操作？
     - 速率限制合适吗？

  3. 轮换 secrets
     - OpenClaw API 密钥
     - 备份 SSH 密钥
     - 审查 TOTP 注册

  4. 审查和归档旧快照
     $ sudo snapper -c root cleanup number
     $ sudo snapper -c db cleanup number
```

## 反模式

会让你陷入麻烦的事情：

### 1. 给 OpenClaw Root 访问权限

```
不要做：
  users.users.openclaw.extraGroups = [ "wheel" ];
  # 或
  security.sudo.extraRules = [{
    users = [ "openclaw" ];
    commands = [{ command = "ALL"; options = [ "NOPASSWD" ]; }];
  }];
```

这绕过了每一层安全机制。OpenClaw 必须通过 TOTP 门禁的 sudo 进行破坏性操作。

### 2. 禁用快照以节省空间

```
不要做：
  services.snapper.configs.root.TIMELINE_CREATE = false;
```

没有快照，回滚是不可能的。如果磁盘空间有问题，减少保留 — 不要禁用快照。

### 3. 不验证就信任 AI 输出

```
不要做：
  不审查 Nix 差异就接受 OpenClaw 的每个提案。

要做：
  在提供 TOTP 验证码之前审查每个第 3 层提案。
  TOTP 门禁是您审查的机会，而不仅仅是减速带。
```

### 4. 跳过健康检查

```
不要做：
  变更后不进行健康验证。
  自动回滚系统只有在健康检查全面时才有效。

要做：
  除默认值外添加特定于应用的健康检查。
  如果您的应用有 /health 端点，请包含它。
```

## 运维指标

跟踪这些指标以评估您的 AI 管理基础设施的健康状况：

| 指标 | 目标 | 警报阈值 |
|---|---|---|
| 成功变更 / 总变更 | > 95% | < 90% |
| 每周回滚次数 | < 2 | > 3 |
| 平均问题检测时间 | < 5 分钟 | > 15 分钟 |
| 平均恢复时间 | < 10 分钟 | > 30 分钟 |
| 快照空间使用 | < 磁盘 30% | > 50% |
| OpenClaw 操作率 | 5-15/天 | > 30/天 或 0/天 |
| TOTP 批准响应时间 | < 15 分钟 | > 1 小时 |

## 完整系统总结

```
┌──────────────────────────────────────────────────────────────────┐
│                 自愈式 NixOS 基础设施                               │
│                                                                  │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────────┐  │
│  │  OpenClaw    │────>│  策略        │────>│  TOTP 门禁       │  │
│  │  AI 运维代理  │     │  引擎        │     │  (人工审查)      │  │
│  │              │     │              │     │                  │  │
│  │  • 监控      │     │  • 第 1-3 层 │     │  • 6 位数字代码  │  │
│  │  • 检测      │     │  • 速率限制  │     │  • pam_oath     │  │
│  │  • 提议      │     │  • 白名单    │     │  • 审计日志记录  │  │
│  └─────────────┘     └──────────────┘     └────────┬─────────┘  │
│                                                     │            │
│                                              ┌──────▼─────────┐  │
│                                              │  safe-rebuild   │  │
│                                              │                 │  │
│                                              │  1. 快照        │  │
│                                              │  2. 重建        │  │
│                                              │  3. 健康检查    │  │
│                                              │  4. 提交或     │  │
│                                              │     回滚        │  │
│                                              └──────┬─────────┘  │
│                                                     │            │
│  ┌──────────────────────────────────────────────────▼─────────┐  │
│  │                    Btrfs 文件系统                              │  │
│  │                                                            │  │
│  │  @root (/)     @home (/home)     @db (/var/lib/db)        │  │
│  │  @nix (/nix)   @log (/var/log)   @snapshots (/.snapshots) │  │
│  │                                                            │  │
│  │  Snapper: 每小时 timeline + 重建前后配对                      │  │
│  │  备份：每日 btrfs send/receive 到远程                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  恢复选项：                                                    │
│  • snapper undochange（即时，在线）                               │
│  • NixOS 代数回滚（启动菜单）                                     │
│  • Btrfs 快照恢复（完整子卷交换）                                  │
│  • 远程备份恢复（灾难恢复）                                       │
│  • 从 flake 全新安装（攻陷恢复）                                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 最终想法

此架构为 AI 辅助基础设施管理提供了实用的框架。关键洞察是 **AI 不需要完美才能有用** — 它只需要在一个错误低成本可撤销的系统中运作。

结合：
- **NixOS**（声明式、可复现的系统状态）
- **Btrfs 快照**（即时、空间高效的回滚）
- **TOTP 门禁**（临界操作中的人工介入）
- **策略引擎**（有界 AI 自主性）

创造了一个 AI 可以实验和学习而人类保持最终控制的环境。当 AI 犯错时，恢复只需一条命令。当它做出好的决策时，系统无需人工干预即可改进。

保持保守 — 将 OpenClaw 限制为仅第 1 层操作。随着建立信心，逐渐扩大其自主性。安全层就在那里，所以您可以快速行动而无需恐惧。
