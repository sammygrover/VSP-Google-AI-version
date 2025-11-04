import { useState, useEffect, useRef } from 'react';

export const useTimer = (duration: number, onTimeout: () => void) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  // FIX: Replaced NodeJS.Timeout with number for browser compatibility.
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeLeft <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      onTimeout();
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, onTimeout]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return {
    formattedTime: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
    stopTimer: () => {
      if(timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);
    }
  };
};
