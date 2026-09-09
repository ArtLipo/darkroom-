/* Slit scan: each strip comes from its own video frame, never from a filter.
   The raw canvas is immutable after capture; every effect reads a fresh copy. */
window.Scan=(()=>{
  const $=id=>document.getElementById(id);
  const dialog=$('scan-editor'),preview=$('scan-preview'),pc=preview.getContext('2d');
  const status=$('scan-status'),select=$('scan-filter'),params=$('scan-filter-params');
  let raw=null,result=null,rawRecord=null,record=null,scanning=false,processing=false,opened=false;
  let frameHandle=null,frameKind='',startTime=null,position=0,captureDirection='right',duration=3000,epoch=0;
  let watchdog=null,lastFrame=0,lastVideoTime=-1;
  let worker=null,job=null,exportUrl=null,savedIds=new Set();
  const api={selected:false,open};
  function cancelFrame(){if(frameHandle!==null){if(frameKind==='video')video.cancelVideoFrameCallback(frameHandle);else cancelAnimationFrame(frameHandle);}frameHandle=null;}
  function nextFrame(){if(!opened)return;frameKind='raf';frameHandle=requestAnimationFrame(frame);}
  function setStatus(text){status.textContent=text;}
  function previewSize(w,h){const scale=Math.min(1,960/Math.max(w,h));const pw=Math.max(1,Math.round(w*scale)),ph=Math.max(1,Math.round(h*scale));if(preview.width!==pw)preview.width=pw;if(preview.height!==ph)preview.height=ph;}
  function display(image){previewSize(image.width,image.height);pc.drawImage(image,0,0,preview.width,preview.height);}
  function update(){
    $('scan-setup').hidden=!!raw&&!scanning;
    $('scan-effects').hidden=!raw||scanning;
    $('scan-start').hidden=!!raw&&!scanning;
    $('scan-start').disabled=scanning||processing;
    $('scan-stop').hidden=!scanning;
    $('scan-new').hidden=!raw||scanning;
    $('scan-save').hidden=!raw||scanning;
    $('scan-save').disabled=processing||!result||!!(record&&savedIds.has(record.id));
    $('scan-save').textContent=record&&savedIds.has(record.id)?'ZAPISANO W ALBUMIE':select.value==='none'?'ZAPISZ SKAN':'ZAPISZ WARIANT';
    $('scan-new').disabled=processing;
    $('scan-apply').disabled=processing||select.value==='none';
    select.disabled=processing;
    params.querySelectorAll('input,select').forEach(e=>e.disabled=processing);
    $('scan-duration').disabled=scanning;
    $('scan-directions').querySelectorAll('button').forEach(e=>e.disabled=scanning);
  }
  function hideExport(){ $('scan-export').hidden=true;if(exportUrl){const old=exportUrl;setTimeout(()=>URL.revokeObjectURL(old),60000);exportUrl=null;} }
  function stopWorker(){if(worker)worker.terminate();worker=null;if(job){clearTimeout(job.timer);job.reject(new Error('Przerwano przetwarzanie.'));job=null;}}
  function filter(imageData,settings){return new Promise((resolve,reject)=>{
    try{worker=new Worker('./filter-worker.js');const timer=setTimeout(()=>{stopWorker();},90000);job={resolve,reject,timer};
      worker.onmessage=({data:m})=>{clearTimeout(timer);job=null;worker.terminate();worker=null;m.error?reject(new Error(m.error)):resolve(m.imageData);};
      worker.onerror=e=>{e.preventDefault();clearTimeout(timer);job=null;worker.terminate();worker=null;reject(new Error('Nie można uruchomić filtra. Skan pozostał dostępny — wybierz Bez filtra lub spróbuj ponownie.'));};
      worker.postMessage({id:1,imageData,settings},[imageData.data.buffer]);
    }catch(error){if(job)clearTimeout(job.timer);job=null;if(worker)worker.terminate();worker=null;reject(error);}
  });}
  function close(){
    if(raw&&!confirm('Zamknąć skan? Po zamknięciu nie wrócisz do jego oryginału. Zapisane warianty pozostaną w albumie.'))return;
    opened=false;clearInterval(watchdog);epoch++;cancelFrame();stopWorker();scanning=false;processing=false;raw=result=rawRecord=record=null;savedIds.clear();hideExport();dialog.close();btnShoot.focus();
  }
  async function open(){
    if(isBusy||opened)return;
    if((hasPhoto||isImported||expCount)&&!confirm('Skan wymaga aparatu. Odrzucić bieżące niezapisane zdjęcie i przejść do skanowania?'))return;
    if(hasPhoto||isImported||expCount)returnToCamera();
    api.selected=true;if(window.Poincare)Poincare.selected=false;
    btnShoot.textContent='SKAN';btnShoot.setAttribute('aria-label','Otwórz skanowanie');
    document.querySelectorAll('.preset-tile').forEach(t=>t.classList.toggle('selected',t.id==='scan-tile'));
    screenPresets.classList.remove('active');screenParams.classList.remove('active');$('bar-main').style.visibility='visible';
    opened=true;epoch++;select.value='none';hideExport();dialog.showModal();$('scan-close').focus();setStatus('Ustaw kadr, wybierz czas i kierunek. Naciśnij Rozpocznij skan.');update();
    const track=video.srcObject?.getVideoTracks()[0];if(!track||track.readyState==='ended')await startCamera();
    if(!opened)return;nextFrame();
  }
  function abortCapture(message){clearInterval(watchdog);scanning=false;raw=result=null;startTime=null;position=0;update();setStatus(message);}
  function frame(now){
    frameHandle=null;if(!opened)return;
    const fresh=video.currentTime!==lastVideoTime;if(fresh){lastVideoTime=video.currentTime;lastFrame=performance.now();}
    if(document.hidden){if(scanning)abortCapture('Skan przerwany po ukryciu aplikacji. Rozpocznij go ponownie.');nextFrame();return;}
    if(video.readyState<2||!video.videoWidth){if(scanning)abortCapture('Utracono obraz z aparatu. Rozpocznij skan ponownie.');nextFrame();return;}
    if(!scanning){if(!raw){previewSize(video.videoWidth,video.videoHeight);pc.drawImage(video,0,0,preview.width,preview.height);}nextFrame();return;}
    if(!fresh){nextFrame();return;}
    if(video.videoWidth!==raw.width||video.videoHeight!==raw.height){abortCapture('Zmienił się rozmiar obrazu aparatu. Rozpocznij skan ponownie.');nextFrame();return;}
    if(startTime===null)startTime=now;
    const progress=Math.min(1,Math.max(0,(now-startTime)/duration));
    const horizontal=captureDirection==='right'||captureDirection==='left';
    const length=horizontal?raw.width:raw.height;
    const next=progress===1?length:Math.floor(length*progress);
    if(next>position){
      const from=(captureDirection==='left'||captureDirection==='up')?length-next:position;
      const count=next-position;
      const x=horizontal?from:0,y=horizontal?0:from,w=horizontal?count:raw.width,h=horizontal?raw.height:count;
      raw.getContext('2d').drawImage(video,x,y,w,h,x,y,w,h);position=next;
    }
    previewSize(raw.width,raw.height);pc.drawImage(video,0,0,preview.width,preview.height);
    const completed=position/length,reverse=captureDirection==='left'||captureDirection==='up';
    pc.save();pc.beginPath();if(horizontal)pc.rect(reverse?preview.width*(1-completed):0,0,preview.width*completed,preview.height);else pc.rect(0,reverse?preview.height*(1-completed):0,preview.width,preview.height*completed);pc.clip();pc.drawImage(raw,0,0,preview.width,preview.height);pc.restore();
    pc.strokeStyle='#ff642e';pc.lineWidth=3;pc.beginPath();const line=reverse?1-completed:completed;
    if(horizontal){pc.moveTo(preview.width*line,0);pc.lineTo(preview.width*line,preview.height);}else{pc.moveTo(0,preview.height*line);pc.lineTo(preview.width,preview.height*line);}pc.stroke();
    setStatus('Skanowanie… '+Math.round(progress*100)+'%');
    if(progress===1){clearInterval(watchdog);scanning=false;result=raw;record=rawRecord=null;select.value='none';buildParams();display(raw);setStatus('Skan gotowy. Zapisz go bez filtra lub wypróbuj efekt.');update();}
    nextFrame();
  }
  function start(){if(scanning||processing)return;if(video.readyState<2||!video.videoWidth||video.srcObject?.getVideoTracks()[0]?.readyState!=='live'){setStatus('Aparat jeszcze nie jest gotowy. Sprawdź dostęp do kamery i spróbuj ponownie.');if(video.srcObject?.getVideoTracks()[0]?.readyState!=='live')startCamera();return;}
    raw=document.createElement('canvas');raw.width=video.videoWidth;raw.height=video.videoHeight;
    duration=Number($('scan-duration').value)*1000;captureDirection=document.querySelector('#scan-directions .active').dataset.direction;
    lastFrame=performance.now();watchdog=setInterval(()=>{if(scanning&&(performance.now()-lastFrame>2500||video.srcObject?.getVideoTracks()[0]?.readyState!=='live'))abortCapture('Skan przerwany: utracono obraz z aparatu. Rozpocznij ponownie.');},500);
    result=rawRecord=record=null;scanning=true;startTime=null;position=0;hideExport();update();setStatus('Skanowanie…');
  }
  function addRange(key,label,min,max,value){const wrap=document.createElement('label');wrap.textContent=label;const output=document.createElement('output');output.textContent=value;wrap.appendChild(output);const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.value=value;input.dataset.key=key;input.setAttribute('aria-label',label);input.oninput=()=>{output.textContent=input.value;dirty();};wrap.appendChild(input);params.appendChild(wrap);}
  function addSelect(key,label,options,value){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('select');input.dataset.key=key;input.setAttribute('aria-label',label);for(const [id,text]of options){const option=new Option(text,id);input.add(option);}input.value=value;input.onchange=dirty;wrap.appendChild(input);params.appendChild(wrap);}
  function buildParams(){params.replaceChildren();const name=select.value;if(name==='none')return;const preset=PRESETS[name];
    addRange('sl-contrast','Kontrast',50,200,100);addRange('sl-saturation','Nasycenie',0,200,100);addRange('sl-brightness','Jasność',-100,100,0);
    addSelect('bw','Kolor',[['false','Kolor'],['true','Czarno-białe']],String(preset.bw));
    if(!NO_THRESHOLD.includes(preset.filter))addRange('sl-threshold','Próg',0,255,preset.threshold);
    if(!NO_INTENSITY.includes(preset.filter))addRange('sl-intensity','Siła',0,100,preset.intensity);
    if(!NO_DIR.includes(preset.filter))addSelect('direction','Kierunek filtra',[['horizontal','Poziom'],['vertical','Pion'],['both','Oba']],preset.dir);
    for(const [key,param]of Object.entries(EXTRA_PARAMS[name]||{}))if(param)addRange(key==='e1'?'sl-extra1':'sl-extra2',param.label,param.min,param.max,param.val);
    if(name==='grawitacja'||name==='elektroforeza')addSelect(name==='grawitacja'?'activeGdir':'activeEdir','Kierunek filtra',[['down','W dół'],['up','W górę'],['left','W lewo'],['right','W prawo']],name==='grawitacja'?'down':'right');
    if(name==='kolor-sort')addSelect('activeHue','Kolor sortowania',[['0','Czerwony'],['30','Pomarańczowy'],['60','Żółty'],['120','Zielony'],['180','Cyjan'],['240','Niebieski'],['300','Fioletowy']],'0');
    if(name==='mnozenie')addSelect('activeMult','Mnożenie',[['rg','R × G'],['rb','R × B'],['gb','G × B'],['cross','Krzyżowo'],['power','Potęga']],'rg');
    if(name==='zespolone')addSelect('activeZmode','Przekształcenie',[['pow','Z^N'],['inv','1/Z'],['exp','E^Z']],'pow');
  }
  function dirty(){result=null;record=null;hideExport();setStatus('Ustawienia zmienione. Naciśnij Zastosuj filtr. Obraz pokazuje poprzedni podgląd.');update();}
  function settings(){const preset=PRESETS[select.value];const s={activeFilter:preset.filter,bw:preset.bw,direction:preset.dir,activeHue:0,activeMult:'rg',activeZmode:'pow',activeEdir:'right',activeGdir:'down',values:{'sl-contrast':100,'sl-saturation':100,'sl-brightness':0,'sl-threshold':preset.threshold,'sl-intensity':preset.intensity,'sl-extra1':1,'sl-extra2':1}};
    params.querySelectorAll('[data-key]').forEach(e=>{const key=e.dataset.key;if(key.startsWith('sl-'))s.values[key]=Number(e.value);else s[key]=key==='bw'?e.value==='true':key==='activeHue'?Number(e.value):e.value;});return s;
  }
  async function apply(){if(processing||!raw||select.value==='none')return;const ticket=epoch;processing=true;update();setStatus('Nakładanie filtra na pierwotny skan…');try{const image=await filter(raw.getContext('2d').getImageData(0,0,raw.width,raw.height),settings());if(!opened||ticket!==epoch)return;result=document.createElement('canvas');result.width=raw.width;result.height=raw.height;result.getContext('2d').putImageData(image,0,0);record=null;display(result);setStatus('Wariant gotowy. Możesz go zapisać lub wybrać inny filtr.');}catch(error){if(opened&&ticket===epoch)setStatus(error.message);}finally{if(ticket===epoch){processing=false;update();}}}
  async function encode(image){if(typeof OffscreenCanvas!=='undefined'){const c=new OffscreenCanvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);return c.convertToBlob({type:'image/jpeg',quality:.92});}return new Promise((resolve,reject)=>image.toBlob(b=>b?resolve(b):reject(new Error('Nie udało się przygotować zdjęcia.')),'image/jpeg',.92));}
  async function save(){if(processing||!result)return;processing=true;update();$('scan-close').disabled=true;setStatus('Zapisywanie w albumie…');try{
    if(!record){const id='darkroom_'+Date.now()+'_'+crypto.randomUUID();const blob=await encode(result);record={id,name:id+'.jpg',created:Date.now(),blob};try{record.thumbnail=await makeThumbnail(blob);}catch{}if(result===raw)rawRecord=record;}
    await PhotoStore.put(record);savedIds.add(record.id);hideExport();setStatus('Zapisano w albumie. Możesz wypróbować inny filtr na tym samym skanie.');
    }catch(error){setStatus('Nie zapisano w albumie. '+(error.message||'Sprawdź wolne miejsce.')+' Skan pozostaje dostępny.');if(record?.blob){hideExport();exportUrl=URL.createObjectURL(record.blob);$('scan-download').href=exportUrl;$('scan-download').download=record.name;$('scan-export').hidden=false;}}
    finally{processing=false;$('scan-close').disabled=false;update();}
  }
  select.add(new Option('Bez filtra — sam skan','none'));
  for(const [key,preset]of Object.entries(PRESETS)){if(key==='multiexp')continue;const tile=document.querySelector('[data-preset="'+key+'"]');const label=tile?[...tile.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():key;select.add(new Option(label,key));}
  select.onchange=()=>{hideExport();buildParams();if(select.value==='none'){result=raw;record=rawRecord;display(raw);setStatus('Pierwotny skan, bez dodatkowego filtra.');update();}else dirty();};
  $('scan-duration').oninput=()=>{$('scan-duration-value').textContent=$('scan-duration').value+' s';try{localStorage.setItem('darkroom-scan-duration',$('scan-duration').value);}catch{}};
  try{const time=Number(localStorage.getItem('darkroom-scan-duration'));if(time>=1&&time<=10)$('scan-duration').value=time;}catch{}$('scan-duration-value').textContent=$('scan-duration').value+' s';
  $('scan-directions').querySelectorAll('button').forEach(button=>button.onclick=()=>{$('scan-directions').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});});
  $('scan-start').onclick=start;$('scan-stop').onclick=()=>abortCapture('Skan przerwany. Możesz rozpocząć ponownie.');
  $('scan-new').onclick=()=>{if(confirm('Rozpocząć nowy skan? Zapisane warianty pozostaną w albumie, ale utracisz dostęp do bieżącego oryginału.')){raw=result=rawRecord=record=null;hideExport();select.value='none';update();setStatus('Ustaw kadr i rozpocznij nowy skan.');}};
  $('scan-apply').onclick=apply;$('scan-save').onclick=save;$('scan-close').onclick=close;
  $('scan-download').onclick=()=>setStatus('Zlecono pobranie. Sprawdź plik w Pobranych.');
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(!$('scan-close').disabled)close();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&opened&&scanning)abortCapture('Skan przerwany po ukryciu aplikacji. Rozpocznij go ponownie.');});
  $('scan-tile').addEventListener('click',open);
  return api;
})();
