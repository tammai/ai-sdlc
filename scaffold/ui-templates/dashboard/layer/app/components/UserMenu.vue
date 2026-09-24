<script setup lang="ts">
// Who is signed in (Cloudflare Access) and a light/dark switch.
defineProps<{ collapsed?: boolean }>()
const { data } = useCurrentUser()
const colorMode = useColorMode()
const email = computed(() => data.value?.user?.email ?? 'Not signed in')
const items = computed(() => [
  [{ label: email.value, type: 'label' as const }],
  [
    {
      label: colorMode.value === 'dark' ? 'Light mode' : 'Dark mode',
      icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => (colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'),
    },
  ],
])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'center', collisionPadding: 12 }" :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }">
    <UButton
      :label="collapsed ? undefined : email"
      icon="i-lucide-circle-user"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ label: 'truncate' }"
    />
  </UDropdownMenu>
</template>
