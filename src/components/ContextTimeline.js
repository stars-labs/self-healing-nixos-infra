import React, { useState, useEffect, useCallback } from 'react';

/**
 * ContextTimeline - Visualizes how OpenClaw maintains context across
 * multiple operations, correlating events and building system knowledge.
 */

const timelineData = {
  correlated: {
    title: { en: 'Event Correlation', zh: '事件关联' },
    desc: {
      en: 'Watch how OpenClaw links related events into a coherent incident instead of treating them independently.',
      zh: '观察 OpenClaw 如何将相关事件关联为一个完整的事件链，而非独立处理。',
    },
    events: [
      {
        time: '10:00',
        type: 'metric',
        source: 'Prometheus',
        title: { en: 'Memory rising: 72%', zh: '内存上升：72%' },
        context: { en: 'Normal range. Logged to baseline.', zh: '正常范围，已记录基线。' },
        color: '#3498db',
        contextState: {
          memory: [72],
          incidents: [],
          knowledge: [],
        },
      },
      {
        time: '10:15',
        type: 'metric',
        source: 'Prometheus',
        title: { en: 'Memory rising: 81%', zh: '内存上升：81%' },
        context: {
          en: 'Trend detected: +9% in 15min. Correlated with app-worker process growth.',
          zh: '检测到趋势：15 分钟内 +9%，与 app-worker 进程增长相关。',
        },
        color: '#f39c12',
        contextState: {
          memory: [72, 81],
          incidents: ['INC-001: Memory trend anomaly'],
          knowledge: [],
        },
      },
      {
        time: '10:22',
        type: 'log',
        source: 'Loki',
        title: { en: 'app-worker: GC pause 800ms', zh: 'app-worker: GC 暂停 800ms' },
        context: {
          en: 'Correlated to INC-001. GC pressure confirms memory leak hypothesis.',
          zh: '关联至 INC-001。GC 压力证实内存泄漏假设。',
        },
        color: '#f39c12',
        contextState: {
          memory: [72, 81, 84],
          incidents: ['INC-001: Memory trend + GC pressure'],
          knowledge: ['app-worker: GC-sensitive under memory pressure'],
        },
      },
      {
        time: '10:30',
        type: 'metric',
        source: 'Prometheus',
        title: { en: 'Memory: 91% — threshold breached', zh: '内存：91% — 超过阈值' },
        context: {
          en: 'INC-001 escalated. Context: 30min trend, GC evidence. Decision: restart (not just alert).',
          zh: 'INC-001 升级。上下文：30 分钟趋势 + GC 证据。决策：重启（非仅告警）。',
        },
        color: '#e74c3c',
        contextState: {
          memory: [72, 81, 84, 91],
          incidents: ['INC-001: ESCALATED — action required'],
          knowledge: ['app-worker: GC-sensitive under memory pressure'],
        },
      },
      {
        time: '10:31',
        type: 'action',
        source: 'OpenClaw',
        title: { en: 'Tier 1: Restart app-worker', zh: 'Tier 1：重启 app-worker' },
        context: {
          en: 'Action informed by 30min context. Snapshot #42 taken. Restart with confidence — root cause identified.',
          zh: '操作基于 30 分钟上下文。已创建快照 #42。已识别根因，信心重启。',
        },
        color: '#27ae60',
        contextState: {
          memory: [72, 81, 84, 91, 45],
          incidents: ['INC-001: RESOLVED — restart effective'],
          knowledge: [
            'app-worker: GC-sensitive under memory pressure',
            'app-worker: restart resolves memory leak (uptime >48h)',
          ],
        },
      },
      {
        time: '10:32',
        type: 'learn',
        source: 'Context Store',
        title: { en: 'Knowledge updated', zh: '知识库已更新' },
        context: {
          en: 'Pattern saved: app-worker leaks memory after 48h uptime → restart resolves. Next time: proactive restart before threshold.',
          zh: '模式已保存：app-worker 运行 48h 后内存泄漏 → 重启可解决。下次：阈值前主动重启。',
        },
        color: '#9b59b6',
        contextState: {
          memory: [72, 81, 84, 91, 45],
          incidents: ['INC-001: RESOLVED + pattern learned'],
          knowledge: [
            'app-worker: GC-sensitive under memory pressure',
            'app-worker: restart resolves memory leak (uptime >48h)',
            'PATTERN: proactive restart at 48h uptime',
          ],
        },
      },
    ],
  },
  session: {
    title: { en: 'Operation Session Continuity', zh: '操作会话连续性' },
    desc: {
      en: 'A multi-step upgrade operation where OpenClaw maintains session context across steps, rollback boundaries, and decision points.',
      zh: '一个多步骤升级操作，OpenClaw 在各步骤、回滚边界和决策点之间维持会话上下文。',
    },
    events: [
      {
        time: 'S1',
        type: 'session',
        source: 'OpenClaw',
        title: { en: 'Session opened: PostgreSQL upgrade', zh: '会话开启：PostgreSQL 升级' },
        context: {
          en: 'Session SES-042 created. Goal: upgrade PG 15→16. Rollback boundary set.',
          zh: '会话 SES-042 已创建。目标：PG 15→16 升级。回滚边界已设定。',
        },
        color: '#3498db',
        contextState: {
          session: 'SES-042: PostgreSQL 15→16',
          steps: ['Plan'],
          rollbackPoint: 'None yet',
        },
      },
      {
        time: 'S2',
        type: 'action',
        source: 'OpenClaw',
        title: { en: 'Pre-flight checks', zh: '预检查' },
        context: {
          en: 'Context from history: last PG upgrade (v14→15) had shared_buffers issue. Adding extra validation.',
          zh: '来自历史上下文：上次 PG 升级 (v14→15) 出现 shared_buffers 问题，增加额外验证。',
        },
        color: '#f39c12',
        contextState: {
          session: 'SES-042: PostgreSQL 15→16',
          steps: ['Plan', 'Pre-flight'],
          rollbackPoint: 'None yet',
        },
      },
      {
        time: 'S3',
        type: 'snapshot',
        source: 'Btrfs',
        title: { en: 'Snapshot: @db #15, @root #42', zh: '快照：@db #15, @root #42' },
        context: {
          en: 'Session rollback point created. Both DB data and system config captured atomically.',
          zh: '会话回滚点已创建。数据库数据和系统配置已原子性捕获。',
        },
        color: '#9b59b6',
        contextState: {
          session: 'SES-042: PostgreSQL 15→16',
          steps: ['Plan', 'Pre-flight', 'Snapshot'],
          rollbackPoint: '@db#15 + @root#42',
        },
      },
      {
        time: 'S4',
        type: 'action',
        source: 'OpenClaw',
        title: { en: 'Step 1: pg_dumpall (backup)', zh: '步骤 1：pg_dumpall（备份）' },
        context: {
          en: 'Logical backup as extra safety. Session tracks: dump completed in 2m34s, 1.2GB.',
          zh: '逻辑备份作为额外安全措施。会话记录：备份完成 2m34s，1.2GB。',
        },
        color: '#27ae60',
        contextState: {
          session: 'SES-042: PostgreSQL 15→16',
          steps: ['Plan', 'Pre-flight', 'Snapshot', 'Backup ✓'],
          rollbackPoint: '@db#15 + @root#42 + pg_dump',
        },
      },
      {
        time: 'S5',
        type: 'action',
        source: 'OpenClaw',
        title: { en: 'Step 2: nixos-rebuild (PG 16)', zh: '步骤 2：nixos-rebuild（PG 16）' },
        context: {
          en: 'TOTP approved. Nix config updated. Rebuild in progress. Session monitors PG startup.',
          zh: 'TOTP 已验证。Nix 配置已更新。重建进行中。会话监控 PG 启动。',
        },
        color: '#e67e22',
        contextState: {
          session: 'SES-042: PostgreSQL 15→16',
          steps: ['Plan', 'Pre-flight', 'Snapshot', 'Backup ✓', 'Rebuild...'],
          rollbackPoint: '@db#15 + @root#42 + pg_dump',
        },
      },
      {
        time: 'S6',
        type: 'verify',
        source: 'OpenClaw',
        title: { en: 'Verify: PG 16 running, queries OK', zh: '验证：PG 16 运行中，查询正常' },
        context: {
          en: 'Session health check: connections OK, replication OK, no errors in log. Applying learned check from INC-019.',
          zh: '会话健康检查：连接正常、复制正常、日志无错误。应用 INC-019 的经验检查。',
        },
        color: '#27ae60',
        contextState: {
          session: 'SES-042: PostgreSQL 15→16',
          steps: ['Plan', 'Pre-flight', 'Snapshot', 'Backup ✓', 'Rebuild ✓', 'Verify ✓'],
          rollbackPoint: '@db#15 + @root#42 + pg_dump',
        },
      },
      {
        time: 'S7',
        type: 'learn',
        source: 'Context Store',
        title: { en: 'Session closed: SUCCESS', zh: '会话关闭：成功' },
        context: {
          en: 'SES-042 completed. Duration: 12min. Knowledge: PG 15→16 upgrade safe with current config. Pattern stored.',
          zh: 'SES-042 已完成。耗时：12 分钟。知识：当前配置下 PG 15→16 升级安全。模式已存储。',
        },
        color: '#9b59b6',
        contextState: {
          session: 'SES-042: COMPLETED',
          steps: ['Plan', 'Pre-flight', 'Snapshot', 'Backup ✓', 'Rebuild ✓', 'Verify ✓', 'Done ✓'],
          rollbackPoint: 'Released (kept 7 days)',
        },
      },
    ],
  },
  proactive: {
    title: { en: 'Proactive Intelligence', zh: '主动智能' },
    desc: {
      en: 'OpenClaw uses accumulated knowledge to prevent incidents before they happen.',
      zh: 'OpenClaw 利用积累的知识在事件发生前主动预防。',
    },
    events: [
      {
        time: 'D1',
        type: 'learn',
        source: 'Knowledge Base',
        title: { en: 'Pattern loaded: app-worker 48h leak', zh: '模式加载：app-worker 48h 泄漏' },
        context: {
          en: 'From INC-001 (3 days ago): app-worker leaks memory after 48h uptime.',
          zh: '来自 INC-001（3 天前）：app-worker 运行 48h 后发生内存泄漏。',
        },
        color: '#9b59b6',
        contextState: {
          patterns: ['app-worker: leak after 48h (confidence: HIGH)'],
          predictions: [],
          actions: [],
        },
      },
      {
        time: 'D2',
        type: 'metric',
        source: 'Prometheus',
        title: { en: 'app-worker uptime: 44h', zh: 'app-worker 运行时间：44h' },
        context: {
          en: 'Approaching 48h pattern threshold. Memory: 68% (normal). Proactive check scheduled.',
          zh: '接近 48h 模式阈值。内存：68%（正常）。已调度主动检查。',
        },
        color: '#3498db',
        contextState: {
          patterns: ['app-worker: leak after 48h (confidence: HIGH)'],
          predictions: ['app-worker restart needed in ~4h'],
          actions: [],
        },
      },
      {
        time: 'D3',
        type: 'action',
        source: 'OpenClaw',
        title: { en: 'Proactive: Schedule restart at 47h', zh: '主动：在 47h 调度重启' },
        context: {
          en: 'Pre-emptive restart before leak manifests. Scheduled during low-traffic window (03:00).',
          zh: '在泄漏发生前预防性重启。已安排在低流量窗口（03:00）执行。',
        },
        color: '#27ae60',
        contextState: {
          patterns: ['app-worker: leak after 48h (confidence: HIGH)'],
          predictions: ['app-worker restart needed in ~4h'],
          actions: ['Scheduled: restart at 03:00 (47h uptime)'],
        },
      },
      {
        time: 'D4',
        type: 'action',
        source: 'OpenClaw',
        title: { en: 'Tier 1: Graceful restart executed', zh: 'Tier 1：优雅重启已执行' },
        context: {
          en: '03:00 — Graceful restart. No user impact. Memory stayed under 70%. Incident prevented.',
          zh: '03:00 — 优雅重启。无用户影响。内存保持在 70% 以下。事件已预防。',
        },
        color: '#27ae60',
        contextState: {
          patterns: ['app-worker: leak after 48h (confidence: HIGH, proven: 2x)'],
          predictions: [],
          actions: ['Completed: proactive restart, 0 impact'],
        },
      },
      {
        time: 'D5',
        type: 'learn',
        source: 'Context Store',
        title: { en: 'Pattern reinforced + Tier 3 proposal', zh: '模式强化 + Tier 3 提案' },
        context: {
          en: 'Pattern confirmed 2nd time. Proposing permanent fix: add systemd timer for 36h restart cycle. Tier 3 (needs TOTP).',
          zh: '模式第 2 次确认。提议永久修复：添加 systemd 定时器实现 36h 重启周期。Tier 3（需 TOTP）。',
        },
        color: '#9b59b6',
        contextState: {
          patterns: ['app-worker: leak after 48h (confidence: HIGH, proven: 2x)'],
          predictions: ['Permanent fix proposed: 36h restart timer'],
          actions: ['Tier 3 proposal pending TOTP approval'],
        },
      },
    ],
  },
};

