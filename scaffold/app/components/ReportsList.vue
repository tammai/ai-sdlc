<script setup lang="ts">
// The list on /reports. Every template's reports page wraps this in its own layout.
const { data: reports, error, status } = useFeedbackList()

</script>

<template>
  <UAlert
    v-if="error"
    color="warning"
    variant="subtle"
    icon="i-lucide-lock"
    title="You need to sign in with your company account to see this page."
    role="alert"
  />
  <p v-else-if="status === 'pending'" class="text-muted">Loading…</p>
  <UEmpty v-else-if="!reports?.length" icon="i-lucide-inbox" title="Nothing reported yet." />
  <ul v-else class="grid gap-3">
    <li v-for="r in reports" :key="r.id" data-testid="report">
      <UCard>
        <p class="whitespace-pre-wrap">{{ r.message }}</p>
        <p class="mt-2 text-sm text-muted">
          {{ formatDate(r.createdAt, 'dateTime') }}
          <template v-if="r.page"> · {{ r.page }}</template>
          <template v-if="r.reportedBy"> · {{ r.reportedBy }}</template>
          · <UBadge :label="r.status" variant="subtle" size="sm" />
        </p>
      </UCard>
    </li>
  </ul>
</template>
