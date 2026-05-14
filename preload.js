const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ielts', {
  getAIFeedback: (payload) => ipcRenderer.invoke('ai:feedback', payload)
});
