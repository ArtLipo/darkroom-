function applyGlobal(imageData) {
  const d = imageData.data;
  const contrast = parseInt(document.getElementById('sl-contrast').value) / 100;
  const saturation = bw ? 0 : parseInt(document.getElementById('sl-saturation').value) / 100;
  const brightness = parseInt(document.getElementById('sl-brightness').value);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b2 = d[i+2];
    r += brightness; g += brightness; b2 += brightness;
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b2 = (b2 - 128) * contrast + 128;
    const gray = 0.299*r + 0.587*g + 0.114*b2;
    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b2 = gray + (b2 - gray) * saturation;
    if (bw) { const lum = 0.299*r + 0.587*g + 0.114*b2; r = g = b2 = lum; }
    d[i]   = Math.max(0, Math.min(255, r));
    d[i+1] = Math.max(0, Math.min(255, g));
    d[i+2] = Math.max(0, Math.min(255, b2));
  }
  return imageData;
}

function getLum(d, i) { return 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; }

function sortRow(data, width, y, threshold, intensity) {
  const off = y * width * 4; let i = 0;
  while (i < width) {
    if (getLum(data, off+i*4) > threshold) {
      let j = i;
      while (j < width && getLum(data, off+j*4) > threshold) j++;
      const seg = [];
      for (let k = i; k < j; k++) seg.push({ r:data[off+k*4], g:data[off+k*4+1], b:data[off+k*4+2], l:getLum(data,off+k*4) });
      seg.sort((a,b) => a.l-b.l);
      const n = Math.floor(seg.length * intensity / 100);
      for (let k = 0; k < n; k++) { data[off+(i+k)*4]=seg[k].r; data[off+(i+k)*4+1]=seg[k].g; data[off+(i+k)*4+2]=seg[k].b; }
      i = j;
    } else i++;
  }
}

function sortCol(data, width, height, x, threshold, intensity) {
  let i = 0;
  while (i < height) {
    if (getLum(data, (i*width+x)*4) > threshold) {
      let j = i;
      while (j < height && getLum(data, (j*width+x)*4) > threshold) j++;
      const seg = [];
      for (let k = i; k < j; k++) seg.push({ r:data[(k*width+x)*4], g:data[(k*width+x)*4+1], b:data[(k*width+x)*4+2], l:getLum(data,(k*width+x)*4) });
      seg.sort((a,b) => a.l-b.l);
      const n = Math.floor(seg.length * intensity / 100);
      for (let k = 0; k < n; k++) { data[((i+k)*width+x)*4]=seg[k].r; data[((i+k)*width+x)*4+1]=seg[k].g; data[((i+k)*width+x)*4+2]=seg[k].b; }
      i = j;
    } else i++;
  }
}

function applyPixelSort(imageData, threshold, intensity, dir) {
  const w = imageData.width, h = imageData.height;
  if (dir === 'horizontal' || dir === 'both') for (let y = 0; y < h; y++) sortRow(imageData.data, w, y, threshold, intensity);
  if (dir === 'vertical'   || dir === 'both') for (let x = 0; x < w; x++) sortCol(imageData.data, w, h, x, threshold, intensity);
  return imageData;
}

function applyDisplacement(imageData, intensity) {
  const w = imageData.width, h = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const d = imageData.data;
  if (intensity <= 0) return imageData;
  const radius = Math.floor(intensity / 10) + 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.floor((Math.random()*2-1)*radius);
    const dy = Math.floor((Math.random()*2-1)*radius);
    const sx = Math.max(0,Math.min(w-1,x+dx)), sy = Math.max(0,Math.min(h-1,y+dy));
    const dst=(y*w+x)*4, s=(sy*w+sx)*4;
    d[dst]=src[s]; d[dst+1]=src[s+1]; d[dst+2]=src[s+2];
  }
  return imageData;
}

