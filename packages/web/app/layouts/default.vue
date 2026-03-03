<template>
  <div class="min-h-screen bg-[var(--ui-bg)]">
    <header class="border-b border-[var(--ui-border)] px-6 py-4">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <h1 class="text-xl font-bold">Codebase Indexer</h1>
        <div class="flex items-center gap-3">
          <USelect
            v-model="locale"
            :items="localeItems"
            size="sm"
            class="w-28"
          />
        </div>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-6 py-8">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const { locale, locales } = useI18n();

const localeItems = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map((l) => ({
    label: l.name,
    value: l.code,
  })),
);
</script>
