import React, { useState, useEffect, useCallback } from 'react';
import Translate from '@docusaurus/Translate';
import { successSteps, failureSteps } from './data';
import styles from './HealingWorkflow.module.css';

const STEP_INTERVAL = 1500;

export default function HealingWorkflow() {
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scenario, setScenario] = useState('success');
  const [hasCompleted, setHasCompleted] = useState(false);

  const steps = scenario === 'success'
    ? successSteps
    : [...successSteps.slice(0, 6), ...failureSteps]; // diverge at Verify

  const totalSteps = steps.length;

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        if (next >= totalSteps) {
          setIsPlaying(false);
          setHasCompleted(true);
          return prev;
        }
        return next;
      });
    }, STEP_INTERVAL);

    return () => clearInterval(timer);
  }, [isPlaying, totalSteps]);

  const handlePlay = useCallback(() => {
    if (hasCompleted) {
      setCurrentStep(0);
      setHasCompleted(false);
    } else if (currentStep === -1) {
      setCurrentStep(0);
    }
    setIsPlaying(true);
  }, [hasCompleted, currentStep]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(-1);
    setHasCompleted(false);
  }, []);

  const handleScenarioChange = useCallback((newScenario) => {
    setScenario(newScenario);
    setIsPlaying(false);
    setCurrentStep(-1);
    setHasCompleted(false);
  }, []);

  const progressPercent = currentStep < 0 ? 0 : ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        {!isPlaying ? (
          <button className={styles.btn} onClick={handlePlay}>
            ▶ <Translate id="demo.healing.play">Play</Translate>
          </button>
        ) : (
          <button className={styles.btn} onClick={handlePause}>
            ⏸ <Translate id="demo.healing.pause">Pause</Translate>
          </button>
        )}
        <button className={styles.btn} onClick={handleReset}>
          ↺ <Translate id="demo.healing.reset">Reset</Translate>
        </button>

        <div className={styles.scenarioToggle}>
          <button
            className={`${styles.btn} ${scenario === 'success' ? styles.btnActive : ''}`}
            onClick={() => handleScenarioChange('success')}
          >
            <Translate id="demo.healing.scenario.success">Success</Translate>
          </button>
          <button
            className={`${styles.btn} ${scenario === 'failure' ? styles.btnActive : ''}`}
            onClick={() => handleScenarioChange('failure')}
          >
            <Translate id="demo.healing.scenario.failure">Failure</Translate>
          </button>
        </div>
      </div>

      <div className={styles.progressBar}>
        <div
          className={`${styles.progressFill} ${scenario === 'failure' && currentStep >= 6 ? styles.progressFillFailure : ''}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className={styles.timeline}>
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const isFailurePath = scenario === 'failure' && index >= 6;
          const showDivider = scenario === 'failure' && index === 6;

          return (
            <React.Fragment key={step.id}>
              {showDivider && <hr className={styles.failureDivider} />}
              <div
                className={`${styles.step} ${isActive ? styles.stepActive : ''} ${isCompleted ? styles.stepCompleted : ''}`}
              >
                <div
                  className={`${styles.stepIcon} ${isActive ? (isFailurePath ? styles.stepIconFailure : styles.stepIconActive) : ''} ${isCompleted ? styles.stepIconCompleted : ''}`}
                >
                  {step.icon}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`${styles.connector} ${isCompleted ? styles.connectorActive : ''} ${isFailurePath ? styles.connectorFailure : ''}`}
                  />
                )}
                <div className={styles.stepLabel}>{step.label}</div>
                <div className={styles.stepDesc}>{step.description}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
