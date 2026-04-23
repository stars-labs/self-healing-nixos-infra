import React, { useState, useEffect, useCallback } from 'react';

const steps = [
  {
    id: 'detect',
    icon: '🔍',
    label: { en: 'Detect', zh: '检测' },
    desc: {
      en: 'OpenClaw detects high memory usage (92%)',
      zh: 'OpenClaw 检测到内存使用率过高 (92%)',
    },
    color: '#e74c3c',
  },
  {
    id: 'analyze',
    icon: '🧠',
    label: { en: 'Analyze', zh: '分析' },
    desc: {
      en: 'AI identifies leaking service: app-worker',
      zh: 'AI 识别出内存泄漏服务：app-worker',
    },
    color: '#f39c12',
  },
  {
    id: 'classify',
    icon: '📋',
    label: { en: 'Classify', zh: '分级' },
    desc: {
      en: 'Action classified as Tier 1 (Autonomous)',
      zh: '操作分类为 Tier 1（自治级）',
    },
    color: '#3498db',
  },
  {
    id: 'snapshot',
    icon: '📸',
    label: { en: 'Snapshot', zh: '快照' },
    desc: {
      en: 'Btrfs snapshot created: @root/.snapshots/42',
      zh: '已创建 Btrfs 快照：@root/.snapshots/42',
    },
    color: '#9b59b6',
  },
  {
    id: 'execute',
    icon: '⚡',
    label: { en: 'Execute', zh: '执行' },
    desc: {
      en: 'systemctl restart app-worker.service',
      zh: 'systemctl restart app-worker.service',
    },
    color: '#e67e22',
  },
  {
    id: 'verify',
    icon: '✅',
    label: { en: 'Verify', zh: '验证' },
    desc: {
      en: 'Health check passed — memory at 45%',
      zh: '健康检查通过 — 内存降至 45%',
    },
    color: '#27ae60',
  },
  {
    id: 'commit',
    icon: '🎉',
    label: { en: 'Commit', zh: '提交' },
    desc: {
      en: 'Change committed. Post-snapshot created.',
      zh: '变更已提交，已创建后置快照',
    },
    color: '#2ecc71',
  },
];

const failSteps = [
  {
    id: 'detect',
    icon: '🔍',
    label: { en: 'Detect', zh: '检测' },
    desc: {
      en: 'OpenClaw detects PostgreSQL connection errors',
      zh: 'OpenClaw 检测到 PostgreSQL 连接错误',
    },
    color: '#e74c3c',
  },
  {
    id: 'analyze',
    icon: '🧠',
    label: { en: 'Analyze', zh: '分析' },
    desc: {
      en: 'AI proposes config change to pg_hba.conf',
      zh: 'AI 提议修改 pg_hba.conf 配置',
    },
    color: '#f39c12',
  },
  {
    id: 'classify',
    icon: '📋',
    label: { en: 'Classify', zh: '分级' },
    desc: {
      en: 'Action classified as Tier 3 (TOTP required)',
      zh: '操作分类为 Tier 3（需要 TOTP）',
    },
    color: '#e74c3c',
  },
  {
    id: 'snapshot',
    icon: '📸',
    label: { en: 'Snapshot', zh: '快照' },
    desc: {
      en: 'Pre-change snapshot: @db/.snapshots/15',
      zh: '变更前快照：@db/.snapshots/15',
    },
    color: '#9b59b6',
  },
  {
    id: 'execute',
    icon: '⚡',
    label: { en: 'Execute', zh: '执行' },
    desc: {
      en: 'nixos-rebuild switch (after TOTP approval)',
      zh: 'nixos-rebuild switch（TOTP 验证后）',
    },
    color: '#e67e22',
  },
  {
    id: 'verify',
    icon: '❌',
    label: { en: 'Verify', zh: '验证' },
    desc: {
      en: 'Health check FAILED — PostgreSQL won\'t start',
      zh: '健康检查失败 — PostgreSQL 无法启动',
    },
    color: '#e74c3c',
  },
  {
    id: 'rollback',
    icon: '⏪',
    label: { en: 'Rollback', zh: '回滚' },
    desc: {
      en: 'Auto-rollback: snapper undochange 14..15',
      zh: '自动回滚：snapper undochange 14..15',
    },
    color: '#e74c3c',
  },
  {
    id: 'recovered',
    icon: '🔄',
    label: { en: 'Recovered', zh: '已恢复' },
    desc: {
      en: 'System restored. PostgreSQL healthy. Alert sent.',
      zh: '系统已恢复，PostgreSQL 正常，告警已发送',
    },
    color: '#27ae60',
  },
];

