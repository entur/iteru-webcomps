---
name: release
description: 'Use when bumping the version, tagging, or cutting a release of @entur/iteru-webcomps, or when the release workflow fails on a tag push. Triggers on "bump the version", "release v0.x.0", "cut a release", "publish the tarball", "release build failed".'
---

# Releasing `@entur/iteru-webcomps`

Not published to a registry. Hosts install from a **GitHub Release tarball URL**
(the host guide gives it as a `<version>` template), so the release artifact is
the whole product surface. `.github/workflows/release.yml` does the packing and
publishing; your job is the version commit and the tag.

## Deciding the number

A URL install pins the exact tarball, so consumers upgrade by editing a URL —
there is no range resolution to soften a change. Bias toward **minor** over
patch: anything that changes what a host receives at runtime is a minor.

Each of these is a minor:

- a dependency moving to a peer dep (breaking for consumers);
- a runtime behaviour change with no API change (e.g. fields no longer sent to
  sobek);
- new API surface (exported types, new props or callbacks);
- new built-in UI that also changes behaviour (e.g. Save inert on an unchanged
  form).

**Relic tags.** `v0.1.0`–`v0.9.0` on the remote are left over from the
pre-rename `mui-comps-nmr` releases, which were deleted; they carry no release
and no asset. Ignore them as history — releases start fresh from the rename —
but the names are taken: `git push origin v<new>` is rejected for any of them,
so the first `iteru-webcomps` release is `0.10.0` or later.

## Steps

Run from a clean, synced `main`.

1. **Manifest** — `npm version <new> --no-git-tag-version`. Updates
   `package.json` and both version fields in `package-lock.json`. There is no
   `version` lifecycle script, so nothing else fires. Do **not** let it create
   the tag; the tag comes after the commit (see below).

2. **Commit** — `chore: <old> -> <new>`, body stating *why* this level (see
   above) and what a host actually gets. Established form; keep it.

3. **Push `main`**, then tag:

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

Confirm the asset URL resolves before telling anyone to upgrade:

```bash
curl -sL -o /dev/null -w "%{http_code}\n" \
  "https://github.com/entur/iteru-webcomps/releases/download/v<new>/entur-iteru-webcomps-<new>.tgz"
```

## Sequencing a release that documents new behaviour

`pages.yml` republishes `docs/using-entity-forms-host-guide.html` to
`/guide.html` on **every push to main**. The guide names no version (its install
line is a `<version>` template), so nothing to bump there — but a PR that
documents new behaviour publishes it before any release carries it. Merge,
bump, tag in one window, then verify the asset URL (above). Holding the guide PR as a draft until the
feature merges, as #31 did, is the other half of the same rule.

**`tsc` exit codes through a pipe.** `npx tsc --noEmit | grep -v "npm notice"`
reports *grep's* status, so a clean run looks like `exit=1` and a broken one can
look clean. Run `./node_modules/.bin/tsc --noEmit -p tsconfig.json` and read its
own code. Editor diagnostics also lag a scripted edit by a beat — believe tsc.
