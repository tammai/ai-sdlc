<script setup lang="ts">
const { app, lang, locale } = useAppConfig()
const uiLocale = uiLocaleFor(locale)
useHead({ htmlAttrs: { lang }, titleTemplate: (t) => (t ? `${t} · ${app.name}` : app.name) })
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLoadingIndicator />
    <!-- The layout comes from the installed template (layers/ui/). -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ReportProblem />
  </UApp>
</template>
