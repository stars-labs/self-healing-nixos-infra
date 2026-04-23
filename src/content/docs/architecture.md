---
sidebar:
  order: 2
title: Architecture Overview
---

# Architecture Overview

This page describes the full system architecture, component interactions, data flows, and failure handling strategies.

:::info AI-First Design
This architecture is specifically designed for **AI-operated infrastructure**. Every design decision considers: AI can make mistakes, AI can hallucinate, AI can misunderstand system state. The architecture must be safe even when the AI is wrong.
:::

## Why AI Safety Matters

Large Language Models (LLMs) like those powering OpenClaw can:

- **Hallucinate problems** — detect issues that don't exist
- **Propose wrong fixes** — suggest commands that would break the system
- **Misread state** — believe the system is in a different state than reality
- **Chain errors** — make a second mistake trying to fix the first

This architecture assumes AI **will** make mistakes. The safety layers exist specifically because AI is involved, not despite it.

## System Layers

The architecture is built in layers, each providing guarantees to the layer above:

```mermaid
flowchart TB
    subgraph Hardware["Hardware / VPS / VPC"]
        H[provisioned via nixos-anywhere]
    end
    
    subgraph Btrfs["Btrfs Filesystem subvolumes"]
        B["root, home, nix, log, db, snapshots"]
    end
    
    subgraph Snap["Snapshot Layer (Snapper)"]
        S1[Pre Snapshots] --> S2[Timeline Cleanup]
        S2 --> S3[Remote Backup]
    end
    
    subgraph Nix["NixOS Configuration"]
        N1[Flake<br/>pinned] --> N2[Modules]
        N2 --> N3[nixos-rebuild]
    end
    
    subgraph TOTP["TOTP Gate (pam_oath)"]
        T[Guards: nixos-rebuild, systemctl, user management, firewall changes]
    end
    
    subgraph OpenClaw["OpenClaw (AI infrastructure operator)"]
        O1[Monitor & Detect] --> O2[Propose Changes]
        O2 --> O3[Execute<br/>via sudo]
    end
    
    subgraph Human["Human Operator"]
        HO[TOTP authentication]
    end
    
    H --> B
    B --> Snap
    Snap --> Nix
    Nix --> TOTP
    TOTP --> OpenClaw
    OpenClaw --> Human
```

## Design Principles

### 1. Rollback-First

Every state-changing operation is preceded by a Btrfs snapshot. **This is the atomicity guarantee** — if anything goes wrong, you can always return to the exact previous state.

```mermaid
sequenceDiagram
    participant AI as OpenClaw (AI)
    participant Snap as Snapshot Layer
    participant Nix as NixOS
    participant Health as Health Check
    
    AI->>Snap: Propose change
    Note over Snap: Before ANY change:<br/>btrfs snapshot root → root-pre
    Snap-->>Nix: Snapshot confirmed
    Nix->>Health: Apply config
    alt Health check passes
        Health-->>AI: Success - keep snapshot
    else Health check fails
        Nix->>Snap: Rollback request
        Snap->>Snap: btrfs subvolume snapshot<br/>snapshots/root-pre to /
        Snap-->>AI: Rolled back - human notified
    end
```

**Atomic Rollback Guarantees:**

| Guarantee | How It's Enforced |
|---|---|
| **Pre-change snapshot** | Snapper automatically snapshots before every `nixos-rebuild` |
| **Immutable snapshot** | Btrfs snapshots are read-only by default |
| **Single-command rollback** | `sudo btrfs subvolume snapshot /snapshots/@root/pre-rebuild /` |
| **Verified state** | Health checks confirm system is operational before "committing" |
| **Multiple rollback layers** | Btrfs snapshot → NixOS generation → Remote backup |

:::danger The AI Cannot Bypass Rollback
Even if OpenClaw tries to execute a change, the snapshot is taken **before** any change is applied. The AI cannot skip this safety layer — it's enforced at the system level by Snapper hooks.
:::

### 2. Reproducibility

The entire system is defined in Nix flakes. Two identical flake inputs produce identical systems:

