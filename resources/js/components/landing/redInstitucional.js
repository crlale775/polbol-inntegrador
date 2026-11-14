import {
    ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, CircleGeometry, Color, ConeGeometry, CubicBezierCurve3, CylinderGeometry, DirectionalLight, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, FogExp2, GridHelper, Group, HemisphereLight, IcosahedronGeometry, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Points, PointsMaterial, RingGeometry, SRGBColorSpace, Scene, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry, TubeGeometry, Vector3, WebGLRenderer
} from 'three';
import { agruparEscena } from './agruparEscena';

/** Adaptación local del ejemplo aportado: sin CDN, contadores ficticios ni datos privados. */
export function crearRedInstitucional(canvas,{reducedMotion=false,onReady,onError}={}) {
 let renderer,scene,frame=0,stopped=false;
 const medir=new URLSearchParams(window.location.search).get('rendimiento')==='1';
 let metricStart=0,metricFrames=0,metricCpu=0;
 const listeners=[];
 function listen(target,event,handler,options){target.addEventListener(event,handler,options);listeners.push(()=>target.removeEventListener(event,handler,options));}
 function cleanup(){
   if(stopped)return;stopped=true;cancelAnimationFrame(frame);listeners.forEach(remove=>remove());
   const geometries=new Set(),materials=new Set(),textures=new Set();
   scene?.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
   geometries.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());renderer?.dispose();renderer?.forceContextLoss();
 }
 try {

var rnd=Math.random,PI=Math.PI,cv=canvas;
var R=renderer=new WebGLRenderer({canvas:cv,antialias:false,powerPreference:'high-performance',alpha:false});
const maxDpr=Math.min(devicePixelRatio,innerWidth<700?1:1.25);
R.setPixelRatio(maxDpr);R.outputColorSpace=SRGBColorSpace;R.toneMapping=ACESFilmicToneMapping;R.toneMappingExposure=1.2;
var S=scene=new Scene(),BG=0x040c08;S.background=new Color(BG);S.fog=new FogExp2(BG,.02);
var C=new PerspectiveCamera(50,1,.1,250);
S.add(new HemisphereLight(0x9fd8b8,0x08140e,.9));
var dl=new DirectionalLight(0xbfe8d0,.7);dl.position.set(-8,14,6);S.add(dl);
var hubL=new PointLight(0xf2b705,3,24);hubL.position.set(0,6.5,0);S.add(hubL);
function size(){R.setSize(innerWidth,innerHeight,false);C.aspect=innerWidth/innerHeight;C.updateProjectionMatrix()}
listen(window,'resize',size);size();

/* ---------- utilidades ---------- */
function cvs(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c}
function tex(c){var t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.anisotropy=4;return t}
function sm(a,b,x){x=Math.min(1,Math.max(0,(x-a)/(b-a)));return x*x*(3-2*x)}
function winTex(cols,rows){var c=cvs(cols*16,rows*16),x=c.getContext('2d');x.fillStyle='#0a1510';x.fillRect(0,0,c.width,c.height);
 for(var j=0;j<rows;j++){x.fillStyle='#14281d';x.fillRect(0,j*16+14,c.width,2);
  for(var i=0;i<cols;i++){var r=rnd();x.fillStyle=r<.45?'#0e1c15':r<.6?'#f2b705':r<.8?'#6fe0c0':'#d2f5e2';x.fillRect(i*16+3,j*16+3,10,9)}}
 return tex(c)}
var glT=(function(){var c=cvs(64,64),x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new CanvasTexture(c)})();
function glow(col,s,op){var m=new Sprite(new SpriteMaterial({map:glT,color:col,transparent:true,opacity:op,blending:AdditiveBlending,depthWrite:false}));m.scale.set(s,s,1);return m}
function label(txt,big){var c=cvs(512,128),x=c.getContext('2d');x.fillStyle='rgba(8,20,14,.85)';x.beginPath();x.roundRect?x.roundRect(8,16,496,96,48):x.rect(8,16,496,96);x.fill();x.strokeStyle=big?'#f2b705':'#2f8a57';x.lineWidth=4;x.stroke();
 x.fillStyle='#eef5ef';x.font='800 50px Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(txt,256,66);
 var s=new Sprite(new SpriteMaterial({map:tex(c),transparent:true,depthWrite:false}));s.scale.set(3.2,.8,1);return s}
var flowU=[];
function flowMat(col,spd,ph){var m=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,side:DoubleSide,
 uniforms:{t:{value:0},c:{value:new Color(col)},s:{value:spd},p:{value:ph}},
 vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'varying vec2 v;uniform float t,s,p;uniform vec3 c;void main(){float f=fract(v.x*4.-t*s+p);float a=.16+.95*pow(f,7.);gl_FragColor=vec4(c*a,a);}'});flowU.push(m);return m}

