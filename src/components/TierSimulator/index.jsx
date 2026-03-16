import React, { useState, useCallback } from 'react';
import Translate from '@docusaurus/Translate';
import { scenarios } from './data';
import styles from './TierSimulator.module.css';

const riskLabels = {
  low: <Translate id="demo.tier.risk.low">Low</Translate>,
  medium: <Translate id="demo.tier.risk.medium">Medium</Translate>,
  high: <Translate id="demo.tier.risk.high">High</Translate>,
};

export default function TierSimulator() {
  const [activeScenario, setActiveScenario] = useState(0);
  const [selectedAction, setSelectedAction] = useState(null);

  const scenario = scenarios[activeScenario];

  const handleScenarioChange = useCallback((index) => {
    setActiveScenario(index);
    setSelectedAction(null);
  }, []);

  const handleActionClick = useCallback((index) => {
    setSelectedAction(index);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.scenarioGrid}>
        {scenarios.map((s, index) => (
          <div
            key={s.id}
            className={`${styles.scenarioCard} ${index === activeScenario ? styles.scenarioCardActive : ''}`}
            onClick={() => handleScenarioChange(index)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleScenarioChange(index)}
          >
            <div className={styles.scenarioIcon}>{s.icon}</div>
            <div className={styles.scenarioTitle}>{s.title}</div>
          </div>
        ))}
      </div>

      <div className={styles.scenarioDesc}>{scenario.description}</div>

      <div className={styles.actionsLabel}>
        <Translate id="demo.tier.chooseAction">Choose a remediation action:</Translate>
      </div>

      <div className={styles.actions}>
        {scenario.actions.map((action, index) => (
          <button
            key={index}
            className={`${styles.actionBtn} ${selectedAction === index ? styles.actionBtnSelected : ''}`}
            onClick={() => handleActionClick(index)}
          >
            <span className={`${styles.tierBadge} ${styles[`tierBadge${action.tier}`]}`}>
              T{action.tier}
            </span>
            <span className={styles.actionLabel}>{action.label}</span>
            <span className={`${styles.riskBadge} ${styles[`risk${action.risk.charAt(0).toUpperCase() + action.risk.slice(1)}`]}`}>
              {riskLabels[action.risk]}
            </span>
          </button>
        ))}
      </div>

      {selectedAction !== null && (
        <div className={`${styles.resultPanel} ${styles[`resultTier${scenario.actions[selectedAction].tier}`]}`}>
          <div className={styles.resultTitle}>
            <Translate id="demo.tier.result">Result</Translate>
          </div>
          <div className={styles.resultText}>
            {scenario.actions[selectedAction].result}
          </div>
        </div>
      )}
    </div>
  );
}
