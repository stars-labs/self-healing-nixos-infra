import React, { useState } from 'react';

const scenarios = [
  {
    id: 'memory',
    icon: '🧠',
    title: { en: 'High Memory Usage', zh: '内存使用率过高' },
    desc: { en: 'Memory at 93%, app-worker using 4.2GB', zh: '内存 93%，app-worker 占用 4.2GB' },
    actions: [
      {
        action: { en: 'Restart app-worker', zh: '重启 app-worker' },
        tier: 1,
        risk: 'LOW',
        result: {
          en: 'Service restarted. Memory dropped to 45%.',
          zh: '服务已重启，内存降至 45%。',
        },
        auto: true,
      },
      {
        action: { en: 'Increase memory limit in config', zh: '修改配置增大内存限制' },
        tier: 3,
        risk: 'MEDIUM',
        result: {
          en: 'Requires TOTP approval. Config change + nixos-rebuild needed.',
          zh: '需要 TOTP 审批，需修改配置并执行 nixos-rebuild。',
        },
        auto: false,
      },
    ],
  },
  {
    id: 'disk',
    icon: '💾',
    title: { en: 'Disk 87% Full', zh: '磁盘使用率 87%' },
    desc: {
      en: 'Root partition running low on space',
      zh: '根分区空间即将不足',
    },
    actions: [
      {
        action: { en: 'Clean old snapshots', zh: '清理旧快照' },
        tier: 1,
        risk: 'LOW',
        result: {
          en: 'Removed 15 snapshots older than 30 days. Disk at 62%.',
          zh: '已删除 15 个超过 30 天的快照，磁盘降至 62%。',
        },
        auto: true,
      },
      {
        action: { en: 'Run nix-collect-garbage', zh: '执行 nix-collect-garbage' },
        tier: 2,
        risk: 'LOW',
        result: {
          en: 'Notified admin. Will auto-apply in 30 min if no objection.',
          zh: '已通知管理员，30 分钟内无异议将自动执行。',
        },
        auto: false,
      },
    ],
  },
  {
    id: 'ssh-brute',
    icon: '🔐',
    title: { en: 'SSH Brute Force Detected', zh: '检测到 SSH 暴力破解' },
    desc: {
      en: '50 failed SSH attempts from 203.0.113.42 in 5 min',
      zh: '5 分钟内来自 203.0.113.42 的 50 次 SSH 登录失败',
    },
    actions: [
      {
        action: { en: 'Ban IP via Fail2ban', zh: '通过 Fail2ban 封禁 IP' },
        tier: 1,
        risk: 'LOW',
        result: {
          en: 'IP 203.0.113.42 banned for 1 hour. Fail2ban jail active.',
          zh: 'IP 203.0.113.42 已被封禁 1 小时，Fail2ban 规则已生效。',
        },
        auto: true,
      },
      {
        action: { en: 'Change SSH port', zh: '修改 SSH 端口' },
        tier: 3,
        risk: 'HIGH',
        result: {
          en: 'Requires TOTP. Firewall + SSH config change. Risk: lockout.',
          zh: '需要 TOTP 验证。需修改防火墙 + SSH 配置。风险：可能锁定自己。',
        },
        auto: false,
      },
    ],
  },
  {
    id: 'cert',
    icon: '📜',
    title: { en: 'TLS Certificate Expiring', zh: 'TLS 证书即将过期' },
    desc: {
      en: 'Certificate for grafana.example.com expires in 7 days',
      zh: 'grafana.example.com 证书将在 7 天后过期',
    },
    actions: [
      {
        action: { en: 'Trigger ACME renewal', zh: '触发 ACME 续签' },
        tier: 2,
        risk: 'LOW',
        result: {
          en: 'Admin notified. Auto-apply in 15 min. ACME renewal queued.',
          zh: '已通知管理员，15 分钟后自动执行，ACME 续签已排队。',
        },
        auto: false,
      },
      {
        action: { en: 'Generate self-signed cert', zh: '生成自签名证书' },
        tier: 3,
        risk: 'MEDIUM',
        result: {
          en: 'Requires TOTP. Temporary fix — clients may see warnings.',
          zh: '需要 TOTP 验证。临时方案 — 客户端可能看到安全警告。',
        },
        auto: false,
      },
    ],
  },
  {
    id: 'db-crash',
    icon: '🗄️',
    title: { en: 'PostgreSQL Crash Loop', zh: 'PostgreSQL 崩溃循环' },
    desc: {
      en: 'PostgreSQL restarted 3 times in 10 minutes',
      zh: 'PostgreSQL 在 10 分钟内重启了 3 次',
    },
    actions: [
      {
        action: { en: 'Check logs & report', zh: '检查日志并报告' },
        tier: 1,
        risk: 'LOW',
        result: {
          en: 'Logs collected. Error: shared_buffers too large after config change.',
          zh: '日志已收集。错误：配置变更后 shared_buffers 过大。',
        },
        auto: true,
      },
      {
        action: { en: 'Rollback to last snapshot', zh: '回滚到上一个快照' },
        tier: 3,
        risk: 'HIGH',
        result: {
          en: 'Requires TOTP. snapper undochange restores DB + config.',
          zh: '需要 TOTP 验证。snapper undochange 恢复数据库 + 配置。',
        },
        auto: false,
      },
    ],
  },
];

const tierColors = {
  1: '#27ae60',
  2: '#f39c12',
  3: '#e74c3c',
};

const tierLabels = {
  1: { en: 'Tier 1 — Autonomous', zh: 'Tier 1 — 自治级' },
  2: { en: 'Tier 2 — Supervised', zh: 'Tier 2 — 监督级' },
  3: { en: 'Tier 3 — TOTP Gated', zh: 'Tier 3 — TOTP 审批级' },
};

