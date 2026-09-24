// Each test is one example from an intent/*.md file, with the example sentence as
// its title, word for word. If the example changes, the intent changes first.
import { expect, test } from '@playwright/test'
import { open, shot } from './helpers'

test('When I report a problem, I see a thank-you message and it appears on the reports page', async ({ page }) => {
  const message = `The export button does nothing (${Date.now()})`

  await open(page, '/')
  await page.getByRole('button', { name: 'Report a problem' }).click()
  await page.getByLabel('What went wrong?').fill(message)
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByRole('status')).toHaveText('Thanks — your report was sent.')
  await shot(page, 'report-sent')

  await open(page, '/reports')
  await expect(page.getByTestId('report').filter({ hasText: message })).toBeVisible()
  await shot(page, 'reports-page')
})
