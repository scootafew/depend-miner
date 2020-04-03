#
# Base image stage
#
FROM maven:3.6.0-jdk-8-slim AS base

# update 
RUN apt-get update && \
# install curl 
apt-get install -y curl && \
# get install script and pass it to execute: 
curl -sL https://deb.nodesource.com/setup_12.x | bash  && \
# and install node 
apt-get install -y nodejs && \
# confirm that it was successful 
node -v && \
# npm installs automatically 
npm -v


#
# Development stage
#
FROM base AS development

WORKDIR /home/app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nodemon*.json ./
RUN npm ci --quiet

COPY ./worker/ ./worker/
COPY ./libs/models/ ./libs/models/
# RUN npm run pure:compile
RUN npm run build

COPY --from=jp2g:latest /home/app/jp2g jp2g


#
# Production stage.
# This state compile get back the JavaScript code from development stage
# It will also install the production package only
#
FROM base AS production

WORKDIR /home/app
ENV NODE_ENV=production

COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci --quiet --only=production

# COPY tsconfig-paths-bootstrap.js ./

## We just need the build to execute the command
COPY --from=development /home/app/dist ./dist
COPY --from=jp2g:latest /home/app/jp2g ./jp2g

CMD ["npm", "run", "worker:start:prod"]