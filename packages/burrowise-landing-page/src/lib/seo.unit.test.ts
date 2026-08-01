import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The brand suffix (` | Burrowise Landing`) is a per-path rule, not a per-page
// opt-in: anything under /blog must come out unbranded so article titles rank on
// their own keywords instead of burning SERP characters on the company name.
describe('seo — buildPageMetadata title branding', () => {
	const originalEnv = process.env

	beforeEach(() => {
		vi.resetModules()
		process.env = { ...originalEnv }
		process.env.SITE_URL = 'https://example.com'
	})

	afterEach(() => {
		process.env = originalEnv
	})

	async function load() {
		vi.doMock('@/i18n/config', () => ({
			defaultLocale: 'en',
			supportedLocales: ['en'],
			isMultiLang: false,
			additionalLocales: [],
		}))
		return await import('./seo')
	}

	async function titleFor(path: string, title: string, brand?: boolean) {
		const { buildPageMetadata } = await load()
		const meta = buildPageMetadata({
			path,
			locale: 'en',
			title,
			...(brand === undefined ? {} : { brand }),
		})
		return (meta.title as { absolute: string }).absolute
	}

	describe('blog paths are never branded', () => {
		it('leaves an article title verbatim', async () => {
			expect(await titleFor('/blog/my-post', 'How To Do The Thing')).toBe('How To Do The Thing')
		})

		it('leaves the blog listing title verbatim', async () => {
			expect(await titleFor('/blog', 'Blog')).toBe('Blog')
		})

		it('leaves author pages verbatim', async () => {
			expect(await titleFor('/blog/authors', 'Authors')).toBe('Authors')
			expect(await titleFor('/blog/authors/jane-doe', 'Jane Doe')).toBe('Jane Doe')
		})

		it('does not brand a short article title that would easily fit', async () => {
			const { SITE_NAME } = await load()
			const title = await titleFor('/blog/x', 'Short')
			expect(title).not.toContain(SITE_NAME)
		})
	})

	describe('non-blog paths keep the existing behaviour', () => {
		it('brands a short title', async () => {
			const { SITE_NAME } = await load()
			expect(await titleFor('/contact', 'Contact Us')).toBe(`Contact Us | ${SITE_NAME}`)
		})

		it('drops the suffix when the branded title would exceed 60 chars', async () => {
			const longTitle = 'A Very Long Page Title That Already Fills The Whole Serp Line'
			expect(await titleFor('/contact', longTitle)).toBe(longTitle)
		})

		it('honours an explicit brand: false', async () => {
			expect(await titleFor('/contact', 'Contact Us', false)).toBe('Contact Us')
		})

		it('does not treat a path that merely starts with "blog" as a blog path', async () => {
			const { SITE_NAME } = await load()
			expect(await titleFor('/blogging-tips', 'Blogging Tips')).toBe(
				`Blogging Tips | ${SITE_NAME}`,
			)
		})
	})

	it('keeps OpenGraph and Twitter titles in step with the page title', async () => {
		const { buildPageMetadata } = await load()
		const meta = buildPageMetadata({ path: '/blog/my-post', locale: 'en', title: 'My Post' })
		expect(meta.openGraph?.title).toBe('My Post')
		expect(meta.twitter?.title).toBe('My Post')
	})
})
