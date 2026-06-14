import { useState, useEffect, useRef, useCallback } from 'react';

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const Screenshot = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
  const [screenImage, setScreenImage] = useState<HTMLImageElement | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [endPoint, setEndPoint] = useState<Point | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [showMagnifier, setShowMagnifier] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [screenSize, setScreenSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.electronAPI?.onScreenshotCaptured) {
      window.electronAPI.onScreenshotCaptured((dataUrl: string) => {
        const img = new Image();
        img.onload = () => {
          setScreenImage(img);
          setScreenSize({ width: img.width, height: img.height });
          setLoading(false);
        };
        img.onerror = () => {
          setLoading(false);
        };
        img.src = dataUrl;
      });
    }
  }, []);

  const getSelectionRect = useCallback((start: Point, end: Point): Rect => {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (loading) return;
    const point = { x: e.clientX, y: e.clientY };

    if (selection && isPointInSelection(point)) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - selection.x, y: e.clientY - selection.y });
      return;
    }

    setIsSelecting(true);
    setStartPoint(point);
    setEndPoint(point);
    setSelection(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const point = { x: e.clientX, y: e.clientY };
    setMousePos(point);

    if (isDragging && selection && dragStart) {
      const newX = Math.max(0, Math.min(screenSize.width - selection.width, e.clientX - dragStart.x));
      const newY = Math.max(0, Math.min(screenSize.height - selection.height, e.clientY - dragStart.y));
      setSelection({ ...selection, x: newX, y: newY });
    } else if (isSelecting && startPoint) {
      const end = {
        x: Math.max(0, Math.min(screenSize.width, e.clientX)),
        y: Math.max(0, Math.min(screenSize.height, e.clientY)),
      };
      setEndPoint(end);
      setSelection(getSelectionRect(startPoint, end));
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
    }
    if (isSelecting) {
      setIsSelecting(false);
    }
  };

  const isPointInSelection = (point: Point): boolean => {
    if (!selection) return false;
    const resizeHandleSize = 10;
    return (
      point.x >= selection.x - resizeHandleSize &&
      point.x <= selection.x + selection.width + resizeHandleSize &&
      point.y >= selection.y - resizeHandleSize &&
      point.y <= selection.y + selection.height + resizeHandleSize
    );
  };

  const confirmScreenshot = () => {
    if (!selection || !screenImage || selection.width < 5 || selection.height < 5) return;

    const canvas = document.createElement('canvas');
    canvas.width = selection.width;
    canvas.height = selection.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        screenImage,
        selection.x,
        selection.y,
        selection.width,
        selection.height,
        0,
        0,
        selection.width,
        selection.height
      );
      const dataUrl = canvas.toDataURL('image/png');
      window.electronAPI?.closeScreenshotWindow(dataUrl);
    }
  };

  const cancelScreenshot = () => {
    window.electronAPI?.closeScreenshotWindow();
  };

  const fullscreenScreenshot = () => {
    if (!screenImage) return;
    const canvas = document.createElement('canvas');
    canvas.width = screenImage.width;
    canvas.height = screenImage.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(screenImage, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      window.electronAPI?.closeScreenshotWindow(dataUrl);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelScreenshot();
      } else if (e.key === 'Enter') {
        confirmScreenshot();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, screenImage]);

  useEffect(() => {
    if (!screenImage || !magnifierCanvasRef.current) return;

    const canvas = magnifierCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const magnifierSize = 150;
    const zoom = 2;
    const sourceSize = magnifierSize / zoom;

    ctx.clearRect(0, 0, magnifierSize, magnifierSize);

    const sx = mousePos.x - sourceSize / 2;
    const sy = mousePos.y - sourceSize / 2;

    ctx.drawImage(
      screenImage,
      sx,
      sy,
      sourceSize,
      sourceSize,
      0,
      0,
      magnifierSize,
      magnifierSize
    );

    ctx.strokeStyle = 'rgba(0, 122, 255, 0.8)';
    ctx.lineWidth = 1;
    const center = magnifierSize / 2;
    const step = magnifierSize / 10;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, magnifierSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(magnifierSize, i * step);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.fillRect(center - 1, center - 1, 2, 2);
  }, [mousePos, screenImage]);

  return (
    <div
      className="fixed inset-0 w-screen h-screen overflow-hidden cursor-crosshair bg-black/30"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {screenImage && (
        <img
          src={screenImage.src}
          alt="screen"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
          draggable={false}
        />
      )}

      {selection && (
        <>
          <div
            className="absolute top-0 left-0 bg-black/50"
            style={{
              width: '100%',
              height: selection.y,
            }}
          />
          <div
            className="absolute bottom-0 left-0 bg-black/50"
            style={{
              width: '100%',
              height: screenSize.height - selection.y - selection.height,
            }}
          />
          <div
            className="absolute left-0 bg-black/50"
            style={{
              left: 0,
              top: selection.y,
              width: selection.x,
              height: selection.height,
            }}
          />
          <div
            className="absolute bg-black/50"
            style={{
              right: 0,
              top: selection.y,
              width: screenSize.width - selection.x - selection.width,
              height: selection.height,
            }}
          />

          <div
            className="absolute border-2 border-primary-500 pointer-events-none"
            style={{
              left: selection.x,
              top: selection.y,
              width: selection.width,
              height: selection.height,
            }}
          >
            <div className="absolute -top-1 -left-1 w-3 h-3 bg-white border-2 border-primary-500 rounded-full -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-white border-2 border-primary-500 rounded-full translate-x-1/2 -translate-y-1/2" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border-2 border-primary-500 rounded-full -translate-x-1/2 translate-y-1/2" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border-2 border-primary-500 rounded-full translate-x-1/2 translate-y-1/2" />
            <div className="absolute -top-1 left-1/2 w-3 h-3 bg-white border-2 border-primary-500 rounded-full -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute -bottom-1 left-1/2 w-3 h-3 bg-white border-2 border-primary-500 rounded-full -translate-x-1/2 translate-y-1/2" />
            <div className="absolute top-1/2 -left-1 w-3 h-3 bg-white border-2 border-primary-500 rounded-full -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute top-1/2 -right-1 w-3 h-3 bg-white border-2 border-primary-500 rounded-full translate-x-1/2 -translate-y-1/2" />
          </div>

          <div
            className="absolute bg-black/70 text-white px-2 py-1 rounded text-xs font-mono pointer-events-none"
            style={{
              left: selection.x,
              top: selection.y > 28 ? selection.y - 28 : selection.y + selection.height + 4,
            }}
          >
            {Math.round(selection.width)} × {Math.round(selection.height)}
          </div>
        </>
      )}

      {!selection && !loading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="bg-black/60 text-white px-6 py-4 rounded-2xl backdrop-blur-sm">
            <svg className="w-12 h-12 mx-auto mb-2 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-medium">拖拽选择截图区域</p>
            <p className="text-xs text-white/60 mt-1">按 ESC 取消 · 按 Enter 确认</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="bg-black/60 text-white px-6 py-4 rounded-2xl backdrop-blur-sm">
            <div className="w-8 h-8 mx-auto mb-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-sm font-medium">正在捕获屏幕...</p>
          </div>
        </div>
      )}

      {showMagnifier && !loading && (
        <div
          className="absolute pointer-events-none rounded-full border-2 border-white/50 shadow-2xl overflow-hidden"
          style={{
            width: 150,
            height: 150,
            left: Math.min(mousePos.x + 20, window.innerWidth - 170),
            top: Math.min(mousePos.y + 20, window.innerHeight - 170),
          }}
        >
          <canvas
            ref={magnifierCanvasRef}
            width={150}
            height={150}
            className="w-full h-full"
          />
        </div>
      )}

      {selection && selection.width > 10 && selection.height > 10 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl border border-white/10 z-50">
          <button
            onClick={cancelScreenshot}
            className="flex items-center gap-2 px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm">取消</span>
          </button>

          <div className="w-px h-8 bg-white/20" />

          <button
            onClick={fullscreenScreenshot}
            className="flex items-center gap-2 px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span className="text-sm">全屏</span>
          </button>

          <button
            onClick={() => setShowMagnifier(!showMagnifier)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
              showMagnifier ? 'text-primary-400 bg-primary-500/20' : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-sm">放大镜</span>
          </button>

          <div className="w-px h-8 bg-white/20" />

          <button
            onClick={confirmScreenshot}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/30"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">完成</span>
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Screenshot;
