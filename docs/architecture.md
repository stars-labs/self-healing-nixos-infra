---
sidebar_position: 2
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
    
    subgraph Btrfs["Btrfs Filesystem (subvolumes)"]
        B[@root, @home, @nix, @log, @db, @snapshots]
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
    Note over Snap: Before ANY change:<br/>btrfs snapshot @root -> @root-pre
    Snap-->>Nix: Snapshot confirmed
    Nix->>Health: Apply config
    alt Health check passes
        Health-->>AI: Success - keep snapshot
    else Health check fails
        Nix->>Snap: Rollback request
        Snap->>Snap: btrfs subvolume snapshot<br/>/snapshots/@root-pre /
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
    B -->|authorized| D[Pre-Change Snapshot<br/>btrfs snapshot @root -> @root-pre]
    D -->|apply| E[nixos-rebuild switch<br/>applies new NixOS configuration]
    E --> F{success?}
    F -->|yes| G[Done<br/>keep snapshot]
    F -->|no| H[Rollback<br/>restore snapshot]
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
        A["@root -> /<br/>system root, snapshotted"]
        B["@home -> /home<br/>user data, snapshotted"]
        C["@nix -> /nix<br/>Nix store, NOT snapshotted"]
        D["@log -> /var/log<br/>logs, persisted across rollbacks"]
        E["@db -> /var/lib/db<br/>databases, separate snapshot schedule"]
        F["@snapshots -> /.snapshots<br/>snapshot storage"]
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
        F[Threat: Configuration drift] --> F1[Mitigation: Declarative NixOS (no drift)]
        G[Threat: Data loss from bad migration] --> G1[Mitigation: Btrfs snapshot of @db before change]
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
