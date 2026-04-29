interface ToolLayoutProps {
  title: string
  controls: React.ReactNode
  children: React.ReactNode
}

export default function ToolLayout({
  title,
  controls,
  children,
}: ToolLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r p-4">
        <h1 className="text-lg">{title}</h1>
        {controls}
      </aside>
      <main className="flex flex-1 items-center justify-center overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
