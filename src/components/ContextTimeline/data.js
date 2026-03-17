import Translate from '@docusaurus/Translate';
import React from 'react';

export const events = [
  {
    id: 'baseline',
    time: '10:00',
    icon: '📊',
    type: 'info',
    title: <Translate id="demo.context.event.baseline.title">Baseline Recorded</Translate>,
    description: <Translate id="demo.context.event.baseline.desc">Memory at 72%. Logged to trend baseline. No action required.</Translate>,
    context: <Translate id="demo.context.event.baseline.ctx">Trend: stable</Translate>,
  },
  {
    id: 'trend',
    time: '10:15',
    icon: '📈',
    type: 'warning',
    title: <Translate id="demo.context.event.trend.title">Trend Detected</Translate>,
    description: <Translate id="demo.context.event.trend.desc">Memory at 81%. Rising +9% in 15 minutes. Incident INC-001 opened.</Translate>,
    context: <Translate id="demo.context.event.trend.ctx">Trend: rising (+9%/15min)</Translate>,
  },
  {
    id: 'correlate',
    time: '10:22',
    icon: '🔗',
    type: 'warning',
    title: <Translate id="demo.context.event.correlate.title">Event Correlated</Translate>,
    description: <Translate id="demo.context.event.correlate.desc">GC pause 800ms detected. Correlated to INC-001. Memory leak hypothesis formed.</Translate>,
    context: <Translate id="demo.context.event.correlate.ctx">Linked: INC-001 (memory leak)</Translate>,
  },
  {
    id: 'escalate',
    time: '10:30',
    icon: '🚨',
    type: 'error',
    title: <Translate id="demo.context.event.escalate.title">Incident Escalated</Translate>,
    description: <Translate id="demo.context.event.escalate.desc">Memory at 91%. INC-001 escalated. Service restart with known root cause.</Translate>,
    context: <Translate id="demo.context.event.escalate.ctx">Action: restart (confidence: high)</Translate>,
  },
  {
    id: 'resolve',
    time: '10:32',
    icon: '✅',
    type: 'success',
    title: <Translate id="demo.context.event.resolve.title">Knowledge Saved</Translate>,
    description: <Translate id="demo.context.event.resolve.desc">Service restarted. Pattern learned: "app-worker leaks after 48h uptime".</Translate>,
    context: <Translate id="demo.context.event.resolve.ctx">Pattern stored for proactive action</Translate>,
  },
  {
    id: 'proactive',
    time: '+48h',
    icon: '🛡️',
    type: 'success',
    title: <Translate id="demo.context.event.proactive.title">Proactive Prevention</Translate>,
    description: <Translate id="demo.context.event.proactive.desc">48h later: preemptive restart scheduled based on learned pattern. No alert triggered.</Translate>,
    context: <Translate id="demo.context.event.proactive.ctx">Source: learned pattern INC-001</Translate>,
  },
];
