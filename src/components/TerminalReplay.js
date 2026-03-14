import React, { useState, useEffect, useRef, useCallback } from 'react';

const demos = {
  rollback: {
    title: { en: 'Instant Rollback Demo', zh: '快照回滚演示' },
    lines: [
      { prompt: true, text: 'sudo nixos-rebuild switch', delay: 800 },
      { text: 'building Nix...', delay: 600 },
      { text: 'activating the configuration...', delay: 500 },
      { text: '\x1b[31mJob for postgresql.service failed.\x1b[0m', delay: 400 },
      { text: '\x1b[31m× postgresql.service - PostgreSQL Server\x1b[0m', delay: 300 },
      { text: '', delay: 400 },
      { prompt: true, text: '# Health check failed! Auto-rollback triggered...', delay: 1000 },
      { text: '', delay: 300 },
      { prompt: true, text: 'sudo snapper -c root undochange 41..42', delay: 800 },
      { text: 'create:0 modify:23 delete:0', delay: 500 },
      { text: '\x1b[32m✓ Snapshot 42 changes reverted\x1b[0m', delay: 400 },
      { text: '', delay: 300 },
      { prompt: true, text: 'sudo nixos-rebuild switch', delay: 800 },
      { text: 'building Nix...', delay: 600 },
      { text: 'activating the configuration...', delay: 500 },
      { text: '\x1b[32m✓ system activation successful\x1b[0m', delay: 400 },
      { text: '', delay: 300 },
      { prompt: true, text: 'systemctl status postgresql', delay: 600 },
      { text: '\x1b[32m● postgresql.service - PostgreSQL Server\x1b[0m', delay: 300 },
      { text: '   Active: \x1b[32mactive (running)\x1b[0m since ...', delay: 300 },
      { text: '', delay: 300 },
      { text: '\x1b[32m✓ System recovered in 12 seconds\x1b[0m', delay: 0 },
    ],
  },
  openclaw: {
    title: { en: 'OpenClaw AI Operations', zh: 'OpenClaw AI 运维演示' },
    lines: [
      { text: '\x1b[36m[openclaw]\x1b[0m Starting monitoring cycle...', delay: 600 },
      { text: '\x1b[36m[monitor]\x1b[0m Querying Prometheus metrics...', delay: 500 },
      { text: '\x1b[33m[alert]\x1b[0m Memory usage: 92% (threshold: 90%)', delay: 600 },
      { text: '\x1b[36m[analyze]\x1b[0m Identifying high-memory processes...', delay: 800 },
      { text: '\x1b[36m[analyze]\x1b[0m app-worker: 4.2 GB (RSS), uptime: 72h', delay: 500 },
      { text: '\x1b[36m[analyze]\x1b[0m Likely memory leak detected', delay: 600 },
      { text: '', delay: 300 },
      { text: '\x1b[33m[propose]\x1b[0m Action: restart app-worker.service', delay: 500 },
      { text: '\x1b[33m[propose]\x1b[0m Tier: 1 (Autonomous)', delay: 400 },
      { text: '\x1b[33m[propose]\x1b[0m Risk: LOW | Reversible: YES', delay: 400 },
      { text: '', delay: 300 },
      { text: '\x1b[36m[snapshot]\x1b[0m Creating pre-change snapshot...', delay: 600 },
      { text: '\x1b[36m[snapshot]\x1b[0m @root/.snapshots/42 created', delay: 400 },
      { text: '', delay: 300 },
      { text: '\x1b[33m[execute]\x1b[0m systemctl restart app-worker.service', delay: 800 },
      { text: '\x1b[36m[verify]\x1b[0m Running health checks...', delay: 800 },
      { text: '\x1b[36m[verify]\x1b[0m Memory: 45% ✓  Service: active ✓  HTTP 200 ✓', delay: 500 },
      { text: '', delay: 300 },
      { text: '\x1b[32m[commit]\x1b[0m Change committed. Audit logged.', delay: 500 },
      { text: '\x1b[32m[commit]\x1b[0m Post-snapshot @root/.snapshots/43 created', delay: 0 },
    ],
  },
  snapshot: {
    title: { en: 'Btrfs Snapshot & Restore', zh: 'Btrfs 快照与恢复' },
    lines: [
      { prompt: true, text: '# Create pre-upgrade snapshot', delay: 600 },
      { prompt: true, text: 'sudo snapper -c root create -t pre -d "pre-upgrade"', delay: 800 },
      { text: '42', delay: 400 },
      { text: '', delay: 300 },
      { prompt: true, text: '# List snapshots', delay: 500 },
      { prompt: true, text: 'sudo snapper -c root list', delay: 600 },
      { text: '  # | Type   | Pre | Date                     | Description', delay: 200 },
      { text: '----+--------+-----+--------------------------+------------', delay: 200 },
      { text: '  0 | single |     |                          | current', delay: 200 },
      { text: ' 40 | single |     | 2024-03-14 02:00:01      | timeline', delay: 200 },
      { text: ' 41 | pre    |     | 2024-03-14 10:15:22      | pre-upgrade', delay: 200 },
      { text: ' 42 | post   |  41 | 2024-03-14 10:16:45      | post-upgrade', delay: 200 },
      { text: '', delay: 400 },
      { prompt: true, text: '# Compare what changed', delay: 500 },
      { prompt: true, text: 'sudo snapper -c root status 41..42', delay: 600 },
      { text: 'c.... /etc/nixos/configuration.nix', delay: 200 },
      { text: '+.... /etc/nginx/nginx.conf', delay: 200 },
      { text: 'c.... /etc/systemd/system/app.service', delay: 200 },
      { text: '', delay: 400 },
      { prompt: true, text: '# Check snapshot space usage', delay: 500 },
      { prompt: true, text: 'sudo btrfs filesystem du -s /.snapshots/*', delay: 600 },
      { text: '  Total   Exclusive  Set shared  Filename', delay: 200 },
      { text: '  2.1GiB  112.5MiB   1.9GiB      /.snapshots/40/snapshot', delay: 200 },
      { text: '  2.1GiB   48.2MiB   2.0GiB      /.snapshots/41/snapshot', delay: 200 },
      { text: '  2.1GiB   52.8MiB   2.0GiB      /.snapshots/42/snapshot', delay: 0 },
    ],
  },
};

