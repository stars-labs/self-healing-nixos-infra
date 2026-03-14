---
sidebar_position: 7
title: AI-Managed Infrastructure
---

# AI-Managed Infrastructure

With OpenClaw installed, this chapter defines the operational model: what the AI manages autonomously, what requires human approval, and how the entire change pipeline works.

## Operational Model

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

## Action Classification

OpenClaw classifies every proposed action into one of three tiers:

### Tier 1: Autonomous (No Approval)

Low-risk, reversible operations that OpenClaw can execute immediately:

| Action | Example | Why Autonomous |
|---|---|---|
| Log rotation | `journalctl --vacuum-size=500M` | No data loss, recoverable |
| Temp cleanup | Remove `/tmp` files older than 7 days | Non-critical data |
| Service restart | `systemctl restart nginx` (after failure) | Self-correcting, no config change |
| Metric collection | Disk/CPU/memory monitoring | Read-only |
| Certificate status | Check expiry dates | Read-only |

### Tier 2: Supervised (Notification + Auto-Apply)

Medium-risk operations that proceed unless a human intervenes within a window:

| Action | Example | Window |
|---|---|---|
| Package security update | Single CVE patch | 30 minutes |
| Swap configuration | Add swap when memory is critical | 15 minutes |
| Firewall rate-limit | Add temporary rate limit under attack | 5 minutes |

### Tier 3: Gated (TOTP Required)

High-risk operations that must be explicitly approved with a TOTP code:

| Action | Example | Why Gated |
|---|---|---|
| `nixos-rebuild switch` | System configuration change | Could break boot |
| `nixos-rebuild boot` | Next-boot configuration | Affects reboot |
| Firewall rule change | Open/close ports | Security impact |
| User management | Add/remove users | Access control |
| Network config | IP, DNS, routing changes | Could lose connectivity |
| Database migration | Schema changes | Data integrity |

## Policy Configuration

The policy engine is defined in a Nix module:

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

## Change Proposal Workflow

When OpenClaw detects an issue, it generates a change proposal:

### Step 1: Detection

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

### Step 2: Analysis and Proposal

OpenClaw's LLM analyzes the issue and generates a proposal:

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

### Step 3: Execution

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

## Example Scenarios

### Scenario 1: High Memory Usage

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

### Scenario 2: CVE Detected

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

### Scenario 3: Service Crash Loop

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

## Emergency Stop

If OpenClaw is behaving unexpectedly, trigger an emergency stop:

```bash
# Create the stop file — OpenClaw halts all autonomous actions immediately
sudo touch /var/lib/openclaw/STOP

# Check status
sudo systemctl status openclaw
# Should show: "EMERGENCY STOP: autonomous actions disabled"

# Resume operations
sudo rm /var/lib/openclaw/STOP
```

:::danger When to Use Emergency Stop
- OpenClaw is in an action loop (repeatedly restarting a service)
- Unexpected configuration changes are being proposed
- You need to investigate OpenClaw's behavior without interference
- During manual maintenance windows
:::

## Monitoring OpenClaw

### Audit Log

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

### Prometheus Metrics

OpenClaw exposes metrics at `localhost:9101/metrics`:

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

## What's Next

The AI operator is configured with a clear tiered policy. Next, we'll add [context management](./context-management) — giving OpenClaw memory, event correlation, and the ability to learn from past operations for consistent and coherent AI-driven operations.
