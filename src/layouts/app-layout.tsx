import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { Link, Outlet, useMatch } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme-provider"

export default function AppLayout() {
  const isHome = useMatch("/")
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        {!isHome && (
          <Link
            to="/"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back to home"
          >
            ←
          </Link>
        )}
        <Link to="/" className="tracking-wide">
          Pixel Tools
        </Link>
        <div className="ml-auto flex items-center rounded-md border p-0.5">
          <button
            onClick={() => setTheme("light")}
            title="Light"
            className={cn(
              "rounded-sm p-1 transition-colors hover:bg-muted",
              theme === "light" ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
          >
            <SunIcon className="size-3.5" />
          </button>
          <button
            onClick={() => setTheme("system")}
            title="System"
            className={cn(
              "rounded-sm p-1 transition-colors hover:bg-muted",
              theme === "system" ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
          >
            <MonitorIcon className="size-3.5" />
          </button>
          <button
            onClick={() => setTheme("dark")}
            title="Dark"
            className={cn(
              "rounded-sm p-1 transition-colors hover:bg-muted",
              theme === "dark" ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
          >
            <MoonIcon className="size-3.5" />
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
