# Backgammon

A backgammon game built on the same stack as [skip-bo](https://github.com/klbsjpolp/skip-bo),
designed to reuse the shared multiplayer infrastructure in
[realtime-infra](https://github.com/klbsjpolp/realtime-infra).

## Layout

```
packages/backgammon-core      @backgammon/core     pure rules engine (board, dice, moves, cube, AI)
packages/backgammon-runtime   @backgammon/runtime  host-authoritative runtime + action schema
apps/web                      @backgammon/web      React + Vite + Tailwind board UI (local play vs AI)
```

The runtime is host-authoritative and transport-agnostic, shaped to plug into
`@klbsjpolp/realtime-core` for online play (the same model skip-bo uses). See
[DECISIONS.md](DECISIONS.md) for scope, rules, and what's deferred.

## Develop

```bash
pnpm install
pnpm dev          # web app on http://localhost:5173
pnpm build        # build core, runtime, then the web bundle
pnpm test         # vitest across all packages
pnpm typecheck
pnpm lint
```

## Versioning

The workspace version in the root `package.json` is the project version, and it is
derived from the commit history — never edited by hand. Commits follow
[Conventional Commits](https://www.conventionalcommits.org); `commit-and-tag-version`
turns them into a semver bump, a `CHANGELOG.md` entry, and a `vX.Y.Z` tag.

- `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major
  (while the version is below `1.0.0`, breaking changes bump the minor and
  features bump the patch)
- `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`, `style:`, `perf:`
  are valid types; only `feat`/`fix`/breaking ones move the version

A `commit-msg` husky hook runs commitlint, so a non-conforming message is rejected
locally. `pnpm commit` walks through a conforming message interactively.

Releases are cut by the Deploy workflow on every push to `main`: it bumps the
version, writes the changelog, tags, pushes the release commit (marked
`[skip ci]` so it does not loop), builds and deploys that exact commit to Pages,
and publishes the GitHub release. Set a `RELEASE_PUSH_TOKEN` secret if `main` is
protected or the release push needs to trigger other workflows; otherwise the
default `GITHUB_TOKEN` is used.

To preview or run a release by hand:

```bash
pnpm release:dry-run   # show the next version and changelog entry, change nothing
pnpm release           # bump, changelog, commit, tag locally
```

## Install it

The app is a PWA: it can be installed to a home screen or a desktop, and once it
has been opened a first time the board plays against the AI with no network at
all. Online play still needs one, for obvious reasons.

## Updates

The running version is shown in the footer, next to the manual half of the flow:
**Check for updates** when nothing is pending, **Update now** once something is.

Each deploy writes the released tag into `apps/web/public/runtime-config.json`,
which ships beside the bundle rather than inside it — that is what lets an open
tab notice a newer build. Tabs poll it every 10 minutes and whenever they come
back to the foreground, then reload themselves onto the new version, but only
where nothing is lost: never during a local game or while in an online room. A
pending update is taken on the next **Nouvelle partie**, **Héberger une partie** or
**Rejoindre**,
since those discard the same state a reload would; until then a banner offers it.
An automatic reload happens at most once per version, so a stale cache can't put
the app in a reload loop — the buttons still force it.

Because the bundle is precached by a service worker, a reload alone would re-serve
the build it is leaving; every reload therefore hands over to the waiting worker
first, and falls back to a plain reload only when there is no worker to hand over
to. `runtime-config.json` is never cached, or a tab could not learn it is behind.

Set the repository variable `MINIMUM_SUPPORTED_VERSION` (or the Deploy workflow's
`minimum_supported_version` input) to a release tag to make the update mandatory:
older clients are blocked behind a "Mise à jour requise" overlay and reload instead of
playing on. Leave it empty for the normal, optional flow.

## Status

Full rules (bar/hit/bearing off, the use-both-dice rule, doubling cube,
gammon/backgammon scoring) with two modes:

- **Contre l'IA** — local play against a move-sequence-search, shot-aware bot that also
  turns the cube: it offers doubles inside the classic window and takes or drops on
  its own estimated win probability.
- **En ligne** — host-authoritative multiplayer over the shared realtime-infra relay
  (create/join a room by code). The board is drawn from each seat's point of view, so
  both colors see their home board bottom-right and bear off onto their own tray.

Three themes — **Classique**, **Minuit** and **Parchemin** — switch from the header
and are remembered between visits.

The interface is in French; this file and the code around it are not.

The board is playable by keyboard and readable by a screen reader: points are numbered
the way the player on that side counts them, they announce what is standing on them and
what part they play in the move being made, and only the points actually in play sit in
the tab order. Rolls and turn changes are announced through polite live regions.

Online requires `@klbsjpolp/realtime-core` to be published to npm and
`VITE_BACKGAMMON_API_URL` to point at the relay server. Until the package is
published, a temporary `file:` override in `pnpm-workspace.yaml` resolves it from a
local tarball. See [DECISIONS.md](DECISIONS.md).
