// All site-wide copy and navigation lives here, so replacing the sample text is one file: names, nav, and the text of every page.
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

export interface Faq {
  label: string
  content: string
}

export const site = {
  name: '__APP_TITLE__',
  tagline: 'One clear sentence about what you offer and who it is for.',
  description: 'A short description of __APP_TITLE__ for search results and link previews, about 150 characters.',
  contactEmail: 'hello@example.com',
  /** Header and footer navigation. Every `to` must be a file in app/pages (test/unit/site.spec.ts checks it). */
  nav: [
    { label: 'Home', to: '/' },
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' }
  ] satisfies NavLink[],
  legal: [{ label: 'Privacy', to: '/privacy' }] satisfies NavLink[],
  features: [
    { title: 'Say the main benefit', description: 'One or two sentences on the outcome for the visitor, not on how it works.', icon: 'i-lucide-sparkles' },
    { title: 'Remove a worry', description: 'Name the objection people have before they get in touch and answer it plainly.', icon: 'i-lucide-shield-check' },
    { title: 'Show the next step', description: 'Make the first step small and obvious, so a visitor knows what happens after they click.', icon: 'i-lucide-route' }
  ] satisfies Feature[],
  faq: [
    { label: 'Who is this for?', content: 'Describe the people you built it for, and who it is not for.' },
    { label: 'How do I get started?', content: 'Point to the one action on the page: the contact link, a sign-up link or a booking page.' },
    { label: 'How can I reach you?', content: 'Use the contact page. Add a real address in app/data/site.ts.' }
  ] satisfies Faq[],
  /** Text of each page, in the order it appears. */
  pages: {
    home: {
      primaryAction: 'Get in touch',
      secondaryAction: 'Learn more',
      featuresTitle: 'What you get',
      featuresDescription: 'Three short points; replace them with the ones that matter to your visitors.',
      faqTitle: 'Questions',
      faqDescription: 'Answer the questions people ask before they get in touch.',
      ctaTitle: 'Ready to talk?',
      ctaDescription: 'Say hello and tell us what you are working on.',
      ctaAction: 'Contact'
    },
    about: {
      title: 'About',
      description: 'Who is behind __APP_TITLE__ and why it exists.',
      paragraphs: [
        'Tell the story in a few short paragraphs: the problem you saw, what you made, and who it is for.',
        'Keep it factual. Say what you have actually done, and link to proof such as a project, a talk or a customer who agreed to be named.'
      ]
    },
    contact: {
      title: 'Contact',
      description: 'The best way to reach us is email.',
      seoDescription: 'How to reach __APP_TITLE__.',
      note: 'We read every message.'
    },
    privacy: {
      title: 'Privacy',
      dataQuestions: 'Questions about your data:',
      description: 'What this site collects and why.',
      // Sample text, not legal advice: have it reviewed and make it match what the site really does (analytics, cookies, forms).
      paragraphs: [
        'This site is static. It does not set cookies and has no sign-in or forms. The light/dark switch saves your choice in your browser (local storage) and nothing else.',
        'If you email us, we use your address only to reply.'
      ]
    }
  }
}