function parseAnsi(text) {
  const parts = [];
  const regex = /\x1b\[(\d+)m/g;
  let lastIndex = 0;
  let currentColor = null;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), color: currentColor });
    }
    const code = parseInt(match[1]);
    if (code === 0) currentColor = null;
    else if (code === 31) currentColor = '#e74c3c';
    else if (code === 32) currentColor = '#27ae60';
    else if (code === 33) currentColor = '#f39c12';
    else if (code === 36) currentColor = '#3498db';
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), color: currentColor });
  }

  return parts;
}

const styles = {
  container: {
    margin: '2rem 0',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid #333',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
  },
  titleBar: {
    background: '#2d2d2d',
    padding: '0.5rem 1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #444',
  },
  dots: {
    display: 'flex',
    gap: '6px',
  },
  dot: (color) => ({
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: color,
  }),
  titleText: {
    color: '#aaa',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  controls: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  termBtn: {
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    border: '1px solid #555',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  body: {
    background: '#1a1a2e',
    padding: '1rem 1.25rem',
    minHeight: '320px',
    maxHeight: '420px',
    overflowY: 'auto',
    fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
    fontSize: '0.85rem',
    lineHeight: '1.6',
  },
  line: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  prompt: {
    color: '#27ae60',
  },
  cursor: {
    display: 'inline-block',
    width: '8px',
    height: '1.1em',
    background: '#27ae60',
    verticalAlign: 'text-bottom',
    animation: 'blink 1s step-end infinite',
  },
  tabBar: {
    display: 'flex',
    gap: 0,
    background: '#1e1e1e',
    borderBottom: '1px solid #333',
  },
  tab: (active) => ({
    padding: '0.5rem 1rem',
    background: active ? '#1a1a2e' : '#2d2d2d',
    color: active ? '#fff' : '#888',
    border: 'none',
    borderBottom: active ? '2px solid #3498db' : '2px solid transparent',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontFamily: 'var(--ifm-font-family-base)',
    transition: 'all 0.2s',
  }),
};

export default function TerminalReplay({ lang = 'en' }) {
  const [activeDemo, setActiveDemo] = useState('rollback');
  const [visibleLines, setVisibleLines] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const bodyRef = useRef(null);

  const demo = demos[activeDemo];

  const reset = useCallback(() => {
    setVisibleLines([]);
    setLineIndex(0);
    setPlaying(false);
  }, []);

  useEffect(() => {
    reset();
  }, [activeDemo, reset]);

  useEffect(() => {
    if (!playing || lineIndex >= demo.lines.length) {
      if (lineIndex >= demo.lines.length) setPlaying(false);
      return;
    }
    const line = demo.lines[lineIndex];
    const timer = setTimeout(() => {
      setVisibleLines((prev) => [...prev, line]);
      setLineIndex((i) => i + 1);
    }, line.delay || 300);
    return () => clearTimeout(timer);
  }, [playing, lineIndex, demo.lines]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [visibleLines]);

  const play = () => {
    if (lineIndex >= demo.lines.length) {
      reset();
      setTimeout(() => setPlaying(true), 50);
    } else {
      setPlaying(true);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.titleBar}>
        <div style={styles.dots}>
          <div style={styles.dot('#ff5f57')} />
          <div style={styles.dot('#ffbd2e')} />
          <div style={styles.dot('#28c840')} />
        </div>
        <span style={styles.titleText}>{demo.title[lang] || demo.title.en}</span>
        <div style={styles.controls}>
          <button style={styles.termBtn} onClick={playing ? () => setPlaying(false) : play}>
            {playing ? '⏸' : '▶'}
          </button>
          <button style={styles.termBtn} onClick={reset}>↺</button>
        </div>
      </div>

      <div style={styles.tabBar}>
        {Object.entries(demos).map(([key, d]) => (
          <button
            key={key}
            style={styles.tab(activeDemo === key)}
            onClick={() => setActiveDemo(key)}
          >
            {d.title[lang] || d.title.en}
          </button>
        ))}
      </div>

      <div ref={bodyRef} style={styles.body}>
        <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
        {visibleLines.map((line, i) => (
          <div key={i} style={styles.line}>
            {line.prompt && <span style={styles.prompt}>{'root@nixos:~# '}</span>}
            {parseAnsi(line.text).map((part, j) => (
              <span key={j} style={part.color ? { color: part.color } : { color: '#e0e0e0' }}>
                {part.text}
              </span>
            ))}
          </div>
        ))}
        {playing && <span style={styles.cursor} />}
        {!playing && visibleLines.length === 0 && (
          <div style={{ color: '#555', textAlign: 'center', paddingTop: '120px' }}>
            {lang === 'zh' ? '点击 ▶ 开始演示' : 'Click ▶ to start demo'}
          </div>
        )}
      </div>
    </div>
  );
}
