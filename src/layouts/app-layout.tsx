import { Link, Outlet, useMatch } from "react-router-dom"

export default function AppLayout() {
  const isHome = useMatch("/")

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
      </header>
      <Outlet />
    </div>
  )
}