function applyPaski(imageData, bandH, maxShift) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  let y=0;
  while(y<h){
    const bh=Math.max(1,Math.floor(bandH*(0.5+Math.random())));
    const shift=Math.random()>0.5?Math.floor((Math.random()*2-1)*maxShift):0;
    for(let row=y;row<Math.min(y+bh,h);row++)
      for(let x=0;x<w;x++){
        const sx=Math.max(0,Math.min(w-1,x-shift));
        const dst=(row*w+x)*4, s=(row*w+sx)*4;
        d[dst]=src[s];d[dst+1]=src[s+1];d[dst+2]=src[s+2];
      }
    y+=bh;
  }
  return imageData;
}

function applySen(imageData, pieces, chaos) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  const pw=Math.floor(w/pieces), ph=Math.floor(h/pieces);
  const positions=[];
  for(let r=0;r<pieces;r++) for(let c=0;c<pieces;c++) positions.push([r,c]);
  const shuffled=[...positions];
  for(let i=shuffled.length-1;i>0;i--){
    const range=Math.max(1,Math.floor(chaos*shuffled.length/10));
    const j=Math.max(0,i-Math.floor(Math.random()*range));
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  for(let i=0;i<positions.length;i++){
    const[fr,fc]=positions[i],[tr,tc]=shuffled[i];
    for(let y=0;y<ph;y++) for(let x=0;x<pw;x++){
      const dst=((tr*ph+y)*w+tc*pw+x)*4, s=((fr*ph+y)*w+fc*pw+x)*4;
      d[dst]=src[s];d[dst+1]=src[s+1];d[dst+2]=src[s+2];
    }
  }
  return imageData;
}

function applySpirala(imageData, fragSize, maxAngle) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  const cx=w/2, cy=h/2;
  const cols=Math.ceil(w/fragSize), rows=Math.ceil(h/fragSize);
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++){
    const fx=col*fragSize+fragSize/2, fy=row*fragSize+fragSize/2;
    const dx=fx-cx, dy=fy-cy;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const angle=(dist/Math.sqrt(cx*cx+cy*cy))*maxAngle*Math.PI/180;
    const cos=Math.cos(angle), sin=Math.sin(angle);
    for(let py=row*fragSize;py<Math.min((row+1)*fragSize,h);py++)
      for(let px=col*fragSize;px<Math.min((col+1)*fragSize,w);px++){
        const lx=px-fx, ly=py-fy;
        const rx=Math.round(lx*cos-ly*sin+fx), ry=Math.round(lx*sin+ly*cos+fy);
        const dst=(py*w+px)*4;
        if(rx>=0&&rx<w&&ry>=0&&ry<h){const s=(ry*w+rx)*4;d[dst]=src[s];d[dst+1]=src[s+1];d[dst+2]=src[s+2];}
      }
  }
  return imageData;
}

function applySiatka(imageData, contrast, stripeWidth) {
  const w=imageData.width, h=imageData.height, d=imageData.data;
  const threshold=parseInt(document.getElementById('sl-threshold').value);
  for(let i=0;i<d.length;i+=4){
    const lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
    const c=Math.min(255,Math.max(0,(lum-80)*contrast));
    d[i]=d[i+1]=d[i+2]=c;
  }
  for(let x=0;x<w;x++){
    let i=0;
    while(i<h){
      if(d[(i*w+x)*4]>threshold){
        let j=i;
        while(j<h&&d[(j*w+x)*4]>threshold)j++;
        const seg=[];
        for(let k=i;k<j;k++)seg.push(d[(k*w+x)*4]);
        seg.sort((a,b)=>a-b);
        for(let k=0;k<seg.length;k++){d[((i+k)*w+x)*4]=seg[k];d[((i+k)*w+x)*4+1]=seg[k];d[((i+k)*w+x)*4+2]=seg[k];}
        i=j;
      }else i++;
    }
  }
  const sw=Math.max(1,stripeWidth);
  for(let x=0;x<w;x+=sw*2) for(let y=0;y<h;y++) for(let s=0;s<sw&&x+s<w;s++){
    const idx=(y*w+x+s)*4;
    d[idx]=d[idx+1]=d[idx+2]=Math.floor(d[idx]*0.12);
  }
  return imageData;
}

