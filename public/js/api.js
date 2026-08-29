export async function api(url, metodo = 'GET', cuerpo = null) {
  const headers = { 'Content-Type': 'application/json' };
  
  // Inyección de contexto multi-tenant y token de sesión
  const compId = sessionStorage.getItem('jnj_compania_activa') || localStorage.getItem('compania');
  if (compId) {
    headers['X-Company-Id'] = String(compId);
  }

  const token = sessionStorage.getItem('jnj_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const opts = { method: metodo, headers };
  if (cuerpo) opts.body = JSON.stringify(cuerpo);
  
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Error en la solicitud');
  return data;
}

export const GET = (url) => api(url);
export const POST = (url, cuerpo) => api(url, 'POST', cuerpo);
export const PUT = (url, cuerpo) => api(url, 'PUT', cuerpo);
export const DEL = (url) => api(url, 'DELETE');