/* ---------- suelo y entorno ---------- */
var gt=(function(){var c=cvs(256,256),x=c.getContext('2d'),g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'#1c6a42');g.addColorStop(.3,'#0e2e1f');g.addColorStop(1,'#040c08');x.fillStyle=g;x.fillRect(0,0,256,256);return tex(c)})();
var ground=new Mesh(new CircleGeometry(60,64),new MeshBasicMaterial({map:gt}));ground.rotation.x=-PI/2;S.add(ground);
var grid=new GridHelper(80,80,0x2f8a57,0x14301f);grid.position.y=.01;grid.material.transparent=true;grid.material.opacity=.3;S.add(grid);
[4,8.2,12.5].forEach(function(r,i){var m=new Mesh(new RingGeometry(r,r+.04,128),new MeshBasicMaterial({color:0x2f8a57,transparent:true,opacity:.4-i*.1,side:DoubleSide}));m.rotation.x=-PI/2;m.position.y=.02;S.add(m)});
var ticks=new InstancedMesh(new BoxGeometry(.07,.02,.45),new MeshBasicMaterial({color:0x3fae70}),96),D=new Object3D(),tg=new Group();
for(var q=0;q<96;q++){var qa=q/96*PI*2;D.position.set(Math.cos(qa)*15.5,.03,Math.sin(qa)*15.5);D.rotation.set(0,-qa,0);D.scale.set(1,1,q%4?1:2.2);D.updateMatrix();ticks.setMatrixAt(q,D.matrix)}
D.scale.set(1,1,1);tg.add(ticks);S.add(tg);
var sky=new InstancedMesh(new BoxGeometry(1,1,1),new MeshStandardMaterial({color:0x0c1d15,emissive:0x1d5a3c,emissiveIntensity:.35,roughness:.6}),70);
for(var s=0;s<70;s++){var sa=rnd()*PI*2,sr=26+rnd()*20,sw=1.2+rnd()*2.2,sh=2+rnd()*rnd()*14;D.position.set(Math.cos(sa)*sr,sh/2,Math.sin(sa)*sr);D.rotation.set(0,rnd()*3,0);D.scale.set(sw,sh,sw);D.updateMatrix();sky.setMatrixAt(s,D.matrix)}
D.rotation.set(0,0,0);D.scale.set(1,1,1);S.add(sky);
var pa=[];for(var d=0;d<240;d++)pa.push((rnd()-.5)*56,rnd()*20,(rnd()-.5)*56);
var dust=new Points(new Float32BufferAttribute(pa,3).count?(function(){var g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pa,3));return g})():null,new PointsMaterial({color:0x9fe3b8,size:.12,map:glT,transparent:true,opacity:.55,blending:AdditiveBlending,depthWrite:false}));S.add(dust);