```mermaid
flowchart LR
    A[flake.lock<br/>pinned] --> B[nixos-rebuild] --> C[identical<br/>system state]
```

### 3. Defense-in-Depth

Multiple safety layers protect against bad changes:

| Layer | Protection |
|---|---|
| TOTP gate | Prevents unauthorized `nixos-rebuild` |
| Pre-rebuild snapshots | Instant rollback after bad apply |
| NixOS generations | Boot into previous generation from GRUB |
| Btrfs send/receive | Off-site backup of known-good state |
| OpenClaw policy engine | AI can only act within defined boundaries |

### 4. Least Privilege

OpenClaw runs as a dedicated system user. It cannot directly execute privileged commands — it must go through the TOTP-gated sudo path for anything destructive.

### 5. AI Hallucination Mitigation

This architecture assumes AI **will** make errors. Multiple layers protect against AI hallucinations:

| AI Risk | Mitigation in This Architecture |
|---|---|
| **Hallucinates a problem** | Policy engine only acts on verified metrics, not AI interpretation |
| **Proposes wrong fix** | TOTP gate requires human approval for all system changes |
| **Misreads system state** | Health checks verify actual state after any change |
| **Applies change at wrong time** | Cooldown periods between actions prevent rapid-fire errors |
| **Cascading failures** | Pre-change snapshot enables instant rollback to known good state |

```mermaid
flowchart LR
    subgraph AI_Risks["AI Can Fail"]
        A[Hallucinate<br/>problem] --> B[Propose<br/>wrong fix]
        B --> C[Apply at<br/>wrong time]
        C --> D[Chain<br/>errors]
    end
    
    subgraph Safety_Layers["Safety Layers"]
        E[Policy Engine<br/>verified metrics] --> F[TOTP Gate<br/>human approval]
        F --> G[Pre-snapshot<br/>always first]
        G --> H[Health Check<br/>verify state]
        H --> I[Rollback<br/>single command]
    end
    
    AI_Risks -.->|blocked by| Safety_Layers
```

**Key insight**: The AI proposes, but the **architecture decides**. Human approval and automated snapshots are not optional — they are enforced by the system, not by the AI.

## Component Interactions

```mermaid
flowchart TB
    A[OpenClaw<br/>detect] -->|propose change| B[TOTP Sudo Gate<br/>pam_oath validates 6-digit code]
    C[Human<br/>approve] -->|TOTP code| B
    B -->|authorized| D[Pre-Change Snapshot<br/>btrfs snapshot root to root-pre]
    D -->|apply| E[nixos-rebuild switch<br/>applies new NixOS configuration]
    E --> F{success?}
    F -->|yes| G[Done<br/>keep snapshot]
    F -->|no| H[Rollback<br/>restore snapshot]
```

## OpenClaw: The AI Infrastructure Operator

### What is OpenClaw?

OpenClaw is an AI-powered agent that acts as your **digital on-call SRE**. It doesn't replace human operators — it augments them by handling routine monitoring, analysis, and can execute low-risk operations autonomously while escalating high-risk changes to humans.

```mermaid
flowchart TB
    subgraph OpenClaw["OpenClaw Architecture"]
        M[Monitor<br/>metrics, logs, health] --> D[Detect<br/>anomaly detection]
        D --> A[Analyze<br/>LLM reasoning]
        A --> P[Propose<br/>change proposal]
        P --> E[Execute<br/>if approved]
        
        subgraph Policy["Policy Engine"]
            P --> W[Whitelist<br/>allowed actions]
            P --> R[Rate Limit<br/>cooldown]
            P --> T[Tier Classification<br/>1-3]
        end
        
        subgraph Safety["Safety Layers"]
            W -.->|blocks| E
            R -.->|throttles| E
            T -.->|requires TOTP| E
        end
    end
```

### Core Responsibilities

| Responsibility | Description |
|---|---|
| **Monitoring** | Continuously collect system metrics (CPU, memory, disk, services) |
| **Detection** | Identify anomalies, degraded services, security issues |
| **Analysis** | Use LLM to analyze root cause and propose solutions |
| **Execution** | Execute approved changes with full audit trail |

