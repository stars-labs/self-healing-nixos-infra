import React, { useState, useEffect, useCallback } from 'react';
import Translate from '@docusaurus/Translate';
import { events } from './data';
import styles from './ContextTimeline.module.css';

const STEP_INTERVAL = 1800;

export default function ContextTimeline() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setVisibleCount((prev) => {
        const next = prev + 1;
        if (next >= events.length) {
          setIsPlaying(false);
          return events.length;
        }
        return next;
      });
    }, STEP_INTERVAL);

    return () => clearInterval(timer);
  }, [isPlaying]);

  const handlePlay = useCallback(() => {
    if (visibleCount >= events.length) {
      setVisibleCount(0);
    }
    setIsPlaying(true);
  }, [visibleCount]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setVisibleCount(0);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        {!isPlaying ? (
          <button className={styles.btn} onClick={handlePlay}>
            ▶ <Translate id="demo.context.play">Play</Translate>
          </button>
        ) : (
          <button className={styles.btn} onClick={() => setIsPlaying(false)}>
            ⏸ <Translate id="demo.context.pause">Pause</Translate>
          </button>
        )}
        <button className={styles.btn} onClick={handleReset}>
          ↺ <Translate id="demo.context.reset">Reset</Translate>
        </button>
      </div>

      <div className={styles.timeline}>
        {events.map((event, index) => {
          const isVisible = index < visibleCount;

          return (
            <div
              key={event.id}
              className={`${styles.event} ${isVisible ? styles.eventVisible : ''}`}
            >
              <div className={styles.timeLabel}>{event.time}</div>
              <div className={styles.icon}>{event.icon}</div>
              {index < events.length - 1 && (
                <div
                  className={`${styles.connector} ${isVisible ? styles.connectorVisible : ''} ${styles[`connector${event.type.charAt(0).toUpperCase() + event.type.slice(1)}`]}`}
                />
              )}
              <div className={`${styles.card} ${styles[`card${event.type.charAt(0).toUpperCase() + event.type.slice(1)}`]}`}>
                <div className={styles.cardTitle}>{event.title}</div>
                <div className={styles.cardDesc}>{event.description}</div>
                <span className={styles.contextBadge}>{event.context}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
