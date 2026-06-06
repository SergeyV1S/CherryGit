FROM node:22.12.0-alpine AS builder

WORKDIR /var/www

ARG VITE_API_URL="${API_URL}"

COPY package.json ./
RUN npm install

COPY . .

RUN npm run build

FROM nginx:stable-alpine AS production

COPY --from=builder /var/www/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

ENV VITE_API_URL="${API_URL}"

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]