/* ---------- central ---------- */
var hub=new Group();S.add(hub);var HR=1.55;
var mHub=new MeshStandardMaterial({color:0x10261b,metalness:.6,roughness:.35});
function add(g,m,y){var o=new Mesh(g,m);o.position.y=y;hub.add(o);return o}
add(new CylinderGeometry(2.7,3,.5,48),mHub,.25);
var bt=new Mesh(new TorusGeometry(2.85,.05,8,80),new MeshBasicMaterial({color:0x4ade80}));bt.rotation.x=PI/2;bt.position.y=.52;hub.add(bt);
var ht=winTex(18,20),ht2=winTex(14,6);
var tw=new MeshStandardMaterial({map:ht,emissiveMap:ht,emissive:0xffffff,emissiveIntensity:.8,color:0x44705a,metalness:.4,roughness:.4});
add(new CylinderGeometry(1.35,1.6,4.6,40),tw,2.8);
add(new CylinderGeometry(.98,1.22,1.7,40),new MeshStandardMaterial({map:ht2,emissiveMap:ht2,emissive:0xffffff,emissiveIntensity:.8,color:0x44705a,metalness:.4,roughness:.4}),5.95);
[5.1,6.8].forEach(function(y,i){var c=new Mesh(new TorusGeometry(1.3-i*.2,.07,8,64),new MeshBasicMaterial({color:i?0xf2b705:0x2f8a57}));c.rotation.x=PI/2;c.position.y=y;hub.add(c)});
var cap=add(new ConeGeometry(.85,1.5,32),new MeshStandardMaterial({color:0x1f5a3a,emissive:0x1f5a3a,emissiveIntensity:.7,metalness:.5,roughness:.3}),7.55);
add(new CylinderGeometry(.03,.06,2.4,8),new MeshBasicMaterial({color:0xcfeedd}),9.3);
var core=new Mesh(new IcosahedronGeometry(.55,1),new MeshBasicMaterial({color:0xf2b705,wireframe:true}));core.position.y=10.2;hub.add(core);
var cg=glow(0xf2b705,3.2,.9);cg.position.y=10.2;hub.add(cg);
var rings=[];[[2.1,3.9,.5],[2.6,4.6,-.4],[3.2,3.4,.3]].forEach(function(r,i){var m=new Mesh(new TorusGeometry(r[0],.045,8,90,r[1]),new MeshBasicMaterial({color:i===1?0xf2b705:0x4ade80}));m.position.y=2.2+i*1.5;m.rotation.x=PI/2+r[2]*.12;hub.add(m);rings.push([m,r[2]])});
var beam=add(new CylinderGeometry(.05,.05,30,8),new MeshBasicMaterial({color:0xf2b705,transparent:true,opacity:.5,blending:AdditiveBlending,depthWrite:false}),15);
add(new CylinderGeometry(.4,.9,22,24,1,true),new MeshBasicMaterial({color:0xf2b705,transparent:true,opacity:.07,blending:AdditiveBlending,depthWrite:false,side:DoubleSide}),11);
var hl=label('COMANDO',1);hl.position.y=12.2;hl.scale.set(3.8,.95,1);hub.add(hl);
var ripples=[];for(var rp=0;rp<4;rp++){var rm=new Mesh(new RingGeometry(1,1.07,96),new MeshBasicMaterial({color:0xf2b705,transparent:true,opacity:0,side:DoubleSide,depthWrite:false}));rm.rotation.x=-PI/2;rm.position.y=.06;rm.userData.a=0;S.add(rm);ripples.push(rm)}
function spawn(){for(var i=0;i<4;i++)if(ripples[i].userData.a<=0){ripples[i].userData.a=1;break}}

