import type { StatsResponse, IndexStatusResponse } from '~/types/api';

const POLL_INTERVAL_MS = 600;

export function useIndexer() {
  const { apiFetch } = useApi();

  const workspacePath = ref('');
  const stats = ref<StatsResponse | null>(null);
  const indexStatus = ref<IndexStatusResponse | null>(null);
  const isIndexing = ref(false);

  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  function stopPolling() {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    const poll = async () => {
      await fetchStatus();
      if (isIndexing.value) {
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  }

  async function fetchStats(): Promise<void> {
    try {
      const params = workspacePath.value
        ? `?workspacePath=${encodeURIComponent(workspacePath.value)}`
        : '';
      stats.value = await apiFetch<StatsResponse>(`/api/v1/stats${params}`);
    } catch {
      stats.value = null;
    }
  }

  async function fetchStatus(): Promise<void> {
    try {
      const params = workspacePath.value
        ? `?workspacePath=${encodeURIComponent(workspacePath.value)}`
        : '';
      indexStatus.value = await apiFetch<IndexStatusResponse>(`/api/v1/status${params}`);
    } catch {
      indexStatus.value = null;
    }
  }

  async function releaseLock(): Promise<void> {
    try {
      await apiFetch('/api/v1/release-lock', {
        method: 'POST',
        body: JSON.stringify({ workspacePath: workspacePath.value }),
      });
      await fetchStatus();
    } catch (err) {
      console.error('Failed to release lock:', err);
    }
  }

  async function triggerIndex(force = false): Promise<void> {
    if (!workspacePath.value.trim()) return;
    isIndexing.value = true;
    indexStatus.value = { status: 'indexing', message: 'Starting...', files_processed: 0, files_total: 0 };
    startPolling();
    try {
      indexStatus.value = await apiFetch<IndexStatusResponse>('/api/v1/reindex', {
        method: 'POST',
        body: JSON.stringify({ workspacePath: workspacePath.value, force }),
      });
    } catch (err) {
      indexStatus.value = {
        status: 'error',
        message: (err as Error).message,
        files_processed: 0,
        files_total: 0,
      };
    } finally {
      isIndexing.value = false;
      stopPolling();
      await Promise.all([fetchStatus(), fetchStats()]);
    }
  }

  return {
    workspacePath,
    stats,
    indexStatus,
    isIndexing,
    fetchStats,
    fetchStatus,
    releaseLock,
    triggerIndex,
  };
}
