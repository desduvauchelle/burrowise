import type { Dictionary } from '@/i18n'

interface ConfigDisplayProps {
	hours: Record<string, unknown> | null
	contact: Record<string, unknown> | null
	dict: Dictionary
}

export function ConfigDisplay({ hours, contact, dict }: ConfigDisplayProps) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
			{hours && (
				<div className="card bg-base-200 p-6">
					<h3 className="text-xl font-semibold mb-4">{dict['contact.business.hours']}</h3>
					<dl className="space-y-2">
						{Object.entries(hours).map(([day, time]) => (
							<div key={day} className="flex justify-between">
								<dt className="font-medium capitalize">{day}</dt>
								<dd className="text-base-content/70">{String(time)}</dd>
							</div>
						))}
					</dl>
				</div>
			)}

			{contact && (
				<div className="card bg-base-200 p-6">
					<h3 className="text-xl font-semibold mb-4">{dict['contact.info']}</h3>
					<dl className="space-y-2">
						{Object.entries(contact).map(([key, value]) => (
							<div key={key} className="flex justify-between">
								<dt className="font-medium capitalize">{key}</dt>
								<dd className="text-base-content/70">{String(value)}</dd>
							</div>
						))}
					</dl>
				</div>
			)}
		</div>
	)
}
