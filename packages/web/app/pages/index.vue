<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('nav.overview')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <div class="p-6 space-y-6 overflow-y-auto">
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UCard>
          <div class="text-sm text-dimmed">{{ t('overview.workspaceCount') }}</div>
          <div class="text-2xl font-bold mt-1">{{ workspaces.workspaces.value.length }}</div>
        </UCard>
        <UCard>
          <div class="text-sm text-dimmed">{{ t('overview.indexedCount') }}</div>
          <div class="text-2xl font-bold mt-1">{{ indexedCount }}</div>
        </UCard>
        <UCard>
          <div class="text-sm text-dimmed">{{ t('overview.totalFiles') }}</div>
          <div class="text-2xl font-bold mt-1">{{ totalFiles }}</div>
        </UCard>
      </div>

      <!-- Workspace List -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">{{ t('nav.workspaces') }}</h2>
            <UButton
              :label="t('workspaces.manage')"
              variant="outline"
              size="sm"
              icon="i-lucide-settings"
              to="/workspaces"
            />
          </div>
        </template>

        <div v-if="workspaces.workspaces.value.length === 0" class="text-dimmed text-sm py-4 text-center">
          {{ t('workspaces.empty') }}
        </div>

        <div v-else class="divide-y divide-default">
          <div
            v-for="ws in workspaces.workspaces.value"
            :key="ws.path"
            class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
          >
            <div class="min-w-0 flex-1">
              <div class="font-mono text-sm truncate">{{ ws.path }}</div>
              <div class="flex items-center gap-2 mt-1">
                <UBadge
                  :color="statusColor(workspaces.statusMap.value[ws.path]?.status)"
                  :label="workspaces.statusMap.value[ws.path]?.status || 'standby'"
                  size="xs"
                />
                <span v-if="workspaces.statsMap.value[ws.path]?.fileCount" class="text-xs text-dimmed">
                  {{ t('overview.filesCount', { count: workspaces.statsMap.value[ws.path]?.fileCount }) }}
                </span>
              </div>
            </div>
            <NuxtLink :to="`/workspaces?selected=${encodeURIComponent(ws.path)}`">
              <UButton variant="ghost" size="xs" icon="i-lucide-arrow-right" />
            </NuxtLink>
          </div>
        </div>
      </UCard>
    </div>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const { t } = useI18n();
const workspaces = useWorkspaces();
const { statusColor } = useStatusColor();

const indexedCount = computed(() => {
  return Object.values(workspaces.statusMap.value).filter((s) => s.status === 'indexed').length;
});

const totalFiles = computed(() => {
  return Object.values(workspaces.statsMap.value).reduce((sum, s) => sum + (s.fileCount ?? 0), 0);
});

onMounted(async () => {
  workspaces.loadFromStorage();
  await workspaces.fetchAllStatuses();
});
</script>
