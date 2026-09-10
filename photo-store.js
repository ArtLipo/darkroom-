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
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = null; };
        resolve(request.result);
      };
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
    page: async (before = null, limit = 12) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readonly'), store = tx.objectStore('photos');
        const photos = []; let total = 0, hasMore = false;
        const count = store.count(); count.onsuccess = () => { total = count.result; };
        // Existing app IDs start with darkroom_<timestamp>_, so the primary
        // key provides newest-first pagination without changing the DB version.
        const request = store.openCursor(before ? IDBKeyRange.upperBound(before, true) : null, 'prev');
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (photos.length === limit) { hasMore = true; return; }
          photos.push(cursor.value); cursor.continue();
        };
        tx.oncomplete = () => resolve({ photos, total, next: hasMore ? photos.at(-1).id : null });
        tx.onabort = tx.onerror = () => reject(tx.error || request.error);
      });
    },
    put: photo => transact('readwrite', store => store.put(photo)),
    list: () => transact('readonly', store => store.getAll()),
    remove: id => transact('readwrite', store => store.delete(id)),
    markExport: (id, exportStatus) => transact('readwrite', store => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, exportStatus });
      };
      return request;
    })
  };
})();
let albumUrls = [];
let albumRequest = 0;
let albumCursors = [null], albumPage = 0, albumNext = null;
const pendingDownloadUrls = new Map();
function clearAlbum() {
  albumUrls.forEach(url => {
    const remaining = (pendingDownloadUrls.get(url) || 0) - Date.now();
    const release = () => { URL.revokeObjectURL(url); pendingDownloadUrls.delete(url); };
    if (remaining > 0) setTimeout(release, remaining);
    else release();
  });
  albumUrls = [];
  document.getElementById('album-list').replaceChildren();
}
async function showAlbum(reset = true) {
  if (reset) { albumCursors = [null]; albumPage = 0; }
  const request = ++albumRequest;
  document.getElementById('album').hidden = false;
  const status = document.getElementById('album-status');
  status.textContent = 'Wczytywanie…'; clearAlbum();
  try {
    const { photos, total, next } = await PhotoStore.page(albumCursors[albumPage]);
    if (request !== albumRequest) return;
    if (!photos.length && albumPage > 0) { albumPage--; return showAlbum(false); }
    albumNext = next;
    document.getElementById('album-prev').disabled = albumPage === 0;
    document.getElementById('album-next').disabled = !next;
    document.getElementById('album-page').textContent = 'Strona ' + (albumPage + 1);
    status.textContent = total ? 'Zapisane zdjęcia: ' + total : 'Album jest pusty. Zrób zdjęcie i naciśnij ZAPISZ W ALBUMIE.';
    updateStorageStatus();
    for (const photo of photos) {
      const item = document.createElement('article');
      const img = document.createElement('img');
      let thumbnail = photo.thumbnail;
      if (!thumbnail) {
        try { thumbnail = await makeThumbnail(photo.blob); } catch (error) { thumbnail = photo.blob; }
        if (request !== albumRequest) return;
      }
      img.src = URL.createObjectURL(thumbnail); albumUrls.push(img.src);
      img.alt = 'Zdjęcie ' + new Date(photo.created).toLocaleString('pl-PL');
      img.loading = 'lazy';
      const preview = document.createElement('button'); preview.className = 'photo-preview';
      preview.setAttribute('aria-label', 'Otwórz: ' + img.alt); preview.appendChild(img);
      preview.onclick = () => {
        const viewer = document.getElementById('photo-viewer');
        const full = viewer.querySelector('img'); full.src = URL.createObjectURL(photo.blob); full.alt = img.alt;
        viewer.onclose = () => { URL.revokeObjectURL(full.src); full.removeAttribute('src'); preview.focus(); };
        viewer.showModal(); document.getElementById('photo-viewer-close').focus();
      };
      item.appendChild(preview);
      const exportStatus = document.createElement('p');
      exportStatus.className = 'photo-export-status';
      exportStatus.setAttribute('role', 'status');
      const showExportStatus = state => {
        if (!state) { exportStatus.textContent = 'Zdjęcie jest w albumie aplikacji.'; return; }
        const time = new Date(state.at).toLocaleString('pl-PL');
        exportStatus.textContent = state.kind === 'share'
          ? 'Przekazano do udostępnienia · ' + time
          : 'Zlecono pobranie · ' + time + '. Sprawdź plik w Pobranych. Jeśli go nie ma, użyj UDOSTĘPNIJ.';
      };
      showExportStatus(photo.exportStatus);
      const recordExport = kind => {
        const state = { kind, at: Date.now() };
        photo.exportStatus = state; showExportStatus(state);
        PhotoStore.markExport(photo.id, state).catch(() => notice('Nie udało się zapamiętać informacji o eksporcie. Zdjęcie nadal jest w albumie.'));
      };
      // A real, persistent link receives the user's click directly. Do not
      // synthesize a click on a temporary link or navigate the album away.
      const download = document.createElement('a'); download.textContent = 'POBIERZ NA TELEFON';
      download.className = 'photo-download';
      download.href = URL.createObjectURL(photo.blob); albumUrls.push(download.href);
      download.download = photo.name;
      // Keep the direct user-initiated download in this browsing context.
      // No new window or external tab is needed for a blob with download=.
      download.target = '_self';
      download.addEventListener('click', () => {
        pendingDownloadUrls.set(download.href, Date.now() + 60000);
        recordExport('download');
        notice('Przekazano zdjęcie do pobrania. Wynik sprawdź w Pobranych.');
      });
      item.appendChild(download);
      const file = new File([photo.blob], photo.name, { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        const share = document.createElement('button'); share.textContent = 'UDOSTĘPNIJ';
        share.onclick = async () => {
          share.disabled = true;
          try { await navigator.share({ files: [file] }); recordExport('share'); }
          catch (error) {
            exportStatus.textContent = error.name === 'AbortError'
              ? 'Anulowano udostępnianie. Zdjęcie nadal jest w albumie.'
              : 'Udostępnianie nie powiodło się. Zdjęcie nadal jest w albumie.';
            notice(exportStatus.textContent);
          } finally { share.disabled = false; }
        };
        item.appendChild(share);
      }
      const remove = document.createElement('button'); remove.textContent = 'USUŃ';
      remove.onclick = async () => {
        if (!confirm('Usunąć tę kopię z albumu DARKROOM? Upewnij się, że zdjęcie zostało pobrane.')) return;
        try { await PhotoStore.remove(photo.id); await showAlbum(false); }
        catch (error) { notice('Nie udało się usunąć zdjęcia.'); }
      };
      item.appendChild(remove); item.appendChild(exportStatus);
      document.getElementById('album-list').appendChild(item);
    }
  } catch (error) { if (request === albumRequest) status.textContent = 'Nie można otworzyć albumu. Sprawdź dostęp do pamięci przeglądarki.'; }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('photo-viewer-close').onclick = () => document.getElementById('photo-viewer').close();
  document.getElementById('album-prev').onclick = () => { if (albumPage > 0) { albumPage--; showAlbum(false); } };
  document.getElementById('album-next').onclick = () => { if (albumNext) { albumCursors[++albumPage] = albumNext; showAlbum(false); } };
  document.getElementById('storage-persist').onclick = async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      notice(granted ? 'Przeglądarka przyznała ochronę przed automatycznym usuwaniem. Nadal pobieraj ważne zdjęcia.' : 'Przeglądarka nie przyznała ochrony. Pobieraj ważne zdjęcia na telefon.');
      updateStorageStatus();
    } catch (error) { notice('Nie można zmienić ochrony pamięci w tej przeglądarce.'); }
  };
  document.getElementById('btn-album').onclick = showAlbum;
  document.getElementById('album-close').onclick = () => {
    albumRequest++; clearAlbum(); document.getElementById('album').hidden = true;
  };
});
async function updateStorageStatus() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    document.getElementById('storage-status').textContent = (estimate ? 'Pamięć witryny: ' + (estimate.usage / 1048576).toFixed(1) + ' MB. ' : '') + (persisted ? 'Ochrona przed automatycznym usuwaniem włączona.' : 'Ważne zdjęcia pobierz na telefon; pamięć przeglądarki nie jest kopią zapasową.');
    document.getElementById('storage-persist').hidden = !!persisted || !navigator.storage?.persist;
  } catch (error) { document.getElementById('storage-status').textContent = 'Nie można odczytać zajętego miejsca. Pobieraj ważne zdjęcia.'; }
}
