---
sidebar:
  order: 14
title: FAQ
---

# Frequently Asked Questions

## Btrfs & Snapshots

### Why Btrfs instead of ZFS?

Both are excellent copy-on-write filesystems. We chose Btrfs because:

| Factor | Btrfs | ZFS |
|---|---|---|
| Linux kernel integration | Mainline kernel, no DKMS | Requires kernel module (license conflict) |
| NixOS support | First-class, disko native | Supported but more complex setup |
| Memory requirements | Low overhead | Recommends 1 GB RAM per TB of storage |
| Send/receive | Native, incremental | Native, incremental |
| Snapshot performance | Instant | Instant |

ZFS is a valid choice — if you prefer it, the architecture translates directly (replace subvolumes with datasets, `btrfs send` with `zfs send`).

### How much disk space do snapshots use?

Snapshots are copy-on-write — they only consume space as files diverge from the original. In practice:

- **System snapshots** (@root): 100-500 MB per snapshot (config changes are small)
- **Database snapshots** (@db): Proportional to data churn (high-write DBs can use 10-30% of DB size per snapshot)
- **Typical total**: 2-5 GB for 30 days of hourly system snapshots on a server with moderate activity

Monitor with:

```bash
sudo btrfs qgroup show -reF /
```

### My disk is almost full — what do I do?

1. **Clean up old snapshots first** — they're usually the biggest consumer:

```bash
# Force cleanup of timeline snapshots
sudo snapper -c root cleanup timeline
sudo snapper -c db cleanup timeline

# Delete specific old snapshots
sudo snapper -c root delete 1-50
```

2. **Check Nix store** — old generations accumulate:

```bash
sudo nix-collect-garbage --delete-older-than 14d
```

3. **Check compression** — ensure zstd is active:

```bash
sudo compsize /
```

### Can I use Btrfs RAID with this setup?

Yes. Modify `disk-config.nix` to include multiple disks in the Btrfs pool. For production, RAID1 for metadata is strongly recommended even on single-disk systems:

```nix
extraArgs = [ "-f" "-m" "raid1" "-d" "raid1" ];
```

For multi-disk RAID, define additional disks in the disko config and add them to the same Btrfs pool.

### What happens if a snapshot is corrupted?

Btrfs checksums all data and metadata. If a snapshot has bit rot, `btrfs scrub` will detect it:

```bash
sudo btrfs scrub start /
sudo btrfs scrub status /
```

With RAID1 or `dup` metadata, Btrfs can self-heal. Without redundancy, you'll need to restore from remote backup (`btrfs send/receive`).

## NixOS & System Management

### Can I use this on an existing NixOS server?

Yes. Skip Chapter 1 (`nixos-anywhere`) and start from Chapter 2. Add the Btrfs subvolume layout to your existing disko or fstab config, then apply the Snapper, OpenClaw, and TOTP modules incrementally.

:::warning
Migrating an existing ext4 root to Btrfs requires a backup-and-restore. You cannot convert a live root filesystem in place.
:::

### How many NixOS generations should I keep?

At least 3-5. The boot menu shows recent generations as fallback options. Configure in `configuration.nix`:

```nix
boot.loader.systemd-boot.configurationLimit = 10;
```

Each generation is small (a few MB of symlinks) — keeping 10+ is cheap.

### `nixos-rebuild` is slow — how do I speed it up?

1. **Build on a faster machine** and copy the result:

```bash
nixos-rebuild switch --flake .#server \
  --target-host admin@SERVER_IP \
  --build-host localhost \
  --use-remote-sudo
```

2. **Use binary caches** — add Cachix or your own Nix cache:

```nix
nix.settings.substituters = [ "https://cache.nixos.org" "https://your-cache.cachix.org" ];
```

3. **Pin nixpkgs** — avoid unnecessary rebuilds by not updating the flake lock unless needed.

### Does this work on ARM (aarch64) servers?

Yes. Change `system = "x86_64-linux"` to `system = "aarch64-linux"` in `flake.nix`. All components (Btrfs, Snapper, pam_oath) support ARM. Make sure your `nixos-anywhere` target is also aarch64.

## OpenClaw & AI Operations

### Can I use a different LLM instead of Claude?

Yes. OpenClaw's LLM backend is configurable:

```nix
services.openclaw.settings.llm = {
  # OpenAI
  provider = "openai";
  model = "gpt-4o";
  apiKeyFile = "/run/secrets/openai-api-key";

  # Or local model via Ollama
  provider = "ollama";
  model = "llama3:70b";
  endpoint = "http://localhost:11434";
};
```

Local models avoid network dependency and API costs, but may produce lower-quality analysis.

### What if OpenClaw goes into a restart loop?

The policy engine has built-in protections:

1. **Per-service restart limit** (default: 3 per hour) — after 3 restarts, the service is marked as needing human intervention
2. **Global rate limit** (default: 5 actions/hour) — prevents runaway automation
3. **Emergency stop** — create `/var/lib/openclaw/STOP` to halt all autonomous actions immediately:

```bash
sudo touch /var/lib/openclaw/STOP
```

### How do I review what OpenClaw has done?

```bash
# Recent actions
sudo tail -50 /var/log/openclaw/audit.jsonl | jq '.timestamp + " " + .action + " " + .status'

# Failed actions only
sudo cat /var/log/openclaw/audit.jsonl | jq 'select(.status == "failed")'

# Actions by tier
sudo cat /var/log/openclaw/audit.jsonl | jq -r '.tier' | sort | uniq -c
```

