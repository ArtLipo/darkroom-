'use strict';
let noticeTimer;
function notice(message) {
  const element = document.getElementById('app-notice');
  clearTimeout(noticeTimer);
  element.textContent = message; element.hidden = false;
  noticeTimer = setTimeout(() => { element.hidden = true; }, 7000);
}
const PhotoStore = (() => {
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('darkroom-photos', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(request.error); };
      request.onblocked = () => notice('Zamknij inne okna DARKROOM, aby otworzyć album.');
    });
    return database;
  }
  async function transact(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', mode);
      const request = action(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('Zapis przerwany'));
      tx.onerror = () => reject(tx.error || request.error);
    });
  }
  return {
    put: photo => transact('readwrite', store => store.put(photo)),
    list: () => transact('readonly', store => store.getAll()),
    remove: id => transact('readwrite', store => store.delete(id))
  };
})();
function downloadPhoto(photo) {
  const url = URL.createObjectURL(photo.blob);
  const link = document.createElement('a');
  link.href = url; link.download = photo.name;
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
let albumUrls = [];
let albumRequest = 0;
function clearAlbum() {
  albumUrls.forEach(url => URL.revokeObjectURL(url)); albumUrls = [];
  document.getElementById('album-list').replaceChildren();
}
async function showAlbum() {
  const request = ++albumRequest;
  document.getElementById('album').hidden = false;
  const status = document.getElementById('album-status');
  status.textContent = 'Wczytywanie…'; clearAlbum();
  try {
    const photos = await PhotoStore.list();
    if (request !== albumRequest) return;
    photos.sort((a,b) => b.created - a.created);
    status.textContent = photos.length ? 'Zapisane zdjęcia: ' + photos.length : 'Album jest pusty. Zrób zdjęcie i naciśnij SAVE.';
    for (const photo of photos) {
      const item = document.createElement('article');
      const img = document.createElement('img');
      img.src = URL.createObjectURL(photo.blob); albumUrls.push(img.src);
      img.alt = 'Zdjęcie ' + new Date(photo.created).toLocaleString('pl-PL');
      img.loading = 'lazy'; item.appendChild(img);
      const download = document.createElement('button'); download.textContent = 'POBIERZ';
      download.onclick = () => {
        downloadPhoto(photo);
        status.textContent = 'Wysłano do pobrania. Jeśli telefon blokuje pobieranie, użyj UDOSTĘPNIJ.';
      };
      item.appendChild(download);
      const file = new File([photo.blob], photo.name, { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        const share = document.createElement('button'); share.textContent = 'UDOSTĘPNIJ';
        share.onclick = async () => {
          try { await navigator.share({ files: [file] }); }
          catch (error) { if (error.name !== 'AbortError') notice('Udostępnianie nie powiodło się. Zdjęcie jest nadal w albumie.'); }
        };
        item.appendChild(share);
      }
      const remove = document.createElement('button'); remove.textContent = 'USUŃ';
      remove.onclick = async () => {
        if (!confirm('Usunąć tę kopię z albumu DARKROOM? Upewnij się, że zdjęcie zostało pobrane.')) return;
        try { await PhotoStore.remove(photo.id); await showAlbum(); }
        catch (error) { notice('Nie udało się usunąć zdjęcia.'); }
      };
      item.appendChild(remove); document.getElementById('album-list').appendChild(item);
    }
  } catch (error) { if (request === albumRequest) status.textContent = 'Nie można otworzyć albumu. Sprawdź dostęp do pamięci przeglądarki.'; }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-album').onclick = showAlbum;
  document.getElementById('album-close').onclick = () => {
    albumRequest++; clearAlbum(); document.getElementById('album').hidden = true;
  };
});
