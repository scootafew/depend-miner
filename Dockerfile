# Credit https://medium.com/@VincentSchoener/development-of-nodejs-application-with-docker-and-typescript-part-2-4dd51c1e7766

#
# Development stage.
# This state compile our TypeScript to get the JavaScript code
#
FROM node:12.13.0 AS development

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci --quiet

COPY ./libs ./libs
COPY ./src ./src
RUN npm run build

## Wait script, configured with ENV VAR WAIT_HOSTS
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

CMD /wait && npm run start:dev

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

## Wait script, configured with ENV VAR WAIT_HOSTS
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

## We just need the build to execute the command
COPY --from=development /usr/src/app/dist ./dist

CMD /wait && npm run start:prod