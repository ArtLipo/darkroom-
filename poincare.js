/* Isolated photo editor: the original never receives the rendered effect. */
window.Poincare=(()=>{
  const dialog=document.getElementById('poincare-editor'),display=document.getElementById('poincare-preview'),dc=display.getContext('2d');
  const message=document.getElementById('poincare-status');
  const controls=['p-zoom','p-photo-rotation','p-disk-rotation'];
  let source=null,worker=null,sequence=0,pending=new Map(),editing=false,finishing=false,running=null,revision=0,offsetX=0,offsetY=0,showingOriginal=false,lastPreview=null;
  const pointers=new Map();let gesture=null;
  const api={selected:false,open,edit(){if(hasPhoto||isImported||source)open();else notice("Najpierw wykadruj ujęcie i naciśnij ZRÓB ZDJĘCIE. Suwaki otworzą się po zrobieniu zdjęcia.");},reset(){source=null;offsetX=offsetY=0;}};
  function settings(){return {zoom:Number(document.getElementById('p-zoom').value)/100,photoRotation:Number(document.getElementById('p-photo-rotation').value),diskRotation:Number(document.getElementById('p-disk-rotation').value),offsetX,offsetY};}
  function stopWorker(reason=new Error("Przerwano przetwarzanie.")){if(worker)worker.terminate();worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(reason);}pending.clear();}
  function request(data){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{stopWorker();},90000);pending.set(id,{resolve,reject,timer});worker.postMessage({...data,id});});}
  function labels(){controls.forEach(id=>document.getElementById(id+'-value').textContent=document.getElementById(id).value+(id==='p-zoom'?'%':'°'));}
  function draw(){if(showingOriginal && source){dc.fillStyle='#000';dc.fillRect(0,0,display.width,display.height);const k=Math.min(display.width/source.width,display.height/source.height);dc.drawImage(source,(display.width-source.width*k)/2,(display.height-source.height*k)/2,source.width*k,source.height*k);}else if(lastPreview)dc.putImageData(lastPreview,0,0);}
  function schedule(){revision++;labels();try{localStorage.setItem('darkroom-poincare-v1',JSON.stringify(settings()));}catch{}if(!editing||finishing||running)return;running=pump().finally(()=>{running=null;});}
  async function pump(){let rendered=-1;while(editing&&!finishing&&rendered!==revision){rendered=revision;message.textContent='Odświeżanie podglądu…';try{const {result}=await request({type:'render',size:360,settings:settings()});if(!editing)return;if(rendered!==revision)continue;display.width=result.width;display.height=result.height;lastPreview=new ImageData(result.data,result.width,result.height);draw();message.textContent='Przesuwaj palcem • dwa palce zmieniają wielkość motywu';}catch(error){if(editing){message.textContent=error.message;document.getElementById('p-accept').disabled=true;}return;}}}
  async function open(){if(isBusy||editing)return;
    if(!source){const input=(hasPhoto||expCount)?canvas:isImported?originalCanvas:video;const w=input.videoWidth||input.width,h=input.videoHeight||input.height;if(!w||!h){notice('Aparat jeszcze nie jest gotowy.');return;}source=document.createElement('canvas');source.width=w;source.height=h;source.getContext('2d').drawImage(input,0,0,w,h);offsetX=offsetY=0;}
    if(window.Scan)Scan.selected=false;btnShoot.innerHTML='ZRÓB<br>ZDJĘCIE';btnShoot.setAttribute('aria-label','Zrób zdjęcie lub zastosuj filtr');api.selected=true;document.querySelectorAll('.preset-tile').forEach(tile=>tile.classList.toggle('selected',tile.id==='poincare-tile'));editing=true;finishing=false;lastPreview=null;showingOriginal=false;pointers.clear();gesture=null;
    screenPresets.classList.remove('active');screenParams.classList.remove('active');document.getElementById('bar-main').style.visibility='visible';
    dialog.showModal();document.getElementById('p-cancel').focus();message.textContent='Przygotowanie podglądu…';document.getElementById('p-accept').disabled=true;
    worker=new Worker('./poincare-worker.js');worker.onmessage=({data:m})=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m);};worker.onerror=event=>{event.preventDefault();message.textContent='Nie można uruchomić efektu. Otwórz aplikację online i spróbuj ponownie.';stopWorker(new Error(message.textContent));};
    try{await request({type:'source',image:source.getContext('2d').getImageData(0,0,source.width,source.height)});if(!editing)return;document.getElementById('p-accept').disabled=false;schedule();}catch(error){if(editing)message.textContent=error.message;}
  }
  function close(){if(!hasPhoto&&!isImported)source=null;editing=false;finishing=false;showingOriginal=false;pointers.clear();gesture=null;stopWorker();dialog.close();document.getElementById('btn-shoot').focus();}
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.getElementById('p-cancel').onclick=close;
  controls.forEach(id=>document.getElementById(id).addEventListener('input',()=>{schedule();try{localStorage.setItem('darkroom-poincare-v1',JSON.stringify(settings()));}catch{}}));
  try{const stored=JSON.parse(localStorage.getItem('darkroom-poincare-v1'));if(stored){for(const [id,key,mult] of [['p-zoom','zoom',100],['p-photo-rotation','photoRotation',1],['p-disk-rotation','diskRotation',1]])if(Number.isFinite(stored[key]))document.getElementById(id).value=stored[key]*mult;}}catch{}labels();
  document.getElementById('p-center').onclick=()=>{offsetX=offsetY=0;document.getElementById('p-zoom').value=100;schedule();};
  const originalButton=document.getElementById('p-original');
  function original(on){showingOriginal=on;originalButton.setAttribute('aria-pressed',String(on));draw();}
  originalButton.onpointerdown=e=>{originalButton.setPointerCapture(e.pointerId);original(true);};originalButton.onpointerup=originalButton.onpointercancel=originalButton.onlostpointercapture=()=>original(false);
  originalButton.onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();original(true);}};originalButton.onkeyup=()=>original(false);originalButton.onblur=()=>original(false);
  function baseline(){const ps=[...pointers.values()];gesture={x:ps[0]?.x,y:ps[0]?.y,offsetX,offsetY,zoom:settings().zoom,distance:ps.length>1?Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y):0};}
  display.onpointerdown=e=>{if(finishing)return;display.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});baseline();};
  display.onpointermove=e=>{if(!pointers.has(e.pointerId)||finishing)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const ps=[...pointers.values()];if(ps.length===1){const width=display.getBoundingClientRect().width;offsetX=Math.max(-1,Math.min(1,gesture.offsetX-(ps[0].x-gesture.x)/width/gesture.zoom));offsetY=Math.max(-1,Math.min(1,gesture.offsetY-(ps[0].y-gesture.y)/width/gesture.zoom));}else if(gesture.distance>0){const distance=Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y);document.getElementById('p-zoom').value=Math.max(50,Math.min(400,Math.round(gesture.zoom*distance/gesture.distance*100)));}schedule();};
  display.onpointerup=display.onpointercancel=display.onlostpointercapture=e=>{pointers.delete(e.pointerId);baseline();};
  document.getElementById('p-accept').onclick=async()=>{
    if(finishing||!editing)return;finishing=true;dialog.querySelectorAll('button,input').forEach(e=>e.disabled=true);document.getElementById('p-cancel').disabled=false;message.textContent='Przygotowanie pełnej jakości…';showingOriginal=false;
    try{if(running)await running;if(!editing)return;const size=Math.min(source.width,source.height);const {result}=await request({type:'render',size,settings:settings(),quality:true});
      if(!editing)return;document.getElementById('p-cancel').disabled=true;
      const previous=document.createElement('canvas');previous.width=canvas.width;previous.height=canvas.height;previous.getContext('2d').drawImage(canvas,0,0);const oldBlob=photoBlob,oldId=photoId;
      try{canvas.width=result.width;canvas.height=result.height;ctx.putImageData(new ImageData(result.data,result.width,result.height),0,0);await preparePhoto();}catch(error){canvas.width=previous.width;canvas.height=previous.height;ctx.drawImage(previous,0,0);photoBlob=oldBlob;photoId=oldId;throw error;}
      canvas.style.display='block';canvas.style.opacity='1';video.style.display='none';hasPhoto=true;resetMultiExp();btnRetake.classList.add('visible');btnSave.classList.add('visible');btnFlip.style.display='none';statusEl.textContent='● DYSK GOTOWY';close();notice('Gotowe. Zapisz w albumie albo otwórz SUWAKI, aby zmienić efekt.');
    }catch(error){message.textContent=error.message;}finally{finishing=false;dialog.querySelectorAll('button,input').forEach(e=>e.disabled=false);}
  };
  document.getElementById('poincare-tile').addEventListener('click',()=>{
    if(isBusy||editing)return;
    api.selected=true;
    document.querySelectorAll('.preset-tile').forEach(tile=>tile.classList.toggle('selected',tile.id==='poincare-tile'));
    screenPresets.classList.remove('active');screenParams.classList.remove('active');
    document.getElementById('bar-main').style.visibility='visible';
    if(hasPhoto||isImported||expCount){open();return;}
    api.reset();statusEl.textContent='● DYSK · APARAT';
    notice('Dysk wybrany. Wykadruj ujęcie i naciśnij ZRÓB ZDJĘCIE.');
  });
  return api;
})();
