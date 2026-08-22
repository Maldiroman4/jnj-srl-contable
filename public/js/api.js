export async function api(url, metodo = 'GET', cuerpo = null) {
  const opts = { method: metodo, headers: { 'Content-Type': 'application/json' } };
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