const typeIcons = {
  metric: '📊',
  log: '📝',
  action: '⚡',
  snapshot: '📸',
  session: '🔗',
  verify: '✅',
  learn: '🧠',
};

const styles = {
  outer: {
    fontFamily: 'var(--ifm-font-family-base)',
    margin: '2rem 0',
  },
  tabRow: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
  },
  tab: (active) => ({
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: `2px solid ${active ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-200)'}`,
    background: active ? 'var(--ifm-color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--ifm-font-color-base)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
    transition: 'all 0.2s',
  }),
  desc: {
    fontSize: '0.9rem',
    color: 'var(--ifm-font-color-secondary)',
    marginBottom: '1rem',
    lineHeight: 1.6,
  },
  controls: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  btn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid var(--ifm-color-emphasis-300)',
    background: 'transparent',
    color: 'var(--ifm-font-color-base)',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  mainArea: {
    display: 'grid',
    gridTemplateColumns: '1fr 300px',
    gap: '1rem',
  },
  mainAreaMobile: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '1rem',
  },
  timeline: {
    position: 'relative',
  },
  line: {
    position: 'absolute',
    left: '40px',
    top: 0,
    bottom: 0,
    width: '3px',
    background: 'var(--ifm-color-emphasis-200)',
    borderRadius: '2px',
  },
  event: (active, passed) => ({
    display: 'flex',
    gap: '0.75rem',
    padding: '0.6rem 0',
    position: 'relative',
    opacity: passed || active ? 1 : 0.3,
    transform: active ? 'translateX(4px)' : 'none',
    transition: 'all 0.5s ease',
  }),
  timeCol: {
    width: '36px',
    textAlign: 'right',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--ifm-font-color-secondary)',
    paddingTop: '0.5rem',
    fontFamily: 'var(--ifm-font-family-monospace)',
  },
  dot: (color, active) => ({
    width: '40px',
    height: '40px',
    minWidth: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.1rem',
    background: active ? color : 'var(--ifm-background-color)',
    border: `3px solid ${color}`,
    zIndex: 1,
    transition: 'all 0.4s',
    boxShadow: active ? `0 0 12px ${color}44` : 'none',
  }),
  eventBody: {
    flex: 1,
    minWidth: 0,
  },
  eventHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  sourceBadge: (color) => ({
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
    background: `${color}22`,
    color: color,
    border: `1px solid ${color}44`,
  }),
  eventTitle: (active) => ({
    fontWeight: 600,
    fontSize: '0.9rem',
    color: active ? 'var(--ifm-font-color-base)' : 'var(--ifm-font-color-secondary)',
  }),
  eventContext: {
    fontSize: '0.8rem',
    color: 'var(--ifm-font-color-secondary)',
    marginTop: '0.25rem',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  sidebar: {
    padding: '1rem',
    borderRadius: '10px',
    background: 'var(--ifm-background-surface-color, #f8f9fa)',
    border: '1px solid var(--ifm-color-emphasis-200)',
    fontSize: '0.8rem',
    position: 'sticky',
    top: '80px',
    maxHeight: 'calc(100vh - 120px)',
    overflowY: 'auto',
  },
  sidebarTitle: {
    fontWeight: 700,
    fontSize: '0.85rem',
    marginBottom: '0.75rem',
    paddingBottom: '0.5rem',
    borderBottom: '2px solid var(--ifm-color-emphasis-200)',
  },
  sidebarSection: {
    marginBottom: '0.75rem',
  },
  sidebarLabel: {
    fontWeight: 600,
    fontSize: '0.75rem',
    color: 'var(--ifm-font-color-secondary)',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  sidebarItem: {
    fontSize: '0.78rem',
    padding: '0.2rem 0.4rem',
    borderRadius: '4px',
    background: 'var(--ifm-background-color)',
    marginBottom: '0.25rem',
    fontFamily: 'var(--ifm-font-family-monospace)',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  chart: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    height: '40px',
    marginTop: '0.25rem',
  },
  chartBar: (value, max, color) => ({
    width: '20px',
    height: `${(value / max) * 100}%`,
    background: value > 85 ? '#e74c3c' : color,
    borderRadius: '2px 2px 0 0',
    transition: 'height 0.5s ease',
    minHeight: '2px',
  }),
};

export default function ContextTimeline({ lang = 'en' }) {
  const [activeTab, setActiveTab] = useState('correlated');
  const [currentStep, setCurrentStep] = useState(-1);
  const [playing, setPlaying] = useState(false);

  const data = timelineData[activeTab];
  const events = data.events;

  const reset = useCallback(() => {
    setCurrentStep(-1);
    setPlaying(false);
  }, []);

  useEffect(() => { reset(); }, [activeTab, reset]);

  useEffect(() => {
    if (!playing) return;
    if (currentStep >= events.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setCurrentStep((s) => s + 1), 2000);
    return () => clearTimeout(timer);
  }, [playing, currentStep, events.length]);

  const play = () => {
    if (currentStep >= events.length - 1) setCurrentStep(-1);
    setPlaying(true);
    if (currentStep < 0) setCurrentStep(0);
  };

  const contextState = currentStep >= 0 ? events[currentStep].contextState : null;

  const renderContextPanel = () => {
    if (!contextState) {
      return (
        <div style={{ color: 'var(--ifm-font-color-secondary)', textAlign: 'center', padding: '2rem 0' }}>
          {lang === 'zh' ? '点击播放查看上下文状态' : 'Play to see context state'}
        </div>
      );
    }

    if (activeTab === 'correlated') {
      const cs = contextState;
      return (
        <>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '内存趋势' : 'Memory Trend'}</div>
            <div style={styles.chart}>
              {(cs.memory || []).map((v, i) => (
                <div key={i} style={styles.chartBar(v, 100, '#3498db')} title={`${v}%`} />
              ))}
            </div>
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '活跃事件' : 'Active Incidents'}</div>
            {(cs.incidents || []).map((inc, i) => (
              <div key={i} style={styles.sidebarItem}>{inc}</div>
            ))}
            {(!cs.incidents || cs.incidents.length === 0) && (
              <div style={{ ...styles.sidebarItem, color: '#999' }}>
                {lang === 'zh' ? '无' : 'None'}
              </div>
            )}
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '知识库' : 'Knowledge Base'}</div>
            {(cs.knowledge || []).map((k, i) => (
              <div key={i} style={styles.sidebarItem}>{k}</div>
            ))}
            {(!cs.knowledge || cs.knowledge.length === 0) && (
              <div style={{ ...styles.sidebarItem, color: '#999' }}>
                {lang === 'zh' ? '暂无积累' : 'No entries yet'}
              </div>
            )}
          </div>
        </>
      );
    }

    if (activeTab === 'session') {
      const cs = contextState;
      return (
        <>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '会话' : 'Session'}</div>
            <div style={styles.sidebarItem}>{cs.session}</div>
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '步骤' : 'Steps'}</div>
            {(cs.steps || []).map((s, i) => (
              <div key={i} style={{
                ...styles.sidebarItem,
                color: s.includes('✓') ? '#27ae60' : s.includes('...') ? '#f39c12' : 'inherit',
              }}>{s}</div>
            ))}
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '回滚点' : 'Rollback Point'}</div>
            <div style={styles.sidebarItem}>{cs.rollbackPoint}</div>
          </div>
        </>
      );
    }

    if (activeTab === 'proactive') {
      const cs = contextState;
      return (
        <>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '已知模式' : 'Known Patterns'}</div>
            {(cs.patterns || []).map((p, i) => (
              <div key={i} style={styles.sidebarItem}>{p}</div>
            ))}
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '预测' : 'Predictions'}</div>
            {(cs.predictions || []).length > 0
              ? cs.predictions.map((p, i) => <div key={i} style={styles.sidebarItem}>{p}</div>)
              : <div style={{ ...styles.sidebarItem, color: '#999' }}>{lang === 'zh' ? '无' : 'None'}</div>
            }
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>{lang === 'zh' ? '操作' : 'Actions'}</div>
            {(cs.actions || []).length > 0
              ? cs.actions.map((a, i) => <div key={i} style={styles.sidebarItem}>{a}</div>)
              : <div style={{ ...styles.sidebarItem, color: '#999' }}>{lang === 'zh' ? '无' : 'None'}</div>
            }
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <div style={styles.outer}>
      <div style={styles.tabRow}>
        {Object.entries(timelineData).map(([key, d]) => (
          <button key={key} style={styles.tab(activeTab === key)} onClick={() => setActiveTab(key)}>
            {d.title[lang] || d.title.en}
          </button>
        ))}
      </div>

      <p style={styles.desc}>{data.desc[lang] || data.desc.en}</p>

      <div style={styles.controls}>
        <button style={styles.btn} onClick={playing ? () => setPlaying(false) : play}>
          {playing
            ? (lang === 'zh' ? '⏸ 暂停' : '⏸ Pause')
            : (lang === 'zh' ? '▶ 播放' : '▶ Play')}
        </button>
        <button style={styles.btn} onClick={reset}>
          {lang === 'zh' ? '↺ 重置' : '↺ Reset'}
        </button>
      </div>

      <div style={styles.mainArea}>
        <div style={styles.timeline}>
          <div style={styles.line} />
          {events.map((evt, i) => (
            <div key={i} style={styles.event(i === currentStep, i <= currentStep)}>
              <div style={styles.timeCol}>{evt.time}</div>
              <div style={styles.dot(evt.color, i <= currentStep)}>
                {typeIcons[evt.type] || '●'}
              </div>
              <div style={styles.eventBody}>
                <div style={styles.eventHeader}>
                  <span style={styles.sourceBadge(evt.color)}>{evt.source}</span>
                  <span style={styles.eventTitle(i === currentStep)}>
                    {evt.title[lang] || evt.title.en}
                  </span>
                </div>
                {i <= currentStep && (
                  <div style={styles.eventContext}>
                    {evt.context[lang] || evt.context.en}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.sidebar}>
          <div style={styles.sidebarTitle}>
            {lang === 'zh' ? '🧠 上下文状态' : '🧠 Context State'}
          </div>
          {renderContextPanel()}
        </div>
      </div>
    </div>
  );
}
