FROM node:22-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
