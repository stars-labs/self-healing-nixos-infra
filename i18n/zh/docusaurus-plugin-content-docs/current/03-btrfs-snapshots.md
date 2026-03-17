---
sidebar_position: 5
title: Btrfs 快照与 Snapper
---

# Btrfs 快照与 Snapper

快照是回滚策略的核心。本章涵盖手动快照、使用 Snapper 进行自动化管理，以及确保每次系统变更都有还原点的重建前钩子。

## 快照基础

Btrfs 快照是子卷的即时、空间高效的副本。它利用写时复制机制 — 创建时不复制任何数据，只有当原始子卷和快照之间的文件发生差异时才会消耗额外空间。

```mermaid
flowchart LR
    subgraph T0["Time T0: Create snapshot"]
        A["root subvol - live"] --- B["Both point to same data<br/>blocks via COW"]
        C["root-snap-T0"] --- B
    end

    subgraph T1["Time T1: Modify file in root subvol"]
        D["root subvol - live<br/>modified block"] --- E["shared blocks"]
        F["root-snap-T0<br/>original block"] --- E
    end
```

> 只有发生变更的数据块才会消耗额外空间。

### 只读快照与读写快照

| 类型 | 使用场景 |
|---|---|
| 只读（`-r`） | 备份、远程 send/receive、归档 |
| 读写 | 回滚目标（需要从中启动系统） |

```bash
# Read-only snapshot (for backups)
sudo btrfs subvolume snapshot -r / /.snapshots/@root-backup

# Read-write snapshot (for rollback)
sudo btrfs subvolume snapshot / /.snapshots/@root-rollback
```

## 手动快照

在执行任何高风险操作之前，先创建手动快照：

```bash
# Snapshot root before a change
sudo btrfs subvolume snapshot / /.snapshots/@root-$(date +%Y%m%d-%H%M%S)

# Snapshot database before migration
sudo btrfs subvolume snapshot /var/lib/db /.snapshots/@db-pre-migration

# List all snapshots
sudo btrfs subvolume list -s /
```

## NixOS 上的 Snapper

Snapper 自动化快照的创建、基于时间线的清理以及变更前后的快照配对。NixOS 原生集成了 Snapper。

### NixOS 模块配置

```nix title="configuration.nix"
{ config, pkgs, ... }:
{
  # Enable Snapper
  services.snapper = {
    snapshotInterval = "hourly";
    cleanupInterval = "1d";

    configs = {
      # Root filesystem snapshots
      root = {
        SUBVOLUME = "/";
        ALLOW_USERS = [ "admin" ];
        TIMELINE_CREATE = true;
        TIMELINE_CLEANUP = true;

        # Retention policy
        TIMELINE_MIN_AGE = "1800";       # 30 minutes
        TIMELINE_LIMIT_HOURLY = "24";    # keep 24 hourly
        TIMELINE_LIMIT_DAILY = "7";      # keep 7 daily
        TIMELINE_LIMIT_WEEKLY = "4";     # keep 4 weekly
        TIMELINE_LIMIT_MONTHLY = "6";    # keep 6 monthly
        TIMELINE_LIMIT_YEARLY = "1";     # keep 1 yearly
      };

      # Home directory snapshots
      home = {
        SUBVOLUME = "/home";
        ALLOW_USERS = [ "admin" ];
        TIMELINE_CREATE = true;
        TIMELINE_CLEANUP = true;

        TIMELINE_LIMIT_HOURLY = "12";
        TIMELINE_LIMIT_DAILY = "7";
        TIMELINE_LIMIT_WEEKLY = "4";
        TIMELINE_LIMIT_MONTHLY = "3";
        TIMELINE_LIMIT_YEARLY = "0";
      };

      # Database snapshots (more frequent)
      db = {
        SUBVOLUME = "/var/lib/db";
        ALLOW_USERS = [ "admin" ];
        TIMELINE_CREATE = true;
        TIMELINE_CLEANUP = true;

        TIMELINE_LIMIT_HOURLY = "48";    # 2 days of hourly
        TIMELINE_LIMIT_DAILY = "14";     # 2 weeks daily
        TIMELINE_LIMIT_WEEKLY = "8";     # 2 months weekly
        TIMELINE_LIMIT_MONTHLY = "6";
        TIMELINE_LIMIT_YEARLY = "0";
      };
    };
  };

  # Ensure snapper directories exist
  systemd.tmpfiles.rules = [
    "d /.snapshots 0750 root root -"
  ];
}
```

### 验证 Snapper 运行状态

