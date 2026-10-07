// Site-wide copy and navigation, and the text of the home page. Other pages are Markdown files in content/.
// Write it from what the user told you (their brief, or intent.md when there is one); never invent metrics, customer logos, testimonials or prices.
export interface NavLink {
  label: string
  to: string
}

export interface Feature {
  title: string
  description: string
  icon: string
}

export const site = {
  name: '__APP_TITLE__',
  tagline: 'One clear sentence about what you offer and who it is for.',
  description: 'A short description of __APP_TITLE__ for search results and link previews, about 150 characters.',
  contactEmail: 'hello@example.com',
  /**
   * Header and footer navigation. Every `to` is `/`, `/blog`, or a Markdown file in content/ (`/about` → content/about.md);
   * test/unit/content.spec.ts checks that.
   */
  nav: [
    { label: 'Features', to: '/features' },
    { label: 'Pricing', to: '/pricing' },
    { label: 'Blog', to: '/blog' },
    { label: 'About', to: '/about' }
  ] satisfies NavLink[],
  legal: [{ label: 'Privacy', to: '/privacy' }] satisfies NavLink[],
  features: [
    { title: 'Say the main benefit', description: 'One or two sentences on the outcome for the visitor, not on how it works.', icon: 'i-lucide-sparkles' },
    { title: 'Remove a worry', description: 'Name the objection people have before they get in touch and answer it plainly.', icon: 'i-lucide-shield-check' },
    { title: 'Show the next step', description: 'Make the first step small and obvious, so a visitor knows what happens after they click.', icon: 'i-lucide-route' }
  ] satisfies Feature[],
  /** Text of the home page, in the order it appears. */
  home: {
    primaryAction: 'See the features',
    secondaryAction: 'Read the blog',
    featuresTitle: 'What you get',
    featuresDescription: 'Three short points; replace them with the ones that matter to your visitors.',
    postsTitle: 'Latest from the blog',
    postsDescription: 'Posts are Markdown files in content/blog.',
    ctaTitle: 'Ready to talk?',
    ctaDescription: 'Say hello and tell us what you are working on.',
    ctaAction: 'Contact'
  }
}