/* ---------- edificios, rutas, documentos ---------- */
var names=['San Pedro','Sur','Ferroviaria','Munaypata','Cotahuma','Chijini','Centro','Bosquecillo','Merced'],N=names.length;
var acc=[0x4ade80,0xf2b705,0x7fe0c4],B=[],routes=[],packets=[],backs=[];
for(var i=0;i<N;i++){
 var a=i/N*PI*2+.35,rad=8.5+(i%3)*2.2,bx=Math.cos(a)*rad,bz=Math.sin(a)*rad,col=acc[i%3];
 var g=new Group();g.position.set(bx,0,bz);g.rotation.y=-a;S.add(g);
 var w=1.5+(i%3)*.3,secs=[[w,1.4+((i*37)%10)/10*1.6],[w*.72,1+((i*53)%10)/10*1.1],[w*.42,.7]],y=0,wm=[];
 var roofM=new MeshStandardMaterial({color:0x163626,metalness:.5,roughness:.4});
 for(var k=0;k<3;k++){if(k===2&&i%2)continue;var sw=secs[k][0],sh=secs[k][1];
  var wt=winTex(Math.max(3,Math.round(sw*2.6)),Math.max(2,Math.round(sh*2.6)));
  var mt=new MeshStandardMaterial({map:wt,emissiveMap:wt,emissive:0xffffff,emissiveIntensity:.7,color:0x3e6552,metalness:.35,roughness:.45});wm.push(mt);
  var bm=new Mesh(new BoxGeometry(sw,sh,sw),[mt,mt,roofM,roofM,mt,mt]);bm.position.y=y+sh/2;g.add(bm);
  var ed=new Mesh(new BoxGeometry(sw+.08,.07,sw+.08),new MeshBasicMaterial({color:col}));ed.position.y=y+sh;g.add(ed);y+=sh}
 var an=new Mesh(new CylinderGeometry(.02,.035,1.2,6),new MeshBasicMaterial({color:0xaac0b2}));an.position.y=y+.6;g.add(an);
 var bc=new Mesh(new SphereGeometry(.07,10,10),new MeshBasicMaterial({color:0xff4a3f}));bc.position.y=y+1.22;g.add(bc);
 var bg=glow(0xff4a3f,.6,.9);bg.position.y=y+1.22;g.add(bg);
 var pad=new Mesh(new RingGeometry(w*.95,w*1.2,48),new MeshBasicMaterial({color:col,transparent:true,opacity:.35,side:DoubleSide}));pad.rotation.x=-PI/2;pad.position.y=.03;g.add(pad);
 var disc=new Mesh(new CircleGeometry(w*1.2,48),new MeshBasicMaterial({color:0x0c2418}));disc.rotation.x=-PI/2;disc.position.y=.02;g.add(disc);
 var lb=label(names[i]);lb.position.y=y+2.2;g.add(lb);
 B.push({f:0,wm:wm,pad:pad,bc:bc,bg:bg});
 var s0=new Vector3(bx,y+.2,bz),e=new Vector3(Math.cos(a)*HR,3.3+(i%3)*.7,Math.sin(a)*HR);
 var c1=s0.clone().lerp(e,.3);c1.y=y+3.6+(i%3)*.5;var c2=s0.clone().lerp(e,.78);c2.y=e.y+2.6;
 var curve=new CubicBezierCurve3(s0,c1,c2,e);routes.push(curve);
 S.add(new Mesh(new TubeGeometry(curve,72,.032,6,false),flowMat(col,.35+(i%3)*.08,i*.13)));
 // camino de datos en el suelo
 var L=Math.hypot(bx,bz)-2.9,rb=new Mesh(new PlaneGeometry(1,.16).rotateX(-PI/2),flowMat(col,.3,i*.2));
 rb.scale.x=L;rb.position.set(bx*(1-(L/2+w*1.2)/rad)*1,.04,bz*(1-(L/2+w*1.2)/rad));rb.rotation.y=PI-a;S.add(rb);
 for(var kk=0;kk<4;kk++)packets.push({c:curve,b:i,t:(kk/4+i*.07)%1,sp:.07+(i%4)*.01});
 backs.push({t:(i*.17)%1})}
