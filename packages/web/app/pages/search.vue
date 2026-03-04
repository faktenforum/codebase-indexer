<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('search.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <div class="p-6 space-y-6 overflow-y-auto">
      <!-- Search Form -->
      <UCard>
        <form @submit.prevent="handleSearch" class="space-y-4">
          <!-- Workspace Selection -->
          <USelect
            v-if="workspaces.workspaces.value.length > 0"
            v-model="selectedWorkspace"
            :items="workspaceItems"
            :placeholder="t('search.selectWorkspace')"
            size="lg"
            icon="i-lucide-folder-open"
          />
          <UInput
            v-else
            v-model="selectedWorkspace"
            :placeholder="t('workspace.placeholder')"
            size="lg"
            icon="i-lucide-folder"
          />

          <UInput
            v-model="query"
            :placeholder="t('search.placeholder')"
            :disabled="!selectedWorkspace"
            size="lg"
            icon="i-lucide-search"
          />
          <div class="flex gap-3">
            <UInput
              v-model="pathFilter"
              :placeholder="t('search.pathFilter')"
              size="sm"
              class="flex-1"
            />
            <USelect
              v-model="searchMode"
              :items="searchModeItems"
              size="sm"
              class="w-40"
            />
            <UInput
              v-model.number="limit"
              type="number"
              :placeholder="t('search.limit')"
              size="sm"
              class="w-24"
            />
            <UButton
              type="submit"
              :label="t('search.button')"
              :loading="search.isLoading.value"
              :disabled="!selectedWorkspace || !query.trim()"
            />
          </div>
        </form>
      </UCard>

      <!-- Error -->
      <div v-if="search.error.value" class="text-red-500 text-sm">
        {{ search.error.value }}
      </div>

      <!-- Results -->
      <div v-if="search.results.value.length > 0" class="space-y-3">
        <h3 class="text-sm text-dimmed">
          {{ t('search.resultCount', { count: search.results.value.length }) }}
        </h3>
        <UCard
          v-for="(result, i) in search.results.value"
          :key="i"
          class="hover:border-[var(--ui-primary)] transition-colors"
        >
          <div class="flex items-start justify-between">
            <div>
              <NuxtLink
                :to="`/workspaces/chunks?workspace=${encodeURIComponent(selectedWorkspace)}&file=${encodeURIComponent(result.file_path)}`"
                class="font-mono text-sm font-bold text-[var(--ui-primary)] hover:underline"
              >
                {{ result.file_path }}
              </NuxtLink>
              <div class="text-xs text-dimmed mt-1">
                {{ t('search.lines', { start: result.start_line, end: result.end_line }) }}
              </div>
            </div>
            <UBadge variant="subtle" :label="result.score.toFixed(3)" />
          </div>
          <pre class="mt-3 text-xs bg-[var(--ui-bg-elevated)] p-3 rounded overflow-x-auto max-h-40">{{ result.code_chunk.trim().slice(0, 500) }}</pre>
        </UCard>
      </div>
    </div>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const { t } = useI18n();
const search = useSearch();
const workspaces = useWorkspaces();

const selectedWorkspace = ref('');
const query = ref('');
const pathFilter = ref('');
const limit = ref(20);
const searchMode = ref('hybrid');

const searchModeItems = computed(() => [
  { label: t('search.modeHybrid'), value: 'hybrid' },
  { label: t('search.modeVector'), value: 'vector' },
  { label: t('search.modeFts'), value: 'fts' },
]);

const workspaceItems = computed(() =>
  workspaces.workspaces.value.map((w) => ({
    label: w.path,
    value: w.path,
  })),
);

async function handleSearch() {
  if (!query.value.trim() || !selectedWorkspace.value) return;
  await search.search({
    query: query.value.trim(),
    workspacePath: selectedWorkspace.value,
    path: pathFilter.value || undefined,
    limit: limit.value,
    mode: searchMode.value as 'vector' | 'fts' | 'hybrid',
  });
}

onMounted(() => {
  workspaces.loadFromStorage();
  if (workspaces.workspaces.value.length > 0 && !selectedWorkspace.value) {
    selectedWorkspace.value = workspaces.workspaces.value[0]!.path;
  }
});
</script>