```bash
# Check snapper configs
sudo snapper list-configs

# Output:
# Config | Subvolume
# -------+----------
# root   | /
# home   | /home
# db     | /var/lib/db

# List snapshots for root config
sudo snapper -c root list

# Check the snapper timer
systemctl status snapper-timeline.timer
systemctl status snapper-cleanup.timer
```

## 重建前快照钩子

最关键的快照发生在 `nixos-rebuild` 之前。创建一个包装脚本，确保每次重建前都会自动创建快照：

```nix title="modules/safe-rebuild.nix"
{ config, pkgs, lib, ... }:
let
  safeRebuild = pkgs.writeShellScriptBin "safe-rebuild" ''
    set -euo pipefail

    ACTION="''${1:-switch}"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    SNAP_DESC="nixos-rebuild $ACTION"

    echo "=== Safe NixOS Rebuild ==="
    echo "Action: $ACTION"
    echo "Time:   $TIMESTAMP"
    echo ""

    # Step 1: Create pre-rebuild snapshots
    echo "[1/4] Creating pre-rebuild snapshots..."
    sudo snapper -c root create \
      --type pre \
      --description "$SNAP_DESC" \
      --print-number > /tmp/snap-root-num

    ROOT_SNAP=$(cat /tmp/snap-root-num)
    echo "       Root snapshot: #$ROOT_SNAP"

    # Step 2: Run nixos-rebuild
    echo "[2/4] Running nixos-rebuild $ACTION..."
    if sudo nixos-rebuild "$ACTION" "''${@:2}"; then
      REBUILD_STATUS=0
      echo "[3/4] Rebuild succeeded."
    else
      REBUILD_STATUS=$?
      echo "[3/4] Rebuild FAILED with exit code $REBUILD_STATUS"
    fi

    # Step 3: Create post-rebuild snapshot
    echo "[4/4] Creating post-rebuild snapshot..."
    sudo snapper -c root create \
      --type post \
      --pre-number "$ROOT_SNAP" \
      --description "$SNAP_DESC (exit: $REBUILD_STATUS)"

    # Step 4: Report
    if [ $REBUILD_STATUS -ne 0 ]; then
      echo ""
      echo "╔══════════════════════════════════════════╗"
      echo "║  REBUILD FAILED — Rollback available     ║"
      echo "║                                          ║"
      echo "║  To rollback:                            ║"
      echo "║  sudo snapper -c root undochange         ║"
      echo "║         $ROOT_SNAP..0                    ║"
      echo "║                                          ║"
      echo "║  Or reboot into previous generation:     ║"
      echo "║  sudo reboot (select older entry in GRUB)║"
      echo "╚══════════════════════════════════════════╝"
      exit $REBUILD_STATUS
    fi

    echo ""
    echo "Rebuild complete. Snapshot #$ROOT_SNAP saved as restore point."
  '';
in
{
  environment.systemPackages = [ safeRebuild ];
}
```

用法：

```bash
# Instead of: sudo nixos-rebuild switch
safe-rebuild switch

# With extra flags:
safe-rebuild switch --flake /etc/nixos#server

# Boot (for next reboot):
safe-rebuild boot
```

## 列出和比较快照

```bash
# List all root snapshots
sudo snapper -c root list

# Output:
#  # | Type   | Pre # | Date                | User | Cleanup  | Description
# ---+--------+-------+---------------------+------+----------+------------------
#  0 | single |       |                     | root |          | current
#  1 | pre    |       | 2024-01-15 10:30:00 | root |          | nixos-rebuild switch
#  2 | post   |     1 | 2024-01-15 10:32:15 | root |          | nixos-rebuild switch (exit: 0)
#  3 | single |       | 2024-01-15 11:00:00 | root | timeline | timeline

# Show what changed between two snapshots
sudo snapper -c root status 1..2

# Show diff of a specific file between snapshots
sudo snapper -c root diff 1..2 /etc/nixos/configuration.nix
```

## 回滚步骤

### 方法一：Snapper Undochange（在线回滚）

在不重启的情况下撤销两个快照之间的文件变更：

```bash
# Undo changes made between snapshot 1 (pre) and current state
sudo snapper -c root undochange 1..0
```

:::warning Undochange 的局限性
`snapper undochange` 是逐文件替换的。它适用于配置回滚，但可能无法优雅地处理正在运行的服务。如需完整回滚，请使用方法二或方法三。
:::

### 方法二：子卷替换（完整回滚）

用快照替换当前的根文件系统：

```bash
# 1. Boot into a rescue system or use a snapshot as temporary root

# 2. Mount the Btrfs partition directly
sudo mount /dev/sda2 /mnt

# 3. Move the broken root aside
sudo mv /mnt/@root /mnt/@root-broken

# 4. Create a read-write snapshot from the known-good snapshot
sudo btrfs subvolume snapshot /mnt/@snapshots/root/1/snapshot /mnt/@root

# 5. Unmount and reboot
sudo umount /mnt
sudo reboot
```

