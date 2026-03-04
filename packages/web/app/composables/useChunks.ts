import type { ChunkItem, ChunksResponse } from '~/types/api';

export function useChunks() {
  const { apiFetch } = useApi();

  const chunks = ref<ChunkItem[]>([]);
  const rechunkedChunks = ref<ChunkItem[]>([]);
  const isLoading = ref(false);
  const isRechunking = ref(false);
  const error = ref<string | null>(null);

  async function fetchChunks(workspacePath: string, filePath: string, limit = 100): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams({
        workspacePath,
        filePath,
        limit: String(limit),
      });
      const response = await apiFetch<ChunksResponse>(`/api/v1/chunks?${params}`);
      chunks.value = response.chunks;
    } catch (err) {
      error.value = (err as Error).message;
      chunks.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  async function rechunkFile(workspacePath: string, filePath: string, limit = 50): Promise<void> {
    isRechunking.value = true;
    error.value = null;
    try {
      const response = await apiFetch<ChunksResponse>('/api/v1/rechunk', {
        method: 'POST',
        body: JSON.stringify({ workspacePath, filePath, limit }),
      });
      rechunkedChunks.value = response.chunks;
    } catch (err) {
      error.value = (err as Error).message;
      rechunkedChunks.value = [];
    } finally {
      isRechunking.value = false;
    }
  }

  function clearRechunked() {
    rechunkedChunks.value = [];
  }

  return {
    chunks,
    rechunkedChunks,
    isLoading,
    isRechunking,
    error,
    fetchChunks,
    rechunkFile,
    clearRechunked,
  };
}
