---
sidebar_position: 7
title: AI 管理的基础设施
---

# AI 管理的基础设施

安装 OpenClaw 后，本章定义运维模型：AI 自主管理什么、什么需要人类批准，以及整个变更管道如何工作。

## 运维模型

```
┌──────────────────────────────────────────────────────────────┐
│                     变更管道                                   │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────┐ │
│  │  检测    │───>│ 分类     │───>│ 批准     │───>│ 应用  │ │
│  │  问题    │    │ 严重程度 │    │ (如需要) │    │       │ │
│  └──────────┘    └──────────┘    └──────────┘    └───┬───┘ │
│                                                      │      │
│                                        ┌─────────────┤      │
│                                        │             │      │
│                                   ┌────▼───┐   ┌────▼───┐  │
│                                   │ 验证通过 │   │ 回滚   │  │
│                                   │        │   │ 失败   │  │
│                                   └────────┘   └────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## 操作分类

OpenClaw 将每个提议的操作分类为三个层级之一：

### 第 1 层：自主（无需批准）

低风险、可逆操作，OpenClaw 可以立即执行：

| 操作 | 示例 | 为什么自主 |
|---|---|---|
| 日志轮转 | `journalctl --vacuum-size=500M` | 无数据丢失，可恢复 |
| 临时清理 | 删除超过 7 天的 `/tmp` 文件 | 非关键数据 |
| 服务重启 | `systemctl restart nginx`（故障后）| 自我修正，无配置更改 |
| 指标收集 | 磁盘/CPU/内存监控 | 只读 |
| 证书状态 | 检查过期日期 | 只读 |

### 第 2 层：监督（通知 + 自动应用）

中等风险操作，除非人类在窗口期内干预，否则继续进行：

| 操作 | 示例 | 窗口期 |
|---|---|---|
| 软件包安全更新 | 单个 CVE 补丁 | 30 分钟 |
| Swap 配置 | 内存紧张时添加 swap | 15 分钟 |
| 防火墙速率限制 | 攻击下添加临时速率限制 | 5 分钟 |

### 第 3 层：门禁（需要 TOTP）

高风险操作，必须使用 TOTP 验证码明确批准：

| 操作 | 示例 | 为什么门禁 |
|---|---|---|
| `nixos-rebuild switch` | 系统配置更改 | 可能破坏启动 |
| `nixos-rebuild boot` | 下次启动配置 | 影响重启 |
| 防火墙规则更改 | 打开/关闭端口 | 安全影响 |
| 用户管理 | 添加/删除用户 | 访问控制 |
| 网络配置 | IP、DNS、路由更改 | 可能失去连接 |
| 数据库迁移 | 模式更改 | 数据完整性 |

## 策略配置

策略引擎在 Nix 模块中定义：

```nix title="modules/openclaw-policy.nix"
{ config, pkgs, lib, ... }:
{
  services.openclaw.settings.policy = {
    # 第 1 层：自主操作
    autonomous = {
      allowedActions = [
        "restart-failed-service"
        "rotate-logs"
        "clean-temp-files"
        "collect-metrics"
        "check-certificates"
      ];

      constraints = {
        # 每小时最多 5 个自主操作（防止操作循环）
        maxActionsPerHour = 5;

        # 可以自主重启的服务
        restartableServices = [
          "nginx"
          "postgresql"
          "openssh"
        ];

        # 每个服务每小时最多 3 次重启
        maxRestartsPerServicePerHour = 3;
      };
    };

    # 第 2 层：监督操作（延迟后自动应用）
    supervised = {
      allowedActions = [
        "security-package-update"
        "add-swap"
        "temporary-rate-limit"
      ];

      # 通知渠道
      notifyCommand = "${pkgs.curl}/bin/curl -X POST https://hooks.slack.com/your-webhook -d '{\"text\": \"OpenClaw action pending\"}'";

      defaultWindow = "30m";  # 自动应用前的时间

      overrides = {
        "temporary-rate-limit" = { window = "5m"; };  # 主动威胁更快
        "add-swap" = { window = "15m"; };
      };
    };

    # 第 3 层：门禁操作（需要 TOTP）
    gated = {
      actions = [
        "nixos-rebuild-switch"
        "nixos-rebuild-boot"
        "firewall-rule-change"
        "user-management"
        "network-config-change"
        "database-migration"
      ];

      # 所有门禁操作都通过 TOTP sudo
      requireTOTP = true;
    };

    # 全局安全限制
    safety = {
      # 紧急停止 — 禁用所有自主操作
      emergencyStopFile = "/var/lib/openclaw/STOP";

      # 每天最大变更数
      maxChangesPerDay = 20;

      # 任何变更前需要快照
      requirePreSnapshot = true;

      # 每次变更后需要健康检查
      requirePostHealthCheck = true;
      healthCheckTimeout = "120s";

      # 健康检查失败时自动回滚
      autoRollbackOnFailure = true;
    };
  };
}
```

## 变更提案工作流

当 OpenClaw 检测到问题时，它会生成一个变更提案：

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

### 步骤 2：分析和提案

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
第 1 层操作 (rotate-logs):
  ✓ 自主 — 立即执行
  ✓ journalctl --vacuum-size=2G
  ✓ 释放了 8.7GB
  ✓ 记录到审计追踪

第 3 层操作 (nixos-rebuild-switch):
  → 需要 TOTP 批准
  → 通知已发送给运维人员
  → 等待批准...
  → 运维人员提供 TOTP 码
  → 拍摄预重建快照
  → 执行 nixos-rebuild switch
  → 健康检查通过
  → 变更已提交
```

