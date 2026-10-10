# Site v2 review

This branch is for review. Do not merge or deploy without separate publication approval. Railway remains inactive and DNS is unchanged.

## Build and review

Run `python build_all.py` with Python 3.12. Only the generated `dist/` directory is a complete site; publishing the repository root omits generated languages and metadata.

The build requires all 15 languages and 20 illustrative use cases per language. English cases are on `company.html`; localized cases appear on the respective language homepages. `language-coverage.json` records the actual rendered counts.

GitHub CI validates source and generated references, then runs Chromium checks at 320 and 1280 pixels in dark and light modes. Passing runs provide `site-v2-preview` and `browser-review` artifacts for seven days. Extract the preview and serve its folder locally to inspect the site. These artifacts do not publish the site.

Review translations, images, reading order, menus, contact links and carousel controls visually. Automated checks do not certify translation quality, all browsers, security or accessibility compliance. The custom-project panels are service descriptions, not a deployed authentication/dashboard product.

## Publication boundary

`main`, the live domain and Railway activation remain outside this review. A future Railway deployment uses the prepared Docker/Nginx files. A different hosting platform must publish the generated site, not raw source files. No SEO ranking or profit guarantee is implied.