### 方法三：NixOS 世代（引导级别）

NixOS 将之前的系统配置保存为引导加载器条目：

```bash
# List available generations
sudo nix-env --list-generations -p /nix/var/nix/profiles/system

# Switch to a previous generation
sudo nix-env --switch-generation 42 -p /nix/var/nix/profiles/system
sudo /nix/var/nix/profiles/system/bin/switch-to-configuration switch

# Or simply reboot and select a previous generation from the GRUB menu
```

:::tip 双重保险
NixOS 世代和 Btrfs 快照相互补充：
- **NixOS 世代**回滚的是*系统配置*（软件包、服务、引导）
- **Btrfs 快照**回滚的是*文件系统状态*（数据、数据库、Nix 管理范围之外的配置）

两者结合使用，可以获得最大的可恢复性。
:::

## 使用 Send/Receive 进行远程备份

将快照流式传输到远程备份服务器：

```bash
# Create a read-only snapshot
sudo btrfs subvolume snapshot -r / /.snapshots/@root-backup-$(date +%Y%m%d)

# Send to remote server (first time — full send)
sudo btrfs send /.snapshots/@root-backup-20240115 | \
  ssh backup-server "sudo btrfs receive /backups/server1/"

# Incremental send (subsequent backups — only send changes)
sudo btrfs send -p /.snapshots/@root-backup-20240115 \
  /.snapshots/@root-backup-20240116 | \
  ssh backup-server "sudo btrfs receive /backups/server1/"
```

### 自动备份脚本

```nix title="modules/btrfs-backup.nix"
{ config, pkgs, ... }:
let
  btrfsBackup = pkgs.writeShellScriptBin "btrfs-backup" ''
    set -euo pipefail

    REMOTE="backup-server"
    REMOTE_PATH="/backups/$(hostname)"
    LOCAL_SNAPS="/.snapshots"
    TODAY=$(date +%Y%m%d)

    # Create read-only snapshot
    sudo btrfs subvolume snapshot -r / "$LOCAL_SNAPS/@root-backup-$TODAY"

    # Find yesterday's snapshot for incremental send
    YESTERDAY=$(date -d yesterday +%Y%m%d)
    if [ -d "$LOCAL_SNAPS/@root-backup-$YESTERDAY" ]; then
      echo "Incremental send (parent: $YESTERDAY)..."
      sudo btrfs send -p "$LOCAL_SNAPS/@root-backup-$YESTERDAY" \
        "$LOCAL_SNAPS/@root-backup-$TODAY" | \
        ssh "$REMOTE" "sudo btrfs receive $REMOTE_PATH/"
    else
      echo "Full send..."
      sudo btrfs send "$LOCAL_SNAPS/@root-backup-$TODAY" | \
        ssh "$REMOTE" "sudo btrfs receive $REMOTE_PATH/"
    fi

    echo "Backup complete: @root-backup-$TODAY -> $REMOTE:$REMOTE_PATH"
  '';
in
{
  environment.systemPackages = [ btrfsBackup ];

  # Daily backup timer
  systemd.services.btrfs-backup = {
    description = "Btrfs snapshot backup to remote";
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "${btrfsBackup}/bin/btrfs-backup";
    };
  };

  systemd.timers.btrfs-backup = {
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "daily";
      Persistent = true;
      RandomizedDelaySec = "1h";
    };
  };
}
```

## 监控快照空间

如果不及时清理，快照可能消耗大量空间。监控使用情况：

```bash
# Check overall filesystem usage
sudo btrfs filesystem usage /

# Check how much space snapshots consume
sudo btrfs filesystem du -s /.snapshots/

# Check exclusive space used (space that would be freed on deletion)
sudo btrfs qgroup show -reF /
```

:::danger 不要让快照占满磁盘
Btrfs 文件系统满了之后可能无法挂载。请设置监控：

```bash
# Simple check script — alert if usage exceeds 85%
USAGE=$(sudo btrfs filesystem usage / | grep "Used:" | awk '{print $2}' | tr -d '%')
if [ "$USAGE" -gt 85 ]; then
  echo "WARNING: Btrfs usage at ${USAGE}%"
  # Trigger alert here
fi
```

NixOS 配置中的 Snapper 清理策略会自动删除旧的时间线快照，但仍需保持监控。
:::

## 下一步

快照已配置完毕并实现自动化。接下来，我们将安装 [OpenClaw](./install-openclaw)，它是 AI 运维代理，将利用这些快照作为安全网来管理基础设施变更。
