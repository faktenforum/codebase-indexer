import type { SearchRequest, SearchResponse, SearchResultItem } from '~/types/api';

export function useSearch() {
  const { apiFetch } = useApi();

  const results = ref<SearchResultItem[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function search(params: SearchRequest): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await apiFetch<SearchResponse>('/api/v1/search', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      results.value = response.results;
    } catch (err) {
      error.value = (err as Error).message;
      results.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  return {
    results,
    isLoading,
    error,
    search,
  };
}
