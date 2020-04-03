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