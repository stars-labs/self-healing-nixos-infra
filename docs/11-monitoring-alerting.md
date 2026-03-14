---
sidebar_position: 11
title: Monitoring & Alerting
---

# Monitoring & Alerting

OpenClaw needs **observability data** to detect issues and propose fixes. Without proper monitoring, the AI operator is flying blind. This chapter sets up a complete monitoring stack on NixOS: Prometheus for metrics, Grafana for dashboards, and Loki for log aggregation.

## Architecture Overview

```mermaid
flowchart LR
    subgraph Target["NixOS Server"]
        NE[Node Exporter<br/>System Metrics]
        SE[Systemd Exporter<br/>Service Metrics]
        BE[Btrfs Metrics<br/>Custom Script]
        P[Promtail<br/>Log Shipper]
        Prom[Prometheus]
        Loki[Loki]
        G[Grafana]
        OC[OpenClaw]
    end

    NE -->|scrape| Prom
    SE -->|scrape| Prom
    BE -->|scrape| Prom
    P -->|push| Loki
    Prom -->|query| G
    Loki -->|query| G
    Prom -->|alerts| OC
    Loki -->|alerts| OC
```

## Prometheus & Node Exporter

Node Exporter provides hardware and OS metrics (CPU, memory, disk, network). Prometheus scrapes and stores them.

```nix title="monitoring.nix"
{ config, pkgs, ... }:

{
  # Prometheus server
  services.prometheus = {
    enable = true;
    port = 9090;
    retentionTime = "30d";

    # Scrape targets
    scrapeConfigs = [
      {
        job_name = "node";
        static_configs = [{
          targets = [ "localhost:9100" ];
        }];
        scrape_interval = "15s";
      }
      {
        job_name = "systemd";
        static_configs = [{
          targets = [ "localhost:9558" ];
        }];
        scrape_interval = "30s";
      }
    ];

    # Alert rules
    rules = [
      (builtins.toJSON {
        groups = [{
          name = "system";
          rules = [
            {
              alert = "HighCPU";
              expr = ''100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85'';
              for = "5m";
              labels.severity = "warning";
              annotations.summary = "CPU usage above 85% for 5 minutes";
            }
            {
              alert = "HighMemory";
              expr = ''(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 90'';
              for = "5m";
              labels.severity = "warning";
              annotations.summary = "Memory usage above 90%";
            }
            {
              alert = "DiskSpaceLow";
              expr = ''(1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 > 85'';
              for = "2m";
              labels.severity = "critical";
              annotations.summary = "Disk usage above 85%";
            }
            {
              alert = "SystemdUnitFailed";
              expr = ''node_systemd_unit_state{state="failed"} == 1'';
              for = "1m";
              labels.severity = "critical";
              annotations.summary = "Systemd unit {{ $labels.name }} has failed";
            }
            {
              alert = "HighLoad";
              expr = ''node_load15 > on() count(node_cpu_seconds_total{mode="idle"}) by (instance) * 0.8'';
              for = "10m";
              labels.severity = "warning";
              annotations.summary = "15-minute load average exceeds 80% of CPU count";
            }
            {
              alert = "NetworkErrors";
              expr = ''rate(node_network_receive_errs_total[5m]) + rate(node_network_transmit_errs_total[5m]) > 10'';
              for = "5m";
              labels.severity = "warning";
              annotations.summary = "Network interface errors detected";
            }
          ];
        }];
      })
    ];
  };

  # Node Exporter — system metrics
  services.prometheus.exporters.node = {
    enable = true;
    port = 9100;
    enabledCollectors = [
      "cpu"
      "diskstats"
      "filesystem"
      "loadavg"
      "meminfo"
      "netdev"
      "netstat"
      "stat"
      "time"
      "vmstat"
      "systemd"
      "processes"
      "tcpstat"
    ];
  };

  # Systemd Exporter — service-level metrics
  services.prometheus.exporters.systemd = {
    enable = true;
    port = 9558;
  };

  # Firewall: only expose Grafana, keep Prometheus/Loki internal
  networking.firewall.allowedTCPPorts = [ 3000 ];
}
```

## Grafana Dashboards

Grafana provides visualization and is where operators (and OpenClaw) review system health.

