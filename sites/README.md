# Personal site submodules

Each directory here is a separate Astro repository mounted with `git submodule`.
The repository name and path determine the public URL:

```text
site-member-pants   -> sites/member/pants   -> /member/pants
site-char-chogi     -> sites/char/chogi     -> /char/chogi
```

The convention is:

```text
site-<kind>-<slug> -> sites/<kind>/<slug> -> /<kind>/<slug>
```

`npm run build` discovers every `sites/*/*` directory, builds it, and copies its
`dist/` output to `public/web/<kind>/<slug>/`. The desktop deep link lives at
`/<kind>/<slug>`, and IE loads the content from `/web/<kind>/<slug>/`.

## Site requirements

- Static Astro output (`output: "static"`).
- No JavaScript: no `<script>` tags, `client:*` directives, or inline handlers.
- Prefer relative asset URLs. The parent build also rewrites the site's existing
  GitHub Pages base to `/web/<kind>/<slug>/`.
- Build output in `dist/`.

The parent build strips scripts and inline handlers before copying the output.
It also rewrites links between the personal sites so they stay inside the fake
browser.

## Adding a site

```bash
git submodule add -b main https://github.com/pants-the-person/site-member-pip.git sites/member/pip
npm run sites:build
```

Then commit the new submodule entry and `src/generated/personal-sites.ts`.

## Updating sites

Site authors update their own repositories. The parent repository pins a
submodule commit. Bump the pointers for review with:

```bash
npm run sites:update
```

Because the parent build runs each site's `npm ci` and `npm run build`, review
submodule bumps before deploying or build sites in a CI job without parent
deploy secrets.
