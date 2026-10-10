FROM nginx:stable-alpine
ENV PORT=8080
RUN rm -rf /usr/share/nginx/html/*
COPY *.html *.css *.js /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
