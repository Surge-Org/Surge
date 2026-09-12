# Surge

A local preview of the **Stellar Ecosystem Program** — a scoped open-source contribution program.
Maintainers submit repositories for review; accepted repositories get their own dashboard where
the maintainer posts issues and picks one contributor per issue. Contributors browse, apply with
a plan, and earn points that split the wave pool in USDC.

The ecosystem is defined in one place: [`src/program.ts`](src/program.ts) holds the name, chain,
and reward asset. Swapping programs is that file plus the repository fixtures in `src/model.ts`.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

## Surfaces

Two clearly separate kinds of screen:

**Public** — top nav, centred content, no dashboard chrome.

| Route | |
| --- | --- |
| `/` | Landing |
| `/explore`, `/explore/repos`, `/explore/orgs` | Browse issues, repositories, organizations |
| `/issue/:id` | Issue detail and proposals |

**Workspaces** — fixed left rail, scoped to one role or one repository.

| Route | |
| --- | --- |
| `/login` | Contributor sign-in |
| `/me`, `/me/points`, `/me/settings` | Contributor workspace |
| `/maintainer/login` | **Separate** maintainer sign-in |
| `/maintainer` | Your repositories and their review status |
| `/maintainer/submit` | Submit a repository for review |
| `/maintainer/repo/:id` | Dashboard for one accepted repository |

## The maintainer gate

The maintainer area is a separate session from the contributor one — signing in as a contributor
never opens it, and vice versa. Beyond that:

1. Sign in at `/maintainer/login`.
2. Submit a repository. It enters `Pending`. **No dashboard opens.**
3. The repository must be **accepted** before its dashboard exists. Review is simulated locally
   because the preview has no backend reviewer.
4. Each accepted repository gets its own dashboard — its issues, its proposals, its assignments.

The gate is enforced on the route, not just in the UI: a direct URL to a pending repository's
dashboard, or to a repository owned by a different maintainer, redirects away.

## Design

Dark by default, with a violet accent. One neutral ramp plus one accent drives both themes, so
light and dark come from the same tokens.

**Sharp edges.** Every radius token is `0`, so buttons, cards, chips, inputs, modals and avatars
are square. Only true dots (status indicators, language dots, aurora blobs) stay circular.

The public navbar is a sticky bar with a dismissible announcement strip above it, a slash-separated
link group, and a border that only appears once the page is scrolled. It collapses to a sheet below
860px. Type runs on eight steps topping out at 30px, controls on
three heights, spacing on a 4px grid. Inter for UI, JetBrains Mono for identifiers only.
Motion is handled by `motion` on one easing curve.

### React Bits

Ported into `src/bits.tsx`, `src/bits-ui.tsx` and `src/bits-gl.tsx`:
**GooeyNav** (SVG goo filter, blob tracks the active item, particles burst on click),
**MoltenMetal** (WebGL fragment shader, domain-warped fbm; pauses off-screen and falls back to a
CSS gradient without WebGL), **Lanyard** (spring-physics badge on a cord, draggable),
**CardSwap**, **BounceCards**, **ProfileCard** (pointer tilt + holographic sheen),
**InfiniteSpiral** and **LogoLoop**. The public navbar is a floating pill.

React Bits (reactbits.dev) ships as copy-paste source rather than an npm dependency, so
[`src/bits.tsx`](src/bits.tsx) holds its patterns re-implemented against these tokens:
Aurora, DotGrid, GradientText, ShinyText, SplitText, CountUp, SpotlightCard, StarBorder, Magnet,
ClickSpark, RotatingText, AnimatedContent, Marquee, GlareHover, TiltedCard and ScrollProgress.
Every scroll-triggered component falls back to fully visible under `prefers-reduced-motion`, so
content is never left hidden.

The hero visual (`src/hero-visual.tsx`) is an animated contribution pipeline — proposal, assignment,
pull request, acceptance, settlement — looping in DOM. It is **not** Rive: a `.riv` is a binary
artboard exported from the Rive editor, so it has to be authored there. Drop one in and swap
`HeroVisual` to render it; the pipeline stays as the fallback.

The landing page lays these out on a six-column bento grid (`.bento` / `.box` with `w2`/`w3`/`w4`/`w6`
spans) — large boxes with generous padding and display-scale figures, rather than uniform small cards.

## Checks

[![CI](https://github.com/Surge-Org/Surge/actions/workflows/ci.yml/badge.svg)](https://github.com/Surge-Org/Surge/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Surge-Org/Surge/actions/workflows/codeql.yml/badge.svg)](https://github.com/Surge-Org/Surge/actions/workflows/codeql.yml)

Four checks run on every push and pull request, defined in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Check | Command |
| --- | --- |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| End-to-end | `npm run test:e2e -- <url>` |

CodeQL analyses the source weekly and on every pull request, and Dependabot groups dependency
bumps into one pull request per ecosystem.

Locally, the end-to-end suite needs a running server and a browser. It uses Playwright's own
Chromium (`npx playwright install chromium`), or an installed browser if `CHROME_PATH` is set:

```powershell
npm.cmd run build
npm.cmd run preview -- --port 4173
npm.cmd run test:e2e -- http://localhost:4173
```

CI runs it against the built artifact on the preview server, not the dev server, so it exercises
what actually ships. The suite covers the public explore surface, search/tabs/filters, the contributor apply and
persistence path, the separate maintainer sign-in, the submit-then-review gate, per-repo dashboards
scoped by owner and acceptance, proposal assignment, theme persistence, the mobile drawer, and
horizontal overflow across 15 routes at five widths.

### Branch protection

`main` is covered by the **Protect main** ruleset. For contributors it means: open a pull request,
and land it once Typecheck, Lint, Build and End-to-end are green. Force-pushes and branch deletion
are refused outright, and review threads must be resolved before merging. No approving review is
required, so a maintainer can merge their own pull request.

Repository admins bypass the ruleset and can push to `main` directly.

## Repository images

Organization avatars are the real ones, pulled from `https://github.com/<org>.png`. An org that
does not resolve falls back to a letter tile, so a repository submitted under a made-up handle
still renders correctly. Language dots use GitHub's own language colours.

## Boundaries

The seeded repositories are **real, existing open-source projects** used as reference examples so
the directory renders with genuine avatars and plausible metadata — their star counts, topics and
update times are fixtures, and their presence here implies no affiliation with, or participation
in, any program. Sample contributors (`nadia.dev`, `kwame-o`, `lucia-m`, `tobi.k`) are fixtures so
the maintainer flow has candidates to choose between.


12345