### Why OpenClaw? (Not Just Another Automation Tool)

Unlike traditional automation (Ansible, Terraform), OpenClaw:

| Traditional Automation | OpenClaw (AI Operator) |
|---|---|
| Declarative desired state | Learns and adapts to system behavior |
| Fixed playbooks | Generates novel solutions for novel problems |
| No context understanding | Uses LLM to understand context |
| Human writes all logic | AI suggests, human approves |
| Static | Improves from feedback |

### The Three-Tier Operation Model

OpenClaw classifies every action into one of three tiers:

```mermaid
flowchart LR
    subgraph Tier1["Tier 1: Autonomous"]
        T1[Log rotation<br/>Service restart<br/>Temp cleanup]
    end
    
    subgraph Tier2["Tier 2: Supervised"]
        T2[Security updates<br/>Swap config<br/>Rate limits]
    end
    
    subgraph Tier3["Tier 3: Gated"]
        T3[nixos-rebuild<br/>User management<br/>Network config]
    end
    
    T1 -->|auto| Success1[✅ Execute]
    T2 -->|notify + wait| Success2[✅ Auto-apply or cancel]
    T3 -->|TOTP required| Human[👤 Human approval]
```

**Tier 1 — Autonomous (No Approval)**
- Low-risk, reversible operations
- Auto-executed immediately
- Examples: log rotation, service restart after failure, temp file cleanup

**Tier 2 — Supervised (Notification + Auto-Apply)**
- Medium-risk operations
- Notifies human, auto-applies after window (default: 30 min)
- Examples: security patches, swap configuration

**Tier 3 — Gated (TOTP Required)**
- High-risk operations
- Requires explicit human approval via TOTP
- Examples: `nixos-rebuild switch`, user management, firewall changes

### OpenClaw Policy Engine

The policy engine is the **safety boundary** that prevents OpenClaw from overreaching. It's defined in Nix:

```nix
services.openclaw.settings.policy = {
  # Tier 1: What AI can do autonomously
  autonomous = {
    allowedActions = [
      "restart-failed-service"
      "rotate-logs"
      "clean-temp-files"
    ];
    constraints = {
      maxActionsPerHour = 5;
      maxRestartsPerServicePerHour = 3;
    };
  };
  
  # Tier 2: What AI proposes but waits for
  supervised = {
    allowedActions = [
      "security-package-update"
      "add-swap"
    ];
    defaultWindow = "30m";
  };
  
  # Tier 3: What AI cannot do without human
  gated = {
    actions = [
      "nixos-rebuild-switch"
      "user-management"
    ];
    requireTOTP = true;
  };
  
  # Global safety limits
  safety = {
    emergencyStopFile = "/var/lib/openclaw/STOP";
    maxChangesPerDay = 20;
    requirePreSnapshot = true;
    autoRollbackOnFailure = true;
  };
};
```

### OpenClaw in the Architecture

```mermaid
sequenceDiagram
    participant System as System (NixOS)
    participant OpenClaw as OpenClaw (AI)
    participant Policy as Policy Engine
    participant Human as Human Operator
    participant TOTP as TOTP Gate
    participant Snap as Btrfs Snapshots
    
    System->>OpenClaw: Send metrics
    OpenClaw->>OpenClaw: Analyze for issues
    
    alt Issue detected
        OpenClaw->>Policy: Check if action allowed
        
        alt Tier 1 (Autonomous)
            Policy->>OpenClaw: Allowed
            OpenClaw->>Snap: Pre-snapshot (automatic)
            Snap-->>OpenClaw: Snapshot done
            OpenClaw->>System: Execute action
            System-->>OpenClaw: Success/fail
            OpenClaw->>OpenClaw: Log to audit
            
        else Tier 2 (Supervised)
            Policy->>OpenClaw: Allowed (supervised)
            OpenClaw->>Human: Notify of pending action
            Note over Human,OpenClaw: 30 minute window
            alt Human approves
                Human->>OpenClaw: Approve
                OpenClaw->>Snap: Pre-snapshot
                OpenClaw->>System: Execute
            else Human cancels
                Human->>OpenClaw: Cancel
                OpenClaw->>OpenClaw: Log cancelled
            end

        else Tier 3 (Gated)
            Policy->>OpenClaw: Requires TOTP
            OpenClaw->>Human: Request approval
            Human->>TOTP: Enter TOTP code
            TOTP->>Policy: Validated
            Policy->>OpenClaw: Approved
            OpenClaw->>Snap: Pre-snapshot
            OpenClaw->>System: Execute via sudo
        end
    end
```

