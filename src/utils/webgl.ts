export class WebGLImageProcessor {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private canvas: HTMLCanvasElement;
  private vertexBuffer: WebGLBuffer | null = null;
  private isWebGLAvailable = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.initWebGL();
  }

  private initWebGL() {
    const gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true }) ||
               this.canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    if (!gl) {
      this.isWebGLAvailable = false;
      return;
    }
    this.gl = gl as WebGLRenderingContext;
    this.isWebGLAvailable = this.createShaders();
  }

  private createShaders(): boolean {
    if (!this.gl) return false;
    const gl = this.gl;

    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    if (!vertexShader) return false;

    const fragmentShaderSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform int u_effectType;
      uniform float u_param1;
      uniform float u_param2;
      uniform vec2 u_textureSize;
      uniform vec2 u_roiStart;
      uniform vec2 u_roiEnd;

      void main() {
        vec2 uv = v_texCoord;
        vec4 color = texture2D(u_image, uv);

        float inRoiX = step(u_roiStart.x, uv.x) * step(uv.x, u_roiEnd.x);
        float inRoiY = step(u_roiStart.y, uv.y) * step(uv.y, u_roiEnd.y);
        float inRoi = inRoiX * inRoiY;

        if (u_effectType == 0) {
          gl_FragColor = color;
        } else if (u_effectType == 1) {
          float radius = u_param1;
          vec2 texel = 1.0 / u_textureSize;
          vec4 sum = vec4(0.0);
          int samples = 0;
          for (int x = -8; x <= 8; x++) {
            for (int y = -8; y <= 8; y++) {
              vec2 offset = vec2(float(x), float(y)) * texel * radius;
              vec2 sampleUv = uv + offset;
              if (sampleUv.x >= 0.0 && sampleUv.x <= 1.0 && sampleUv.y >= 0.0 && sampleUv.y <= 1.0) {
                float weight = 1.0 - (length(vec2(float(x), float(y))) / 12.0);
                weight = max(weight, 0.0);
                sum += texture2D(u_image, sampleUv) * weight;
                samples++;
              }
            }
          }
          vec4 blurred = sum / 145.0;
          gl_FragColor = mix(color, blurred, inRoi);
        } else if (u_effectType == 2) {
          float blockSize = u_param1;
          vec2 block = blockSize / u_textureSize;
          vec2 mosaicUv = floor(uv / block) * block + block * 0.5;
          vec4 mosaicColor = texture2D(u_image, mosaicUv);
          gl_FragColor = mix(color, mosaicColor, inRoi);
        } else {
          gl_FragColor = color;
        }
      }
    `;

    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      return false;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return false;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return false;
    }

    this.program = program;

    const vertices = new Float32Array([
      -1, -1,  0, 1,
       1, -1,  1, 1,
      -1,  1,  0, 0,
       1,  1,  1, 0,
    ]);

    this.vertexBuffer = gl.createBuffer();
    if (!this.vertexBuffer) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, 'a_position');
    const aTexCoord = gl.getAttribLocation(program, 'a_texCoord');

    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);

    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private loadTexture(image: HTMLImageElement | HTMLCanvasElement | ImageData): boolean {
    if (!this.gl) return false;
    const gl = this.gl;

    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    this.texture = gl.createTexture();
    if (!this.texture) return false;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    if (image instanceof ImageData) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }

    return true;
  }

  public available(): boolean {
    return this.isWebGLAvailable;
  }

  private applyEffect(
    effectType: number,
    param1: number,
    source: HTMLCanvasElement,
    roiX: number = 0,
    roiY: number = 0,
    roiW: number = -1,
    roiH: number = -1
  ): boolean {
    if (!this.isWebGLAvailable || !this.gl || !this.program) return false;
    const gl = this.gl;

    const width = source.width;
    const height = source.height;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (!this.loadTexture(source)) return false;

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    const uEffectType = gl.getUniformLocation(this.program, 'u_effectType');
    const uParam1 = gl.getUniformLocation(this.program, 'u_param1');
    const uParam2 = gl.getUniformLocation(this.program, 'u_param2');
    const uTextureSize = gl.getUniformLocation(this.program, 'u_textureSize');
    const uRoiStart = gl.getUniformLocation(this.program, 'u_roiStart');
    const uRoiEnd = gl.getUniformLocation(this.program, 'u_roiEnd');
    const uImage = gl.getUniformLocation(this.program, 'u_image');

    const rx = roiW < 0 ? 0 : roiX / width;
    const ry = roiH < 0 ? 0 : 1 - (roiY + (roiH < 0 ? height : roiH)) / height;
    const rw = roiW < 0 ? 1 : roiW / width;
    const rh = roiH < 0 ? 1 : (roiH < 0 ? height : roiH) / height;

    gl.uniform1i(uEffectType, effectType);
    gl.uniform1f(uParam1, param1);
    gl.uniform1f(uParam2, 0);
    gl.uniform2f(uTextureSize, width, height);
    gl.uniform2f(uRoiStart, rx, ry);
    gl.uniform2f(uRoiEnd, rx + rw, ry + rh);
    gl.uniform1i(uImage, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.finish();
    return true;
  }

  public applyBlur(
    source: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
    radius: number = 5,
    roiX: number = 0,
    roiY: number = 0,
    roiW: number = -1,
    roiH: number = -1
  ): boolean {
    if (!this.applyEffect(1, radius, source, roiX, roiY, roiW, roiH)) return false;
    try {
      targetCtx.save();
      targetCtx.setTransform(1, 0, 0, 1, 0, 0);
      targetCtx.clearRect(0, 0, source.width, source.height);
      targetCtx.drawImage(this.canvas, 0, 0);
      targetCtx.restore();
      return true;
    } catch {
      return false;
    }
  }

  public applyMosaic(
    source: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
    blockSize: number = 15,
    roiX: number = 0,
    roiY: number = 0,
    roiW: number = -1,
    roiH: number = -1
  ): boolean {
    if (!this.applyEffect(2, blockSize, source, roiX, roiY, roiW, roiH)) return false;
    try {
      targetCtx.save();
      targetCtx.setTransform(1, 0, 0, 1, 0, 0);
      targetCtx.clearRect(0, 0, source.width, source.height);
      targetCtx.drawImage(this.canvas, 0, 0);
      targetCtx.restore();
      return true;
    } catch {
      return false;
    }
  }

  public destroy() {
    if (this.gl && this.texture) this.gl.deleteTexture(this.texture);
    if (this.gl && this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
    if (this.gl && this.vertexBuffer) this.gl.deleteBuffer(this.vertexBuffer);
    if (this.gl && this.program) this.gl.deleteProgram(this.program);
    this.texture = null;
    this.framebuffer = null;
    this.vertexBuffer = null;
    this.program = null;
    this.gl = null;
  }
}

export const webglProcessor = new WebGLImageProcessor();
