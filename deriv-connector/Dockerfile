# Production-ready Dockerfile for the Deriv web connector

FROM node:18-alpine AS build
WORKDIR /app
COPY deriv-connector/package.json ./
RUN npm install --production
COPY deriv-connector/ .

FROM node:18-alpine
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
