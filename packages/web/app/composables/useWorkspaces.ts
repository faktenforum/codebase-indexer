import type { Workspace, IndexStatusResponse, StatsResponse } from '~/types/api';

const STORAGE_KEY = 'codebase-indexer-workspaces';

export function useWorkspaces() {
  const { apiFetch } = useApi();

  const workspaces = useState<Workspace[]>('workspaces', () => []);
  const statusMap = useState<Record<string, IndexStatusResponse>>('workspace-status', () => ({}));
  const statsMap = useState<Record<string, StatsResponse>>('workspace-stats', () => ({}));

  function loadFromStorage() {
    if (import.meta.server) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        workspaces.value = JSON.parse(raw) as Workspace[];
      }
    } catch {
      // ignore
    }
  }

  function saveToStorage() {
    if (import.meta.server) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces.value));
  }

  function addWorkspace(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;
    if (workspaces.value.some((w) => w.path === trimmed)) return;
    workspaces.value.push({ path: trimmed, addedAt: new Date().toISOString() });
    saveToStorage();
  }

  function removeWorkspace(path: string) {
    workspaces.value = workspaces.value.filter((w) => w.path !== path);
    delete statusMap.value[path];
    delete statsMap.value[path];
    saveToStorage();
  }

  async function fetchStatus(workspacePath: string): Promise<IndexStatusResponse | null> {
    try {
      const params = `?workspacePath=${encodeURIComponent(workspacePath)}`;
      const status = await apiFetch<IndexStatusResponse>(`/api/v1/status${params}`);
      statusMap.value[workspacePath] = status;
      return status;
    } catch {
      return null;
    }
  }

  async function fetchStats(workspacePath: string): Promise<StatsResponse | null> {
    try {
      const params = `?workspacePath=${encodeURIComponent(workspacePath)}`;
      const stats = await apiFetch<StatsResponse>(`/api/v1/stats${params}`);
      statsMap.value[workspacePath] = stats;
      return stats;
    } catch {
      return null;
    }
  }

  async function fetchAllStatuses() {
    await Promise.all(
      workspaces.value.map((w) => Promise.all([fetchStatus(w.path), fetchStats(w.path)])),
    );
  }

  async function triggerIndex(workspacePath: string, force = false): Promise<IndexStatusResponse | null> {
    statusMap.value[workspacePath] = {
      status: 'indexing',
      message: 'Starting...',
      files_processed: 0,
      files_total: 0,
    };
    try {
      const result = await apiFetch<IndexStatusResponse>('/api/v1/reindex', {
        method: 'POST',
        body: JSON.stringify({ workspacePath, force }),
      });
      statusMap.value[workspacePath] = result;
      await fetchStats(workspacePath);
      return result;
    } catch (err) {
      const errorStatus: IndexStatusResponse = {
        status: 'error',
        message: (err as Error).message,
        files_processed: 0,
        files_total: 0,
      };
      statusMap.value[workspacePath] = errorStatus;
      return errorStatus;
    }
  }

  async function releaseLock(workspacePath: string): Promise<void> {
    try {
      await apiFetch('/api/v1/release-lock', {
        method: 'POST',
        body: JSON.stringify({ workspacePath }),
      });
      await fetchStatus(workspacePath);
    } catch (err) {
      console.error('Failed to release lock:', err);
    }
  }

  return {
    workspaces,
    statusMap,
    statsMap,
    loadFromStorage,
    addWorkspace,
    removeWorkspace,
    fetchStatus,
    fetchStats,
    fetchAllStatuses,
    triggerIndex,
    releaseLock,
  };
}
