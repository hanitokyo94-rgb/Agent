export type BoboVerifyResponse = { valid: boolean; user?: any };
export type BoboDataSetResponse = { ok: boolean; value?: any };

const BOBO_API_URL = import.meta.env.VITE_BOBO_API_URL as string | undefined;
const BOBO_PROJECT_KEY = import.meta.env.VITE_BOBO_PROJECT_KEY as string | undefined;

function requireEnv() {
  if (!BOBO_API_URL) throw new Error('Missing VITE_BOBO_API_URL');
  if (!BOBO_PROJECT_KEY) throw new Error('Missing VITE_BOBO_PROJECT_KEY');
  return { BOBO_API_URL, BOBO_PROJECT_KEY };
}

export async function boboSetData<T>(key: string, value: T, token: string) {
  const { BOBO_API_URL } = requireEnv();
  const res = await fetch(`${BOBO_API_URL}/api/bobo/data/set`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ key, value })
  });
  if (!res.ok) throw new Error(`Failed to save data (${res.status})`);
  return (await res.json()) as BoboDataSetResponse;
}

export async function boboGetData<T>(key: string, token: string) {
  const { BOBO_API_URL } = requireEnv();
  const res = await fetch(`${BOBO_API_URL}/api/bobo/data/get?key=${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Failed to get data (${res.status})`);
  const data = (await res.json()) as { value: T };
  return data.value;
}

export async function boboDeleteData(key: string, token: string) {
  const { BOBO_API_URL } = requireEnv();
  const res = await fetch(`${BOBO_API_URL}/api/bobo/data/delete?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Failed to delete data (${res.status})`);
  return await res.json().catch(() => ({}));
}
