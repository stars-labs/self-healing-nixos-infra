---
sidebar_size: 9
title: 数据库快照策略
---

# 数据库快照策略

数据库需要特殊的快照处理。对正在运行的数据库进行简单的文件系统快照可能会捕获不一致的状态 — 半写事务、脏缓冲区、不完整的 WAL 条目。本章介绍在 Btrfs 上实现一致数据库快照的策略。

## 一致性问题

```
不协调：
┌──────────────────┐    ┌──────────────────┐
│   PostgreSQL     │    │   Btrfs 快照    │
│                  │    │                   │
│  写事务 1 ────────┼────┼── 已捕获 ✓       │
│  写事务 2 ────────┼──┐ │                  │
│  (进行中)        │  │ │── 半捕获 ✗│
│  写事务 2 ────────┼──┘ │                  │
│  (继续)          │    │                  │
└──────────────────┘    └──────────────────┘
结果：损坏的快照 — 事务 2 部分写入

协调后：
┌──────────────────┐    ┌──────────────────┐
│   PostgreSQL     │    │   Btrfs 快照    │
│                  │    │                   │
│  CHECKPOINT ─────┼────┼── 刷新到磁盘    │
│  pg_start_backup─┼────┼── 标记备份       │
│  (写冻结)        │    │                  │
│                  │    │── 快照拍摄 ✓     │
│  pg_stop_backup──┼────┼── 恢复写        │
│  写事务 3 ────────┼────┼── 不在快照中    │
└──────────────────┘    └──────────────────┘
结果：一致的快照 — 所有数据完整
```

## 策略概览

| 数据库 | 快照方法 |
|---|---|
| PostgreSQL | `CHECKPOINT` + `pg_backup_start()` + Btrfs 快照 + `pg_backup_stop()` |
| SQLite | `PRAGMA wal_checkpoint(TRUNCATE)` + Btrfs 快照 |
| Redis | `BGSAVE` + 等待 + Btrfs 快照 |
| MySQL/MariaDB | `FLUSH TABLES WITH READ LOCK` + Btrfs 快照 + `UNLOCK TABLES` |

## PostgreSQL 一致快照

### NixOS PostgreSQL 配置

```nix title="modules/postgresql.nix"
{ config, pkgs, ... }:
{
  services.postgresql = {
    enable = true;
    package = pkgs.postgresql_16;

    # 将数据存储在 @db 子卷上
    dataDir = "/var/lib/db/postgresql";

    settings = {
      # 可靠备份的 WAL 配置
      wal_level = "replica";
      archive_mode = "on";
      archive_command = "cp %p /var/lib/db/wal-archive/%f";

      # 检查点设置
      checkpoint_timeout = "15min";
      max_wal_size = "1GB";
    };
  };

  # 确保 WAL 归档目录存在
  systemd.tmpfiles.rules = [
    "d /var/lib/db/wal-archive 0700 postgres postgres -"
  ];
}
```

### 一致快照脚本

```nix title="modules/db-snapshot.nix"
{ config, pkgs, ... }:
let
  dbSnapshot = pkgs.writeShellScriptBin "db-snapshot" ''
    set -euo pipefail

    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    SNAP_NAME="@db-$TIMESTAMP"
    SNAP_PATH="/.snapshots/$SNAP_NAME"

    echo "=== Database Consistent Snapshot ==="
    echo "Timestamp: $TIMESTAMP"
    echo "Target:    $SNAP_PATH"
    echo ""

    # 步骤 1：强制检查点（刷新脏缓冲区到磁盘）
    echo "[1/5] Forcing PostgreSQL checkpoint..."
    sudo -u postgres psql -c "CHECKPOINT;"

    # 步骤 2：开始备份模式（PostgreSQL 记录 WAL 位置）
    echo "[2/5] Starting backup mode..."
    BACKUP_LABEL=$(sudo -u postgres psql -t -c \
      "SELECT pg_backup_start('btrfs-snapshot-$TIMESTAMP', false);")
    echo "       Backup LSN: $BACKUP_LABEL"

    # 步骤 3：拍摄 Btrfs 快照
    echo "[3/5] Creating Btrfs snapshot..."
    sudo btrfs subvolume snapshot -r /var/lib/db "$SNAP_PATH"

    # 步骤 4：停止备份模式
    echo "[4/5] Stopping backup mode..."
    sudo -u postgres psql -c "SELECT pg_backup_stop(false);" > /dev/null

    # 步骤 5：验证
    echo "[5/5] Verifying snapshot..."
    sudo btrfs subvolume show "$SNAP_PATH"

    echo ""
    echo "Snapshot created: $SNAP_PATH"
    echo "To restore: sudo btrfs subvolume snapshot $SNAP_PATH /var/lib/db"
  '';

  dbRestore = pkgs.writeShellScriptBin "db-restore" ''
    set -euo pipefail

    SNAP_PATH="''${1:?Usage: db-restore <snapshot-path>}"

    if [ ! -d "$SNAP_PATH" ]; then
      echo "Error: Snapshot not found: $SNAP_PATH"
      exit 1
    fi

    echo "=== Database Restore ==="
    echo "Source: $SNAP_PATH"
    echo ""
    echo "WARNING: This will stop PostgreSQL and replace the database."
    read -r -p "Continue? [y/N] " confirm
    if [ "$confirm" != "y" ]; then
      echo "Aborted."
      exit 0
    fi

    # 步骤 1：停止 PostgreSQL
    echo "[1/4] Stopping PostgreSQL..."
    sudo systemctl stop postgresql

    # 步骤 2：将当前数据移开
    echo "[2/4] Moving current data aside..."
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    sudo mv /var/lib/db /var/lib/db-old-$TIMESTAMP

    # 步骤 3：从快照恢复（创建读写副本）
    echo "[3/4] Restoring from snapshot..."
    sudo btrfs subvolume snapshot "$SNAP_PATH" /var/lib/db

    # 步骤 4：启动 PostgreSQL
    echo "[4/4] Starting PostgreSQL..."
    sudo systemctl start postgresql

    # 验证
    echo ""
    echo "Restore complete. Verifying..."
    sudo -u postgres psql -c "SELECT version();"
    echo "Old data saved to: /var/lib/db-old-$TIMESTAMP"
  '';
in
{
  environment.systemPackages = [ dbSnapshot dbRestore ];
}
```