function applyEkspozycja(imageData, count, shift) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data);
  const d=imageData.data;
  const result=new Float32Array(d.length);
  for(let copy=0; copy<count; copy++){
    const dx=Math.round((copy-(count-1)/2)*shift);
    const dy=Math.round((copy-(count-1)/2)*shift*0.5);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const sx=Math.max(0,Math.min(w-1,x-dx));
      const sy=Math.max(0,Math.min(h-1,y-dy));
      const dst=(y*w+x)*4, s=(sy*w+sx)*4;
      result[dst]+=src[s]; result[dst+1]+=src[s+1]; result[dst+2]+=src[s+2]; result[dst+3]=255;
    }
  }
  for(let i=0;i<d.length;i+=4){
    d[i]=Math.min(255,result[i]/count); d[i+1]=Math.min(255,result[i+1]/count); d[i+2]=Math.min(255,result[i+2]/count);
  }
  return imageData;
}

function applyKolorSort(imageData, hue, range, threshold, intensity, dir) {
  const w=imageData.width, h=imageData.height, d=imageData.data;
  function getHue(r,g,b) {
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), delta=max-min;
    if(delta===0) return -1;
    let h2=0;
    if(max===r) h2=((g-b)/delta)%6;
    else if(max===g) h2=(b-r)/delta+2;
    else h2=(r-g)/delta+4;
    h2=h2*60; if(h2<0) h2+=360;
    return h2;
  }
  function inRange(r,g,b) {
    const h2=getHue(r,g,b);
    if(h2<0) return false;
    const lum=0.299*r+0.587*g+0.114*b;
    if(lum<threshold) return false;
    let diff=Math.abs(h2-hue);
    if(diff>180) diff=360-diff;
    return diff<=range;
  }
  if(dir==='horizontal'||dir==='both'){
    for(let y=0;y<h;y++){
      const off=y*w*4; let i=0;
      while(i<w){
        if(inRange(d[off+i*4],d[off+i*4+1],d[off+i*4+2])){
          let j=i;
          while(j<w&&inRange(d[off+j*4],d[off+j*4+1],d[off+j*4+2]))j++;
          const seg=[];
          for(let k=i;k<j;k++) seg.push({r:d[off+k*4],g:d[off+k*4+1],b:d[off+k*4+2],l:0.299*d[off+k*4]+0.587*d[off+k*4+1]+0.114*d[off+k*4+2]});
          seg.sort((a,b2)=>a.l-b2.l);
          const n=Math.floor(seg.length*intensity/100);
          for(let k=0;k<n;k++){d[off+(i+k)*4]=seg[k].r;d[off+(i+k)*4+1]=seg[k].g;d[off+(i+k)*4+2]=seg[k].b;}
          i=j;
        }else i++;
      }
    }
  }
  if(dir==='vertical'||dir==='both'){
    for(let x=0;x<w;x++){
      let i=0;
      while(i<h){
        if(inRange(d[(i*w+x)*4],d[(i*w+x)*4+1],d[(i*w+x)*4+2])){
          let j=i;
          while(j<h&&inRange(d[(j*w+x)*4],d[(j*w+x)*4+1],d[(j*w+x)*4+2]))j++;
          const seg=[];
          for(let k=i;k<j;k++) seg.push({r:d[(k*w+x)*4],g:d[(k*w+x)*4+1],b:d[(k*w+x)*4+2],l:0.299*d[(k*w+x)*4]+0.587*d[(k*w+x)*4+1]+0.114*d[(k*w+x)*4+2]});
          seg.sort((a,b2)=>a.l-b2.l);
          const n=Math.floor(seg.length*intensity/100);
          for(let k=0;k<n;k++){d[((i+k)*w+x)*4]=seg[k].r;d[((i+k)*w+x)*4+1]=seg[k].g;d[((i+k)*w+x)*4+2]=seg[k].b;}
          i=j;
        }else i++;
      }
    }
  }
  return imageData;
}

