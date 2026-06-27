import { useEffect, useRef } from "react";

type Params = { blueish: number; scale: number; illumination: number; surfaceDistortion: number; waterDistortion: number; src: string };
export type WaterRippleImageProps = Partial<Params> & { className?: string };

const VERT = `precision mediump float;varying vec2 vUv;attribute vec2 a_position;void main(){vUv=.5*(a_position+1.);gl_Position=vec4(a_position,0.0,1.0);}`;
const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D u_image_texture;uniform float u_time;uniform float u_ratio;uniform float u_img_ratio;
uniform float u_blueish;uniform float u_scale;uniform float u_illumination;uniform float u_surface_distortion;uniform float u_water_distortion;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}
float snoise(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1;i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);}
mat2 rotate2D(float r){return mat2(cos(r),sin(r),-sin(r),cos(r));}
float surface_noise(vec2 uv,float t,float scale){vec2 n=vec2(.1);vec2 N=vec2(.1);mat2 m=rotate2D(.5);for(int j=0;j<10;j++){uv*=m;n*=m;vec2 q=uv*scale+float(j)+n+(.5+.5*float(j))*(mod(float(j),2.)-1.)*t;n+=sin(q);N+=cos(q)/scale;scale*=1.2;}return(N.x+N.y+.1);}
void main(){vec2 uv=vUv;uv.y=1.-uv.y;uv.x*=u_ratio;float t=.002*u_time;vec3 color=vec3(0.);float opacity=0.;
float outer_noise=snoise((.3+.1*sin(t))*uv+vec2(0.,.2*t));vec2 surface_noise_uv=2.*uv+(outer_noise*.2);
float surf=surface_noise(surface_noise_uv,t,u_scale);surf*=pow(uv.y,.3);surf=pow(surf,2.);
vec2 img_uv=vUv;img_uv-=.5;if(u_ratio>u_img_ratio){img_uv.x=img_uv.x*u_ratio/u_img_ratio;}else{img_uv.y=img_uv.y*u_img_ratio/u_ratio;}
float scale_factor=1.4;img_uv*=scale_factor;img_uv+=.5;img_uv.y=1.-img_uv.y;img_uv+=(u_water_distortion*outer_noise);img_uv+=(u_surface_distortion*surf);
vec4 img=texture2D(u_image_texture,img_uv);img*=(1.+u_illumination*surf);color+=img.rgb;color+=u_illumination*vec3(1.-u_blueish,1.,1.)*surf;opacity+=img.a;
float edge_width=.02;float edge_alpha=smoothstep(0.,edge_width,img_uv.x)*smoothstep(1.,1.-edge_width,img_uv.x);edge_alpha*=smoothstep(0.,edge_width,img_uv.y)*smoothstep(1.,1.-edge_width,img_uv.y);color*=edge_alpha;opacity*=edge_alpha;
gl_FragColor=vec4(color,opacity);}`;

function compile(gl: WebGLRenderingContext, src: string, type: number) {
  const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader err");
  return sh;
}

export function WaterRippleImage({ blueish = 0.4, scale = 7, illumination = 0.15, surfaceDistortion = 0.05, waterDistortion = 0.03, src = import.meta.env.BASE_URL + "memes/meme1.jpg", className = "" }: WaterRippleImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = (canvas.getContext("webgl", { alpha: true, antialias: true }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const v = compile(gl, VERT, gl.VERTEX_SHADER), f = compile(gl, FRAG, gl.FRAGMENT_SHADER);
    const program = gl.createProgram()!; gl.attachShader(program, v); gl.attachShader(program, f); gl.linkProgram(program); gl.useProgram(program);
    const U: Record<string, WebGLUniformLocation | null> = {};
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(program, i); if (info) U[info.name] = gl.getUniformLocation(program, info.name); }
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "a_position"); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(U["u_blueish"], blueish); gl.uniform1f(U["u_scale"], scale); gl.uniform1f(U["u_illumination"], illumination);
    gl.uniform1f(U["u_surface_distortion"], surfaceDistortion); gl.uniform1f(U["u_water_distortion"], waterDistortion);

    let img: HTMLImageElement | null = null;
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => {
      img = image;
      const tex = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(U["u_image_texture"], 0);
      gl.uniform1f(U["u_img_ratio"], image.naturalWidth / image.naturalHeight);
    };
    image.src = src;

    const resize = () => {
      const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
      canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); gl.uniform1f(U["u_ratio"], w / h);
      if (img) gl.uniform1f(U["u_img_ratio"], img.naturalWidth / img.naturalHeight);
    };
    resize(); window.addEventListener("resize", resize);
    let raf = 0;
    const render = () => { if (U["u_time"]) gl.uniform1f(U["u_time"], performance.now()); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); raf = requestAnimationFrame(render); };
    raf = requestAnimationFrame(render);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(raf); gl.deleteProgram(program); };
  }, []);
  return <canvas ref={canvasRef} className={"fixed inset-0 w-full h-full " + className} />;
}
