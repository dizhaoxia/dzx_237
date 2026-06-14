import { useState, useEffect, useRef, useCallback } from 'react';

type RecordingState = 'idle' | 'recording' | 'paused';

interface RecordingSegment {
  blob: Blob;
  startTimestamp: number;
  endTimestamp: number;
}

const MainWindow = () => {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fps, setFps] = useState(30);
  const [error, setError] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentChunksRef = useRef<Blob[]>([]);
  const segmentsRef = useRef<RecordingSegment[]>([]);
  const segmentStartRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const effectiveDurationRef = useRef<number>(0);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetAllState = useCallback(() => {
    mediaRecorderRef.current = null;
    currentChunksRef.current = [];
    segmentsRef.current = [];
    isStoppingRef.current = false;
    effectiveDurationRef.current = 0;
    setRecordingState('idle');
    setRecordingTime(0);
  }, []);

  const finalizeCurrentSegment = useCallback(() => {
    if (currentChunksRef.current.length > 0) {
      const blob = new Blob(currentChunksRef.current, { type: 'video/webm' });
      segmentsRef.current.push({
        blob,
        startTimestamp: segmentStartRef.current,
        endTimestamp: Date.now(),
      });
      currentChunksRef.current = [];
    }
  }, []);

  const createAndStartRecorder = useCallback((stream: MediaStream, mimeType: string) => {
    const recorder = new MediaRecorder(stream, { mimeType });
    currentChunksRef.current = [];
    segmentStartRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) currentChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      finalizeCurrentSegment();
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
  }, [finalizeCurrentSegment]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setRecordingTime((t) => t + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const concatenateAndSave = useCallback(async () => {
    const allBlobs = segmentsRef.current.map((s) => s.blob);
    if (allBlobs.length === 0) {
      resetAllState();
      return;
    }

    const combinedBlob = new Blob(allBlobs, { type: 'video/webm' });
    const defaultName = `recording-${Date.now()}.webm`;

    try {
      if (window.electronAPI?.showSaveVideoDialog) {
        const result = await window.electronAPI.showSaveVideoDialog(defaultName);
        if (!result.canceled && result.filePath) {
          const reader = new FileReader();
          reader.onload = () => {
            const buffer = reader.result as ArrayBuffer;
            if (window.electronAPI?.saveVideoToPath) {
              window.electronAPI.saveVideoToPath(buffer, result.filePath!);
            }
          };
          reader.readAsArrayBuffer(combinedBlob);
        }
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result as ArrayBuffer;
          if (window.electronAPI?.saveVideo) {
            window.electronAPI.saveVideo(buffer, defaultName);
          }
        };
        reader.readAsArrayBuffer(combinedBlob);
      }
    } catch (err) {
      console.error('保存视频失败:', err);
      setError('保存视频失败');
    }

    resetAllState();
  }, [resetAllState]);

  const pauseRecording = useCallback(() => {
    if (recordingState !== 'recording') return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.pause();
        finalizeCurrentSegment();
        stopTimer();
        setRecordingState('paused');
      } catch (err) {
        console.error('暂停失败:', err);
      }
    }
  }, [recordingState, finalizeCurrentSegment, stopTimer]);

  const resumeRecording = useCallback(() => {
    if (recordingState !== 'paused') return;
    if (streamRef.current) {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      createAndStartRecorder(streamRef.current, mimeType);
      startTimer();
      setRecordingState('recording');
    }
  }, [recordingState, createAndStartRecorder, startTimer]);

  const stopRecording = useCallback(() => {
    if (isStoppingRef.current) return;
    if (recordingState === 'idle') return;
    isStoppingRef.current = true;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        if (mediaRecorderRef.current.state === 'paused') {
          mediaRecorderRef.current.resume();
        }
        mediaRecorderRef.current.stop();
      } catch {}
    }

    stopTimer();
    cleanupStream();

    setTimeout(() => {
      concatenateAndSave();
    }, 300);
  }, [recordingState, stopTimer, cleanupStream, concatenateAndSave]);

  const startRecording = useCallback(async () => {
    if (recordingState !== 'idle') return;
    try {
      setError('');
      if (!window.electronAPI?.getSources) {
        setError('环境不支持录屏');
        return;
      }

      const sources = await window.electronAPI.getSources();
      const screenSource = sources.find((s) => s.id.startsWith('screen:'));
      if (!screenSource) {
        setError('未找到屏幕源');
        return;
      }

      const videoConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id,
          maxWidth: 9999,
          maxHeight: 9999,
          maxFrameRate: fps,
        },
      } as unknown as MediaStreamConstraints['video'];

      const audioConstraints = audioEnabled
        ? ({
            mandatory: {
              chromeMediaSource: 'desktop',
            },
          } as unknown as MediaStreamConstraints['audio'])
        : false;

      const constraints: MediaStreamConstraints = {
        video: videoConstraints,
        audio: audioConstraints,
      };

      let stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (micEnabled) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          try {
            const audioCtx = new AudioContext();
            const dest = audioCtx.createMediaStreamDestination();
            const sysSource = audioCtx.createMediaStreamSource(stream);
            const micSource = audioCtx.createMediaStreamSource(micStream);
            sysSource.connect(dest);
            micSource.connect(dest);
            stream = new MediaStream([
              ...stream.getVideoTracks(),
              ...dest.stream.getAudioTracks(),
            ]);
          } catch {
            stream = new MediaStream([
              ...stream.getVideoTracks(),
              ...stream.getAudioTracks(),
              ...micStream.getAudioTracks(),
            ]);
          }
        } catch {
          // mic unavailable
        }
      }

      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      createAndStartRecorder(stream, mimeType);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (recordingState !== 'idle' && !isStoppingRef.current) {
            stopRecording();
          }
        };
      }

      segmentsRef.current = [];
      setRecordingState('recording');
      setRecordingTime(0);
      startTimer();

      window.electronAPI?.showRecordWindow();
      window.electronAPI?.hideMainWindow();
    } catch (err) {
      console.error('录屏启动失败:', err);
      setError('录屏启动失败: ' + (err instanceof Error ? err.message : String(err)));
      resetAllState();
      cleanupStream();
    }
  }, [recordingState, fps, audioEnabled, micEnabled, createAndStartRecorder, startTimer, stopRecording, resetAllState, cleanupStream]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    if (window.electronAPI?.onToggleRecording) {
      const cleanup = window.electronAPI.onToggleRecording(() => {
        if (recordingState === 'idle') {
          startRecording();
        } else {
          stopRecording();
        }
      });
      cleanups.push(cleanup);
    }
    if (window.electronAPI?.onForceStopRecording) {
      const cleanup = window.electronAPI.onForceStopRecording(() => {
        stopRecording();
      });
      cleanups.push(cleanup);
    }
    if (window.electronAPI?.onPauseRecording) {
      const cleanup = window.electronAPI.onPauseRecording(() => {
        pauseRecording();
      });
      cleanups.push(cleanup);
    }
    if (window.electronAPI?.onResumeRecording) {
      const cleanup = window.electronAPI.onResumeRecording(() => {
        resumeRecording();
      });
      cleanups.push(cleanup);
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [startRecording, stopRecording, pauseRecording, resumeRecording, recordingState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAreaScreenshot = () => {
    if (window.electronAPI?.startAreaScreenshot) {
      window.electronAPI.startAreaScreenshot();
    }
  };

  const handleFullScreenshot = () => {
    if (window.electronAPI?.startAreaScreenshot) {
      window.electronAPI.startAreaScreenshot();
    }
  };

  const handleWindowScreenshot = async () => {
    if (window.electronAPI?.getSources) {
      try {
        const sources = await window.electronAPI.getSources();
        const windowSources = sources.filter((s) => s.id.startsWith('window:'));
        if (windowSources.length > 0) {
          window.electronAPI.hideMainWindow();
          setTimeout(() => {
            window.electronAPI!.openEditor(windowSources[0].thumbnail);
          }, 300);
        }
      } catch (e) {
        console.error('窗口截图失败:', e);
      }
    }
  };

  const handleMinimize = () => {
    window.electronAPI?.hideMainWindow();
  };

  const handleClose = () => {
    window.electronAPI?.hideMainWindow();
  };

  const isRecording = recordingState === 'recording' || recordingState === 'paused';

  return (
    <div className="w-full h-full flex items-center justify-center p-2">
      <div className="w-full h-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 overflow-hidden flex flex-col">
        <div className="app-drag h-10 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">截图工具</span>
          </div>
          <div className="flex items-center gap-1 no-drag">
            <button
              onClick={handleMinimize}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="最小化到托盘"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              title="关闭到托盘"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 no-drag" style={{ WebkitOverflowScrolling: 'touch' }}>
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {error}
              <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">×</button>
            </div>
          )}

          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">截图</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleAreaScreenshot}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-b from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 border border-blue-200/50 transition-all hover:scale-105 active:scale-95"
              >
                <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-700">区域截图</span>
              </button>

              <button
                onClick={handleFullScreenshot}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-b from-green-50 to-green-100/50 hover:from-green-100 hover:to-green-200/50 border border-green-200/50 transition-all hover:scale-105 active:scale-95"
              >
                <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-700">全屏</span>
              </button>

              <button
                onClick={handleWindowScreenshot}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-b from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 border border-purple-200/50 transition-all hover:scale-105 active:scale-95"
              >
                <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-700">窗口</span>
              </button>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">录屏</h3>
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-4 border border-red-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    recordingState === 'recording' ? 'bg-red-500 animate-pulse' :
                    recordingState === 'paused' ? 'bg-yellow-500' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {recordingState === 'recording' ? '录制中' :
                     recordingState === 'paused' ? '已暂停' : '未录制'}
                  </span>
                </div>
                {isRecording && (
                  <span className={`text-lg font-mono font-bold ${
                    recordingState === 'paused' ? 'text-yellow-600' : 'text-red-500'
                  }`}>{formatTime(recordingTime)}</span>
                )}
              </div>

              {recordingState === 'paused' && (
                <button
                  onClick={resumeRecording}
                  className="w-full py-2 mb-2 rounded-xl font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg shadow-green-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  继续录制
                </button>
              )}

              <button
                onClick={recordingState === 'recording' ? pauseRecording : recordingState === 'paused' ? resumeRecording : startRecording}
                className={`w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  recordingState === 'recording'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-500 shadow-lg shadow-yellow-200'
                    : recordingState === 'paused'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg shadow-green-200 hidden'
                    : 'bg-gradient-to-r from-red-500 to-orange-500 shadow-lg shadow-orange-200'
                }`}
              >
                {recordingState === 'recording' ? '暂停录制' : recordingState === 'paused' ? '继续录制' : '开始录制'}
              </button>

              {isRecording && (
                <button
                  onClick={stopRecording}
                  className="w-full mt-2 py-2 rounded-xl font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  停止录制并保存
                </button>
              )}

              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-full mt-2 py-2 text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {showSettings ? '收起设置' : '录制设置'}
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="mb-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">录制设置</h4>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">系统音频</span>
                  <button
                    onClick={() => setAudioEnabled(!audioEnabled)}
                    className={`w-11 h-6 rounded-full transition-colors ${
                      audioEnabled ? 'bg-primary-500' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                        audioEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">麦克风</span>
                  <button
                    onClick={() => setMicEnabled(!micEnabled)}
                    className={`w-11 h-6 rounded-full transition-colors ${
                      micEnabled ? 'bg-primary-500' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                        micEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">帧率</span>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="px-2 py-1 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={15}>15 FPS</option>
                    <option value={24}>24 FPS</option>
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">快捷键</h4>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">区域截图</span>
                <kbd className="px-2 py-0.5 bg-white rounded border border-gray-300 text-gray-500 font-mono">⌘⇧A</kbd>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">全屏截图</span>
                <kbd className="px-2 py-0.5 bg-white rounded border border-gray-300 text-gray-500 font-mono">⌘⇧S</kbd>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">开始/停止录屏</span>
                <kbd className="px-2 py-0.5 bg-white rounded border border-gray-300 text-gray-500 font-mono">⌘⇧R</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainWindow;
