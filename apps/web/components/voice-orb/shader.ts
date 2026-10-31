/**
 * Ported from docs/reference/aural-prototype-v2.html (VS / FS).
 * Full-screen quad vertex shader plus the orb fragment shader.
 */
export const ORB_VERTEX = [
  'attribute vec2 p;',
  'void main(){ gl_Position = vec4(p,0.0,1.0); }',
].join('\n');

export const ORB_FRAGMENT = [
  'precision highp float;',
  'uniform vec2 R; uniform float T; uniform float AMP; uniform vec2 M; uniform float MODE;',
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
  'float noise(vec2 p){',
  '  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);',
  '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y);',
  '}',
  'float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }',
  'void main(){',
  '  vec2 uv=(gl_FragCoord.xy-0.5*R)/min(R.x,R.y);',
  '  uv += M*0.035;',
  '  float r=length(uv);',
  '  float t=T*0.22;',
  '  vec2 q=vec2(fbm(uv*2.7+vec2(t,0.0)), fbm(uv*2.7+vec2(0.0,t*1.25)));',
  '  float f=fbm(uv*3.6+q*1.5+vec2(0.0,t*0.8));',
  '  float disc=smoothstep(0.356,0.338,r);',
  '  float core=pow(max(0.0,1.0-r/0.356),1.5);',
  '  float rim=smoothstep(0.225,0.345,r)*disc;',
  '  vec3 c1=vec3(0.30,0.17,0.78);',
  '  vec3 c2=vec3(0.10,0.62,0.86);',
  '  vec3 inner=mix(c1,c2,smoothstep(0.22,0.82,f));',
  '  vec3 col=inner*(0.48+0.95*core);',
  '  col*=0.72+0.62*smoothstep(0.12,0.86,f);',
  '  col+=vec3(0.76,0.72,1.0)*rim*0.72;',
  '  float atmo=exp(-max(0.0,r-0.328)*8.5)*(1.0-disc)*(0.16+AMP*0.5);',
  '  col+=vec3(0.34,0.26,0.95)*atmo*1.5;',
  '  vec2 hs=uv-vec2(-0.07,-0.052);',
  '  float hot=exp(-dot(hs,hs)*22.0);',
  '  col+=vec3(0.66,0.58,1.0)*hot*0.55;',
  '  col*=0.87+0.20*smoothstep(-0.34,0.34,-uv.y);',
  '  if(MODE>0.5){',
  '    float ring=1.0-smoothstep(0.0,0.009,abs(r-0.395-fract(T*0.22)*0.085));',
  '    col+=vec3(0.13,0.83,0.93)*ring*0.55;',
  '  }',
  '  float a=disc*(0.52+0.48*core)+atmo*0.75;',
  '  a=clamp(a,0.0,1.0);',
  '  gl_FragColor=vec4(col*a, a);',
  '}',
].join('\n');
