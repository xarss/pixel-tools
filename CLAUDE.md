# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server with hot reload
npm run build      # Type-check + production build
npm run typecheck  # Type-check without emitting
npm run lint       # ESLint
npm run format     # Prettier (sorts Tailwind classes automatically)
npm run preview    # Preview production build
```

No test runner is configured.

## Adding shadcn/ui components

```bash
npx shadcn@latest add <component-name>
```

Components are scaffolded into `src/components/ui/` and follow the existing `Button` pattern.

## Architecture

**Entry**: `src/main.tsx` wraps `<App>` in `<ThemeProvider>`, mounts to `#root`.

**Theme system** (`src/components/theme-provider.tsx`): Manages `light | dark | system` via localStorage, applies classes to `<html>`, and exposes `useTheme()`. Pressing `d` anywhere (except text inputs) toggles dark mode. CSS transitions are briefly suppressed during switches to avoid flicker.

**Styling**: Tailwind CSS 4 via `@tailwindcss/vite`. Custom CSS variables use OKLch color space and are defined in `src/index.css`. Prettier auto-sorts Tailwind classes on save.

**Path alias**: `@/*` resolves to `src/*`.

**TypeScript**: Strict mode — no unused locals or parameters allowed.

**Component pattern**: CVA (`class-variance-authority`) for variant logic + `cn()` from `src/lib/utils.ts` for Tailwind class merging. Radix UI `Slot` enables polymorphic rendering on interactive components.
