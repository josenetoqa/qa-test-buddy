const { test, expect } = require('@playwright/test');
test.beforeEach(async ({ page }) => { await page.goto('/demo/'); });
test('create a contact with a valid email address', async ({ page }) => {
  await page.getByLabel('Full name', { exact: true }).fill('QA Demo');
  await page.getByLabel('Email address', { exact: true }).fill('qa@example.test');
  await page.getByRole('button', { name: 'Create contact', exact: true }).click();
  await expect(page.getByText('Contact created', { exact: true })).toBeVisible();
});
test('reject an empty email address', async ({ page }) => {
  await page.getByRole('button', { name: 'Create contact', exact: true }).click();
  await expect(page.getByText('Enter an email address', { exact: true })).toBeVisible();
});
test('reject an invalid email address', async ({ page }) => {
  await page.getByLabel('Email address', { exact: true }).fill('invalid-email');
  await page.getByRole('button', { name: 'Create contact', exact: true }).click();
  await expect(page.getByText('Enter a valid email address', { exact: true })).toBeVisible();
});