function applyGrawitacja(imageData, strength, dir) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  const s = strength/100;
  if(dir==='down'||dir==='up'){
    const reverse = dir==='down';
    for(let x=0;x<w;x++){
      const col=[], lums=[];
      for(let y=0;y<h;y++){
        const idx=(y*w+x)*4;
        col.push([src[idx],src[idx+1],src[idx+2]]);
        lums.push(0.299*src[idx]+0.587*src[idx+1]+0.114*src[idx+2]);
      }
      const idx_sorted = lums.map((_,i)=>i).sort((a,b)=> reverse ? lums[a]-lums[b] : lums[b]-lums[a]);
      for(let y=0;y<h;y++){
        const orig_y = Math.round(y*(1-s) + idx_sorted[y]*s);
        const src_y = Math.max(0,Math.min(h-1,orig_y));
        const dst=(y*w+x)*4;
        d[dst]=col[src_y][0];d[dst+1]=col[src_y][1];d[dst+2]=col[src_y][2];
      }
    }
  } else {
    const reverse = dir==='right';
    for(let y=0;y<h;y++){
      const row=[], lums=[];
      for(let x=0;x<w;x++){
        const idx=(y*w+x)*4;
        row.push([src[idx],src[idx+1],src[idx+2]]);
        lums.push(0.299*src[idx]+0.587*src[idx+1]+0.114*src[idx+2]);
      }
      const idx_sorted = lums.map((_,i)=>i).sort((a,b)=> reverse ? lums[a]-lums[b] : lums[b]-lums[a]);
      for(let x=0;x<w;x++){
        const orig_x = Math.round(x*(1-s) + idx_sorted[x]*s);
        const src_x = Math.max(0,Math.min(w-1,orig_x));
        const dst=(y*w+x)*4;
        d[dst]=row[src_x][0];d[dst+1]=row[src_x][1];d[dst+2]=row[src_x][2];
      }
    }
  }
  return imageData;
}

function applyElektroforeza(imageData, distance, dir) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data);
  const d=imageData.data;
  for(let i=0;i<d.length;i++) d[i] = i%4===3 ? 255 : 0;
  if(dir==='right'||dir==='left'){
    const sign = dir==='right' ? 1 : -1;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const si=(y*w+x)*4;
      const lum=0.299*src[si]+0.587*src[si+1]+0.114*src[si+2];
      const migration = Math.floor(lum/255*distance)*sign;
      const nx = Math.max(0,Math.min(w-1,x+migration));
      const di=(y*w+nx)*4;
      const dlum=0.299*d[di]+0.587*d[di+1]+0.114*d[di+2];
      if(lum>dlum){d[di]=src[si];d[di+1]=src[si+1];d[di+2]=src[si+2];}
    }
  } else {
    const sign = dir==='down' ? 1 : -1;
    for(let x=0;x<w;x++) for(let y=0;y<h;y++){
      const si=(y*w+x)*4;
      const lum=0.299*src[si]+0.587*src[si+1]+0.114*src[si+2];
      const migration = Math.floor(lum/255*distance)*sign;
      const ny = Math.max(0,Math.min(h-1,y+migration));
      const di=(ny*w+x)*4;
      const dlum=0.299*d[di]+0.587*d[di+1]+0.114*d[di+2];
      if(lum>dlum){d[di]=src[si];d[di+1]=src[si+1];d[di+2]=src[si+2];}
    }
  }
  return imageData;
}