```nix title="grafana.nix"
{ config, pkgs, ... }:

{
  services.grafana = {
    enable = true;
    settings = {
      server = {
        http_addr = "0.0.0.0";
        http_port = 3000;
        domain = "grafana.example.com";
      };
      security = {
        admin_user = "admin";
        # Change this! Use agenix/sops-nix in production
        admin_password = "$__file{/run/secrets/grafana-admin-password}";
      };
      # Disable public signup
      "auth.anonymous".enabled = false;
    };

    # Auto-provision data sources
    provision = {
      enable = true;
      datasources.settings.datasources = [
        {
          name = "Prometheus";
          type = "prometheus";
          url = "http://localhost:9090";
          isDefault = true;
        }
        {
          name = "Loki";
          type = "loki";
          url = "http://localhost:3100";
        }
      ];
    };
  };
}
```

## Loki & Promtail (Log Aggregation)

Loki stores logs. Promtail ships system and service logs to Loki. This enables OpenClaw to search and analyze logs for anomaly detection.

```nix title="loki.nix"
{ config, pkgs, ... }:

{
  # Loki log storage
  services.loki = {
    enable = true;
    configuration = {
      auth_enabled = false;
      server.http_listen_port = 3100;

      common = {
        path_prefix = "/var/lib/loki";
        storage.filesystem.chunks_directory = "/var/lib/loki/chunks";
        storage.filesystem.rules_directory = "/var/lib/loki/rules";
        replication_factor = 1;
        ring.kvstore.store = "inmemory";
        ring.instance_addr = "127.0.0.1";
      };

      schema_config.configs = [{
        from = "2024-01-01";
        store = "tsdb";
        object_store = "filesystem";
        schema = "v13";
        index = {
          prefix = "index_";
          period = "24h";
        };
      }];

      limits_config = {
        retention_period = "30d";
        max_query_length = "721h";
      };

      compactor = {
        working_directory = "/var/lib/loki/compactor";
        compaction_interval = "10m";
        retention_enabled = true;
        retention_delete_delay = "2h";
      };
    };
  };

  # Promtail log shipper
  services.promtail = {
    enable = true;
    configuration = {
      server = {
        http_listen_port = 9080;
        grpc_listen_port = 0;
      };

      positions.filename = "/var/lib/promtail/positions.yaml";

      clients = [{
        url = "http://localhost:3100/loki/api/v1/push";
      }];

      scrape_configs = [
        {
          job_name = "journal";
          journal = {
            max_age = "12h";
            labels.job = "systemd-journal";
          };
          relabel_configs = [{
            source_labels = [ "__journal__systemd_unit" ];
            target_label = "unit";
          }];
        }
        {
          job_name = "syslog";
          static_configs = [{
            targets = [ "localhost" ];
            labels = {
              job = "syslog";
              __path__ = "/var/log/*.log";
            };
          }];
        }
        {
          job_name = "openclaw";
          static_configs = [{
            targets = [ "localhost" ];
            labels = {
              job = "openclaw";
              __path__ = "/var/lib/openclaw/audit/*.log";
            };
          }];
        }
      ];
    };
  };
}
```

## Btrfs Snapshot Monitoring

Standard exporters don't cover Btrfs snapshot health. Use a custom script to expose snapshot metrics to Prometheus via the textfile collector.

```bash title="/usr/local/bin/btrfs-metrics.sh"
#!/usr/bin/env bash
# Generates Prometheus-compatible metrics for Btrfs health
# Run via systemd timer every 5 minutes

TEXTFILE_DIR="/var/lib/prometheus-node-exporter"
METRIC_FILE="${TEXTFILE_DIR}/btrfs.prom"
TMP_FILE="${METRIC_FILE}.tmp"

mkdir -p "$TEXTFILE_DIR"

{
  # Snapshot count per config
  for config in $(snapper list-configs --columns config | tail -n +3); do
    count=$(snapper -c "$config" list --columns number | tail -n +3 | wc -l)
    echo "btrfs_snapshot_count{config=\"$config\"} $count"

    # Age of latest snapshot (seconds)
    latest=$(snapper -c "$config" list --columns date | tail -1 | xargs -I{} date -d {} +%s 2>/dev/null || echo 0)
    now=$(date +%s)
    if [ "$latest" -gt 0 ]; then
      age=$((now - latest))
      echo "btrfs_snapshot_latest_age_seconds{config=\"$config\"} $age"
    fi
  done

  # Filesystem usage
  usage_json=$(btrfs filesystem usage -b / 2>/dev/null)
  if [ $? -eq 0 ]; then
    total=$(echo "$usage_json" | grep "Device size:" | awk '{print $3}')
    used=$(echo "$usage_json" | grep "Used:" | head -1 | awk '{print $2}')
    echo "btrfs_device_size_bytes $total"
    echo "btrfs_used_bytes $used"
  fi

  # Scrub status
  last_scrub=$(btrfs scrub status / 2>/dev/null | grep "finished" | head -1)
  if echo "$last_scrub" | grep -q "finished"; then
    echo "btrfs_scrub_healthy 1"
  else
    echo "btrfs_scrub_healthy 0"
  fi

  # Btrfs device errors
  errors=$(btrfs device stats / 2>/dev/null | awk '{sum += $NF} END {print sum}')
  echo "btrfs_device_errors_total ${errors:-0}"

} > "$TMP_FILE"

mv "$TMP_FILE" "$METRIC_FILE"
```

