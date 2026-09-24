// Safe to edit (green tier): the app's name, colours and navigation.
// The template shell in layers/ui/ reads these, so changing a menu never touches layout code.
export default defineAppConfig({
  app: {
    name: 'New app',
    description: 'Built with Claude from an idea in intent/.',
  },
  // The language the app's own words are written in (the page's <html lang>).
  lang: 'en',
  // How dates look and which language Nuxt UI's own labels use (month names, date field order).
  // Any BCP 47 tag: 'vi-VN', 'en-GB', 'en-US'…
  locale: 'vi-VN',
  // Times are shown in this zone, the same on the server and in the browser.
  timeZone: 'Asia/Ho_Chi_Minh',
  // Nuxt UI colour names: https://ui.nuxt.com/docs/getting-started/theme/design-system
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
  },
  // Menu items shown by the template (sidebar in dashboard, header in landing).
  // icon: any i-lucide-* name from https://lucide.dev/icons
  navigation: [
    { label: 'Home', icon: 'i-lucide-house', to: '/' },
    { label: 'Reported problems', icon: 'i-lucide-message-square-warning', to: '/reports' },
  ],
})
