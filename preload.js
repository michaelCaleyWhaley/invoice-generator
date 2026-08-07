const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: async ({ defaultPath, data }) => {
    try {
      // Convert ArrayBuffer / TypedArray to Node Buffer via Buffer
      const buf = Buffer.from(data);
      const base64 = buf.toString('base64');
      return await ipcRenderer.invoke('save-file', { defaultPath, base64 });
    } catch (err) {
      console.error('[preload] saveFile error', err);
      return { canceled: true, error: String(err) };
    }
  },
});
