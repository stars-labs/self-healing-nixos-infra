---
sidebar_position: 7
title: AI 管理的基础设施
---

# AI 管理的基础设施

OpenClaw 安装完成后，本章将定义其运维模型：哪些操作由 AI 自主管理、哪些需要人工审批，以及整个变更流水线如何运作。

## 运维模型

```mermaid
flowchart TB
    A[Detect Issue] --> B[Classify Severity]
    B --> C{Approval Required?}
    C -->|No| D[Apply]
    C -->|Yes| E[Approve (if req)]
    E --> D
    D --> F{Verify}
    F -->|Pass| G[Commit]
    F -->|Fail| H[Rollback]
```

## 操作分类

OpenClaw 将每个提议的操作分为三个等级：

### 第一级：自主执行（无需审批）

低风险、可逆的操作，OpenClaw 可以立即执行：

| 操作 | 示例 | 自主执行的原因 |
|---|---|---|
| 日志轮转 | `journalctl --vacuum-size=500M` | 无数据丢失，可恢复 |
| 临时文件清理 | 删除 `/tmp` 中超过 7 天的文件 | 非关键数据 |
| 服务重启 | `systemctl restart nginx`（故障后） | 自我修复，不涉及配置变更 |
| 指标采集 | 磁盘/CPU/内存监控 | 只读操作 |
| 证书状态检查 | 检查过期日期 | 只读操作 |

### 第二级：监督执行（通知 + 自动应用）

中等风险的操作，在等待窗口期内如果人工未干预则自动执行：

| 操作 | 示例 | 等待窗口 |
|---|---|---|
| 安全补丁更新 | 单个 CVE 补丁 | 30 分钟 |
| Swap 配置 | 内存紧张时添加 swap | 15 分钟 |
| 防火墙限速 | 遭受攻击时添加临时速率限制 | 5 分钟 |

### 第三级：门控执行（需要 TOTP）

高风险操作，必须使用 TOTP 验证码进行显式审批：

| 操作 | 示例 | 门控原因 |
|---|---|---|
| `nixos-rebuild switch` | 系统配置变更 | 可能导致无法启动 |
| `nixos-rebuild boot` | 下次启动的配置 | 影响重启 |
| 防火墙规则变更 | 开启/关闭端口 | 安全影响 |
| 用户管理 | 添加/删除用户 | 访问控制 |
| 网络配置 | IP、DNS、路由变更 | 可能导致断网 |
| 数据库迁移 | Schema 变更 | 数据完整性 |

## 策略配置

策略引擎通过 Nix 模块定义：

```nix title="modules/openclaw-policy.nix"
{ config, pkgs, lib, ... }:
{
  services.openclaw.settings.policy = {
    # Tier 1: Autonomous actions
    autonomous = {
      allowedActions = [
        "restart-failed-service"
        "rotate-logs"
        "clean-temp-files"
        "collect-metrics"
        "check-certificates"
      ];

      constraints = {
        # Max 5 autonomous actions per hour (prevent action loops)
        maxActionsPerHour = 5;

        # Services that can be restarted autonomously
        restartableServices = [
          "nginx"
          "postgresql"
          "openssh"
        ];

        # Max 3 restarts per service per hour
        maxRestartsPerServicePerHour = 3;
      };
    };

    # Tier 2: Supervised actions (auto-apply with delay)
    supervised = {
      allowedActions = [
        "security-package-update"
        "add-swap"
        "temporary-rate-limit"
      ];

      # Notification channel
      notifyCommand = "${pkgs.curl}/bin/curl -X POST https://hooks.slack.com/your-webhook -d '{\"text\": \"OpenClaw action pending\"}'";

      defaultWindow = "30m";  # Time before auto-apply

      overrides = {
        "temporary-rate-limit" = { window = "5m"; };  # Faster for active threats
        "add-swap" = { window = "15m"; };
      };
    };

    # Tier 3: Gated actions (require TOTP)
    gated = {
      actions = [
        "nixos-rebuild-switch"
        "nixos-rebuild-boot"
        "firewall-rule-change"
        "user-management"
        "network-config-change"
        "database-migration"
      ];

      # All gated actions go through TOTP sudo
      requireTOTP = true;
    };

    # Global safety limits
    safety = {
      # Emergency stop — disable all autonomous actions
      emergencyStopFile = "/var/lib/openclaw/STOP";

      # Max total changes per day
      maxChangesPerDay = 20;

      # Require snapshot before any change
      requirePreSnapshot = true;

      # Health check after every change
      requirePostHealthCheck = true;
      healthCheckTimeout = "120s";

      # Automatic rollback on health check failure
      autoRollbackOnFailure = true;
    };
  };
}
```

## 变更提案工作流

当 OpenClaw 检测到问题时，会生成一个变更提案：

