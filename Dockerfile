# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# (the analytics "token" is a public beacon ID that ends up in every page anyway)
# Railway (or any Docker host) image: builds the static site, then serves it with nginx.

FROM python:3.12-slim AS build
WORKDIR /src
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Optional settings; on Railway, service variables with these names are passed in automatically.
ARG ZERONE_FORMSPREE_FORM_ID=""
ARG ZERONE_BOOKING_URL=""
ARG ZERONE_WHATSAPP_NUMBER=""
ARG ZERONE_CLOUDFLARE_ANALYTICS_TOKEN=""
ARG ZERONE_GOOGLE_SITE_VERIFICATION=""
ARG ZERONE_BING_SITE_VERIFICATION=""
RUN python build.py && python tests/validate_site.py

FROM nginxinc/nginx-unprivileged:1.31-alpine
ENV PORT=8080
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /src/build/redirects.conf /src/build/languages.conf /src/build/csp.conf /etc/nginx/snippets/
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
