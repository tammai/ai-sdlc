// Marks <html data-hydrated> once the page is interactive, so example checks never
// click a button before it works (tests/examples/helpers.ts waits for this).
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:suspense:resolve', () => {
    document.documentElement.dataset.hydrated = 'true'
  })
})