const riskColors = {
  LOW: '#27ae60',
  MEDIUM: '#f39c12',
  HIGH: '#e74c3c',
};

const styles = {
  container: {
    fontFamily: 'var(--ifm-font-family-base)',
    margin: '2rem 0',
    padding: '1.5rem',
    borderRadius: '12px',
    background: 'var(--ifm-background-surface-color, #f8f9fa)',
    border: '1px solid var(--ifm-color-emphasis-200)',
  },
  title: {
    fontSize: '1.1rem',
    fontWeight: 700,
    marginBottom: '1rem',
  },
  scenarioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  scenarioCard: (active) => ({
    padding: '0.75rem',
    borderRadius: '8px',
    border: `2px solid ${active ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-200)'}`,
    background: active ? 'var(--ifm-color-primary-lightest, #e8f0fe)' : 'var(--ifm-background-color)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
  }),
  scenarioIcon: {
    fontSize: '1.5rem',
    marginBottom: '0.25rem',
  },
  scenarioTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  detailBox: {
    padding: '1.25rem',
    borderRadius: '10px',
    background: 'var(--ifm-background-color)',
    border: '1px solid var(--ifm-color-emphasis-200)',
  },
  alertBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    background: '#fff3cd',
    border: '1px solid #ffc107',
    marginBottom: '1rem',
    color: '#856404',
  },
  actionCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginTop: '1rem',
  },
  actionCard: (selected) => ({
    padding: '1rem',
    borderRadius: '8px',
    border: `2px solid ${selected ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-200)'}`,
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: selected ? 'var(--ifm-color-primary-lightest, #e8f0fe)' : 'transparent',
  }),
  tierBadge: (tier) => ({
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#fff',
    background: tierColors[tier],
    marginRight: '0.5rem',
  }),
  riskBadge: (risk) => ({
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#fff',
    background: riskColors[risk],
  }),
  actionTitle: {
    fontWeight: 600,
    fontSize: '0.95rem',
    marginTop: '0.5rem',
  },
  resultBox: (tier) => ({
    marginTop: '1rem',
    padding: '1rem',
    borderRadius: '8px',
    borderLeft: `4px solid ${tierColors[tier]}`,
    background: 'var(--ifm-background-surface-color)',
  }),
  resultTitle: {
    fontWeight: 700,
    fontSize: '0.85rem',
    marginBottom: '0.5rem',
  },
  resultText: {
    fontSize: '0.85rem',
    color: 'var(--ifm-font-color-secondary)',
    fontFamily: 'var(--ifm-font-family-monospace)',
  },
  autoBadge: {
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.65rem',
    fontWeight: 700,
    color: '#fff',
    background: '#3498db',
    marginLeft: '0.5rem',
  },
};

export default function TierSimulator({ lang = 'en' }) {
  const [activeScenario, setActiveScenario] = useState('memory');
  const [selectedAction, setSelectedAction] = useState(null);

  const scenario = scenarios.find((s) => s.id === activeScenario);

  const handleScenarioChange = (id) => {
    setActiveScenario(id);
    setSelectedAction(null);
  };

  return (
    <div style={styles.container}>
      <h4 style={styles.title}>
        {lang === 'zh'
          ? '🎮 OpenClaw 决策模拟器'
          : '🎮 OpenClaw Decision Simulator'}
      </h4>

      <div style={styles.scenarioGrid}>
        {scenarios.map((s) => (
          <div
            key={s.id}
            style={styles.scenarioCard(activeScenario === s.id)}
            onClick={() => handleScenarioChange(s.id)}
          >
            <div style={styles.scenarioIcon}>{s.icon}</div>
            <div style={styles.scenarioTitle}>{s.title[lang] || s.title.en}</div>
          </div>
        ))}
      </div>

      {scenario && (
        <div style={styles.detailBox}>
          <div style={styles.alertBanner}>
            <span style={{ fontSize: '1.5rem' }}>{scenario.icon}</span>
            <div>
              <strong>{scenario.title[lang] || scenario.title.en}</strong>
              <br />
              <span style={{ fontSize: '0.85rem' }}>
                {scenario.desc[lang] || scenario.desc.en}
              </span>
            </div>
          </div>

          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {lang === 'zh' ? 'OpenClaw 提议的操作：' : 'OpenClaw proposed actions:'}
          </div>

          <div style={styles.actionCards}>
            {scenario.actions.map((a, i) => (
              <div
                key={i}
                style={styles.actionCard(selectedAction === i)}
                onClick={() => setSelectedAction(i)}
              >
                <div>
                  <span style={styles.tierBadge(a.tier)}>
                    {tierLabels[a.tier][lang] || tierLabels[a.tier].en}
                  </span>
                  <span style={styles.riskBadge(a.risk)}>
                    {lang === 'zh' ? '风险' : 'Risk'}: {a.risk}
                  </span>
                  {a.auto && (
                    <span style={styles.autoBadge}>
                      {lang === 'zh' ? '自动' : 'AUTO'}
                    </span>
                  )}
                </div>
                <div style={styles.actionTitle}>{a.action[lang] || a.action.en}</div>
              </div>
            ))}
          </div>

          {selectedAction !== null && (
            <div style={styles.resultBox(scenario.actions[selectedAction].tier)}>
              <div style={styles.resultTitle}>
                {lang === 'zh' ? '📋 执行结果：' : '📋 Execution Result:'}
              </div>
              <div style={styles.resultText}>
                {scenario.actions[selectedAction].result[lang] ||
                  scenario.actions[selectedAction].result.en}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