### NixOS Configuration for Btrfs Metrics

```nix title="btrfs-metrics.nix"
{ config, pkgs, ... }:

{
  # Install the script
  environment.etc."btrfs-metrics.sh" = {
    source = ./scripts/btrfs-metrics.sh;
    mode = "0755";
  };

  # Systemd service to generate metrics
  systemd.services.btrfs-metrics = {
    description = "Generate Btrfs metrics for Prometheus";
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "/etc/btrfs-metrics.sh";
    };
    path = with pkgs; [ btrfs-progs snapper coreutils gawk gnugrep ];
  };

  systemd.timers.btrfs-metrics = {
    description = "Run Btrfs metrics collection every 5 minutes";
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnBootSec = "2min";
      OnUnitActiveSec = "5min";
      RandomizedDelaySec = "30s";
    };
  };

  # Tell Node Exporter to read textfile metrics
  services.prometheus.exporters.node.extraFlags = [
    "--collector.textfile.directory=/var/lib/prometheus-node-exporter"
  ];
}
```

## Alert Rules for OpenClaw

These Prometheus alert rules are specifically designed for OpenClaw to consume and act on.

```nix title="alert-rules.nix"
{ config, ... }:

{
  services.prometheus.rules = [
    (builtins.toJSON {
      groups = [
        {
          name = "btrfs";
          rules = [
            {
              alert = "SnapshotTooOld";
              expr = ''btrfs_snapshot_latest_age_seconds{config="root"} > 86400'';
              for = "10m";
              labels.severity = "warning";
              annotations.summary = "Root snapshot is older than 24 hours";
            }
            {
              alert = "SnapshotSpaceHigh";
              expr = ''btrfs_snapshot_count{config="root"} > 100'';
              for = "5m";
              labels.severity = "warning";
              annotations.summary = "Too many root snapshots, cleanup needed";
            }
            {
              alert = "BtrfsDeviceErrors";
              expr = "btrfs_device_errors_total > 0";
              for = "1m";
              labels.severity = "critical";
              annotations.summary = "Btrfs device errors detected — run btrfs scrub";
            }
          ];
        }
        {
          name = "openclaw";
          rules = [
            {
              alert = "OpenClawDown";
              expr = ''up{job="openclaw"} == 0'';
              for = "2m";
              labels.severity = "critical";
              annotations.summary = "OpenClaw service is down";
            }
            {
              alert = "HighRollbackRate";
              expr = ''rate(openclaw_rollbacks_total[1h]) > 3'';
              for = "5m";
              labels.severity = "warning";
              annotations.summary = "OpenClaw has triggered more than 3 rollbacks in the last hour";
            }
            {
              alert = "TierThreePending";
              expr = ''openclaw_proposals_pending{tier="3"} > 0'';
              for = "30m";
              labels.severity = "warning";
              annotations.summary = "Tier 3 proposal waiting for TOTP approval for >30 minutes";
            }
          ];
        }
        {
          name = "services";
          rules = [
            {
              alert = "SSHDown";
              expr = ''node_systemd_unit_state{name="sshd.service",state="active"} != 1'';
              for = "1m";
              labels.severity = "critical";
              annotations.summary = "SSH service is not running";
            }
            {
              alert = "NTPOutOfSync";
              expr = "abs(node_timex_offset_seconds) > 0.5";
              for = "5m";
              labels.severity = "warning";
              annotations.summary = "System clock drift detected — TOTP may break";
            }
            {
              alert = "HighSwapUsage";
              expr = ''(node_memory_SwapTotal_bytes - node_memory_SwapFree_bytes) / node_memory_SwapTotal_bytes * 100 > 50'';
              for = "10m";
              labels.severity = "warning";
              annotations.summary = "Swap usage above 50%";
            }
          ];
        }
        {
          name = "certificates";
          rules = [
            {
              alert = "CertificateExpiringSoon";
              expr = ''(probe_ssl_earliest_cert_expiry - time()) / 86400 < 14'';
              for = "1h";
              labels.severity = "warning";
              annotations.summary = "TLS certificate expires in less than 14 days";
            }
          ];
        }
      ];
    })
  ];
}
```

