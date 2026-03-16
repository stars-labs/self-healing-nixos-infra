import React, { useState, useEffect, useRef, useCallback } from 'react';
import Translate from '@docusaurus/Translate';
import { tabs } from './data';
import styles from './TerminalReplay.module.css';

export default function TerminalReplay() {
  const [activeTab, setActiveTab] = useState(0);
  const [displayedLines, setDisplayedLines] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const bodyRef = useRef(null);
  const timeoutRef = useRef(null);

  const currentLines = tabs[activeTab].lines;

  const scrollToBottom = useCallback(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, []);

  const playLine = useCallback((index) => {
    if (index >= currentLines.length) {
      setIsPlaying(false);
      setIsDone(true);
      return;
    }

    const line = currentLines[index];
    setDisplayedLines((prev) => [...prev, line]);
    setTimeout(scrollToBottom, 10);

    timeoutRef.current = setTimeout(() => {
      playLine(index + 1);
    }, line.delay);
  }, [currentLines, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handlePlay = useCallback(() => {
    if (isDone) {
      setDisplayedLines([]);
      setIsDone(false);
    }
    setIsPlaying(true);
    const startFrom = isDone ? 0 : displayedLines.length;
    playLine(startFrom);
  }, [isDone, displayedLines.length, playLine]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setIsDone(false);
    setDisplayedLines([]);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleTabChange = useCallback((index) => {
    setActiveTab(index);
    setDisplayedLines([]);
    setIsPlaying(false);
    setIsDone(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const getLineClass = (type) => {
    switch (type) {
      case 'command': return styles.lineCommand;
      case 'error': return styles.lineError;
      case 'success': return styles.lineSuccess;
      default: return styles.lineOutput;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${index === activeTab ? styles.tabActive : ''}`}
            onClick={() => handleTabChange(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.terminal}>
        <div className={styles.titleBar}>
          <div className={`${styles.dot} ${styles.dotRed}`} />
          <div className={`${styles.dot} ${styles.dotYellow}`} />
          <div className={`${styles.dot} ${styles.dotGreen}`} />
        </div>

        <div className={styles.body} ref={bodyRef}>
          {displayedLines.map((line, index) => (
            <div key={index} className={`${styles.line} ${getLineClass(line.type)}`}>
              {line.text}
            </div>
          ))}
          {isPlaying && <span className={styles.cursor} />}
          {displayedLines.length === 0 && !isPlaying && (
            <div className={styles.lineOutput} style={{ opacity: 0.5 }}>
              <Translate id="demo.terminal.placeholder">Press Play to start the replay...</Translate>
            </div>
          )}
        </div>

        <div className={styles.controls}>
          {!isPlaying ? (
            <button className={styles.controlBtn} onClick={handlePlay}>
              ▶ <Translate id="demo.terminal.play">Play</Translate>
            </button>
          ) : (
            <button className={styles.controlBtn} onClick={handlePause}>
              ⏸ <Translate id="demo.terminal.pause">Pause</Translate>
            </button>
          )}
          <button className={styles.controlBtn} onClick={handleReset}>
            ↺ <Translate id="demo.terminal.reset">Reset</Translate>
          </button>
        </div>
      </div>
    </div>
  );
}
