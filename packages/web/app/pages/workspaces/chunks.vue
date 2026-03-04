<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('chunks.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            size="sm"
            :to="`/workspaces/files?workspace=${encodeURIComponent(workspacePath)}`"
            class="mr-2"
          />
        </template>
        <template #trailing>
          <UBadge v-if="chunksData.chunks.value.length" variant="subtle" :label="String(chunksData.chunks.value.length)" />
        </template>
      </UDashboardNavbar>
    </template>

    <div class="p-6 space-y-4">
      <!-- File Info -->
      <div class="flex items-center gap-3 text-sm">
        <UIcon name="i-lucide-file-code" class="size-4 text-dimmed" />
        <span class="font-mono truncate">{{ filePath }}</span>
      </div>

      <!-- Actions -->
      <div class="flex gap-2">
        <UButton
          :label="t('chunks.rechunk')"
          variant="outline"
          size="sm"
          icon="i-lucide-refresh-cw"
          :loading="chunksData.isRechunking.value"
          @click="handleRechunk"
        />
        <UButton
          v-if="chunksData.rechunkedChunks.value.length > 0"
          :label="t('chunks.clearRechunk')"
          variant="ghost"
          size="sm"
          icon="i-lucide-x"
          @click="chunksData.clearRechunked()"
        />
      </div>

      <!-- Loading -->
      <div v-if="chunksData.isLoading.value" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
      </div>

      <!-- Error -->
      <UAlert
        v-else-if="chunksData.error.value"
        color="error"
        variant="subtle"
        :description="chunksData.error.value"
      />

      <!-- Empty -->
      <div v-else-if="chunksData.chunks.value.length === 0" class="text-dimmed text-sm py-8 text-center">
        {{ t('chunks.empty') }}
      </div>

      <!-- Stored Chunks -->
      <template v-else>
        <h3 class="text-sm font-semibold flex items-center gap-2">
          <UIcon name="i-lucide-database" class="size-4" />
          {{ t('chunks.stored') }} ({{ chunksData.chunks.value.length }})
        </h3>
        <div class="space-y-3">
          <UCard
            v-for="(chunk, i) in chunksData.chunks.value"
            :key="chunk.segment_hash"
            class="border-l-2 border-primary-400"
          >
            <div class="space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <UBadge color="primary" variant="soft" size="xs">
                  #{{ i + 1 }}
                </UBadge>
                <span class="text-xs text-dimmed">
                  {{ t('search.lines', { start: chunk.start_line, end: chunk.end_line }) }}
                </span>
                <span class="text-xs text-dimmed">
                  {{ t('chunks.chars', { count: chunk.char_count }) }}
                </span>
                <UBadge color="neutral" variant="soft" size="xs" class="font-mono">
                  {{ chunk.segment_hash.slice(0, 12) }}
                </UBadge>
              </div>
              <pre class="text-xs bg-[var(--ui-bg-elevated)] p-3 rounded overflow-x-auto max-h-48 whitespace-pre-wrap">{{ chunk.content_preview }}</pre>
            </div>
          </UCard>
        </div>
      </template>

      <!-- Rechunked Chunks (comparison) -->
      <template v-if="chunksData.rechunkedChunks.value.length > 0">
        <h3 class="text-sm font-semibold flex items-center gap-2 mt-6">
          <UIcon name="i-lucide-refresh-cw" class="size-4" />
          {{ t('chunks.rechunked') }} ({{ chunksData.rechunkedChunks.value.length }})
        </h3>
        <div class="space-y-3">
          <UCard
            v-for="(chunk, i) in chunksData.rechunkedChunks.value"
            :key="`rechunk-${chunk.segment_hash}`"
            class="border-l-2 border-warning-400"
          >
            <div class="space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <UBadge color="warning" variant="soft" size="xs">
                  #{{ i + 1 }}
                </UBadge>
                <span class="text-xs text-dimmed">
                  {{ t('search.lines', { start: chunk.start_line, end: chunk.end_line }) }}
                </span>
                <span class="text-xs text-dimmed">
                  {{ t('chunks.chars', { count: chunk.char_count }) }}
                </span>
                <UBadge color="neutral" variant="soft" size="xs" class="font-mono">
                  {{ chunk.segment_hash.slice(0, 12) }}
                </UBadge>
              </div>
              <pre class="text-xs bg-[var(--ui-bg-elevated)] p-3 rounded overflow-x-auto max-h-48 whitespace-pre-wrap">{{ chunk.content_preview }}</pre>
            </div>
          </UCard>
        </div>
      </template>
    </div>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const chunksData = useChunks();

const workspacePath = computed(() => (route.query.workspace as string) || '');
const filePath = computed(() => (route.query.file as string) || '');

function handleRechunk() {
  if (workspacePath.value && filePath.value) {
    chunksData.rechunkFile(workspacePath.value, filePath.value);
  }
}

watch([workspacePath, filePath], ([ws, fp]) => {
  if (ws && fp) {
    chunksData.fetchChunks(ws, fp);
    chunksData.clearRechunked();
  }
}, { immediate: true });
</script>