### AI Hallucination Protection

OpenClaw's design explicitly addresses AI hallucinations:

| Hallucination Type | Protection |
|---|---|
| **Hallucinated problem** | Only acts on verified metrics, not LLM interpretation |
| **Wrong fix proposed** | Policy whitelist prevents unauthorized actions |
| **Wrong target** | Human reviews diff before TOTP approval |
| **Feedback loop** | Rate limiting + cooldown periods |
| **Confidence too high** | Always logs uncertainty, requires human for Tier 3 |

:::danger OpenClaw Is Not Root
OpenClaw runs as a dedicated user (`openclaw`), not root. Even if the LLM suggests a root-level command, OpenClaw cannot execute it without going through the TOTP-gated sudo path. **Never give OpenClaw root access** — it would bypass every safety layer.
:::

### Rollback Skills for OpenClaw

OpenClaw doesn't guess how to recover — it has **structured rollback skills** defined as Nix modules. These skills are atomic, tested, and guaranteed to work.

```mermaid
flowchart TB
    subgraph Rollback_Skills["OpenClaw Rollback Skills"]
        R1[system-rollback<br/>NixOS generation restore] --> R5[Atomic subvolume swap]
        R2[service-rollback<br/>systemd service reset] --> R5
        R3[config-rollback<br/>nix diff + revert] --> R5
        R4[db-rollback<br/>PostgreSQL snapshot restore] --> R5
    end
    
    subgraph Triggers["Triggered By"]
        T1[Health check failure]
        T2[AI decision]
        T3[Human request]
    end
    
    T1 --> R1
    T2 --> R2
    T3 --> R3
```

#### Skill 1: System Rollback (NixOS Generation)

Restores system to a previous NixOS generation:

```nix
# Implemented as a Nix module
systemRollback = {
  description = "Rollback to previous NixOS generation";
  
  # Only executes pre-verified commands
  command = ''
    # Get previous generation
    PREV_GEN=$(nix-env --list-generations | grep -B1 current | head -1 | awk '{print $1}')
    
    # Activate previous generation
    sudo /nix/var/nix/profiles/system/bin/switch-to-configuration switch --specialisations "$PREV_GEN"
  '';
  
  # Prerequisites
  requiresSnapshot = true;
  verifyBefore = ["health-check", "ssh-accessible"];
  verifyAfter = ["health-check", "disk-space"];
};
```

**When used:**
- `nixos-rebuild` fails health check after apply
- System becomes unreachable after reboot
- OpenClaw detects boot failure

#### Skill 2: Service Rollback (systemd)

Restarts a service to known-good state:

```nix
serviceRollback = {
  description = "Rollback a systemd service";
  
  command = ''
    SERVICE=$1  # Passed by OpenClaw
    
    # Stop the service
    sudo systemctl stop "$SERVICE"
    
    # Restore config from last known good
    sudo cp /var/lib/openclaw/service-backups/"$SERVICE"/* /etc/systemd/system/
    
    # Reload and restart
    sudo systemctl daemon-reload
    sudo systemctl restart "$SERVICE"
    
    # Verify
    sudo systemctl status "$SERVICE"
  '';
  
  # Only for allowed services (policy whitelist)
  allowedServices = ["nginx", "postgresql", "docker"];
  maxRollbacksPerHour = 3;
};
```

**When used:**
- Service in crash loop
- Service responding with errors
- Configuration drift detected

