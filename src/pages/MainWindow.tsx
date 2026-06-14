import { useState, useEffect, useRef } from 'react';

const MainWindow = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fps, setFps] = useState(30);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (window.electronAPI?.onToggleRecording) {
      window.electronAPI.onToggleRecording(() => {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      });
    }
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const audioConstraints: MediaStreamConstraints['audio'] = audioEnabled
        ? { mandatory: { chromeMediaSource: 'desktop' } }
        : false;

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: fps,
        } as MediaTrackConstraints,
        audio: audioConstraints as boolean | MediaTrackConstraints,
      });

      if (micEnabled) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioCtx = new AudioContext();
          const dest = audioCtx.createMediaStreamDestination();
          audioCtx.createMediaStreamSource(stream).connect(dest);
          audioCtx.createMediaStreamSource(micStream).connect(dest);
          const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...dest.stream.getAudioTracks(),
          ]);
          streamRef.current = combinedStream;
        } catch {
          streamRef.current = stream;
        }
      } else {
        streamRef.current = stream;
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result as ArrayBuffer;
          if (window.electronAPI?.saveVideo) {
            window.electronAPI.saveVideo(buffer, `recording-${Date.now()}.webm`);
          }
        };
        reader.readAsArrayBuffer(blob);
        chunksRef.current = [];
      };

      stream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);

      window.electronAPI?.showRecordWindow();
      window.electronAPI?.hideMainWindow();
    } catch (error) {
      console.error('录屏启动失败:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
    window.electronAPI?.hideRecordWindow();
  };

  const handleAreaScreenshot = () => {
    window.electronAPI?.hideMainWindow();
    setTimeout(() => {
      window.location.hash = '#/screenshot';
    }, 300);
  };

  const handleFullScreenshot = async () => {
    window.electronAPI?.hideMainWindow();
    setTimeout(async () => {
      try {
        const sources = await window.electronAPI?.getSources();
        const screenSource = sources?.find((s) => s.id.startsWith('screen:'));
        if (screenSource && window.electronAPI?.openEditor) {
          window.electronAPI.openEditor(screenSource.thumbnail);
        }
      } catch (error) {
        console.error('全屏截图失败:', error);
      }
    }, 300);
  };

  const handleWindowScreenshot = async () => {
    if (window.electronAPI?.getSources) {
      const sources = await window.electronAPI.getSources();
      const windowSources = sources.filter((s) => s.id.startsWith('window:'));
      if (windowSources.length > 0 && window.electronAPI?.openEditor) {
        window.electronAPI.openEditor(windowSources[0].thumbnail);
      }
    }
  };

  const handleMinimize = () => {
    window.electronAPI?.hideMainWindow();
  };

  const handleClose = () => {
    window.electronAPI?.hideMainWindow();
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-3">
      <div className="w-full h-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 overflow-hidden flex flex-col">
        <div className="app-drag h-10 flex items-center justify-between px-4 border-b border-gray-100">
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
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">截图</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleAreaScreenshot}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-b from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 border border-blue-200/50 transition-all hover:scale-105 active:scale-95 no-drag"
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
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-b from-green-50 to-green-100/50 hover:from-green-100 hover:to-green-200/50 border border-green-200/50 transition-all hover:scale-105 active:scale-95 no-drag"
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
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-b from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 border border-purple-200/50 transition-all hover:scale-105 active:scale-95 no-drag"
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
                  <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {isRecording ? '录制中' : '未录制'}
                  </span>
                </div>
                {isRecording && (
                  <span className="text-lg font-mono font-bold text-red-500">{formatTime(recordingTime)}</span>
                )}
              </div>

              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] no-drag ${
                  isRecording
                    ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-200'
                    : 'bg-gradient-to-r from-red-500 to-orange-500 shadow-lg shadow-orange-200'
                }`}
              >
                {isRecording ? '停止录制' : '开始录制'}
              </button>

              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-full mt-2 py-2 text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 no-drag"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                录制设置
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
                    className={`w-11 h-6 rounded-full transition-colors no-drag ${
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
                    className={`w-11 h-6 rounded-full transition-colors no-drag ${
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
                    className="px-2 py-1 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 no-drag"
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
                <kbd className="px-2 py-0.5 bg-white rounded border border-gray-300 text-gray-500 font-mono">Ctrl+Shift+A</kbd>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">全屏截图</span>
                <kbd className="px-2 py-0.5 bg-white rounded border border-gray-300 text-gray-500 font-mono">Ctrl+Shift+S</kbd>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">开始录屏</span>
                <kbd className="px-2 py-0.5 bg-white rounded border border-gray-300 text-gray-500 font-mono">Ctrl+Shift+R</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainWindow;
