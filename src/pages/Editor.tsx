import { useState, useEffect, useRef, useCallback } from 'react';
import { webglProcessor } from '../utils/webgl';

type ToolType = 'brush' | 'arrow' | 'rect' | 'mosaic' | 'text' | 'eraser' | 'number' | 'highlight' | 'blur';

interface DrawAction {
  type: ToolType;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  color: string;
  lineWidth: number;
  text?: string;
  fontSize?: number;
  numberIndex?: number;
  highlightAlpha?: number;
  blurRadius?: number;
  mosaicSize?: number;
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
  const [numberCounter, setNumberCounter] = useState(1);
  const [highlightAlpha, setHighlightAlpha] = useState(0.4);
  const [blurRadius, setBlurRadius] = useState(8);
  const [mosaicSize, setMosaicSize] = useState(15);
  const [useWebGL, setUseWebGL] = useState(true);

  useEffect(() => {
    if (window.electronAPI?.onLoadImage) {
      window.electronAPI.onLoadImage((data: string) => {
        setImageDataUrl(data);
        setActions([]);
        setNumberCounter(1);
      });
    }
    return () => {
    };
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

  const getHexColorComponents = (hex: string) => {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  };

  const rgba = (hex: string, alpha: number) => {
    const { r, g, b } = getHexColorComponents(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  };

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
      case 'highlight':
        if (action.start && action.end) {
          const alpha = action.highlightAlpha ?? 0.4;
          ctx.fillStyle = rgba(action.color, alpha);
          const x = Math.min(action.start.x, action.end.x);
          const y = Math.min(action.start.y, action.end.y);
          const w = Math.abs(action.end.x - action.start.x);
          const h = Math.abs(action.end.y - action.start.y);
          ctx.fillRect(x, y, w, h);
        }
        break;
      case 'mosaic':
        if (action.points && action.points.length > 0) {
          const blockSize = action.mosaicSize ?? 15;
          const canvas = ctx.canvas;
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) break;
          tempCtx.drawImage(canvas, 0, 0);

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const pt of action.points) {
            const px = Math.floor(pt.x);
            const py = Math.floor(pt.y);
            minX = Math.min(minX, px - blockSize);
            minY = Math.min(minY, py - blockSize);
            maxX = Math.max(maxX, px + blockSize);
            maxY = Math.max(maxY, py + blockSize);
          }
          minX = Math.max(0, Math.floor(minX));
          minY = Math.max(0, Math.floor(minY));
          maxX = Math.min(canvas.width, Math.ceil(maxX));
          maxY = Math.min(canvas.height, Math.ceil(maxY));
          const roiW = maxX - minX;
          const roiH = maxY - minY;

          if (useWebGL && webglProcessor.available() && roiW > 0 && roiH > 0) {
            const result = webglProcessor.applyMosaic(
              tempCanvas,
              ctx,
              blockSize,
              minX,
              minY,
              roiW,
              roiH
            );
            if (result) break;
          }

          const roiImgData = ctx.getImageData(minX, minY, roiW, roiH);
          const data = roiImgData.data;
          for (let y = 0; y < roiH; y += blockSize) {
            for (let x = 0; x < roiW; x += blockSize) {
              let r = 0, g = 0, b = 0, count = 0;
              const blockEndX = Math.min(x + blockSize, roiW);
              const blockEndY = Math.min(y + blockSize, roiH);
              for (let dy = 0; dy < blockEndY - y; dy++) {
                for (let dx = 0; dx < blockEndX - x; dx++) {
                  const idx = ((y + dy) * roiW + (x + dx)) * 4;
                  r += data[idx];
                  g += data[idx + 1];
                  b += data[idx + 2];
                  count++;
                }
              }
              r = Math.floor(r / count);
              g = Math.floor(g / count);
              b = Math.floor(b / count);
              for (let dy = 0; dy < blockEndY - y; dy++) {
                for (let dx = 0; dx < blockEndX - x; dx++) {
                  const idx = ((y + dy) * roiW + (x + dx)) * 4;
                  data[idx] = r;
                  data[idx + 1] = g;
                  data[idx + 2] = b;
                }
              }
            }
          }
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.putImageData(roiImgData, minX, minY);
          ctx.restore();
        }
        break;
      case 'blur':
        if (action.start && action.end) {
          const radius = action.blurRadius ?? 8;
          const canvas = ctx.canvas;
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) break;
          tempCtx.drawImage(canvas, 0, 0);

          const x = Math.min(action.start.x, action.end.x);
          const y = Math.min(action.start.y, action.end.y);
          const w = Math.abs(action.end.x - action.start.x);
          const h = Math.abs(action.end.y - action.start.y);

          if (useWebGL && webglProcessor.available() && w > 0 && h > 0) {
            const result = webglProcessor.applyBlur(
              tempCanvas,
              ctx,
              radius,
              Math.floor(x),
              Math.floor(y),
              Math.ceil(w),
              Math.ceil(h)
            );
            if (result) break;
          }

          const boxBlur = (imgData: ImageData, r: number) => {
            const w = imgData.width;
            const h = imgData.height;
            const src = imgData.data;
            const dst = new Uint8ClampedArray(src);
            const radius = Math.max(1, Math.floor(r));
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
                for (let dy = -radius; dy <= radius; dy++) {
                  for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                      const idx = (ny * w + nx) * 4;
                      rSum += src[idx];
                      gSum += src[idx + 1];
                      bSum += src[idx + 2];
                      aSum += src[idx + 3];
                      count++;
                    }
                  }
                }
                const didx = (y * w + x) * 4;
                dst[didx] = rSum / count;
                dst[didx + 1] = gSum / count;
                dst[didx + 2] = bSum / count;
                dst[didx + 3] = aSum / count;
              }
            }
            for (let i = 0; i < src.length; i++) imgData.data[i] = dst[i];
          };

          const fx = Math.floor(Math.max(0, x));
          const fy = Math.floor(Math.max(0, y));
          const fw = Math.floor(Math.min(canvas.width - fx, w));
          const fh = Math.floor(Math.min(canvas.height - fy, h));
          if (fw > 0 && fh > 0) {
            const roiImgData = ctx.getImageData(fx, fy, fw, fh);
            boxBlur(roiImgData, radius);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.putImageData(roiImgData, fx, fy);
            ctx.restore();
          }
        }
        break;
      case 'number':
        if (action.start && action.numberIndex != null) {
          const fs = action.fontSize || 24;
          const circleRadius = fs * 0.8;
          ctx.save();
          ctx.fillStyle = action.color;
          ctx.beginPath();
          ctx.arc(action.start.x, action.start.y, circleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#ffffff';
          ctx.font = `bold ${fs}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const num = String(action.numberIndex);
          ctx.fillText(num, action.start.x, action.start.y + 1);
          ctx.restore();
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

    if (activeTool === 'number') {
      const newAction: DrawAction = {
        type: 'number',
        start: pos,
        color: brushColor,
        lineWidth: brushSize,
        fontSize: fontSize,
        numberIndex: numberCounter,
      };
      setActions((prev) => [...prev, newAction]);
      setNumberCounter((c) => c + 1);
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
          mosaicSize: activeTool === 'mosaic' ? mosaicSize : undefined,
        };
      }
    } else if (drawStart) {
      if (activeTool === 'highlight') {
        newAction = {
          type: 'highlight',
          start: drawStart,
          end: pos,
          color: brushColor,
          lineWidth: brushSize,
          highlightAlpha: highlightAlpha,
        };
      } else if (activeTool === 'blur') {
        newAction = {
          type: 'blur',
          start: drawStart,
          end: pos,
          color: brushColor,
          lineWidth: brushSize,
          blurRadius: blurRadius,
        };
      } else {
        newAction = {
          type: activeTool,
          start: drawStart,
          end: pos,
          color: brushColor,
          lineWidth: brushSize,
        };
      }
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
      ctx.strokeStyle = 'rgba(128,128,128,0.5)';
      ctx.lineWidth = mosaicSize * 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pts = [...currentPoints, currentPos];
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (drawStart) {
      if (activeTool === 'arrow') {
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
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
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
        ctx.lineJoin = 'miter';
        ctx.strokeRect(drawStart.x, drawStart.y, currentPos.x - drawStart.x, currentPos.y - drawStart.y);
      } else if (activeTool === 'highlight') {
        const x = Math.min(drawStart.x, currentPos.x);
        const y = Math.min(drawStart.y, currentPos.y);
        const w = Math.abs(currentPos.x - drawStart.x);
        const h = Math.abs(currentPos.y - drawStart.y);
        ctx.fillStyle = rgba(brushColor, highlightAlpha);
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = rgba(brushColor, Math.min(1, highlightAlpha + 0.3));
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
      } else if (activeTool === 'blur') {
        const x = Math.min(drawStart.x, currentPos.x);
        const y = Math.min(drawStart.y, currentPos.y);
        const w = Math.abs(currentPos.x - drawStart.x);
        const h = Math.abs(currentPos.y - drawStart.y);
        ctx.fillStyle = 'rgba(128,128,128,0.2)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(100,100,100,0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
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
    setActions((prev) => {
      const newActions = prev.slice(0, -1);
      const lastAction = prev[prev.length - 1];
      if (lastAction?.type === 'number' && lastAction.numberIndex != null && lastAction.numberIndex === numberCounter - 1) {
        setNumberCounter((c) => Math.max(1, c - 1));
      }
      return newActions;
    });
  };

  const handleResetNumbering = () => {
    setNumberCounter(1);
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
    { type: 'highlight', label: '高亮', icon: 'M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z' },
    { type: 'mosaic', label: '马赛克', icon: 'M4 4h4v4H4V4zm8 0h4v4h-4V4zm-8 8h4v4H4v-4zm8 0h4v4h-4v-4z' },
    { type: 'blur', label: '模糊', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { type: 'number', label: '序号', icon: 'M9 10h1a1 1 0 100-2H9V7a1 1 0 00-2 0v1H6a1 1 0 100 2h1v1a1 1 0 102 0v-1zm5 4h3M7 19h10M17 11a2 2 0 11-4 0 2 2 0 014 0zM5 11a2 2 0 11-4 0 2 2 0 014 0z' },
    { type: 'text', label: '文字', icon: 'M4 7V4h16v3M9 20h6M12 4v16' },
    { type: 'eraser', label: '橡皮', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
  ];

  const currentToolLabel = tools.find(t => t.type === activeTool)?.label || '';

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gray-900 flex flex-col">
      <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
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
          {activeTool === 'number' && (
            <div className="flex items-center gap-1 ml-2 px-2 py-1 bg-gray-700 rounded-lg">
              <span className="text-xs text-gray-400">下一个:</span>
              <span className="text-sm font-bold text-primary-400 font-mono min-w-[16px] text-center">{numberCounter}</span>
              <button
                onClick={handleResetNumbering}
                className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 hover:bg-gray-600 rounded"
                title="重置序号"
              >重置</button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
              max={30}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-16 h-1 accent-primary-500"
            />
            <span className="text-xs text-gray-400 w-4">{brushSize}</span>
          </div>

          {(activeTool === 'text' || activeTool === 'number') && (
            <div className="flex items-center gap-1 mr-2">
              <span className="text-xs text-gray-400">字号</span>
              <input
                type="range"
                min={12}
                max={96}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-16 h-1 accent-primary-500"
              />
              <span className="text-xs text-gray-400 w-8">{fontSize}px</span>
            </div>
          )}

          {activeTool === 'highlight' && (
            <div className="flex items-center gap-1 mr-2">
              <span className="text-xs text-gray-400">透明度</span>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={highlightAlpha}
                onChange={(e) => setHighlightAlpha(Number(e.target.value))}
                className="w-16 h-1 accent-primary-500"
              />
              <span className="text-xs text-gray-400 w-8">{Math.round(highlightAlpha * 100)}%</span>
            </div>
          )}

          {activeTool === 'blur' && (
            <div className="flex items-center gap-1 mr-2">
              <span className="text-xs text-gray-400">强度</span>
              <input
                type="range"
                min={2}
                max={30}
                value={blurRadius}
                onChange={(e) => setBlurRadius(Number(e.target.value))}
                className="w-16 h-1 accent-primary-500"
              />
              <span className="text-xs text-gray-400 w-6">{blurRadius}</span>
            </div>
          )}

          {activeTool === 'mosaic' && (
            <div className="flex items-center gap-1 mr-2">
              <span className="text-xs text-gray-400">块大小</span>
              <input
                type="range"
                min={5}
                max={50}
                value={mosaicSize}
                onChange={(e) => setMosaicSize(Number(e.target.value))}
                className="w-16 h-1 accent-primary-500"
              />
              <span className="text-xs text-gray-400 w-6">{mosaicSize}</span>
            </div>
          )}

          <label className="flex items-center gap-1 mr-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={useWebGL}
              onChange={(e) => setUseWebGL(e.target.checked)}
              className="accent-primary-500"
            />
            <span>WebGL加速</span>
          </label>

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
              style={{
                width: imageSize.width * scale,
                height: imageSize.height * scale,
                cursor: activeTool === 'text' || activeTool === 'number'
                  ? activeTool === 'number' ? 'copy' : 'text'
                  : 'crosshair',
              }}
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
        <span>工具: {currentToolLabel}</span>
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
        <span className="ml-auto">
          {activeTool === 'number' ? '点击添加序号标注 | Cmd+Enter 确认文字' :
           activeTool === 'text' ? '点击插入文字 | Cmd+Enter 确认文字' :
           activeTool === 'highlight' || activeTool === 'blur' || activeTool === 'rect' || activeTool === 'arrow' ? '拖拽绘制区域' :
           activeTool === 'mosaic' || activeTool === 'brush' || activeTool === 'eraser' ? '按住左键绘制' : 'Cmd+Enter 确认文字'}
        </span>
        {useWebGL && webglProcessor.available() && (
          <span className="ml-3 text-primary-400">✓ WebGL 已启用</span>
        )}
      </div>
    </div>
  );
};

export default Editor;
