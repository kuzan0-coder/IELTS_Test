// Browser API shim — only used in the web (Vercel) build.
// In the Electron build, preload.js already defines window.ielts before
// page scripts run, so this guard skips and the desktop bridge is kept.
if (!window.ielts) {
  window.ielts = {
    async getAIFeedback(payload) {
      try {
        const res = await fetch('/api/ai/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          return { ok: false, error: `Server error ${res.status}` };
        }
        return await res.json();
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    }
  };
}