const styles = {
  container: {
    fontFamily: 'var(--ifm-font-family-base)',
    margin: '2rem 0',
    padding: '1.5rem',
    borderRadius: '12px',
    background: 'var(--ifm-background-surface-color, #f8f9fa)',
    border: '1px solid var(--ifm-color-emphasis-200, #dee2e6)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  title: {
    fontSize: '1.1rem',
    fontWeight: 700,
    margin: 0,
  },
  controls: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  btn: (active) => ({
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid var(--ifm-color-emphasis-300)',
    background: active ? 'var(--ifm-color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--ifm-font-color-base)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    transition: 'all 0.2s',
  }),
  timeline: {
    position: 'relative',
    padding: '0.5rem 0',
  },
  line: {
    position: 'absolute',
    left: '24px',
    top: '0',
    bottom: '0',
    width: '3px',
    background: 'var(--ifm-color-emphasis-200)',
    borderRadius: '2px',
  },
  step: (active, passed) => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    padding: '0.75rem 0',
    position: 'relative',
    opacity: passed || active ? 1 : 0.35,
    transform: active ? 'scale(1.02)' : 'scale(1)',
    transition: 'all 0.5s ease',
  }),
  dot: (color, active) => ({
    width: '48px',
    height: '48px',
    minWidth: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.3rem',
    background: active ? color : 'var(--ifm-background-color)',
    border: `3px solid ${color}`,
    zIndex: 1,
    transition: 'all 0.4s ease',
    boxShadow: active ? `0 0 16px ${color}44` : 'none',
  }),
  info: {
    flex: 1,
    paddingTop: '0.5rem',
  },
  stepLabel: (color, active) => ({
    fontWeight: 700,
    fontSize: '0.95rem',
    color: active ? color : 'var(--ifm-font-color-base)',
    transition: 'color 0.3s',
  }),
  stepDesc: {
    fontSize: '0.85rem',
    color: 'var(--ifm-font-color-secondary)',
    marginTop: '0.2rem',
    fontFamily: 'var(--ifm-font-family-monospace)',
  },
  progress: {
    height: '4px',
    borderRadius: '2px',
    background: 'var(--ifm-color-emphasis-200)',
    marginTop: '1rem',
    overflow: 'hidden',
  },
  progressBar: (pct, color) => ({
    height: '100%',
    width: `${pct}%`,
    background: color,
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  }),
};

export default function HealingWorkflow({ lang = 'en' }) {
  const [scenario, setScenario] = useState('success');
  const [currentStep, setCurrentStep] = useState(-1);
  const [playing, setPlaying] = useState(false);

  const currentSteps = scenario === 'success' ? steps : failSteps;

  const reset = useCallback(() => {
    setCurrentStep(-1);
    setPlaying(false);
  }, []);

  useEffect(() => {
    reset();
  }, [scenario, reset]);

  useEffect(() => {
    if (!playing) return;
    if (currentStep >= currentSteps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [playing, currentStep, currentSteps.length]);

  const play = () => {
    if (currentStep >= currentSteps.length - 1) {
      setCurrentStep(-1);
    }
    setPlaying(true);
    if (currentStep < 0) setCurrentStep(0);
  };

  const progressPct = currentStep < 0 ? 0 : ((currentStep + 1) / currentSteps.length) * 100;
  const progressColor = scenario === 'success' ? '#27ae60' : currentStep >= currentSteps.length - 2 ? '#27ae60' : '#e74c3c';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>
          {lang === 'zh' ? '🔄 自愈工作流演示' : '🔄 Self-Healing Workflow Demo'}
        </h4>
        <div style={styles.controls}>
          <button
            style={styles.btn(scenario === 'success')}
            onClick={() => setScenario('success')}
          >
            {lang === 'zh' ? '✅ 成功场景' : '✅ Success'}
          </button>
          <button
            style={styles.btn(scenario === 'failure')}
            onClick={() => setScenario('failure')}
          >
            {lang === 'zh' ? '❌ 失败回滚' : '❌ Failure + Rollback'}
          </button>
          <button style={styles.btn(false)} onClick={playing ? () => setPlaying(false) : play}>
            {playing
              ? (lang === 'zh' ? '⏸ 暂停' : '⏸ Pause')
              : (lang === 'zh' ? '▶ 播放' : '▶ Play')}
          </button>
          <button style={styles.btn(false)} onClick={reset}>
            {lang === 'zh' ? '↺ 重置' : '↺ Reset'}
          </button>
        </div>
      </div>

      <div style={styles.timeline}>
        <div style={styles.line} />
        {currentSteps.map((step, i) => (
          <div key={step.id + i} style={styles.step(i === currentStep, i <= currentStep)}>
            <div style={styles.dot(step.color, i <= currentStep)}>
              {step.icon}
            </div>
            <div style={styles.info}>
              <div style={styles.stepLabel(step.color, i === currentStep)}>
                {step.label[lang] || step.label.en}
              </div>
              {i <= currentStep && (
                <div style={styles.stepDesc}>
                  {step.desc[lang] || step.desc.en}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.progress}>
        <div style={styles.progressBar(progressPct, progressColor)} />
      </div>
    </div>
  );
}