function applyTopo(imageData, nLines, thickness) {
  const w=imageData.width, h=imageData.height, d=imageData.data;
  const src=new Uint8ClampedArray(d);
  const step = 255 / nLines;
  for(let i=0;i<d.length;i+=4){
    const lum=0.299*src[i]+0.587*src[i+1]+0.114*src[i+2];
    const linePos = lum % step;
    const onLine = linePos < thickness * 2;
    if(onLine){
      const lineColor = lum > 127 ? 0 : 255;
      d[i]=lineColor; d[i+1]=lineColor; d[i+2]=bw ? lineColor : Math.floor(lineColor*0.5);
    } else {
      const zone = Math.floor(lum / step) % 2;
      d[i]=Math.min(255, src[i]*(1-zone*0.12));
      d[i+1]=Math.min(255, src[i+1]*(1+zone*0.04));
      d[i+2]=src[i+2];
    }
  }
  return imageData;
}

function applyZespolone(imageData, power, mode) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  const cx=w/2, cy=h/2;
  const p = power / 10;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const re=(x-cx)/cx, im=(y-cy)/cy;
    let w_re, w_im;
    if(mode==='pow'){
      const r=Math.sqrt(re*re+im*im), theta=Math.atan2(im,re), rp=Math.pow(r,p);
      w_re=rp*Math.cos(p*theta); w_im=rp*Math.sin(p*theta);
    } else if(mode==='inv'){
      const denom=re*re+im*im;
      if(denom<0.001) continue;
      w_re=re/denom; w_im=-im/denom;
    } else {
      const er=Math.exp(re)*0.3;
      w_re=er*Math.cos(im); w_im=er*Math.sin(im);
    }
    const sx=Math.round(w_re*cx+cx), sy=Math.round(w_im*cy+cy);
    const dst=(y*w+x)*4;
    if(sx>=0&&sx<w&&sy>=0&&sy<h){const s=(sy*w+sx)*4;d[dst]=src[s];d[dst+1]=src[s+1];d[dst+2]=src[s+2];}
  }
  return imageData;
}

function applyOsmoza(imageData, strength, threshold) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  const lum=new Float32Array(w*h);
  for(let i=0;i<w*h;i++) lum[i]=0.299*src[i*4]+0.587*src[i*4+1]+0.114*src[i*4+2];
  const thr = threshold / 100 * 50;
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const gx = lum[y*w+x+1] - lum[y*w+x-1];
    const gy = lum[(y+1)*w+x] - lum[(y-1)*w+x];
    const mag = Math.sqrt(gx*gx+gy*gy);
    if(mag === 0 || mag < thr) continue;
    const nx = gx/mag, ny = gy/mag;
    const sx = Math.round(Math.max(0,Math.min(w-1, x + nx*strength)));
    const sy = Math.round(Math.max(0,Math.min(h-1, y + ny*strength)));
    const dst=(y*w+x)*4, s=(sy*w+sx)*4;
    d[dst]=src[s]; d[dst+1]=src[s+1]; d[dst+2]=src[s+2];
  }
  return imageData;
}

function applyMobius(imageData, paramA, paramB) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  const cx=w/2, cy=h/2;
  const a = paramA/10, b = paramB/10;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const re = (x-cx)/cx, im = (y-cy)/cy;
    const denom_re = a*re + 1, denom_im = a*im;
    const denom_sq = denom_re*denom_re + denom_im*denom_im;
    if(denom_sq < 0.001) continue;
    const num_re = re + b, num_im = im;
    const w_re = (num_re*denom_re + num_im*denom_im) / denom_sq;
    const w_im = (num_im*denom_re - num_re*denom_im) / denom_sq;
    const sx = Math.round(w_re * cx + cx), sy = Math.round(w_im * cy + cy);
    const dst=(y*w+x)*4;
    if(sx>=0&&sx<w&&sy>=0&&sy<h){const s=(sy*w+sx)*4;d[dst]=src[s];d[dst+1]=src[s+1];d[dst+2]=src[s+2];}
  }
  return imageData;
}

