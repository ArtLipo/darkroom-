let filterWorker = null;
let processingId = 0;
function processInWorker(imageData, settings) {
  return new Promise((resolve, reject) => {
    const id = ++processingId;
    const worker = filterWorker || (filterWorker = new Worker('./filter-worker.js'));
    const cleanup = () => { clearTimeout(timer); worker.onmessage = null; worker.onerror = null; };
    const fail = error => { cleanup(); worker.terminate(); filterWorker = null; reject(error); };
    const timer = setTimeout(() => fail(new Error('Przetwarzanie trwa zbyt długo. Spróbuj mniejszego obrazu.')), 90000);
    worker.onerror = event => { event.preventDefault(); fail(new Error('Nie udało się uruchomić filtra. Otwórz aplikację online, aby dokończyć aktualizację.')); };
    worker.onmessage = event => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.imageData);
    };
    try { worker.postMessage({ id, imageData, settings }, [imageData.data.buffer]); }
    catch (error) { fail(error); }
  });
}
async function makeThumbnail(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bitmap.width * scale)); c.height = Math.max(1, Math.round(bitmap.height * scale));
    c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
    return await new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('Thumbnail unavailable')), 'image/jpeg', .75));
  } finally { bitmap.close(); }
}
let emergencyUrl;
function hideEmergencyExport() {
  document.getElementById('emergency-export').hidden = true;
  if (emergencyUrl) { const old = emergencyUrl; setTimeout(() => URL.revokeObjectURL(old), 60000); emergencyUrl = null; }
}
function showEmergencyExport(photo) {
  hideEmergencyExport();
  emergencyUrl = URL.createObjectURL(photo.blob);
  const link = document.getElementById('emergency-download');
  link.href = emergencyUrl; link.download = photo.name;
  const status = document.getElementById('emergency-status'); status.textContent = '';
  link.onclick = () => { status.textContent = 'Zlecono pobranie. Sprawdź plik w Pobranych.'; };
  const file = new File([photo.blob], photo.name, { type:'image/jpeg' });
  const share = document.getElementById('emergency-share');
  share.hidden = !navigator.canShare?.({files:[file]});
  share.onclick = async () => {
    share.disabled = true;
    try { await navigator.share({files:[file]}); status.textContent = 'Przekazano do udostępnienia.'; }
    catch (error) { status.textContent = error.name === 'AbortError' ? 'Anulowano. Zdjęcie pozostaje na ekranie.' : 'Udostępnianie nie powiodło się.'; }
    finally { share.disabled = false; }
  };
  document.getElementById('emergency-close').onclick = hideEmergencyExport;
  document.getElementById('emergency-export').hidden = false;
}
