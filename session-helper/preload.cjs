const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lineOaConnect', {
  start: () => ipcRenderer.invoke('start-connect'),
  close: () => ipcRenderer.invoke('close-app'),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('connect-progress', listener);
    return () => ipcRenderer.removeListener('connect-progress', listener);
  },
});
