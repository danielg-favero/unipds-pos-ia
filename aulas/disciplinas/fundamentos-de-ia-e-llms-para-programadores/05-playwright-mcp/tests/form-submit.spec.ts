import { test, expect } from '@playwright/test'

const PATH = '/vanilla-js-web-app-example/'

// Clear localStorage before each test so submitted cards don't bleed across tests
test.beforeEach(async ({ page }) => {
  await page.goto(PATH)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('submitting valid form appends new card to the list', async ({ page }) => {
  await page.locator('#title').fill('My Robot')
  await page.locator('#imageUrl').fill('https://example.com/robot.png')
  await page.locator('#btnSubmit').click()

  const newCard = page.locator('#card-list h4.card-title', { hasText: 'My Robot' })
  await expect(newCard).toBeVisible()
})

test('new card image uses the submitted URL', async ({ page }) => {
  await page.locator('#title').fill('Space Cat')
  await page.locator('#imageUrl').fill('https://example.com/cat.png')
  await page.locator('#btnSubmit').click()

  const img = page.locator('#card-list img[alt="Image of an Space Cat"]')
  await expect(img).toHaveAttribute('src', 'https://example.com/cat.png')
})

test('form is cleared after successful submission', async ({ page }) => {
  await page.locator('#title').fill('Reset Test')
  await page.locator('#imageUrl').fill('https://example.com/reset.png')
  await page.locator('#btnSubmit').click()

  await expect(page.locator('#title')).toHaveValue('')
  await expect(page.locator('#imageUrl')).toHaveValue('')
})

test('submitted card persists after page reload', async ({ page }) => {
  await page.locator('#title').fill('Persisted Card')
  await page.locator('#imageUrl').fill('https://example.com/persist.png')
  await page.locator('#btnSubmit').click()

  // Wait for the card to appear before reloading, confirming localStorage was written
  await expect(page.locator('#card-list h4.card-title', { hasText: 'Persisted Card' })).toBeVisible()

  await page.reload()

  await expect(page.locator('#card-list h4.card-title', { hasText: 'Persisted Card' })).toBeVisible()
})