function applyMnozenie(imageData, mode) {
  const d=imageData.data;
  for(let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    if(mode==='rg'){ const v=r*g/255; d[i]=v;d[i+1]=v;d[i+2]=v; }
    else if(mode==='rb'){ const v=r*b/255; d[i]=v;d[i+1]=v;d[i+2]=v; }
    else if(mode==='gb'){ const v=g*b/255; d[i]=v;d[i+1]=v;d[i+2]=v; }
    else if(mode==='cross'){ d[i]=Math.min(255,g*b/255);d[i+1]=Math.min(255,r*b/255);d[i+2]=Math.min(255,r*g/255); }
    else if(mode==='power'){ d[i]=Math.min(255,r*r/255);d[i+1]=Math.min(255,g*r/255);d[i+2]=Math.min(255,b*g/255); }
  }
  return imageData;
}

function applyKrystalizacja(imageData, arms, strength) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  const cx=w/2, cy=h/2;
  const sila=strength/100*0.8;
  const angleStep=(Math.PI*2)/arms;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const dx=x-cx, dy=y-cy;
    const r=Math.sqrt(dx*dx+dy*dy);
    const angle=Math.atan2(dy,dx);
    const angleSnapped=Math.round(angle/angleStep)*angleStep;
    const str=Math.min(1, r/(Math.max(w,h)/2)) * sila;
    const newAngle=angle*(1-str)+angleSnapped*str;
    const sx=Math.round(cx+r*Math.cos(newAngle)), sy=Math.round(cy+r*Math.sin(newAngle));
    const dst=(y*w+x)*4;
    if(sx>=0&&sx<w&&sy>=0&&sy<h){const s=(sy*w+sx)*4;d[dst]=src[s];d[dst+1]=src[s+1];d[dst+2]=src[s+2];}
  }
  return imageData;
}

function applyKalejdoskopKolo(imageData, segments, rotation) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  const cx=w/2, cy=h/2;
  const rMax=Math.min(cx,cy);
  const angleStep=(Math.PI*2)/segments;
  const rotRad=rotation*Math.PI/180;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const dx=x-cx, dy=y-cy;
    const r=Math.sqrt(dx*dx+dy*dy);
    const dst=(y*w+x)*4;
    if(r>rMax){ d[dst]=d[dst+1]=d[dst+2]=0; continue; }
    let angle=Math.atan2(dy,dx)+rotRad;
    angle=((angle%angleStep)+angleStep)%angleStep;
    if(angle>angleStep/2) angle=angleStep-angle;
    const sx=Math.round(cx+r*Math.cos(angle)), sy=Math.round(cy+r*Math.sin(angle));
    if(sx>=0&&sx<w&&sy>=0&&sy<h){const s=(sy*w+sx)*4;d[dst]=src[s];d[dst+1]=src[s+1];d[dst+2]=src[s+2];}
  }
  return imageData;
}

function applyShuffle(imageData, blockSize) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data), d=imageData.data;
  for(let y=0;y<h;y+=blockSize) for(let x=0;x<w;x+=blockSize){
    const y2=Math.min(y+blockSize,h), x2=Math.min(x+blockSize,w);
    const pixels=[];
    for(let py=y;py<y2;py++) for(let px=x;px<x2;px++) pixels.push((py*w+px)*4);
    for(let i=pixels.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      const a=pixels[i], b=pixels[j];
      [d[a],d[b]]=[d[b],d[a]];
      [d[a+1],d[b+1]]=[d[b+1],d[a+1]];
      [d[a+2],d[b+2]]=[d[b+2],d[a+2]];
    }
  }
  return imageData;
}

function applyKalejdoskop(imageData, segments, rotation) {
  const w=imageData.width, h=imageData.height;
  const src=new Uint8ClampedArray(imageData.data);
  const d=imageData.data;
  const cx=w/2, cy=h/2;
  const angleStep = (Math.PI*2) / segments;
  const rotRad = rotation * Math.PI / 180;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const dx=x-cx, dy=y-cy;
    let angle=Math.atan2(dy,dx) + rotRad;
    const r=Math.sqrt(dx*dx+dy*dy);
    angle = ((angle % angleStep) + angleStep) % angleStep;
    if(angle > angleStep/2) angle = angleStep - angle;
    const sx=Math.round(cx + r*Math.cos(angle)), sy=Math.round(cy + r*Math.sin(angle));
    const dst=(y*w+x)*4;
    if(sx>=0&&sx<w&&sy>=0&&sy<h){const s=(sy*w+sx)*4;d[dst]=src[s]; d[dst+1]=src[s+1]; d[dst+2]=src[s+2];}
  }
  return imageData;
}

