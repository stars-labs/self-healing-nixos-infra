import Translate from '@docusaurus/Translate';
import React from 'react';

export const scenarios = [
  {
    id: 'high-memory',
    icon: '💾',
    title: <Translate id="demo.tier.scenario.memory.title">High Memory Usage (95%)</Translate>,
    description: <Translate id="demo.tier.scenario.memory.desc">Server memory usage has exceeded 95% threshold</Translate>,
    actions: [
      {
        tier: 1,
        label: <Translate id="demo.tier.scenario.memory.t1">Restart Service</Translate>,
        result: <Translate id="demo.tier.scenario.memory.t1.result">Restarted the memory-leaking service. Memory dropped to 62%. Quick fix but may recur.</Translate>,
        risk: 'low',
      },
      {
        tier: 2,
        label: <Translate id="demo.tier.scenario.memory.t2">Add Swap Space</Translate>,
        result: <Translate id="demo.tier.scenario.memory.t2.result">Added 4GB swap file and configured swappiness. Memory pressure relieved. Requires monitoring.</Translate>,
        risk: 'medium',
      },
      {
        tier: 3,
        label: <Translate id="demo.tier.scenario.memory.t3">Rebuild with Memory Limits</Translate>,
        result: <Translate id="demo.tier.scenario.memory.t3.result">Ran nixos-rebuild with systemd memory limits (MemoryMax=2G) for the service. Permanent fix with Btrfs snapshot rollback available.</Translate>,
        risk: 'high',
      },
    ],
  },
  {
    id: 'disk-full',
    icon: '💿',
    title: <Translate id="demo.tier.scenario.disk.title">Disk Full</Translate>,
    description: <Translate id="demo.tier.scenario.disk.desc">Root filesystem is at 98% capacity</Translate>,
    actions: [
      {
        tier: 1,
        label: <Translate id="demo.tier.scenario.disk.t1">Clean Temp Files</Translate>,
        result: <Translate id="demo.tier.scenario.disk.t1.result">Removed old Nix generations and temp files. Freed 8GB. Disk usage now at 74%.</Translate>,
        risk: 'low',
      },
      {
        tier: 2,
        label: <Translate id="demo.tier.scenario.disk.t2">Expand Partition</Translate>,
        result: <Translate id="demo.tier.scenario.disk.t2.result">Expanded Btrfs filesystem online. No downtime. New capacity: 100GB.</Translate>,
        risk: 'medium',
      },
      {
        tier: 3,
        label: <Translate id="demo.tier.scenario.disk.t3">Rebuild Storage Config</Translate>,
        result: <Translate id="demo.tier.scenario.disk.t3.result">Ran nixos-rebuild with updated storage configuration including Btrfs compression (zstd). Pre-rebuild snapshot taken.</Translate>,
        risk: 'high',
      },
    ],
  },
  {
    id: 'ssh-brute',
    icon: '🔐',
    title: <Translate id="demo.tier.scenario.ssh.title">SSH Brute Force Attack</Translate>,
    description: <Translate id="demo.tier.scenario.ssh.desc">Detected 500+ failed SSH login attempts from a single IP</Translate>,
    actions: [
      {
        tier: 1,
        label: <Translate id="demo.tier.scenario.ssh.t1">Block IP</Translate>,
        result: <Translate id="demo.tier.scenario.ssh.t1.result">Blocked attacker IP via iptables. Immediate threat neutralized. Temporary fix.</Translate>,
        risk: 'low',
      },
      {
        tier: 2,
        label: <Translate id="demo.tier.scenario.ssh.t2">Update Firewall Rules</Translate>,
        result: <Translate id="demo.tier.scenario.ssh.t2.result">Updated nftables rules with rate limiting and geo-blocking. Applied without rebuild.</Translate>,
        risk: 'medium',
      },
      {
        tier: 3,
        label: <Translate id="demo.tier.scenario.ssh.t3">Reconfigure SSH</Translate>,
        result: <Translate id="demo.tier.scenario.ssh.t3.result">Ran nixos-rebuild with hardened sshd config: key-only auth, fail2ban, port change. Snapshot taken pre-rebuild.</Translate>,
        risk: 'high',
      },
    ],
  },
  {
    id: 'cert-expired',
    icon: '📜',
    title: <Translate id="demo.tier.scenario.cert.title">TLS Certificate Expired</Translate>,
    description: <Translate id="demo.tier.scenario.cert.desc">HTTPS certificate has expired, causing service outage</Translate>,
    actions: [
      {
        tier: 1,
        label: <Translate id="demo.tier.scenario.cert.t1">Renew Certificate</Translate>,
        result: <Translate id="demo.tier.scenario.cert.t1.result">Ran certbot renew. New certificate valid for 90 days. Service restored.</Translate>,
        risk: 'low',
      },
      {
        tier: 2,
        label: <Translate id="demo.tier.scenario.cert.t2">Update ACME Config</Translate>,
        result: <Translate id="demo.tier.scenario.cert.t2.result">Updated ACME configuration with auto-renewal timer and monitoring alerts.</Translate>,
        risk: 'medium',
      },
      {
        tier: 3,
        label: <Translate id="demo.tier.scenario.cert.t3">Rebuild with New CA</Translate>,
        result: <Translate id="demo.tier.scenario.cert.t3.result">Ran nixos-rebuild with security.acme configuration for automatic Let's Encrypt. Snapshot taken. Permanent fix.</Translate>,
        risk: 'high',
      },
    ],
  },
  {
    id: 'db-crash',
    icon: '🗄️',
    title: <Translate id="demo.tier.scenario.db.title">Database Crash</Translate>,
    description: <Translate id="demo.tier.scenario.db.desc">PostgreSQL has crashed due to corrupted WAL files</Translate>,
    actions: [
      {
        tier: 1,
        label: <Translate id="demo.tier.scenario.db.t1">Restart PostgreSQL</Translate>,
        result: <Translate id="demo.tier.scenario.db.t1.result">Restarted PostgreSQL with pg_resetwal. Service running but data integrity uncertain.</Translate>,
        risk: 'low',
      },
      {
        tier: 2,
        label: <Translate id="demo.tier.scenario.db.t2">Restore from Replica</Translate>,
        result: <Translate id="demo.tier.scenario.db.t2.result">Promoted standby replica to primary. 30 seconds of data loss. Service restored.</Translate>,
        risk: 'medium',
      },
      {
        tier: 3,
        label: <Translate id="demo.tier.scenario.db.t3">Full Rollback from Snapshot</Translate>,
        result: <Translate id="demo.tier.scenario.db.t3.result">Restored database from last Btrfs snapshot. nixos-rebuild with updated PostgreSQL config. Zero data loss from snapshot point.</Translate>,
        risk: 'high',
      },
    ],
  },
];
