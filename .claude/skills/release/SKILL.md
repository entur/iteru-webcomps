---
name: release
description: Use when bumping the version or cutting a release of @entur/iteru-webcomps — which files carry version refs, why the tag must follow the version commit, and the live-schema gotcha that makes a green local build no guarantee. Triggers on "bump the version", "release v0.x.0", "cut a release", "publish the tarball".
---

# Releasing `@entur/iteru-webcomps`

Not published to a registry. Hosts install from a **GitHub Release tarball URL**,
so the release artifact and the docs that point at it are the whole product
surface. `.github/workflows/release.yml` does the packing and publishing; your
job is the version commit and the tag.

## Deciding the number

A URL install pins the exact tarball, so consumers upgrade by editing a URL —
there is no range resolution to soften a change. Bias toward **minor** over
patch: anything that changes what a host receives at runtime is a minor.

Precedent:

- `6fbade3` 0.2.0 → 0.3.0 — `graphql-request` moved to a peer dep (breaking for
  consumers).
- `f2861a2` 0.3.0 → 0.4.0 — patch-only schema fields stopped being sent to sobek
  (runtime behaviour change, no API change).
- `8a2d280` 0.4.0 → 0.5.0 — new API surface: exported wrapper props types (#24)
  and `onChange` / `onDirtyChange` (#25).
- `e0df6d9` 0.5.0 → 0.6.0 — built-in Save/Cancel footer (#26). New API
  (`footerProps`, exported `EditFooter`/`SaveSnackbar`) *and* a behaviour
  change: Save is inert on an unchanged form.

## Steps

Run from a clean, synced `main`.

1. **Manifest** — `npm version <new> --no-git-tag-version`. Updates
   `package.json` and both version fields in `package-lock.json`. There is no
   `version` lifecycle script, so nothing else fires. Do **not** let it create
   the tag; the tag comes after the commit (see below).

2. **Host guide** — `docs/using-entity-forms-host-guide.html` carries four
   version refs that `npm version` does not touch:
   - the install `<pre>` — download URL + `.tgz` filename
   - the "Upgrading means editing the URL" callout — the `^<version>` range in prose
   - the cheat-sheet `<li>` — same URL + filename
   - the footer — "as exported from `@entur/iteru-webcomps` v<version>"

   One sed over the file handles all four:

   ```bash
   sed -i "s/v$OLD/v$NEW/g; s/entur-[a-z-]*-$OLD\.tgz/entur-iteru-webcomps-$NEW.tgz/g; s/\^$OLD/^$NEW/g" \
     docs/using-entity-forms-host-guide.html
   ```

   Completeness check — must come back empty. Use `-F`: unescaped dots make
   `0.4.0` a regex that matches `2024-01-01T00:00:00Z` (`0`·`2`·`4`·`-`·`0`),
   so a plain `git grep` reports timestamps in fixtures as leftovers.

   ```bash
   git grep -nF "$OLD" -- . ':!package-lock.json' ':!.claude'
   ```

   Two exclusions, both deliberate: the lock (transitive deps like
   `emoji-regex ^10.3.0` false-positive on a `0.3.0` search) and `.claude`
   (this file's precedent list cites old versions on purpose).

3. **Commit** — `chore: <old> -> <new>`, body stating *why* this level (see
   above) and what a host actually gets. Established form; keep it.

4. **Push `main`**, then tag:

   ```bash
   git push origin main
   git tag v<new> && git push origin v<new>
   ```

**Order is not optional.** `release.yml` compares `$GITHUB_REF_NAME` against
`v$(node -p "require('./package.json').version")` and fails the release if they
disagree — so the version commit must be on the branch the tag points at.

## What the tag triggers

`release.yml` on `push: tags: ['v*']`:

1. `npm ci`, then the tag-vs-manifest guard.
2. `npm pack` — `prepack` runs `npm run build`.
3. `gh release create --generate-notes` with the `.tgz` attached.
4. A second `gh release edit` appending schema provenance (bytes + fetch time)
   to the notes.

## Gotcha: a release is a function of source *and* schema

`npm run build` → `pregenerate` → `distill` → `codegen` → `fetchSchema.ts`, which
downloads the **live** sobek SDL from `https://entur.github.io/sobek/schema.graphqls`.
The release therefore builds against whatever the schema says at that moment,
not against what you tested locally. A green local build does not guarantee a
green release build.

Consequences worth remembering:

- If sobek removed or renamed a field the generated documents select, the
  release build fails even though nothing in the repo changed. Fix the schema
  drift, don't re-run the workflow and hope.
- The provenance line in the release notes is there so you can tell which schema
  a given tarball was cut against. Read it before debugging a host issue.
- Patch-overlay fields (`schema/sobek.patch.graphqls`) never reach the wire —
  see the Patch overlay section in `CLAUDE.md` — so they are not a source of
  release-build drift.

## Verify

```bash
npm test && npm run build                          # before pushing
node -p "require('./package.json').version"        # must equal the tag, minus 'v'
gh run list --workflow release.yml --limit 1       # after the tag push
gh release view v<new>                             # asset entur-iteru-webcomps-<new>.tgz attached
```

The doc edit opens a 404 window: the install URLs name a release that does not
exist until the workflow finishes. Confirm one URL resolves before telling
anyone to upgrade.

```bash
curl -sL -o /dev/null -w "%{http_code}\n" \
  "https://github.com/entur/iteru-webcomps/releases/download/v<new>/entur-iteru-webcomps-<new>.tgz"
curl -s https://entur.github.io/iteru-webcomps/guide.html | grep -c "v<new>"
```

## Sequencing a release that documents new behaviour

`pages.yml` republishes `docs/using-entity-forms-host-guide.html` to
`/guide.html` on **every push to main**, but the guide's install URL pins a
tarball. So merging a PR that rewrites the guide, and cutting the release,
have to happen in one window — otherwise the published guide describes a
version nobody can install yet. Merge, bump, tag, then verify both the asset
URL and the live guide (above). Holding the guide PR as a draft until the
feature merges, as #31 did, is the other half of the same rule.

**`tsc` exit codes through a pipe.** `npx tsc --noEmit | grep -v "npm notice"`
reports *grep's* status, so a clean run looks like `exit=1` and a broken one can
look clean. Run `./node_modules/.bin/tsc --noEmit -p tsconfig.json` and read its
own code. Editor diagnostics also lag a scripted edit by a beat — believe tsc.
