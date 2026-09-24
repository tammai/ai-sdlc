import type { Page } from '@playwright/test'

// Open a page and wait until it's interactive. Use this instead of page.goto().
export async function open(page: Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
}

// Save a screenshot that /check shows next to the example it proves.
export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true })
}

// Type a 'YYYY-MM-DD' date into a Nuxt UI date field (UInputDate) by its label, whatever order
// the app's locale puts day, month and year in. Give the UInputDate an aria-label for this.
export async function fillDate(page: Page, label: string, isoDate: string) {
  const [year, month, day] = isoDate.split('-') as [string, string, string]
  const group = page.getByRole('group', { name: label })
  for (const [part, value] of [['day', day], ['month', month], ['year', year]] as const) {
    await group.locator(`[data-reka-date-field-segment="${part}"]`).click()
    await page.keyboard.type(value)
  }
}
