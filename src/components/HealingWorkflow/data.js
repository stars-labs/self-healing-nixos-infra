import Translate from '@docusaurus/Translate';
import React from 'react';

export const successSteps = [
  {
    id: 'detect',
    icon: '🔍',
    label: <Translate id="demo.healing.step.detect">Detect Anomaly</Translate>,
    description: <Translate id="demo.healing.step.detect.desc">OpenClaw monitoring detects service degradation or failure</Translate>,
  },
  {
    id: 'analyze',
    icon: '🧠',
    label: <Translate id="demo.healing.step.analyze">Analyze Root Cause</Translate>,
    description: <Translate id="demo.healing.step.analyze.desc">AI analyzes logs, metrics, and system state to identify the issue</Translate>,
  },
  {
    id: 'classify',
    icon: '📊',
    label: <Translate id="demo.healing.step.classify">Classify Tier</Translate>,
    description: <Translate id="demo.healing.step.classify.desc">Determine remediation tier: T1 (restart), T2 (reconfigure), or T3 (rebuild)</Translate>,
  },
  {
    id: 'snapshot',
    icon: '📸',
    label: <Translate id="demo.healing.step.snapshot">Create Snapshot</Translate>,
    description: <Translate id="demo.healing.step.snapshot.desc">Btrfs snapshot created before any changes for safe rollback</Translate>,
  },
  {
    id: 'execute',
    icon: '⚡',
    label: <Translate id="demo.healing.step.execute">Execute Remediation</Translate>,
    description: <Translate id="demo.healing.step.execute.desc">Apply the fix: restart service, update config, or nixos-rebuild</Translate>,
  },
  {
    id: 'verify',
    icon: '✅',
    label: <Translate id="demo.healing.step.verify">Verify Fix</Translate>,
    description: <Translate id="demo.healing.step.verify.desc">Run health checks to confirm the issue is resolved</Translate>,
  },
  {
    id: 'commit',
    icon: '🔒',
    label: <Translate id="demo.healing.step.commit">Commit Changes</Translate>,
    description: <Translate id="demo.healing.step.commit.desc">Changes committed to NixOS configuration and snapshot retained</Translate>,
  },
];

export const failureSteps = [
  {
    id: 'rollback',
    icon: '⏪',
    label: <Translate id="demo.healing.step.rollback">Rollback</Translate>,
    description: <Translate id="demo.healing.step.rollback.desc">Verification failed — rolling back to pre-change Btrfs snapshot</Translate>,
  },
  {
    id: 'recovered',
    icon: '🔄',
    label: <Translate id="demo.healing.step.recovered">System Recovered</Translate>,
    description: <Translate id="demo.healing.step.recovered.desc">System restored to known-good state, incident logged for review</Translate>,
  },
];
