---
slug: /
sidebar_position: 1
title: Introduction
---

# Bootstrapping Self-Healing Infrastructure with NixOS

This tutorial walks you through building a **production-grade, self-healing server** that combines declarative system management, copy-on-write snapshots, AI-assisted operations, and TOTP-protected critical commands.

## What You'll Build

By the end of this guide, you'll have a server that:

- Runs **NixOS** installed remotely via `nixos-anywhere` — no ISO, no console access needed
- Uses a **Btrfs** filesystem with a carefully designed subvolume layout
- Implements **Impermanence** ("Erase your darlings") for an ephemeral, stateless root filesystem
- Takes **automatic snapshots** before every system change
- Runs **OpenClaw**, an AI infrastructure operator that monitors and proposes fixes
- Gates **critical operations** (`nixos-rebuild switch`, config changes) behind **TOTP authentication**
- Can **roll back instantly** when something goes wrong — whether caused by a human or an AI

```mermaid
flowchart TB
    subgraph Server["Self-Healing NixOS Server"]
        direction LR
        A[OpenClaw<br/>AI Agent] -->|monitor| B[System Health]
        A -->|propose| C[TOTP Gate<br/>pam_oath]
        C -->|approve| D[nixos-rebuild]
        B -->|check| E[Btrfs Subvolumes<br/>& Impermanence]
        D -->|apply| E
        E -->|snapshot| F[Snapshot<br/>before change]
        F -->|failure| G[Rollback<br/>& Wipe Root]
    end
```

## Example: Atomic Database Upgrades

Imagine you have both **PostgreSQL** and **MySQL** running on your server, and you deploy an AI agent to keep them updated. Upgrading databases is traditionally risky: what if the PostgreSQL upgrade succeeds, but the MySQL upgrade fails and corrupts its data?

With this self-healing architecture, the process is inherently safe:

1. **Pre-upgrade Snapshot:** Before the AI applies the new configuration, the system automatically takes an instantaneous, read-only Btrfs snapshot of both your system state and database subvolumes (e.g., `/var/lib/postgresql` and `/var/lib/mysql`).
2. **The Upgrade:** The AI applies the NixOS configuration change, updating the binaries and restarting the services.
3. **Health Check:** The AI monitors the services. Suppose PostgreSQL succeeds, but MySQL fails to start due to a deprecated configuration parameter.
4. **Atomic Rollback:** Because both the declarative system configuration (Nix) and the data storage (Btrfs) are tightly integrated, rolling back is atomic. The system instantly reverts the snapshots. The binaries, configurations, and raw database files all revert together to the exact microsecond before the upgrade began. No partial failures, no messy manual state recovery.

## Who This Is For

- **DevOps engineers** managing production Linux servers
- **SREs** designing resilient infrastructure
- **Platform engineers** exploring AI-assisted operations
- **NixOS enthusiasts** looking for production patterns

## Prerequisites

| Requirement | Details |
|---|---|
| Target server | VPS or VPC with root SSH access, 2+ GB RAM, 20+ GB disk |
| Local machine | Linux or macOS with [Nix installed](https://nixos.org/download/) |
| SSH key pair | `ssh-keygen -t ed25519` if you don't have one |
| Knowledge | Basic Linux administration, SSH, command-line comfort |

:::tip No NixOS Experience Required
This tutorial assumes no prior NixOS experience. Each step is explained from first principles. However, basic Linux sysadmin skills (SSH, filesystems, services) are expected.
:::

## The Stack

| Component | Role |
|---|---|
| [nixos-anywhere](https://github.com/nix-community/nixos-anywhere) | Remote NixOS installation over SSH |
| [NixOS](https://nixos.org) | Declarative, reproducible operating system |
| [Btrfs](https://btrfs.readthedocs.io/) | Copy-on-write filesystem with snapshots |
| [Snapper](http://snapper.io/) | Automated snapshot management |
| [Impermanence](https://github.com/nix-community/impermanence) | "Erase your darlings" stateless root filesystem |
| [OpenClaw](https://github.com/openclaw) | AI infrastructure operator |
| [pam_oath](https://www.nongnu.org/oath-toolkit/) | TOTP-based sudo authentication |

## Tutorial Roadmap

1. **[Architecture Overview](./architecture)** — System design and component interactions
2. **[Bootstrap with nixos-anywhere](./bootstrap-nixos-anywhere)** — Install NixOS on any server remotely
3. **[Btrfs & Impermanence Layout](./btrfs-layout)** — Design the filesystem for snapshots, stateless root, and persistent state
4. **[Btrfs Snapshots & Snapper](./btrfs-snapshots)** — Automate snapshot creation and cleanup
5. **[Install OpenClaw](./install-openclaw)** — Set up the AI infrastructure operator
6. **[AI-Managed Infrastructure](./ai-managed-infra)** — Configure AI-assisted operations
7. **[OpenClaw Context Management](./context-management)** — Event correlation, session continuity, and knowledge learning
8. **[TOTP Sudo Protection](./totp-sudo-protection)** — Gate critical commands behind TOTP
8. **[Database Snapshot Strategy](./database-snapshot-strategy)** — Consistent database backups with Btrfs
9. **[Disaster Recovery](./disaster-recovery)** — Full recovery procedures
10. **[AI Safety & Rollback](./ai-safety-and-rollback)** — Guardrails and rollback workflows
11. **[Monitoring & Alerting](./monitoring-alerting)** — Prometheus, Grafana, Loki for OpenClaw observability
12. **[Impermanence Setup](./impermanence-setup)** — "Erase your darlings" stateless root filesystem
13. **[Security Hardening](./security-hardening)** — Firewall, SSH, Fail2ban, kernel & service hardening
14. **[FAQ](./faq)** — Common questions and troubleshooting
15. **[Interactive Demo](./interactive-demo)** — Animated workflows, terminal replays, and decision simulator

:::warning Production Readiness
This tutorial uses realistic, production-grade configurations. However, always test in a staging environment before applying to production servers. Every environment has unique requirements.
:::

## Design Philosophy

This architecture follows three core principles:

1. **Rollback-first** — Every change is preceded by a snapshot. Recovery is always one command away.
2. **Defense-in-depth** — AI can propose changes, but humans approve critical ones via TOTP. Snapshots catch what TOTP doesn't.
3. **Declarative everything** — The entire system state lives in version-controlled Nix configurations. No snowflake servers.

Let's start with the [architecture overview](./architecture).
