<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Visual design system

These rules apply to every page and component in this repository unless the user explicitly requests a different direction.

- Before changing UI, read `docs/design-system.md` and inspect `src/app/login/login.module.css`, which is the canonical visual reference.
- Reuse the `--rz-*` design tokens defined in `src/app/globals.css`. Do not introduce a new primary palette for individual pages.
- The product identity is a black cyberpunk interface with restrained champagne-gold structure, magenta glitch accents, and cyan status feedback.
- Prefer sharp geometry, clipped corners, thin HUD lines, dense black negative space, and CSS-first terminal motion.
- Preserve clear form hierarchy, visible keyboard focus, responsive layouts, and `prefers-reduced-motion` support.
- Do not use glassmorphism, generic SaaS gradient cards, acid yellow, soft pastel themes, warehouse/industrial illustrations, or rounded-card dashboards.
- Keep champagne gold for primary actions and structural emphasis. Use magenta only for brief glitch/error accents and cyan only for live/connected states.
- New UI work should feel like part of the same product as the login page, not merely share its colors.
