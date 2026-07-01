import { test, expect } from '@playwright/test'

const PATH = '/vanilla-js-web-app-example/'

test('page has correct title', async ({ page }) => {
  await page.goto(PATH)
  await expect(page).toHaveTitle('TDD Frontend Example')
})

test('form inputs and submit button are visible', async ({ page }) => {
  await page.goto(PATH)
  await expect(page.locator('#title')).toBeVisible()
  await expect(page.locator('#imageUrl')).toBeVisible()
  await expect(page.locator('#btnSubmit')).toBeVisible()
})

test('gallery shows pre-loaded images', async ({ page }) => {
  await page.goto(PATH)
  const cardList = page.locator('#card-list')
  await expect(cardList.getByText('AI Alien')).toBeVisible()
  await expect(cardList.getByText('Predator Night Vision')).toBeVisible()
  await expect(cardList.getByText('ET Bilu')).toBeVisible()
})

test('user can type in title and URL fields', async ({ page }) => {
  await page.goto(PATH)
  await page.locator('#title').fill('My Test Image')
  await page.locator('#imageUrl').fill('https://example.com/image.png')
  await expect(page.locator('#title')).toHaveValue('My Test Image')
  await expect(page.locator('#imageUrl')).toHaveValue('https://example.com/image.png')
})