### 步骤 1：检测

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "detector": "disk-usage-monitor",
  "severity": "warning",
  "message": "Disk usage at 87% on /var/log",
  "details": {
    "filesystem": "/var/log",
    "used_percent": 87,
    "available_gb": 2.1
  }
}
```

### 步骤 2：分析与提案

OpenClaw 的 LLM 分析问题并生成提案：

```json
{
  "proposal_id": "prop-20240115-001",
  "issue": "Disk usage at 87% on /var/log",
  "analysis": "Journal logs consuming 11GB. No log rotation configured beyond systemd defaults.",
  "proposed_actions": [
    {
      "tier": 1,
      "action": "rotate-logs",
      "command": "journalctl --vacuum-size=2G",
      "impact": "Removes old journal entries, freeing ~9GB",
      "reversible": false,
      "risk": "low"
    },
    {
      "tier": 3,
      "action": "nixos-rebuild-switch",
      "description": "Add persistent journal size limit to NixOS config",
      "nix_diff": "services.journald.extraConfig = \"SystemMaxUse=2G\";",
      "impact": "Permanent fix — limits journal size to 2GB",
      "reversible": true,
      "risk": "low"
    }
  ]
}
```

### 步骤 3：执行

```
Tier 1 action (rotate-logs):
  ✓ Autonomous — execute immediately
  ✓ journalctl --vacuum-size=2G
  ✓ Freed 8.7GB
  ✓ Logged to audit trail

Tier 3 action (nixos-rebuild-switch):
  → Requires TOTP approval
  → Notification sent to operator
  → Waiting for approval...
  → Operator provides TOTP code
  → Pre-rebuild snapshot taken
  → nixos-rebuild switch executed
  → Health check passed
  → Change committed
```

## 场景示例

### 场景 1：内存使用率过高

```
Detection:  Memory usage at 92%, swap at 80%
Analysis:   PostgreSQL consuming 6GB (expected: 2GB)
            Likely caused by unvacuumed tables

Tier 1 (autonomous):
  → Restart PostgreSQL service
  → Result: Memory drops to 45%

Tier 3 (gated, if restart doesn't help):
  → Propose NixOS config change to limit PostgreSQL memory
  → Requires TOTP approval
```

### 场景 2：检测到 CVE

```
Detection:  CVE-2024-XXXX in openssl (installed version vulnerable)
Analysis:   Security update available in nixpkgs

Tier 2 (supervised):
  → Propose: nix flake update + nixos-rebuild
  → Notification sent to operator
  → 30-minute window before auto-apply
  → Operator can cancel or approve early
  → Pre-rebuild snapshot taken
  → Applied successfully
```

### 场景 3：服务崩溃循环

```
Detection:  nginx failed 3 times in 10 minutes
Analysis:   Config syntax error in /etc/nginx/nginx.conf
            (introduced by last nixos-rebuild)

Tier 1 (autonomous):
  → Check last snapper pre/post pair
  → Identify config changed in last rebuild

Tier 3 (gated):
  → Propose: rollback to previous snapshot
  → Requires TOTP approval
  → snapper undochange applied
  → nginx starts successfully
```

## 紧急停止

如果 OpenClaw 出现异常行为，可以触发紧急停止：

```bash
# Create the stop file — OpenClaw halts all autonomous actions immediately
sudo touch /var/lib/openclaw/STOP

# Check status
sudo systemctl status openclaw
# Should show: "EMERGENCY STOP: autonomous actions disabled"

# Resume operations
sudo rm /var/lib/openclaw/STOP
```

:::danger 何时使用紧急停止
- OpenClaw 陷入操作循环（反复重启某个服务）
- 出现意料之外的配置变更提案
- 需要在不受干扰的情况下排查 OpenClaw 的行为
- 在手动维护窗口期间
:::

## 监控 OpenClaw

### 审计日志

```bash
# View recent actions
sudo tail -20 /var/log/openclaw/audit.jsonl | jq .

# Count actions by tier today
sudo cat /var/log/openclaw/audit.jsonl | \
  jq -r 'select(.date == "2024-01-15") | .tier' | \
  sort | uniq -c

# Find failed actions
sudo cat /var/log/openclaw/audit.jsonl | \
  jq 'select(.status == "failed")'
```

### Prometheus 指标

OpenClaw 在 `localhost:9101/metrics` 暴露指标：

```
# HELP openclaw_actions_total Total actions executed
# TYPE openclaw_actions_total counter
openclaw_actions_total{tier="autonomous",status="success"} 142
openclaw_actions_total{tier="autonomous",status="failed"} 3
openclaw_actions_total{tier="gated",status="success"} 8
openclaw_actions_total{tier="gated",status="rejected"} 1

# HELP openclaw_proposals_pending Pending proposals awaiting approval
# TYPE openclaw_proposals_pending gauge
openclaw_proposals_pending 0

# HELP openclaw_rollbacks_total Total rollbacks performed
# TYPE openclaw_rollbacks_total counter
openclaw_rollbacks_total 2
```

## 下一步

AI 操作代理已配置好清晰的分级策略。接下来，我们将添加[上下文管理](./context-management) —— 赋予 OpenClaw 记忆能力、事件关联和从历史操作中学习的能力，实现一致且连贯的 AI 驱动运维。
