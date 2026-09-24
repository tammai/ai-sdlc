<script setup lang="ts">
// "Report a problem": on every page. Reports land in the feedback table and are
// listed at /reports. Each one is a candidate idea for the next change.
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string
      reset: (id?: string) => void
      remove: (id: string) => void
    }
  }
}

const route = useRoute()
const open = ref(false)
const message = ref('')
const sent = ref(false)
const token = ref<string | null>(null)
const widget = ref<HTMLElement | null>(null)
let widgetId: string | null = null

const { data: config } = usePublicConfig()
const report = useReportProblem()
const needsBotCheck = computed(() => config.value?.appType === 'public' && Boolean(config.value?.turnstileSiteKey))

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the “I am human” check.'))
    document.head.appendChild(s)
  })
}

// The widget's element leaves the page on success or close; tell Turnstile first.
function removeWidget() {
  if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
  widgetId = null
}

watch(open, async (isOpen) => {
  if (!isOpen) {
    removeWidget()
    sent.value = false
    token.value = null
    report.reset()
    return
  }
  if (!needsBotCheck.value) return
  await nextTick()
  await loadTurnstile()
  if (widget.value && window.turnstile) {
    widgetId = window.turnstile.render(widget.value, {
      sitekey: config.value!.turnstileSiteKey!,
      callback: (t) => (token.value = t),
    })
  }
})

async function send() {
  try {
    await report.mutateAsync({ message: message.value, page: route.fullPath, turnstileToken: token.value })
    removeWidget()
    sent.value = true
    message.value = ''
  } catch {
    // Tokens are single-use, so a retry needs a fresh one.
    if (widgetId && window.turnstile) window.turnstile.reset(widgetId)
    token.value = null
  }
}

const errorText = computed(() => {
  const err = report.error.value as { statusMessage?: string; data?: { statusMessage?: string } } | null
  return err ? (err.data?.statusMessage ?? err.statusMessage ?? 'Something went wrong. Please try again.') : ''
})
</script>

<template>
  <div class="fixed right-4 bottom-4 z-40">
    <UModal v-model:open="open" title="Report a problem" description="Tell us what went wrong. It goes to the people who look after this app.">
      <UButton label="Report a problem" icon="i-lucide-message-square-warning" color="neutral" variant="outline" />

      <template #body>
        <p v-if="sent" role="status" class="text-sm">Thanks — your report was sent.</p>
        <form v-else id="report-form" class="space-y-4" @submit.prevent="send">
          <UFormField label="What went wrong?" name="message" required>
            <UTextarea v-model="message" :rows="4" :maxlength="2000" autoresize class="w-full" />
          </UFormField>
          <div v-if="needsBotCheck" ref="widget" />
          <UAlert v-if="errorText" color="error" variant="subtle" :title="errorText" role="alert" />
        </form>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="sent ? 'Close' : 'Cancel'" color="neutral" variant="ghost" @click="open = false" />
          <UButton
            v-if="!sent"
            type="submit"
            form="report-form"
            label="Send report"
            :loading="report.isLoading.value"
            :disabled="!message.trim()"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
