# Credit https://medium.com/@VincentSchoener/development-of-nodejs-application-with-docker-and-typescript-part-2-4dd51c1e7766

#
# Development stage.
# This state compile our TypeScript to get the JavaScript code
#
# FROM node:12.13.0 AS development

# WORKDIR /usr/src/app

FROM jp2g:latest AS development

# update 
RUN apt-get update && \
# install curl 
apt-get install curl && \
# get install script and pass it to execute: 
curl -sL https://deb.nodesource.com/setup_12.x | bash  && \
# and install node 
apt-get install -y nodejs && \
# confirm that it was successful 
node -v && \
# npm installs automatically 
npm -v

WORKDIR /home/app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nodemon*.json ./
RUN npm ci --quiet

COPY ./worker/worker.ts ./worker.ts
COPY ./libs/models/ ./libs/models/
RUN npm run pure:compile

# Override entrypoint in jp2g
ENTRYPOINT []

#
# Production stage.
# This state compile get back the JavaScript code from development stage
# It will also install the production package only
#
FROM node:12.13.0-slim AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --quiet --only=production

## We just need the build to execute the command
COPY --from=development /home/app/dist/worker.js ./dist/
COPY --from=development /home/app/dist/libs/ ./dist/libs/
COPY ./jp2g ./dist/

CMD ["node", "dist/worker.js"]