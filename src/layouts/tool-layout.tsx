import { ScrollArea } from "@/components/ui/scroll-area"

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
      <aside className="w-72 shrink-0 border-r">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-sm font-medium">{title}</h1>
            {controls}
          </div>
        </ScrollArea>
      </aside>
      <main className="flex flex-1 items-center justify-center overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
