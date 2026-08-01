import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'
import { VaultClient } from '@/components/vault/VaultClient'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params
	return buildPageMetadata({
		path: '/vault',
		locale,
		title: 'Encrypted vault',
		description: 'Access an end-to-end encrypted Burrowise backup. Decryption happens only in this browser.',
	})
}

export default function VaultPage() {
	return <VaultClient />
}
