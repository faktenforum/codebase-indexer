<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t, locale, locales } = useI18n()

const open = ref(false)

const links = computed<NavigationMenuItem[][]>(() => [[{
  label: t('nav.overview'),
  icon: 'i-lucide-house',
  to: '/',
  onSelect: () => { open.value = false },
}, {
  label: t('nav.workspaces'),
  icon: 'i-lucide-folder-open',
  to: '/workspaces',
  onSelect: () => { open.value = false },
}, {
  label: t('nav.search'),
  icon: 'i-lucide-search',
  to: '/search',
  onSelect: () => { open.value = false },
}]])

const localeItems = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map((l) => ({
    label: l.name,
    value: l.code,
  })),
)
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      class="bg-elevated/25"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-2 py-1">
          <UIcon name="i-lucide-code-xml" class="size-6 text-primary shrink-0" />
          <span v-if="!collapsed" class="font-semibold truncate">Codebase Indexer</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <div v-if="!collapsed" class="px-3 py-2">
          <USelect
            v-model="locale"
            :items="localeItems"
            size="xs"
            class="w-full"
          />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
