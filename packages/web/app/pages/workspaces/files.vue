<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('files.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            size="sm"
            to="/workspaces"
            class="mr-2"
          />
        </template>
        <template #trailing>
          <UBadge v-if="filesData.files.value.length" variant="subtle" :label="String(filteredFiles.length)" />
        </template>
      </UDashboardNavbar>
    </template>

    <div class="p-6 space-y-4 overflow-y-auto">
      <!-- Workspace Info -->
      <div class="flex items-center gap-3 text-sm">
        <UIcon name="i-lucide-folder-open" class="size-4 text-dimmed" />
        <span class="font-mono truncate">{{ workspacePath }}</span>
      </div>

      <!-- Filter -->
      <UInput
        v-model="filter"
        :placeholder="t('files.filterPlaceholder')"
        icon="i-lucide-filter"
        size="sm"
      />

      <!-- Loading -->
      <div v-if="filesData.isLoading.value" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
      </div>

      <!-- Error -->
      <UAlert
        v-else-if="filesData.error.value"
        color="error"
        variant="subtle"
        :description="filesData.error.value"
      />

      <!-- Empty -->
      <div v-else-if="filesData.files.value.length === 0" class="text-dimmed text-sm py-8 text-center">
        {{ t('files.empty') }}
      </div>

      <!-- File List -->
      <template v-else>
        <div class="space-y-1">
          <NuxtLink
            v-for="file in paginatedFiles"
            :key="file"
            :to="`/workspaces/chunks?workspace=${encodeURIComponent(workspacePath)}&file=${encodeURIComponent(file)}`"
            class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-elevated transition-colors group"
          >
            <UIcon :name="fileIcon(file)" class="size-4 text-dimmed shrink-0" />
            <span class="font-mono text-sm truncate flex-1">{{ file }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed opacity-0 group-hover:opacity-100 transition-opacity" />
          </NuxtLink>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-between pt-4">
          <span class="text-xs text-dimmed">
            {{ t('files.showing', { from: pageFrom, to: pageTo, total: filteredFiles.length }) }}
          </span>
          <UPagination
            v-model:page="currentPage"
            :total="filteredFiles.length"
            :items-per-page="pageSize"
            size="sm"
          />
        </div>
      </template>
    </div>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const filesData = useFiles();

const workspacePath = computed(() => (route.query.workspace as string) || '');
const filter = ref('');
const currentPage = ref(1);
const pageSize = 50;

const filteredFiles = computed(() => {
  const q = filter.value.toLowerCase();
  if (!q) return filesData.files.value;
  return filesData.files.value.filter((f) => f.toLowerCase().includes(q));
});

const totalPages = computed(() => Math.ceil(filteredFiles.value.length / pageSize));

const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredFiles.value.slice(start, start + pageSize);
});

const pageFrom = computed(() => Math.min((currentPage.value - 1) * pageSize + 1, filteredFiles.value.length));
const pageTo = computed(() => Math.min(currentPage.value * pageSize, filteredFiles.value.length));

// Reset page when filter changes
watch(filter, () => {
  currentPage.value = 1;
});

function fileIcon(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'i-lucide-file-code';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'i-lucide-file-code';
    case 'vue':
    case 'svelte':
      return 'i-lucide-file-code';
    case 'md':
    case 'markdown':
      return 'i-lucide-file-text';
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return 'i-lucide-file-json';
    case 'css':
    case 'html':
      return 'i-lucide-file-code';
    case 'py':
      return 'i-lucide-file-code';
    default:
      return 'i-lucide-file';
  }
}

watch(workspacePath, (path) => {
  if (path) {
    currentPage.value = 1;
    filesData.fetchFiles(path);
  }
}, { immediate: true });
</script>