## OpenClaw Monitoring Integration

Configure OpenClaw to query Prometheus and Loki for intelligent issue detection.

```nix title="openclaw-monitoring.nix"
{ config, pkgs, ... }:

{
  services.openclaw.settings.monitoring = {
    prometheus = {
      endpoint = "http://localhost:9090";
      # Queries OpenClaw runs periodically
      queries = {
        diskUsage = ''100 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100)'';
        memoryUsage = ''(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100'';
        cpuUsage = ''100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'';
        failedUnits = ''node_systemd_unit_state{state="failed"}'';
        loadAverage = "node_load15";
        networkErrors = ''rate(node_network_receive_errs_total[5m]) + rate(node_network_transmit_errs_total[5m])'';
        snapshotAge = ''btrfs_snapshot_latest_age_seconds'';
        btrfsErrors = "btrfs_device_errors_total";
      };
      pollingInterval = "60s";
    };

    loki = {
      endpoint = "http://localhost:3100";
      queries = {
        errors = ''{job="systemd-journal"} |= "error" | rate[5m] > 10'';
        oomKills = ''{job="systemd-journal"} |= "Out of memory"'';
        sshBruteForce = ''{unit="sshd.service"} |= "Failed password" | rate[5m] > 5'';
        openclaw = ''{job="openclaw"}'';
      };
    };
  };
}
```

## Verification

After applying the configuration, verify everything is running:

```bash
# Check all monitoring services
systemctl status prometheus grafana loki promtail

# Verify Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Check Prometheus alerts
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | {name: .labels.alertname, state: .state}'

# Verify Grafana is accessible
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health

# Check Loki is receiving logs
curl -s "http://localhost:3100/loki/api/v1/query?query={job=%22systemd-journal%22}&limit=5" | jq '.data.result | length'

# Verify Btrfs metrics are being generated
cat /var/lib/prometheus-node-exporter/btrfs.prom
```

Expected output:

```
btrfs_snapshot_count{config="root"} 12
btrfs_snapshot_count{config="home"} 8
btrfs_snapshot_count{config="db"} 24
btrfs_snapshot_latest_age_seconds{config="root"} 3420
btrfs_scrub_healthy 1
btrfs_device_errors_total 0
```

## Key Alerts Summary

| Alert | Severity | Threshold | OpenClaw Action |
|---|---|---|---|
| DiskSpaceLow | Critical | &gt;85% full | Tier 1: Clean snapshots/logs |
| SystemdUnitFailed | Critical | Any failed unit | Tier 1: Restart service |
| HighMemory | Warning | &gt;90% used | Tier 1: Identify & restart |
| SSHDown | Critical | SSH not active | Tier 3: Requires TOTP |
| SnapshotTooOld | Warning | &gt;24h since last | Tier 1: Trigger snapshot |
| BtrfsDeviceErrors | Critical | Any errors | Tier 3: Run scrub, alert |
| NTPOutOfSync | Warning | &gt;0.5s drift | Tier 1: Restart NTP |
| OpenClawDown | Critical | Service down | Human intervention |
| CertificateExpiringSoon | Warning | Less than 14 days | Tier 2: Renew cert |

:::tip OpenClaw Needs Metrics to Work
Without monitoring, OpenClaw can only react to service failures it directly observes. With Prometheus metrics and Loki logs, OpenClaw can **proactively** detect degradation before it becomes an outage — high memory trending, disk filling up, snapshot age creeping, certificate expiry approaching.
:::