## 示例场景

### 场景 1：内存使用率高

```
检测：  内存使用率 92%，swap 80%
分析：  PostgreSQL 消耗 6GB（预期：2GB）
        可能是由于未 vacuum 的表

第 1 层（自主）：
  → 重启 PostgreSQL 服务
  → 结果：内存降至 45%

第 3 层（门禁，如果重启无效）：
  → 提议：更改 NixOS 配置以限制 PostgreSQL 内存
  → 需要 TOTP 批准
```

### 场景 2：检测到 CVE

```
检测：  CVE-2024-XXXX in openssl（已安装版本易受攻击）
分析：  nixpkgs 中有安全更新可用

第 2 层（监督）：
  → 提议：nix flake update + nixos-rebuild
  → 通知已发送给运维人员
  → 30 分钟窗口期后自动应用
  → 运维人员可以取消或提前批准
  → 拍摄预重建快照
  → 成功应用
```

### 场景 3：服务崩溃循环

```
检测：  nginx 在 10 分钟内失败 3 次
分析：  /etc/nginx/nginx.conf 配置语法错误
       （由上次 nixos-rebuild 引入）

第 1 层（自主）：
  → 检查上次 snapper 前后配对
  → 识别上次重建中更改的配置

第 3 层（门禁）：
  → 提议：回滚到之前的快照
  → 需要 TOTP 批准
  → 应用 snapper undochange
  → nginx 启动成功
```

## 紧急停止

如果 OpenClaw 行为异常，触发紧急停止：

```bash
# 创建停止文件 — OpenClaw 立即停止所有自主操作
sudo touch /var/lib/openclaw/STOP

# 检查状态
sudo systemctl status openclaw
# 应显示："EMERGENCY STOP: autonomous actions disabled"

# 恢复操作
sudo rm /var/lib/openclaw/STOP
```

:::danger 何时使用紧急停止
- OpenClaw 处于操作循环中（反复重启服务）
- 正在提出意外的配置更改
- 您需要调查 OpenClaw 的行为而不受干扰
- 在手动维护窗口期间
:::

## 监控 OpenClaw

### 审计日志

```bash
# 查看最近的操作
sudo tail -20 /var/log/openclaw/audit.jsonl | jq .

# 按层级统计今天的操作
sudo cat /var/log/openclaw/audit.jsonl | \
  jq -r 'select(.date == "2024-01-15") | .tier' | \
  sort | uniq -c

# 查找失败的操作
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

AI 运维代理已配置了清晰的分层策略。接下来，我们将设置保护第 3 层操作的 [TOTP sudo 保护](./totp-sudo-protection) — 这是 AI 提案和系统变更之间的关键安全层。
