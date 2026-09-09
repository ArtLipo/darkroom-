/* Schwarz triangle (pi/7, pi/3, pi/2), regular {7,3} tiling.
   Geodesic reflection = inversion in a circle orthogonal to unit boundary.
   Geometry reference: https://mphitchman.com/geometry/section5-1.html */
const PA=Math.PI/7;
const PR=Math.sqrt(Math.cos(Math.PI/7+Math.PI/3)/Math.cos(Math.PI/7-Math.PI/3));
const PC=(1+PR*PR)/(2*PR*Math.cos(PA));
const PR2=PC*PC-1;
const ROTATIONS=Array.from({length:7},(_,i)=>[Math.cos(i*2*PA),Math.sin(i*2*PA)]);
function foldPoincare(x,y) {
  if(x*x+y*y>=1) return null;
  for(let i=0;i<128;i++) {
    let best=-Infinity,foldedY=0;
    for(let j=0;j<7;j++){const [c,s]=ROTATIONS[j],tx=c*x+s*y;if(tx>best){best=tx;foldedY=-s*x+c*y;}}
    x=best;y=Math.abs(foldedY);
    const dx=x-PC, distance=dx*dx+y*y;
    if(distance>=PR2-1e-13) return [x,y];
    const ratio=PR2/distance;
    x=PC+dx*ratio;y*=ratio;
  }
  return null;
}
let original=null, map=null, mapSize=0, mapRotation=null;
function geometry(size,rotation) {
  if(mapSize===size && mapRotation===rotation) return map;
  // A single cached preview map; full quality uses four subpixel samples.
  const result=new Float32Array(size*size*2);result.fill(NaN);
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=2*(x+.5)/size-1,py=2*(y+.5)/size-1;
    const point=foldPoincare(c*px+s*py,-s*px+c*py);
    if(point){const i=(y*size+x)*2;result[i]=point[0];result[i+1]=point[1];}
  }
  map=result;mapSize=size;mapRotation=rotation;return result;
}
function renderPoincare(size,settings,quality=false) {
  const output=new Uint8ClampedArray(size*size*4),w=original.width,h=original.height,d=original.data;
  const angle=settings.photoRotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const scale=Math.min(w,h)/settings.zoom;
  const rotation=settings.diskRotation*Math.PI/180,rc=Math.cos(rotation),rs=Math.sin(rotation);
  const coordinates=quality?null:geometry(size,settings.diskRotation);
  const mirror=(v,max)=>{if(max===0)return 0;v=((v%(2*max))+2*max)%(2*max);return v<=max?v:2*max-v;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const idx=(y*size+x)*4;output[idx+3]=255;
    let red=0,green=0,blue=0;
    const diskX=2*(x+.5)/size-1,diskY=2*(y+.5)/size-1;
    const count=quality && diskX*diskX+diskY*diskY>.64?4:1;
    for(let sample=0;sample<count;sample++){
      let u,v;
      if(quality){const px=2*(x+(count===1?.5:sample%2===0?.25:.75))/size-1,py=2*(y+(count===1?.5:sample<2?.25:.75))/size-1;
        const point=foldPoincare(rc*px+rs*py,-rs*px+rc*py);if(!point)continue;[u,v]=point;
      }else {u=coordinates[(y*size+x)*2];v=coordinates[(y*size+x)*2+1];if(!Number.isFinite(u))continue;}
      // Continuous texture on the fundamental triangle; reflections tile it.
      u=u/(PR*Math.cos(PA))-.5;v=v/(PR*Math.sin(PA))-.5;
      const sx=mirror(w*(.5+settings.offsetX)+(c*u+s*v)*scale,w-1);
      const sy=mirror(h*(.5+settings.offsetY)+(-s*u+c*v)*scale,h-1);
      const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=sx-x0,fy=sy-y0;
      const p=(y0*w+x0)*4,q=(y0*w+x1)*4,r=(y1*w+x0)*4,t=(y1*w+x1)*4;
      const blend=k=>(d[p+k]*(1-fx)+d[q+k]*fx)*(1-fy)+(d[r+k]*(1-fx)+d[t+k]*fx)*fy;
      red+=blend(0);green+=blend(1);blue+=blend(2);
    }
    output[idx]=red/count;output[idx+1]=green/count;output[idx+2]=blue/count;
  }
  return {width:size,height:size,data:output};
}
self.onmessage=({data:m})=>{
  try {
    if(m.type==='source'){original=m.image;map=null;mapSize=0;self.postMessage({id:m.id,ready:true});return;}
    if(!original)throw Error('Brak zdjęcia źródłowego.');
    const result=renderPoincare(m.size,m.settings,m.quality);
    self.postMessage({id:m.id,result},[result.data.buffer]);
  }catch(error){self.postMessage({id:m.id,error:error.message});}
};
