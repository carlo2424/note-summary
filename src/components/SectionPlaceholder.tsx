/** Sezione in preparazione (Trading / Crypto). */
export function SectionPlaceholder({
  title,
  hint,
}: {
  title: string
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{hint}</p>
    </div>
  )
}