### Can OpenClaw manage multiple servers?

OpenClaw runs per-server. For multi-server management, deploy OpenClaw on each server with its own policy config. Centralize audit logs by shipping them to a log aggregator (Loki, Elasticsearch, or a simple syslog receiver).

### What's the cost of running OpenClaw with a cloud LLM?

Depends on monitoring interval and issue frequency. Typical usage:

| Activity | Tokens/day | Cost/month (est.) |
|---|---|---|
| Health monitoring (60s interval) | ~10K | ~$0.50 |
| Issue analysis (5 issues/day) | ~50K | ~$2.50 |
| Config generation (2 proposals/day) | ~20K | ~$1.00 |
| **Total** | **~80K** | **~$4/month** |

Local models (Ollama) eliminate API costs at the expense of higher server resource usage.

## TOTP & Security

### I lost my TOTP device — how do I regain access?

1. Access the server via your VPS provider's **web console** (KVM/IPMI/VNC)
2. Boot into rescue mode or single-user mode
3. Mount and edit:

```bash
mount /dev/sda2 /mnt -o subvol=@root
# Remove the pam_oath line temporarily
vim /mnt/etc/pam.d/sudo
# Or replace the TOTP secret
echo "HOTP/T30/6 admin - $(head -c 20 /dev/urandom | base32 | tr -d '=' | head -c 32)" > /mnt/etc/users.oath
```

4. Reboot, re-enroll with a new device, then `safe-rebuild switch` to restore PAM config

:::tip Prevention
Always keep a backup of your TOTP secret key in a password manager or printed in a safe.
:::

### Can an attacker bypass TOTP if they have root?

If an attacker already has root, TOTP cannot protect you — they can modify PAM config, read secrets, or bypass sudo entirely. TOTP protects against **privilege escalation** (attacker has shell but not root) and **AI overreach** (OpenClaw can't execute destructive commands without a code).

For full compromise scenarios, see the [Disaster Recovery chapter](./disaster-recovery#scenario-6-compromised-server).

### Is TOTP sufficient for production security?

TOTP is one layer in a defense-in-depth strategy. For production, also consider:

- **SSH key-only authentication** (already configured in Chapter 1)
- **Fail2ban** or **SSHGuard** for brute-force protection
- **Network-level firewalls** (VPC security groups, iptables)
- **Audit logging** (auditd, OpenClaw's audit trail)
- **Hardware security keys** (U2F/FIDO2 via `pam_u2f` as a TOTP alternative)

### Does the TOTP window=3 setting weaken security?

`window=3` accepts codes within a 90-second window (3 x 30-second time steps). This compensates for minor clock drift between your server and authenticator app. The risk is minimal — an attacker would need to intercept a code and use it within 90 seconds. If you want tighter security, set `window=1` (30 seconds) but ensure your server's NTP is very accurate.

## Disaster Recovery

### How do I test my disaster recovery plan?

1. **Spin up a test server** (same VPS provider, cheapest tier)
2. Run `nixos-anywhere` with the same flake
3. Receive backup snapshots via `btrfs send/receive`
4. Verify services come up and data is intact
5. Test TOTP enrollment and authentication
6. Destroy the test server

Do this quarterly. Document any issues and update the runbook.

### What if all my snapshots are deleted?

If local snapshots are gone, your recovery options are:

1. **Remote backups** via `btrfs send/receive` (configured in Chapter 3)
2. **NixOS generations** — the system config can be rebuilt from the flake (data is lost, but system state is reproducible)
3. **WAL archive** — for PostgreSQL, WAL files in `/var/lib/db/wal-archive/` can replay transactions to a point-in-time

This is why remote backups are critical. Local snapshots protect against bad changes; remote backups protect against disk failure and data loss.

### How fast is a full restore from remote backup?

Depends on backup size and network speed between backup server and new server:

| Data Size | 100 Mbps | 1 Gbps |
|---|---|---|
| 10 GB | ~15 min | ~2 min |
| 50 GB | ~70 min | ~7 min |
| 100 GB | ~140 min | ~14 min |

The `nixos-anywhere` installation itself takes 5-15 minutes. Total RTO for a full disk failure is typically **30-60 minutes** for a moderately sized server.

## Monitoring & Observability

### How do I set up monitoring for this stack?

The tutorial focuses on the core infrastructure. For monitoring, add:

```nix
# Prometheus node exporter (system metrics)
services.prometheus.exporters.node = {
  enable = true;
  enabledCollectors = [ "systemd" "filesystem" "diskstats" ];
};

# Promtail for log shipping (to Loki/Grafana)
services.promtail = {
  enable = true;
  configuration = {
    # ... configure to ship to your Loki instance
  };
};
```

OpenClaw exposes Prometheus metrics at `localhost:9101/metrics` — scrape it with your Prometheus instance.

### What alerts should I set up?

At minimum:

| Alert | Condition | Severity |
|---|---|---|
| Disk usage high | Btrfs usage > 85% | Warning |
| Snapshot too old | Last root snapshot > 2 hours old | Warning |
| Remote backup stale | Last backup > 36 hours old | Critical |
| OpenClaw down | Service not running | Critical |
| Failed systemd units | Any unit in failed state > 10 min | Warning |
| TOTP time drift | Server clock > 30s from NTP | Critical |
| Btrfs errors | `btrfs device stats` shows errors | Critical |
