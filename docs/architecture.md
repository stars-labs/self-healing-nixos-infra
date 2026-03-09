---
sidebar_position: 2
title: Architecture Overview
---

# Architecture Overview

This page describes the full system architecture, component interactions, data flows, and failure handling strategies.

## System Layers

The architecture is built in layers, each providing guarantees to the layer above:

```
┌─────────────────────────────────────────────────────┐
│                  Human Operator                      │
│              (TOTP authentication)                   │
├─────────────────────────────────────────────────────┤
│                   OpenClaw                           │
│          (AI infrastructure operator)                │
│    ┌───────────┐  ┌──────────┐  ┌──────────────┐   │
│    │  Monitor   │  │ Propose  │  │   Execute    │   │
│    │  & Detect  │  │  Changes │  │  (via sudo)  │   │
│    └───────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────┤
│                TOTP Gate (pam_oath)                   │
│         Guards: nixos-rebuild, systemctl,             │
│         user management, firewall changes            │
├─────────────────────────────────────────────────────┤
│              NixOS Configuration                     │
│    ┌───────────┐  ┌──────────┐  ┌──────────────┐   │
│    │  Flake    │  │ Modules  │  │  nixos-      │   │
│    │  (pinned) │  │          │  │  rebuild     │   │
│    └───────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────┤
│              Snapshot Layer (Snapper)                 │
│    ┌───────────┐  ┌──────────┐  ┌──────────────┐   │
│    │   Pre     │  │ Timeline │  │   Remote     │   │
│    │ Snapshots │  │ Cleanup  │  │   Backup     │   │
│    └───────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────┤
│           Btrfs Filesystem (subvolumes)              │
│   @root  @home  @nix  @log  @db  @snapshots         │
├─────────────────────────────────────────────────────┤
│              Hardware / VPS / VPC                     │
│           (provisioned via nixos-anywhere)            │
└─────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Rollback-First

Every state-changing operation is preceded by a Btrfs snapshot. If the change fails, rollback is instant:

```bash
# Before any nixos-rebuild, a snapshot is taken automatically
# Rollback is a single command:
sudo btrfs subvolume snapshot /snapshots/@root/pre-rebuild /
sudo reboot
```

### 2. Reproducibility

The entire system is defined in Nix flakes. Two identical flake inputs produce identical systems:

```
flake.lock (pinned)  ──>  nixos-rebuild  ──>  identical system state
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

## Component Interactions

```
┌──────────────┐         ┌──────────────┐
│   OpenClaw   │         │    Human     │
│   (detect)   │         │  (approve)   │
└──────┬───────┘         └──────┬───────┘
       │ propose change         │ TOTP code
       ▼                        ▼
┌──────────────────────────────────────┐
│          TOTP Sudo Gate              │
│   (pam_oath validates 6-digit code)  │
└──────────────────┬───────────────────┘
                   │ authorized
                   ▼
┌──────────────────────────────────────┐
│        Pre-Change Snapshot           │
│   btrfs snapshot @root -> @root-pre  │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│         nixos-rebuild switch         │
│   (applies new NixOS configuration)  │
└──────────────────┬───────────────────┘
                   │
              ┌────┴────┐
              │ success? │
              └────┬────┘
             yes   │   no
              │    │    │
              ▼    │    ▼
┌──────────┐ │  ┌──────────────┐
│  Done    │ │  │   Rollback   │
│  (keep   │ │  │ (restore     │
│ snapshot)│ │  │  snapshot)   │
└──────────┘ │  └──────────────┘
```

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

```
Btrfs pool (/)
├── @root        -> /              (system root, snapshotted)
├── @home        -> /home          (user data, snapshotted)
├── @nix         -> /nix           (Nix store, NOT snapshotted)
├── @log         -> /var/log       (logs, persisted across rollbacks)
├── @db          -> /var/lib/db    (databases, separate snapshot schedule)
└── @snapshots   -> /.snapshots    (snapshot storage)
```

:::note Why /nix Is Not Snapshotted
The Nix store (`/nix`) is content-addressed. Every path is identified by its hash. Snapshotting it would waste space — you can always rebuild any Nix store path from the flake. Instead, snapshot the configuration that *references* the store paths.
:::

## Security Model

```
┌──────────────────────────────────────────────────┐
│                 Threat Model                      │
├──────────────────────────────────────────────────┤
│                                                   │
│  Threat: AI makes a bad change                   │
│  Mitigation: TOTP gate + pre-change snapshot     │
│                                                   │
│  Threat: Attacker gains shell access             │
│  Mitigation: TOTP required for sudo escalation   │
│                                                   │
│  Threat: Configuration drift                     │
│  Mitigation: Declarative NixOS (no drift)        │
│                                                   │
│  Threat: Data loss from bad migration            │
│  Mitigation: Btrfs snapshot of @db before change │
│                                                   │
│  Threat: Complete disk failure                   │
│  Mitigation: Remote btrfs send/receive backup    │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Authentication Flow

```
User/AI ──> sudo nixos-rebuild switch
                    │
                    ▼
            ┌───────────────┐
            │  PAM Stack    │
            │               │
            │  1. pam_unix  │──> password check
            │  2. pam_oath  │──> TOTP check (6-digit code)
            │  3. pam_env   │──> environment setup
            └───────────────┘
                    │
                    ▼ (both passed)
            Command executes
```

## What's Next

With the architecture understood, let's start building. The next chapter walks through [bootstrapping NixOS on a remote server](./bootstrap-nixos-anywhere) using `nixos-anywhere`.
