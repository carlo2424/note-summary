const categories = [
  { id: 'note', label: 'Note' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'trading', label: 'Trading' },
  { id: 'crypto', label: 'Crypto' },
] as const

export type SummaryAddCategory = (typeof categories)[number]['id']

interface AddChooserProps {
  onChoose: (category: SummaryAddCategory) => void
}

/** Menu + di Note Summary: stesse categorie del menu in basso, solo testo. */
export function AddChooser({ onChoose }: AddChooserProps) {
  return (
    <div className="rounded-xl bg-[#4b5563] p-2">
      <p className="mb-2 px-1 text-xs text-zinc-100">Scegli la categoria</p>
      <div className="flex flex-col gap-1">
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChoose(item.id)}
            className="w-full rounded-md bg-[#2563eb] px-3 py-2 text-center text-sm font-semibold text-white"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}