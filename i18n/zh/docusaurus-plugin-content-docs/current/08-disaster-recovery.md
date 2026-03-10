---
sidebar_position: 10
title: 灾难恢复
---

# Disaster Recovery

This chapter is the runbook. It covers every major failure scenario, the detection method, and step-by-step recovery procedures. Print this page and keep it accessible — you'll need it when things go wrong.

## Recovery Matrix

| Scenario | RTO | RPO | Method |
|---|---|---|---|
| Bad nixos-rebuild (services broken) | 2 min | 0 | Snapper rollback or NixOS generation |
| Bad nixos-rebuild (won't boot) | 5 min | 0 | GRUB previous generation |
| Database corruption | 10 min | Up to 6 hours | Btrfs snapshot restore |
| Accidental file deletion | 2 min | Up to 1 hour | Snapper undochange |
| Full disk failure | 30 min | Up to 24 hours | Remote backup restore |
| Compromised server | 1 hour | Variable | Clean reinstall from flake |
| Lost TOTP device | 15 min | 0 | Console access recovery |

:::note RTO and RPO
**RTO** (Recovery Time Objective) — how long recovery takes.
**RPO** (Recovery Point Objective) — maximum data loss window.
:::

## Scenario 1: Bad nixos-rebuild (Services Broken)

**Symptoms**: Services crash, application errors, networking issues after a rebuild.

**Detection**:
```bash
# Check for failed services
systemctl --failed

# Check recent rebuild
journalctl -u nixos-rebuild --since "1 hour ago"
```

**Recovery Option A — Snapper Rollback**:
```bash
# List recent snapshots (find the pre-rebuild snapshot)
sudo snapper -c root list

# Output:
#  # | Type | Pre # | Date                | Description
#  5 | pre  |       | 2024-01-15 10:30:00 | nixos-rebuild switch
#  6 | post |     5 | 2024-01-15 10:32:15 | nixos-rebuild switch (exit: 0)

# Undo changes since snapshot #5
sudo snapper -c root undochange 5..0

# Restart affected services
sudo systemctl daemon-reload
sudo systemctl restart nginx postgresql
```

**Recovery Option B — NixOS Generation Rollback**:
```bash
# List generations
sudo nix-env --list-generations -p /nix/var/nix/profiles/system

# Switch to previous generation
sudo nix-env --switch-generation 41 -p /nix/var/nix/profiles/system
sudo /nix/var/nix/profiles/system/bin/switch-to-configuration switch
```

## Scenario 2: Bad nixos-rebuild (Won't Boot)

**Symptoms**: Server doesn't come back after `nixos-rebuild boot` + reboot.

**Recovery**:

1. Access the server console via your VPS provider's web console or KVM
2. At the GRUB menu, select a previous NixOS generation (listed as "NixOS - Configuration XX")
3. The system boots into the known-good generation
4. Fix the configuration:

```bash
# Check what's different in the current (broken) generation
diff <(nixos-rebuild dry-run 2>&1) <(cat /run/current-system/nixos-version)

# Fix the configuration
vim /etc/nixos/configuration.nix

# Rebuild with the fixed config
safe-rebuild switch
```

:::tip Always Keep 3+ Generations
Ensure your bootloader keeps multiple generations:

```nix
# In configuration.nix
boot.loader.systemd-boot.configurationLimit = 10;
```

This keeps the last 10 generations in the boot menu.
:::

## Scenario 3: Database Corruption

**Symptoms**: Application errors, PostgreSQL won't start, data inconsistency.

**Detection**:
```bash
# Check PostgreSQL status
sudo systemctl status postgresql
sudo journalctl -u postgresql --since "1 hour ago"

# Try to connect
sudo -u postgres psql -c "SELECT 1;"
```

**Recovery**:
```bash
# List database snapshots
ls -la /.snapshots/@db-*

# Stop PostgreSQL
sudo systemctl stop postgresql

# Move corrupted data aside
sudo mv /var/lib/db /var/lib/db-corrupted-$(date +%Y%m%d-%H%M%S)

# Restore from last known-good snapshot
sudo btrfs subvolume snapshot /.snapshots/@db-20240115-060000 /var/lib/db

# Fix ownership
sudo chown -R postgres:postgres /var/lib/db

# Start PostgreSQL
sudo systemctl start postgresql

# Verify
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_user_tables;"
```

**After recovery**:
```bash
# Check for any WAL files that can be replayed for point-in-time recovery
ls -la /var/lib/db/wal-archive/

# If WAL replay is possible:
sudo -u postgres pg_resetwal /var/lib/db/postgresql
```

## Scenario 4: Accidental File Deletion

**Symptoms**: Missing files, broken configs, deleted user data.

**Recovery**:
```bash
# Find the file in a recent snapshot
sudo snapper -c root list

# Check if file exists in snapshot #5
ls /.snapshots/5/snapshot/path/to/deleted/file

# Restore a single file
sudo cp /.snapshots/5/snapshot/path/to/deleted/file /path/to/deleted/file

# Or restore an entire directory
sudo cp -a /.snapshots/5/snapshot/etc/nginx/ /etc/nginx/
```

## Scenario 5: Full Disk Failure

**Symptoms**: I/O errors, filesystem read-only, server unresponsive.

**Prerequisites**: You have remote backups via `btrfs send/receive` (configured in [Chapter 3](./btrfs-snapshots)).

**Recovery**:

```bash
# On the NEW replacement server:

# Step 1: Install NixOS via nixos-anywhere (same as initial setup)
nix run github:nix-community/nixos-anywhere -- \
  --flake .#server \
  --target-host root@NEW_SERVER_IP

# Step 2: SSH into the new server
ssh admin@NEW_SERVER_IP

# Step 3: Receive the backup snapshots from the backup server
# Mount the Btrfs partition
sudo mount /dev/sda2 /mnt

# Receive the root snapshot
ssh backup-server "sudo btrfs send /backups/server1/@root-backup-20240115" | \
  sudo btrfs receive /mnt/

# Rename received snapshot to @root
sudo btrfs subvolume delete /mnt/@root
sudo btrfs subvolume snapshot /mnt/@root-backup-20240115 /mnt/@root

# Receive the database snapshot
ssh backup-server "sudo btrfs send /backups/server1/@db-backup-20240115" | \
  sudo btrfs receive /mnt/
sudo btrfs subvolume delete /mnt/@db
sudo btrfs subvolume snapshot /mnt/@db-backup-20240115 /mnt/@db

# Step 4: Unmount and reboot
sudo umount /mnt
sudo reboot
```

## Scenario 6: Compromised Server

**Symptoms**: Suspicious processes, unauthorized users, modified binaries, unexpected network connections.

**Response**:

```bash
# IMMEDIATE: Isolate the server
# Via VPS provider: disconnect from network / enable firewall-only mode

# From a CLEAN machine — do NOT trust the compromised server's tools

# Step 1: Snapshot the compromised state (forensics)
# If you still have access:
ssh root@COMPROMISED_IP "btrfs subvolume snapshot -r / /.snapshots/@root-compromised"

# Step 2: Reinstall from scratch using your flake
# This guarantees a clean system — NixOS is declarative
nix run github:nix-community/nixos-anywhere -- \
  --flake .#server \
  --target-host root@SERVER_IP

# Step 3: Restore data from a KNOWN-GOOD backup
# Only restore data, not system files — system comes from the flake
ssh backup-server "sudo btrfs send /backups/server1/@db-backup-KNOWN_GOOD" | \
  ssh root@SERVER_IP "sudo btrfs receive /.snapshots/"

# Step 4: Rotate all credentials
# - SSH keys
# - TOTP secrets
# - API keys
# - Database passwords
# - OpenClaw API key
```

:::danger Do Not Trust the Compromised System
After a compromise, reinstall from your flake — do not try to "clean" the existing system. NixOS makes this practical because the entire system state is defined in code. Only restore **data** from backups, not system files.
:::

## Scenario 7: Lost TOTP Device

**Symptoms**: Cannot authenticate sudo, locked out of administrative commands.

**Recovery**:

1. Access the server console via VPS provider (web console / KVM / IPMI)
2. Boot into a rescue system or single-user mode
3. Mount and edit the TOTP configuration:

```bash
# Mount the root filesystem
mount /dev/sda2 /mnt -o subvol=@root

# Option A: Remove TOTP requirement temporarily
# Edit the PAM config to comment out pam_oath
vim /mnt/etc/pam.d/sudo

# Option B: Replace the TOTP secret
# Generate new secret
NEW_SECRET=$(head -c 20 /dev/urandom | base32 | tr -d '=' | head -c 32)
echo "HOTP/T30/6 admin - $NEW_SECRET" > /mnt/etc/users.oath
chmod 600 /mnt/etc/users.oath

# Unmount and reboot
umount /mnt
reboot
```

4. After reboot, enroll the new TOTP secret on your new device
5. Rebuild NixOS to restore the proper PAM configuration

## Recovery Checklist

Use this checklist after any recovery:

```
□ System boots and all services are running
  systemctl --failed  (should show 0 units)

□ Data integrity verified
  sudo -u postgres psql -c "SELECT count(*) FROM critical_table;"

□ Snapshots are being taken again
  sudo snapper -c root list  (verify recent timeline entries)

□ OpenClaw is operational
  sudo systemctl status openclaw

□ TOTP authentication works
  sudo echo "test"  (should prompt for TOTP)

□ Remote backups resumed
  Check backup timer: systemctl status btrfs-backup.timer

□ Monitoring and alerting is active
  Check metrics endpoint: curl localhost:9101/metrics

□ Root cause documented
  What happened, why, how it was fixed, how to prevent recurrence
```

## Backup Verification Schedule

| Check | Frequency | Method |
|---|---|---|
| Snapper is creating snapshots | Daily | `snapper -c root list \| tail -5` |
| Remote backup is running | Daily | `systemctl status btrfs-backup.timer` |
| Backup can be restored | Monthly | Test restore to temporary subvolume |
| Full disaster recovery | Quarterly | Restore to a test server from backup |
| TOTP recovery path works | Quarterly | Test console access + TOTP reset |

:::warning Test Your Runbook
An untested disaster recovery plan is just documentation. Schedule quarterly DR drills where you actually restore from backup to a test server. Update this runbook with any issues found during drills.
:::

## What's Next

We've covered recovery for every failure mode. The final chapter brings it all together with [AI safety and rollback workflows](./ai-safety-and-rollback) — the operating procedures for day-to-day AI-managed infrastructure.
