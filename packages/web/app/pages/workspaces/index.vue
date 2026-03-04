<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('nav.workspaces')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <div class="p-6 space-y-6">
      <!-- Add Workspace -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">{{ t('workspaces.add') }}</h2>
        </template>
        <form @submit.prevent="handleAdd" class="flex gap-3">
          <UInput
            v-model="newPath"
            :placeholder="t('workspace.placeholder')"
            size="lg"
            icon="i-lucide-folder-plus"
            class="flex-1"
          />
          <UButton
            type="submit"
            :label="t('workspaces.addButton')"
            :disabled="!newPath.trim()"
            variant="outline"
          />
        </form>
      </UCard>

      <!-- Workspace List -->
      <div v-if="workspaces.workspaces.value.length === 0" class="text-dimmed text-sm py-8 text-center">
        {{ t('workspaces.empty') }}
      </div>

      <div v-else class="space-y-4">
        <UCard
          v-for="ws in workspaces.workspaces.value"
          :key="ws.path"
        >
          <div class="space-y-3">
            <!-- Header -->
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="font-mono text-sm font-bold truncate">{{ ws.path }}</div>
                <div class="flex items-center gap-2 mt-1">
                  <UBadge
                    :color="statusColor(workspaces.statusMap.value[ws.path]?.status)"
                    :label="workspaces.statusMap.value[ws.path]?.status || 'standby'"
                    size="xs"
                  />
                  <span v-if="workspaces.statsMap.value[ws.path]?.fileCount != null" class="text-xs text-dimmed">
                    {{ t('overview.filesCount', { count: workspaces.statsMap.value[ws.path]?.fileCount }) }}
                  </span>
                </div>
              </div>
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                color="error"
                size="xs"
                @click="workspaces.removeWorkspace(ws.path)"
              />
            </div>

            <!-- Progress -->
            <div v-if="indexingPaths.has(ws.path)" class="space-y-2">
              <div class="flex items-center gap-2 text-sm text-dimmed">
                <UIcon name="i-lucide-loader-circle" class="animate-spin text-primary" />
                <span>{{ workspaces.statusMap.value[ws.path]?.message || t('indexing.starting') }}</span>
              </div>
              <UProgress
                v-if="(workspaces.statusMap.value[ws.path]?.files_total ?? 0) > 0"
                :value="progressPercent(ws.path)"
              />
              <UProgress v-else />
            </div>

            <!-- Error -->
            <UAlert
              v-if="workspaces.statusMap.value[ws.path]?.status === 'error'"
              color="error"
              variant="subtle"
              :title="t('errors.indexFailed')"
              :description="workspaces.statusMap.value[ws.path]?.message"
              :actions="[{ label: t('actions.releaseLock'), color: 'error', variant: 'outline', onClick: () => workspaces.releaseLock(ws.path) }]"
            />

            <!-- Actions -->
            <div class="flex gap-2">
              <UButton
                :label="t('actions.index')"
                variant="outline"
                size="sm"
                icon="i-lucide-refresh-cw"
                :loading="indexingPaths.has(ws.path)"
                @click="handleIndex(ws.path, false)"
              />
              <UButton
                :label="t('workspaces.forceReindex')"
                variant="outline"
                size="sm"
                icon="i-lucide-zap"
                :loading="indexingPaths.has(ws.path)"
                @click="handleIndex(ws.path, true)"
              />
              <UButton
                :label="t('workspaces.browseFiles')"
                variant="outline"
                size="sm"
                icon="i-lucide-file-search"
                :to="`/workspaces/files?workspace=${encodeURIComponent(ws.path)}`"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import type { IndexStatusResponse } from '~/types/api';

const { t } = useI18n();
const workspaces = useWorkspaces();
const indexingPaths = ref(new Set<string>());

const POLL_INTERVAL_MS = 800;
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();

const newPath = ref('');

function handleAdd() {
  if (!newPath.value.trim()) return;
  workspaces.addWorkspace(newPath.value);
  newPath.value = '';
}

function statusColor(status?: IndexStatusResponse['status']) {
  switch (status) {
    case 'indexed': return 'success' as const;
    case 'indexing': return 'info' as const;
    case 'error': return 'error' as const;
    default: return 'neutral' as const;
  }
}

function progressPercent(path: string): number {
  const status = workspaces.statusMap.value[path];
  if (!status?.files_total) return 0;
  return Math.round((status.files_processed / status.files_total) * 100);
}

function stopPolling(path: string) {
  const timer = pollTimers.get(path);
  if (timer) {
    clearTimeout(timer);
    pollTimers.delete(path);
  }
}

function startPolling(path: string) {
  stopPolling(path);
  const poll = async () => {
    await workspaces.fetchStatus(path);
    const status = workspaces.statusMap.value[path];
    if (status?.status === 'indexing') {
      pollTimers.set(path, setTimeout(poll, POLL_INTERVAL_MS));
    }
  };
  pollTimers.set(path, setTimeout(poll, POLL_INTERVAL_MS));
}

async function handleIndex(path: string, force: boolean) {
  indexingPaths.value.add(path);
  startPolling(path);
  try {
    await workspaces.triggerIndex(path, force);
  } finally {
    indexingPaths.value.delete(path);
    stopPolling(path);
    await Promise.all([workspaces.fetchStatus(path), workspaces.fetchStats(path)]);
  }
}

onMounted(async () => {
  workspaces.loadFromStorage();
  await workspaces.fetchAllStatuses();
});

onUnmounted(() => {
  for (const [path] of pollTimers) {
    stopPolling(path);
  }
});
</script>
