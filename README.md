# PRBX

### Worker
https://stackoverflow.com/questions/39663096/docker-compose-creating-multiple-instances-for-the-same-image

`docker-compose up -V --scale worker=3`



### Production

`docker-compose -f docker-compose.production.yml build`

`docker-compose -f docker-compose.production.yml up`