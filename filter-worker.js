let bw, activeFilter, direction, activeHue, activeMult, activeZmode, activeEdir, activeGdir;
let values = {};
const document = { getElementById: id => ({ value: values[id] }) };
importScripts('./filters.js');
self.onmessage = event => {
  const { id, imageData, settings } = event.data;
  ({ bw, activeFilter, direction, activeHue, activeMult, activeZmode, activeEdir, activeGdir, values } = settings);
  try {
    runFilter(imageData);
    self.postMessage({ id, imageData }, [imageData.data.buffer]);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