#### Skill 3: Config Rollback (Nix Diff Revert)

Reverts specific Nix configuration changes:

```nix
configRollback = {
  description = "Revert specific Nix config changes";
  
  command = ''
    # Get the diff between current and previous
    nix diff /etc/nixos/configuration.nix > /tmp/config-diff
    
    # Show what changed
    cat /tmp/config-diff
    
    # Revert to previous commit in git
    cd /etc/nixos
    sudo git revert HEAD --no-commit
    
    # Rebuild
    sudo nixos-rebuild switch
  '';
  
  requiresSnapshot = true;
  alwaysGated = true;  # Always requires TOTP
};
```

**When used:**
- Partial configuration change caused issues
- Want to keep most changes, revert only one
- Human identifies specific problematic change

#### Skill 4: Database Rollback (Btrfs Snapshot)

Restores database subvolume from Btrfs snapshot:

```nix
dbRollback = {
  description = "Restore database from Btrfs snapshot";
  
  command = ''
    DB_PATH=$1  # e.g., /var/lib/postgresql
    SNAPSHOT=$2  # e.g., pre-change-20240115
    
    # Stop database
    sudo systemctl stop postgresql
    
    # Create backup of current state (in case rollback fails)
    sudo btrfs subvolume snapshot "$DB_PATH" "$DB_PATH-broken-$(date +%s)"
    
    # Restore from snapshot
    sudo btrfs subvolume snapshot "$SNAPSHOT" "$DB_PATH"
    
    # Fix permissions
    sudo chown -R postgres:postgres "$DB_PATH"
    
    # Start database
    sudo systemctl start postgresql
    
    # Verify
    sudo -u postgres pg_isready
  '';
  
  requiresSnapshot = true;
  requiresTOTP = true;
  createsSnapshot = true;  # Creates backup before rollback
};
```

**When used:**
- Database corruption after schema migration
- Data integrity check failed
- Accidental data deletion

#### Rollback Skill Configuration

All rollback skills are configured in the policy:

```nix
services.openclaw.settings.policy.rollback = {
  # Enable rollback skills
  enableSystemRollback = true;
  enableServiceRollback = true;
  enableConfigRollback = true;
  enableDbRollback = true;
  
  # Constraints
  maxRollbacksPerHour = 5;
  maxRollbacksPerDay = 20;
  requireSnapshotBeforeRollback = true;
  
  # Auto-rollback triggers (AI can trigger without human approval)
  autoRollbackOnHealthCheckFail = true;
  autoRollbackOnServiceCrash = false;  # Always requires approval
  
  # Cooldown between rollbacks
  rollbackCooldownMinutes = 5;
  
  # Rollback chain limit (prevent rollback loops)
  maxConsecutiveRollbacks = 2;
  
  # Always notify human after rollback
  notifyAfterRollback = true;
};
```

#### Why Rollback as Skills Matters

| Problem with Ad-Hoc Rollback | How Skills Solve It |
|---|---|
| AI doesn't know correct commands | Pre-defined, tested commands |
| Rollback breaks more things | Creates snapshot before rollback |
| No verification | Health checks before/after |
| Rollback loops | Cooldown + chain limit |
| Root cause not diagnosed | Logs full rollback context |

:::info Rollback Is Not Failure
A rollback is **not** a failure — it's a safety mechanism working as intended. If OpenClaw triggers a rollback, it means the safety architecture is functioning correctly. Review the audit log to understand what went wrong and adjust the policy or health checks accordingly.
:::

## Data Flow: Configuration Change

A typical configuration change flows through the system like this:

1. **Trigger** — OpenClaw detects an issue or operator initiates a change
2. **Propose** — A Nix configuration diff is generated
3. **Authenticate** — TOTP code is required for critical operations
4. **Snapshot** — Btrfs snapshots all relevant subvolumes
5. **Apply** — `nixos-rebuild switch` applies the new configuration
6. **Verify** — Health checks confirm the system is functional
7. **Commit or Rollback** — On success, the snapshot is retained as a restore point. On failure, the snapshot is restored.

