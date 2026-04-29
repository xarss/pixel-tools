import { Link } from "react-router-dom"

const tools = [
  {
    name: "Palette Image Generator",
    description: "Generate images from color palettes.",
    href: "/palette-generator",
  },
]

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12">
      <p className="mb-6 text-sm text-muted-foreground">
        A toolbox of pixel art utilities.
      </p>
      <ul className="flex flex-col gap-3">
        {tools.map((tool) => (
          <li key={tool.href}>
            <Link
              to={tool.href}
              className="block rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <p>{tool.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tool.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