// ajuste: el camino va del edificio a la central (uv.x = 0 → 1), ver rotación arriba
var NT=7,P=packets.length,trP=new Float32Array(P*NT*3),trC=new Float32Array(P*NT*3);
for(var pi=0;pi<P;pi++)for(var tk=0;tk<NT;tk++){var f=1-tk/NT,ix=(pi*NT+tk)*3;trC[ix]=f;trC[ix+1]=f*.72;trC[ix+2]=f*.1}
var trG=new BufferGeometry();trG.setAttribute('position',new BufferAttribute(trP,3));trG.setAttribute('color',new BufferAttribute(trC,3));
var trails=new Points(trG,new PointsMaterial({size:.22,map:glT,vertexColors:true,transparent:true,blending:AdditiveBlending,depthWrite:false}));trails.frustumCulled=false;S.add(trails);
var pt=(function(){var c=cvs(64,80),x=c.getContext('2d');x.fillStyle='#f4f8f4';x.fillRect(0,0,64,80);x.fillStyle='#1f5a3a';x.fillRect(0,0,64,13);x.fillStyle='#f2b705';x.fillRect(46,18,12,12);x.fillStyle='#8a9a90';[26,38,50,62].forEach(function(yy,i){x.fillRect(7,yy,i%2?34:46,4)});return tex(c)})();
var docs=new InstancedMesh(new BoxGeometry(.5,.64,.02),new MeshBasicMaterial({map:pt}),P);docs.frustumCulled=false;docs.instanceMatrix.setUsage(DynamicDrawUsage);S.add(docs);
var orP=new Float32Array(N*3),orG=new BufferGeometry();orG.setAttribute('position',new BufferAttribute(orP,3));
var orbs=new Points(orG,new PointsMaterial({size:.55,map:glT,color:0x4ade80,transparent:true,blending:AdditiveBlending,depthWrite:false}));orbs.frustumCulled=false;S.add(orbs);
trG.attributes.position.setUsage(DynamicDrawUsage);orG.attributes.position.setUsage(DynamicDrawUsage);
const curveCache=new Map();
for(const curve of routes){const values=new Float32Array(257*3),point=new Vector3();for(let index=0;index<=256;index++){curve.getPoint(index/256,point);point.toArray(values,index*3);}curveCache.set(curve,values);}
function puntoCurva(curve,t,target){const values=curveCache.get(curve),position=Math.max(0,Math.min(1,t))*256,index=Math.min(255,Math.floor(position)),fraction=position-index,offset=index*3;return target.set(values[offset]+(values[offset+3]-values[offset])*fraction,values[offset+1]+(values[offset+4]-values[offset+1])*fraction,values[offset+2]+(values[offset+5]-values[offset+2])*fraction);}
agruparEscena(S,new Set([cap,core,beam,...rings.map(item=>item[0]),...ripples,...B.flatMap(item=>[item.pad,item.bc])]));
let qualityStart=0,qualityFrames=0,qualitySlow=0;

/* ---------- scroll y cámara ---------- */
var V=function(x,y,z){return new Vector3(x,y,z)};
var camC=new CatmullRomCurve3([V(26,15,12),V(14,8,-13),V(4.2,4.6,7.2),V(-8.5,7,7.5),V(-14,10,-8),V(18,21,4)]);
var lookC=new CatmullRomCurve3([V(0,2,0),V(0,3,0),V(0,4.8,0),V(0,3.4,0),V(0,3,0),V(0,2.5,0)]);
var sp=0,tp=0,sent=0,conf=0,vel=0,last=0,mx=0,my=0,tx=0,ty=0,tmpV=new Vector3(),nx=new Vector3();
function onS(){var m=document.documentElement.scrollHeight-innerHeight;tp=m>0?Math.min(1,Math.max(0,scrollY/m)):0;if(reducedMotion)requestFrame();}
listen(window,'scroll',onS,{passive:true});onS();
listen(window,'pointermove',function(e){tx=e.clientX/innerWidth*2-1;ty=e.clientY/innerHeight*2-1},{passive:true});

