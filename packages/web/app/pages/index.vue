<template>
  <div class="space-y-8">
    <!-- Workspace Path -->
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('workspace.title') }}</h2>
      </template>
      <div class="flex gap-3">
        <UInput
          v-model="indexer.workspacePath.value"
          :placeholder="t('workspace.placeholder')"
          size="lg"
          icon="i-lucide-folder"
          class="flex-1"
          @change="onWorkspacePathChange"
        />
        <UButton
          :label="t('actions.index')"
          :loading="indexer.isIndexing.value"
          :disabled="!indexer.workspacePath.value.trim()"
          variant="outline"
          @click="indexer.triggerIndex(false)"
        />
      </div>
    </UCard>

    <!-- Indexing Progress -->
    <UCard v-if="indexer.isIndexing.value">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-circle" class="animate-spin text-primary" />
          <h2 class="text-lg font-semibold">{{ t('indexing.title') }}</h2>
        </div>
      </template>
      <div class="space-y-3">
        <p class="text-sm text-dimmed font-mono truncate">
          {{ indexer.indexStatus.value?.message || t('indexing.starting') }}
        </p>
        <div v-if="progressTotal > 0">
          <div class="flex justify-between text-xs text-dimmed mb-1">
            <span>{{ t('indexing.progress', { processed: progressProcessed, total: progressTotal }) }}</span>
            <span>{{ progressPercent }}%</span>
          </div>
          <UProgress :value="progressPercent" />
        </div>
        <div v-else>
          <UProgress />
        </div>
      </div>
    </UCard>

    <!-- Index Error Banner -->
    <UAlert
      v-if="indexer.indexStatus.value?.status === 'error'"
      color="error"
      variant="subtle"
      :title="t('errors.indexFailed')"
      :description="indexer.indexStatus.value.message"
      :actions="[{ label: t('actions.releaseLock'), color: 'error', variant: 'outline', onClick: indexer.releaseLock }]"
    />

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <UCard>
        <div class="text-sm text-dimmed">{{ t('stats.status') }}</div>
        <div class="text-2xl font-bold mt-1">
          <UBadge
            :color="statusColor"
            :label="indexer.indexStatus.value?.status || 'standby'"
          />
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-dimmed">{{ t('stats.files') }}</div>
        <div class="text-2xl font-bold mt-1">
          {{ indexer.stats.value?.fileCount ?? '-' }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-dimmed">{{ t('stats.enabled') }}</div>
        <div class="text-2xl font-bold mt-1">
          <UBadge
            :color="indexer.stats.value?.isEnabled ? 'success' : 'error'"
            :label="indexer.stats.value?.isEnabled ? t('common.yes') : t('common.no')"
          />
        </div>
      </UCard>
    </div>

    <!-- Search Section -->
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('search.title') }}</h2>
      </template>

      <form @submit.prevent="handleSearch" class="space-y-4">
        <UInput
          v-model="query"
          :placeholder="t('search.placeholder')"
          :disabled="!indexer.workspacePath.value.trim()"
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
            :disabled="!indexer.workspacePath.value.trim()"
          />
        </div>
      </form>
    </UCard>

    <!-- Results -->
    <div v-if="search.error.value" class="text-red-500 text-sm">
      {{ search.error.value }}
    </div>

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
            <div class="font-mono text-sm font-bold text-[var(--ui-primary)]">
              {{ result.file_path }}
            </div>
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
</template>

<script setup lang="ts">
const { t } = useI18n();
const search = useSearch();
const indexer = useIndexer();

const query = ref('');
const pathFilter = ref('');
const limit = ref(20);

const progressProcessed = computed(() => indexer.indexStatus.value?.files_processed ?? 0);
const progressTotal = computed(() => indexer.indexStatus.value?.files_total ?? 0);
const progressPercent = computed(() => {
  if (!progressTotal.value) return 0;
  return Math.round((progressProcessed.value / progressTotal.value) * 100);
});

const statusColor = computed(() => {
  switch (indexer.indexStatus.value?.status) {
    case 'indexed': return 'success' as const;
    case 'indexing': return 'info' as const;
    case 'error': return 'error' as const;
    default: return 'neutral' as const;
  }
});

async function onWorkspacePathChange() {
  if (indexer.workspacePath.value.trim()) {
    await Promise.all([
      indexer.fetchStats(),
      indexer.fetchStatus(),
    ]);
  }
}

async function handleSearch() {
  if (!query.value.trim() || !indexer.workspacePath.value.trim()) return;
  await search.search({
    query: query.value.trim(),
    workspacePath: indexer.workspacePath.value,
    path: pathFilter.value || undefined,
    limit: limit.value,
  });
}

onMounted(async () => {
  if (indexer.workspacePath.value.trim()) {
    await Promise.all([
      indexer.fetchStats(),
      indexer.fetchStatus(),
    ]);
  }
});
</script>