function applyPryzmat(imageData, grid) {
  const w = imageData.width, h = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const d = imageData.data;
  const tileW = Math.max(1, Math.floor(w / grid));
  const tileH = Math.max(1, Math.floor(h / grid));

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      // który kafelek
      const col = Math.floor(tx / tileW);
      const row = Math.floor(ty / tileH);
      // pozycja wewnątrz kafelka
      let lx = tx - col * tileW;
      let ly = ty - row * tileH;
      // lustrzane odbicie co drugi kafelek
      if (col % 2 === 1) lx = tileW - 1 - lx;
      if (row % 2 === 1) ly = tileH - 1 - ly;
      // mapuj na środkowy kafelek z oryginału
      const sx = Math.min(w - 1, lx + Math.floor((grid - 1) / 2) * tileW % w);
      const sy = Math.min(h - 1, ly + Math.floor((grid - 1) / 2) * tileH % h);
      const dst = (ty * w + tx) * 4;
      const s = (sy * w + sx) * 4;
      d[dst] = src[s]; d[dst+1] = src[s+1]; d[dst+2] = src[s+2];
    }
  }
  return imageData;
}

function runFilter(imageData) {
  const threshold=parseInt(document.getElementById('sl-threshold').value);
  const intensity=parseInt(document.getElementById('sl-intensity').value);
  const extra1=parseInt(document.getElementById('sl-extra1').value);
  const extra2=parseInt(document.getElementById('sl-extra2').value);
  applyGlobal(imageData);
  if(activeFilter==='drzenie') applyDisplacement(imageData, intensity);
  else if(activeFilter==='paski') applyPaski(imageData, extra1, extra2);
  else if(activeFilter==='sen') applySen(imageData, extra1, extra2);
  else if(activeFilter==='spirala') applySpirala(imageData, extra1, extra2);
  else if(activeFilter==='siatka') applySiatka(imageData, extra1*0.8, extra2);
  else if(activeFilter==='ekspozycja') applyEkspozycja(imageData, extra1, extra2);
  else if(activeFilter==='kalejdoskop') applyKalejdoskop(imageData, extra1, extra2);
  else if(activeFilter==='krystalizacja') applyKrystalizacja(imageData, extra1, extra2);
  else if(activeFilter==='kalejdoskop-kolo') applyKalejdoskopKolo(imageData, extra1, extra2);
  else if(activeFilter==='shuffle') applyShuffle(imageData, extra1);
  else if(activeFilter==='kolor-sort') applyKolorSort(imageData, activeHue, extra1, threshold, intensity, direction);
  else if(activeFilter==='osmoza') applyOsmoza(imageData, extra1, extra2);
  else if(activeFilter==='mobius') applyMobius(imageData, extra1, extra2);
  else if(activeFilter==='mnozenie') applyMnozenie(imageData, activeMult);
  else if(activeFilter==='zespolone') applyZespolone(imageData, extra1, activeZmode);
  else if(activeFilter==='topo') applyTopo(imageData, extra1, extra2);
  else if(activeFilter==='elektroforeza') applyElektroforeza(imageData, extra1, activeEdir);
  else if(activeFilter==='grawitacja') applyGrawitacja(imageData, extra1, activeGdir);
  else if(activeFilter==='pryzmat') applyPryzmat(imageData, extra1);
  else applyPixelSort(imageData, threshold, intensity, direction);
  if (bw) for (let i=0;i<imageData.data.length;i+=4) {
    const d=imageData.data, gray=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
    d[i]=d[i+1]=d[i+2]=gray;
  }
  return imageData;
}

