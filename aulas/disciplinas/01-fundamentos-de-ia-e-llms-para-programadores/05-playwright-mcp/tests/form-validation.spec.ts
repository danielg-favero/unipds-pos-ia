import { test, expect } from '@playwright/test'

const PATH = '/vanilla-js-web-app-example/'

test.beforeEach(async ({ page }) => {
  await page.goto(PATH)
})

test('submitting empty form shows both validation messages', async ({ page }) => {
  await page.locator('#btnSubmit').click()

  await expect(page.locator('#titleFeedback')).toBeVisible()
  await expect(page.locator('#urlFeedback')).toBeVisible()
})

test('submitting without title shows title validation message', async ({ page }) => {
  await page.locator('#imageUrl').fill('https://example.com/image.png')
  await page.locator('#btnSubmit').click()

  await expect(page.locator('#titleFeedback')).toBeVisible()
  await expect(page.locator('#urlFeedback')).not.toBeVisible()
})

test('submitting without URL shows URL validation message', async ({ page }) => {
  await page.locator('#title').fill('Some Title')
  await page.locator('#btnSubmit').click()

  await expect(page.locator('#urlFeedback')).toBeVisible()
  await expect(page.locator('#titleFeedback')).not.toBeVisible()
})

test('submitting with invalid URL format shows URL validation message', async ({ page }) => {
  await page.locator('#title').fill('Some Title')
  await page.locator('#imageUrl').fill('not-a-valid-url')
  await page.locator('#btnSubmit').click()

  await expect(page.locator('#urlFeedback')).toBeVisible()
})

test('invalid form does not add a new card to the list', async ({ page }) => {
  const cardsBefore = await page.locator('#card-list article').count()

  await page.locator('#btnSubmit').click()

  await expect(page.locator('#card-list article')).toHaveCount(cardsBefore)
})