## 自动化数据库快照

安排定期一致快照：

```nix title="modules/db-snapshot-timer.nix"
{ config, pkgs, ... }:
{
  # 每 6 小时拍摄一次一致的数据库快照
  systemd.services.db-snapshot = {
    description = "Consistent database Btrfs snapshot";
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "${pkgs.bash}/bin/bash -c '${./scripts/db-snapshot-auto.sh}'";
    };
    path = with pkgs; [ btrfs-progs postgresql_16 coreutils ];
  };

  systemd.timers.db-snapshot = {
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "*-*-* 00,06,12,18:00:00";  # 每 6 小时
      Persistent = true;
      RandomizedDelaySec = "5m";
    };
  };
}
```

## SQLite 快照策略

SQLite 更简单 — 检查点 WAL 然后快照：

```bash
#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:?Usage: sqlite-snapshot <db-path>}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# 检查点 WAL（将所有 WAL 页刷新到主数据库文件）
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"

# 现在数据库文件是自包含的 — 快照是安全的
sudo btrfs subvolume snapshot -r /var/lib/db "/.snapshots/@db-sqlite-$TIMESTAMP"

echo "SQLite snapshot created: /.snapshots/@db-sqlite-$TIMESTAMP"
```

## Redis 快照策略

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# 触发后台保存
redis-cli BGSAVE

# 等待保存完成
while [ "$(redis-cli LASTSAVE)" = "$(redis-cli LASTSAVE)" ]; do
  sleep 1
done

# 快照数据目录
sudo btrfs subvolume snapshot -r /var/lib/db "/.snapshots/@db-redis-$TIMESTAMP"

echo "Redis snapshot created: /.snapshots/@db-redis-$TIMESTAMP"
```

## 数据库快照保留

由于数据变化，数据库快照比系统快照消耗更多空间。配置激进的清理：

```
时间线：
  ├── 最近 48 小时：每小时快照（48 个快照）
  ├── 最近 2 周：每天快照（14 个快照）
  ├── 最近 2 个月：每周快照（8 个快照）
  └── 最近 6 个月：每月快照（6 个快照）

保留总计：约 76 个快照
估计空间：数据库大小的 2-5 倍（取决于变化）
```

## 监控

```bash
# 检查数据库快照大小
sudo btrfs filesystem du -s /.snapshots/@db-*

# 检查独占空间（如果删除将释放）
sudo btrfs qgroup show -reF / | grep "db"

# 如果数据库快照超过阈值则警报
DB_SNAP_SIZE=$(sudo du -sb /.snapshots/@db-* 2>/dev/null | awk '{sum+=$1} END {print sum}')
DB_SNAP_GB=$((DB_SNAP_SIZE / 1073741824))
if [ "$DB_SNAP_GB" -gt 50 ]; then
  echo "WARNING: Database snapshots consuming ${DB_SNAP_GB}GB"
fi
```

## OpenClaw 集成

OpenClaw 可以作为其监控的一部分管理数据库快照：

```json
{
  "proposal_id": "prop-20240115-db-001",
  "issue": "Database snapshot age exceeds 12 hours",
  "proposed_actions": [
    {
      "tier": 1,
      "action": "database-snapshot",
      "command": "db-snapshot",
      "impact": "Creates consistent snapshot of PostgreSQL",
      "risk": "low"
    }
  ]
}
```

:::tip 测试您的恢复
未经过测试的备份不是备份。安排定期恢复测试：

```bash
# 恢复到临时位置并验证
sudo btrfs subvolume snapshot /.snapshots/@db-20240115-120000 /tmp/db-test
sudo -u postgres pg_isready -h /tmp/db-test
sudo btrfs subvolume delete /tmp/db-test
```
:::

## 下一步

数据库快照已配置为保持一致。接下来，我们将把所有内容整合到一个涵盖每种故障场景的[灾难恢复计划](./disaster-recovery)中。
