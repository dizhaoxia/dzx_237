import { useState, useEffect, useRef, useCallback } from 'react';

type ToolType = 'brush' | 'arrow' | 'rect' | 'mosaic' | 'text' | 'eraser';

interface DrawAction {
  type: ToolType;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  color: string;
  lineWidth: number;
  text?: string;
  fontSize?: number;
}

const Editor = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [activeTool, setActiveTool] = useState<ToolType>('brush');
  const [brushColor, setBrushColor] = useState('#ff3b30');
  const [brushSize, setBrushSize] = useState(3);
  const [fontSize, setFontSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (window.electronAPI?.onLoadImage) {
      window.electronAPI.onLoadImage((data: string) => {
        setImageDataUrl(data);
      });
    }
  }, []);

  useEffect(() => {
    if (!imageDataUrl) return;
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      fitCanvasToWindow(img.width, img.height);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const fitCanvasToWindow = (imgW: number, imgH: number) => {
    const containerW = window.innerWidth - 40;
    const containerH = window.innerHeight - 120;
    const s = Math.min(containerW / imgW, containerH / imgH, 1);
    setScale(s);
    const displayW = imgW * s;
    const displayH = imgH * s;
    setCanvasOffset({
      x: (window.innerWidth - displayW) / 2,
      y: (window.innerHeight - displayH) / 2 + 30,
    });
  };

  useEffect(() => {
    if (!imageDataUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        redrawActions(ctx, actions);
      }
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, actions]);

  const redrawActions = useCallback((ctx: CanvasRenderingContext2D, actionList: DrawAction[]) => {
    for (const action of actionList) {
      drawAction(ctx, action);
    }
  }, []);

  const drawAction = (ctx: CanvasRenderingContext2D, action: DrawAction) => {
    ctx.save();
    switch (action.type) {
      case 'brush':
      case 'eraser':
        if (action.points && action.points.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = action.type === 'eraser' ? '#ffffff' : action.color;
          ctx.lineWidth = action.lineWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (action.type === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
          }
          ctx.moveTo(action.points[0].x, action.points[0].y);
          for (let i = 1; i < action.points.length; i++) {
            ctx.lineTo(action.points[i].x, action.points[i].y);
          }
          ctx.stroke();
        }
        break;
      case 'arrow':
        if (action.start && action.end) {
          ctx.strokeStyle = action.color;
          ctx.lineWidth = action.lineWidth;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(action.start.x, action.start.y);
          ctx.lineTo(action.end.x, action.end.y);
          ctx.stroke();
          const angle = Math.atan2(action.end.y - action.start.y, action.end.x - action.start.x);
          const headLen = Math.max(15, action.lineWidth * 5);
          ctx.beginPath();
          ctx.moveTo(action.end.x, action.end.y);
          ctx.lineTo(action.end.x - headLen * Math.cos(angle - Math.PI / 6), action.end.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(action.end.x, action.end.y);
          ctx.lineTo(action.end.x - headLen * Math.cos(angle + Math.PI / 6), action.end.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
        break;
      case 'rect':
        if (action.start && action.end) {
          ctx.strokeStyle = action.color;
          ctx.lineWidth = action.lineWidth;
          ctx.lineJoin = 'miter';
          ctx.strokeRect(action.start.x, action.start.y, action.end.x - action.start.x, action.end.y - action.start.y);
        }
        break;
      case 'mosaic':
        if (action.points && action.points.length > 0) {
          const blockSize = Math.max(10, action.lineWidth * 3);
          const imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
          for (const pt of action.points) {
            mosaicBlock(imgData, Math.floor(pt.x), Math.floor(pt.y), blockSize, ctx.canvas.width, ctx.canvas.height);
          }
          ctx.putImageData(imgData, 0, 0);
        }
        break;
      case 'text':
        if (action.start && action.text) {
          ctx.fillStyle = action.color;
          ctx.font = `${action.fontSize || 20}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.textBaseline = 'top';
          const lines = action.text.split('\n');
          lines.forEach((line, i) => {
            ctx.fillText(line, action.start!.x, action.start!.y + i * (action.fontSize || 20) * 1.3);
          });
        }
        break;
    }
    ctx.restore();
  };

  const mosaicBlock = (imgData: ImageData, cx: number, cy: number, blockSize: number, w: number, h: number) => {
    const startX = Math.max(0, cx - blockSize);
    const startY = Math.max(0, cy - blockSize);
    const endX = Math.min(w, cx + blockSize);
    const endY = Math.min(h, cy + blockSize);
    const data = imgData.data;
    for (let y = startY; y < endY; y += blockSize) {
      for (let x = startX; x < endX; x += blockSize) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = 0; dy < blockSize && y + dy < endY; dy++) {
          for (let dx = 0; dx < blockSize && x + dx < endX; dx++) {
            const idx = ((y + dy) * w + (x + dx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        for (let dy = 0; dy < blockSize && y + dy < endY; dy++) {
          for (let dx = 0; dx < blockSize && x + dx < endX; dx++) {
            const idx = ((y + dy) * w + (x + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
          }
        }
      }
    }
  };

  const getCanvasPos = (e: React.MouseEvent): { x: number; y: number } | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (textInput) return;
    const pos = getCanvasPos(e);
    if (!pos) return;

    if (activeTool === 'text') {
      setTextInput({ x: pos.x, y: pos.y, value: '' });
      return;
    }

    setIsDrawing(true);
    setDrawStart(pos);
    if (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'mosaic') {
      setCurrentPoints([pos]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    if (!pos) return;

    if (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'mosaic') {
      setCurrentPoints((prev) => [...prev, pos]);
      drawPreview(pos);
    } else if (drawStart) {
      drawPreview(pos);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    if (!pos) { setIsDrawing(false); return; }

    let newAction: DrawAction | null = null;

    if (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'mosaic') {
      const points = [...currentPoints, pos];
      if (points.length > 0) {
        newAction = {
          type: activeTool,
          points,
          color: brushColor,
          lineWidth: activeTool === 'mosaic' ? brushSize : (activeTool === 'eraser' ? brushSize * 3 : brushSize),
        };
      }
    } else if (drawStart) {
      newAction = {
        type: activeTool,
        start: drawStart,
        end: pos,
        color: brushColor,
        lineWidth: brushSize,
      };
    }

    if (newAction) {
      setActions((prev) => [...prev, newAction]);
    }

    setIsDrawing(false);
    setDrawStart(null);
    setCurrentPoints([]);
    clearOverlay();
  };

  const drawPreview = (currentPos: { x: number; y: number }) => {
    const overlay = overlayCanvasRef.current;
    const main = canvasRef.current;
    if (!overlay || !main) return;
    overlay.width = main.width;
    overlay.height = main.height;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (activeTool === 'brush' || activeTool === 'eraser') {
      const pts = [...currentPoints, currentPos];
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(200,200,200,0.5)' : brushColor;
        ctx.lineWidth = activeTool === 'eraser' ? brushSize * 3 : brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (activeTool === 'mosaic') {
      ctx.strokeStyle = 'rgba(128,128,128,0.3)';
      ctx.lineWidth = brushSize * 6;
      ctx.lineCap = 'round';
      const pts = [...currentPoints, currentPos];
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (drawStart) {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      if (activeTool === 'arrow') {
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(drawStart.x, drawStart.y);
        ctx.lineTo(currentPos.x, currentPos.y);
        ctx.stroke();
        const angle = Math.atan2(currentPos.y - drawStart.y, currentPos.x - drawStart.x);
        const headLen = Math.max(15, brushSize * 5);
        ctx.beginPath();
        ctx.moveTo(currentPos.x, currentPos.y);
        ctx.lineTo(currentPos.x - headLen * Math.cos(angle - Math.PI / 6), currentPos.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(currentPos.x, currentPos.y);
        ctx.lineTo(currentPos.x - headLen * Math.cos(angle + Math.PI / 6), currentPos.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (activeTool === 'rect') {
        ctx.lineJoin = 'miter';
        ctx.strokeRect(drawStart.x, drawStart.y, currentPos.x - drawStart.x, currentPos.y - drawStart.y);
      }
    }
  };

  const clearOverlay = () => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
  };

  const handleTextSubmit = () => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }
    const newAction: DrawAction = {
      type: 'text',
      start: { x: textInput.x, y: textInput.y },
      color: brushColor,
      lineWidth: brushSize,
      text: textInput.value,
      fontSize,
    };
    setActions((prev) => [...prev, newAction]);
    setTextInput(null);
  };

  const handleUndo = () => {
    setActions((prev) => prev.slice(0, -1));
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    if (window.electronAPI?.saveImage) {
      window.electronAPI.saveImage(dataUrl);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (err) {
      console.error('复制到剪贴板失败:', err);
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.closeEditorWindow) {
      window.electronAPI.closeEditorWindow();
    }
  };

  const colors = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#5856d6', '#af52de', '#000000', '#ffffff'];

  const tools: { type: ToolType; label: string; icon: string }[] = [
    { type: 'brush', label: '画笔', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
    { type: 'arrow', label: '箭头', icon: 'M14 5l7 7m0 0l-7 7m7-7H3' },
    { type: 'rect', label: '矩形', icon: 'M4 6h16M4 6v12M4 18h16M20 6v12' },
    { type: 'mosaic', label: '马赛克', icon: 'M4 4h4v4H4V4zm8 0h4v4h-4V4zm-8 8h4v4H4v-4zm8 0h4v4h-4v-4z' },
    { type: 'text', label: '文字', icon: 'M4 7V4h16v3M9 20h6M12 4v16' },
    { type: 'eraser', label: '橡皮', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
  ];

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gray-900 flex flex-col">
      <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">图像编辑器</span>
          <div className="w-px h-6 bg-gray-600" />
          {tools.map((tool) => (
            <button
              key={tool.type}
              onClick={() => { setActiveTool(tool.type); setTextInput(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                activeTool === tool.type
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title={tool.label}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tool.icon} />
              </svg>
              <span>{tool.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-2">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setBrushColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  brushColor === c ? 'border-white scale-125' : 'border-gray-600'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 mr-2">
            <span className="text-xs text-gray-400">粗细</span>
            <input
              type="range"
              min={1}
              max={20}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-16 h-1 accent-primary-500"
            />
            <span className="text-xs text-gray-400 w-4">{brushSize}</span>
          </div>

          {(activeTool === 'text') && (
            <div className="flex items-center gap-1 mr-2">
              <span className="text-xs text-gray-400">字号</span>
              <input
                type="range"
                min={12}
                max={72}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-16 h-1 accent-primary-500"
              />
              <span className="text-xs text-gray-400 w-6">{fontSize}</span>
            </div>
          )}

          <button
            onClick={handleUndo}
            disabled={actions.length === 0}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-30"
          >
            撤销
          </button>
          <div className="w-px h-6 bg-gray-600" />
          <button
            onClick={handleCopyToClipboard}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            复制
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            保存
          </button>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>
      </div>

      <div
        className="flex-1 relative overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); clearOverlay(); } }}
      >
        {imageDataUrl && (
          <div
            style={{
              position: 'absolute',
              left: canvasOffset.x,
              top: canvasOffset.y,
              width: imageSize.width * scale,
              height: imageSize.height * scale,
            }}
            className="shadow-2xl"
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0"
              style={{ width: imageSize.width * scale, height: imageSize.height * scale }}
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0"
              style={{ width: imageSize.width * scale, height: imageSize.height * scale, cursor: activeTool === 'text' ? 'text' : 'crosshair' }}
            />

            {textInput && (
              <textarea
                autoFocus
                value={textInput.value}
                onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setTextInput(null); e.stopPropagation(); }
                  if (e.key === 'Enter' && e.metaKey) { handleTextSubmit(); e.stopPropagation(); }
                }}
                onBlur={handleTextSubmit}
                className="absolute bg-transparent border-2 border-primary-400 text-white outline-none resize-none"
                style={{
                  left: textInput.x * scale,
                  top: textInput.y * scale,
                  fontSize: fontSize * scale,
                  color: brushColor,
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  minWidth: 100,
                  minHeight: fontSize * scale * 1.5,
                }}
              />
            )}
          </div>
        )}

        {!imageDataUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">等待加载图片...</p>
            </div>
          </div>
        )}
      </div>

      <div className="h-8 bg-gray-800 border-t border-gray-700 flex items-center px-4 text-xs text-gray-500">
        <span>工具: {tools.find(t => t.type === activeTool)?.label}</span>
        {imageSize.width > 0 && (
          <>
            <span className="mx-3">|</span>
            <span>尺寸: {imageSize.width} × {imageSize.height}</span>
          </>
        )}
        {actions.length > 0 && (
          <>
            <span className="mx-3">|</span>
            <span>操作数: {actions.length}</span>
          </>
        )}
        <span className="ml-auto">Cmd+Enter 确认文字</span>
      </div>
    </div>
  );
};

export default Editor;
