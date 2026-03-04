import type { FilesResponse } from '~/types/api';

export function useFiles() {
  const { apiFetch } = useApi();

  const files = ref<string[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function fetchFiles(workspacePath: string): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const params = `?workspacePath=${encodeURIComponent(workspacePath)}`;
      const response = await apiFetch<FilesResponse>(`/api/v1/files${params}`);
      files.value = response.files;
    } catch (err) {
      error.value = (err as Error).message;
      files.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  return {
    files,
    isLoading,
    error,
    fetchFiles,
  };
}