## Failure Modes

### AI-Specific Failures (Why We Need These Safeguards)

| AI Failure | Detection | Recovery |
|---|---|---|
| AI hallucinates a problem doesn't exist | Human reviews proposal at TOTP gate | Change never applied |
| AI proposes harmful command | Policy engine blocks non-allowed actions | Alert sent to operator |
| AI proposes correct fix but wrong target | Human reviews diff before approval | Change requires TOTP |
| AI applies change incorrectly | Health check fails after switch | Rollback to pre-change snapshot |
| AI in feedback loop (keeps trying same fix) | Rate limiting in policy engine | Cooldown enforced |

### System Failures

| Failure | Detection | Recovery |
|---|---|---|
| Bad NixOS config (won't build) | `nixos-rebuild` fails at build stage | No system change occurred — fix config and retry |
| Bad NixOS config (builds but breaks services) | Health check fails after switch | Rollback to pre-change Btrfs snapshot |
| Bad NixOS config (breaks boot) | System doesn't come up after reboot | Select previous NixOS generation in GRUB |
| Database corruption after change | Application health check / data validation | Restore `@db` subvolume from snapshot |
| OpenClaw proposes bad change | Human reviews and rejects at TOTP gate | Change never applied |
| OpenClaw acts outside policy | Policy engine blocks the action | Action logged and alert sent |
| Disk failure | Btrfs device stats / SMART monitoring | Restore from remote backup (btrfs receive) |

## Subvolume Map

```mermaid
flowchart TB
    subgraph Btrfs["Btrfs pool (/)"]
        A["root → /<br/>system root, snapshotted"]
        B["home → /home<br/>user data, snapshotted"]
        C["nix → /nix<br/>Nix store, NOT snapshotted"]
        D["log → /var/log<br/>logs, persisted across rollbacks"]
        E["db → /var/lib/db<br/>databases, separate snapshot schedule"]
        F["snapshots → /.snapshots<br/>snapshot storage"]
    end
```

:::note Why /nix Is Not Snapshotted
The Nix store (`/nix`) is content-addressed. Every path is identified by its hash. Snapshotting it would waste space — you can always rebuild any Nix store path from the flake. Instead, snapshot the configuration that *references* the store paths.
:::

## Security Model

```mermaid
flowchart TB
    subgraph Threats["Threat Model - AI is the Primary Concern"]
        A[Threat: AI makes a bad change] --> A1[Mitigation: TOTP gate + pre-change snapshot]
        A --> A2[Mitigation: Policy engine blocks unauthorized actions]
        B[Threat: AI hallucinates problem<br/>proposes unnecessary change] --> B1[Mitigation: Human approval required at TOTP gate]
        C[Threat: AI misreads system state] --> C1[Mitigation: Health checks verify actual state]
        D[Threat: AI in feedback loop<br/>repeating failed action] --> D1[Mitigation: Rate limiting + cooldown periods]
        E[Threat: Attacker gains shell access] --> E1[Mitigation: TOTP required for sudo escalation]
        F[Threat: Configuration drift] --> F1["Mitigation: Declarative NixOS (no drift)"]
        G[Threat: Data loss from bad migration] --> G1[Mitigation: Btrfs snapshot of db before change]
        H[Threat: Complete disk failure] --> H1[Mitigation: Remote btrfs send/receive backup]
    end
```

### Authentication Flow

```mermaid
flowchart TB
    A[User/AI<br/>sudo nixos-rebuild switch] --> B[PAM Stack]
    B --> C[1. pam_unix<br/>password check]
    B --> D[2. pam_oath<br/>TOTP check 6-digit code]
    B --> E[3. pam_env<br/>environment setup]
    C -->|pass| F{all passed?}
    D -->|pass| F
    E --> F
    F -->|yes| G[Command executes]
```

## What's Next

With the architecture understood, let's start building. The next chapter walks through [bootstrapping NixOS on a remote server](./bootstrap-nixos-anywhere) using `nixos-anywhere`.
