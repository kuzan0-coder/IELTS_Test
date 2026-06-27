// Browser API shim — only used in the web (Vercel) build.
// In the Electron build, preload.js already defines window.ielts before
// page scripts run, so this guard skips and the desktop bridge is kept.
if (!window.ielts) {
  // Ambil access token Supabase (kalau login) untuk dikirim ke endpoint AI.
  // Server mewajibkan login + menerapkan kuota berbasis user ini.
  async function authHeader() {
    try {
      if (window.SB && window.SB.auth) {
        const { data } = await window.SB.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (token) return { Authorization: `Bearer ${token}` };
      }
    } catch (_) { /* abaikan, jatuh ke tanpa-token (server akan menolak) */ }
    return {};
  }

  window.ielts = {
    async getAIFeedback(payload) {
      try {
        const res = await fetch('/api/ai/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          // Coba ambil pesan error dari body (mis. 401 belum login, 413 input kepanjangan).
          const body = await res.json().catch(() => null);
          if (body && body.error) return body;
          if (res.status === 401) return { ok: false, error: 'Silakan login dulu untuk memakai fitur AI.' };
          return { ok: false, error: `Server error ${res.status}` };
        }
        return await res.json();
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    }
  };
}