function loop(ts){
 frame=0;if(stopped||document.hidden)return;
 if(!reducedMotion)requestFrame();
 const cpuStart=medir?performance.now():0;
 var t=reducedMotion?3:ts/1000,dt=reducedMotion?0:Math.min(t-last,.05);last=t;
 const easing=1-Math.exp(-dt*5),pointerEase=1-Math.exp(-dt*2.5);
 sp=reducedMotion?tp:sp+(tp-sp)*easing;vel=Math.min(Math.abs(tp-sp)*40,3);var boost=1+vel*1.5;
 mx+=(tx-mx)*pointerEase;my+=(ty-my)*pointerEase;
 camC.getPoint(sp,C.position);lookC.getPoint(sp,tmpV);C.position.x+=mx*1.4;C.position.y-=my*.8;C.lookAt(tmpV);
 flowU.forEach(function(m){m.uniforms.t.value=t});
 packets.forEach(function(p,i){var pv=p.t;p.t+=p.sp*dt*boost;
  if(pv<.05&&p.t>=.05)B[p.b].f=1;
  if(p.t>=1){p.t-=1;spawn();hubL.intensity=6}
  puntoCurva(p.c,p.t,tmpV);puntoCurva(p.c,Math.min(p.t+.015,1),nx);
  D.position.copy(tmpV);D.lookAt(nx);D.rotateY(PI/2);D.rotateX(t*2.2+i);
  D.scale.setScalar(Math.max(.001,sm(0,.07,p.t)*(1-sm(.92,1,p.t))));D.updateMatrix();docs.setMatrixAt(i,D.matrix);
  for(var k=0;k<NT;k++){puntoCurva(p.c,Math.max(0,p.t-k*.014),tmpV);var ix=(i*NT+k)*3;trP[ix]=tmpV.x;trP[ix+1]=tmpV.y;trP[ix+2]=tmpV.z}});
 D.scale.set(1,1,1);D.rotation.set(0,0,0);
 docs.instanceMatrix.needsUpdate=true;trG.attributes.position.needsUpdate=true;
 backs.forEach(function(b,i){b.t-=.1*dt*boost;if(b.t<0){b.t+=1;B[i].f=Math.max(B[i].f,.6)}
  puntoCurva(routes[i],b.t,tmpV);orP[i*3]=tmpV.x;orP[i*3+1]=tmpV.y;orP[i*3+2]=tmpV.z});
 orG.attributes.position.needsUpdate=true;
 B.forEach(function(b,i){b.f=Math.max(0,b.f-dt*1.6);var fl=.62+.14*Math.sin(t*.9+i*1.7)+b.f*.5;b.wm.forEach(function(m){m.emissiveIntensity=fl});
  b.pad.material.opacity=.3+b.f*.7;var on=Math.sin(t*3+i*2)>.4?1:.25;b.bc.material.color.setRGB(1*on,.29*on,.25*on);b.bg.material.opacity=.15+on*.75+b.f*.3});
 ripples.forEach(function(r){var a=r.userData.a;if(a>0){a=Math.max(0,a-dt*.9);r.userData.a=a;r.scale.setScalar(1+(1-a)*7.5);r.material.opacity=a*.7}else r.material.opacity=0});
 hubL.intensity+=(3-hubL.intensity)*Math.min(1,dt*4);
 rings.forEach(function(r,i){r[0].rotation.z=t*r[1]*(i%2?-1:1)*1.4});
 core.rotation.y=t*.9;core.rotation.x=t*.6;core.scale.setScalar(1+Math.sin(t*3)*.08);cg.material.opacity=.7+Math.sin(t*3)*.2;
 cap.rotation.y=t*.6;beam.material.opacity=.38+Math.sin(t*3)*.14;tw.emissiveIntensity=.75+Math.sin(t*1.3)*.1;
 tg.rotation.y=t*.03;dust.rotation.y=t*.012;
 R.render(S,C);
 if(!reducedMotion){qualityStart||=ts;qualityFrames++;if(dt>.022)qualitySlow++;if(ts-qualityStart>=2500){if(qualityFrames>30&&qualitySlow/qualityFrames>.18&&R.getPixelRatio()>.7){R.setPixelRatio(Math.max(.7,R.getPixelRatio()-.15));size();}qualityStart=ts;qualityFrames=0;qualitySlow=0;}}
 if(medir){metricFrames++;metricCpu+=performance.now()-cpuStart;if(!metricStart)metricStart=ts;if(ts-metricStart>=1000){canvas.dataset.rendimiento=JSON.stringify({fps:+(metricFrames*1000/(ts-metricStart)).toFixed(1),drawCalls:R.info.render.calls,triangulos:R.info.render.triangles,cpuMedioMs:+(metricCpu/metricFrames).toFixed(2),dpr:R.getPixelRatio()});metricFrames=0;metricCpu=0;metricStart=ts;}}
 }
function requestFrame(){if(!frame&&!stopped&&!document.hidden)frame=requestAnimationFrame(loop);}
listen(document,'visibilitychange',function(){if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;qualityStart=0;qualityFrames=0;qualitySlow=0;metricStart=0;metricFrames=0;metricCpu=0;}else requestFrame();});
listen(canvas,'webglcontextlost',function(event){event.preventDefault();cleanup();onError?.();});
requestFrame();onReady?.();
cleanup.setReducedMotion=function(value){reducedMotion=value;last=0;requestFrame();};
return cleanup;
} catch(error){cleanup();throw error;}
}
