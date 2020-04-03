# Credit https://medium.com/@VincentSchoener/development-of-nodejs-application-with-docker-and-typescript-part-2-4dd51c1e7766

#
# Development stage.
# This state compile our TypeScript to get the JavaScript code
#
FROM node:12.13.0 AS development

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig*.json ./
COPY ./libs ./libs
COPY ./src ./src
RUN npm ci --quiet && npm run build

#
# Production stage.
# This state compile get back the JavaScript code from development stage
# It will also install the production package only
#
FROM node:12.13.0-slim AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci --quiet --only=production

## We just need the build to execute the command
COPY --from=development /usr/src/app/dist ./dist

CMD ["npm", "run", "start:prod"]