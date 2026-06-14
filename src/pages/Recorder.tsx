import { useState, useEffect, useRef } from 'react';

const Recorder = () => {
  const [elapsed, setElapsed] = useState(0);
  const [isRecording, setIsRecording] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    setIsRecording(false);
    if (window.electronAPI?.hideMainWindow) {
      window.electronAPI.showMainWindow();
    }
    if (window.electronAPI?.hideRecordWindow) {
      window.electronAPI.hideRecordWindow();
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center px-3 py-1 select-none">
      <div className="flex items-center gap-2 bg-black/80 backdrop-blur-xl rounded-full px-3 py-1.5 border border-white/10 shadow-2xl">
        <div className={`w-2.5 h-2.5 rounded-full ${isRecording && !isPaused ? 'bg-red-500 animate-pulse' : isPaused ? 'bg-yellow-400' : 'bg-gray-400'}`} />

        <span className="text-sm font-mono text-white/90 min-w-[52px] text-center">
          {formatTime(elapsed)}
        </span>

        <div className="w-px h-4 bg-white/20" />

        <button
          onClick={handlePause}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          title={isPaused ? '继续' : '暂停'}
        >
          {isPaused ? (
            <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          )}
        </button>

        <button
          onClick={handleStop}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          title="停止录制"
        >
          <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Recorder;
