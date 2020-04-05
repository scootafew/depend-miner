# PRBX

### Worker
https://stackoverflow.com/questions/39663096/docker-compose-creating-multiple-instances-for-the-same-image

`docker-compose up -V --scale worker=3`



### Production

`docker-compose -f docker-compose.production.yml build <optional-service-name>`

`docker-compose -f docker-compose.production.yml up`


## Inspect Container
`docker container exec -it depend-miner_worker_1 /bin/sh`

## Inspect Image
`docker run -it depend-miner_worker /bin/sh`

## Neo4j
Note that the environment variable NEO4J_AUTH only sets the initial password for the container. To change the password you must delete the container & associated volume. Note that doing so will remove all other data.

`docker container rm <neo4j_container>`
`docker volume rm <neo4j_volume>`