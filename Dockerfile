FROM python:3.12-alpine AS builder
WORKDIR /app
COPY . .
RUN python build_site.py

FROM nginx:stable-alpine
ENV PORT=8080
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist/ /usr/share/nginx/html/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
