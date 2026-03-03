export function useApi() {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBase || '';

  async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return { apiFetch };
}
