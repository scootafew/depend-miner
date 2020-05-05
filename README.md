# Depend Miner

## How to Run Locally
## Installation

```bash
$ npm install
```

### Secrets
Before the application can be run, the template file [secrets.env.template](secrets.env.template) should be renamed to `secrets.env` and the values populated. The Redis and Neo4J passwords can be any values. The GitHub API access token should be generated [here](https://github.com/settings/tokens/new) with the `public_repo` scope only.

## How to Run in Docker

### Development
To build local images. Ommitting the optional service name builds all services.

```bash
$ docker-compose build <optional-service-name>
```

To start services defined in [docker-compose.yml](docker-compose.yml). Ommitting the optional service name starts all services.

```bash
$ docker-compose up <optional-service-name>
```

### Production
For production, run docker-compose commands specifying the [production compose file](docker-compose.production.yml).

Environment variables also need to be set for Redis and Neo4J password, along with the GitHub API token. Suggestion is to create `secrets.prod.env` and pass to docker-compose. (Note: .env files are included in the .gitignore file to prevent against accidental commit of secrets)

```bash
$ docker-compose -f docker-compose.production.yml --env-file=secrets.prod.env <commands...>
```

### AWS
These services could be run on a container orchestration service such as Docker Swarm or Kubernetes. The examples here are for Docker Swarm, but for Kubernetes the [kompose](https://github.com/kubernetes/kompose) tool may be of interest.

Environment variables need to be set for Redis and Neo4J password, along with the GitHub API token. Suggestion is to create `secrets.aws.env` and pass to docker-compose. (Note: .env files are included in the .gitignore file to prevent against accidental commit of secrets)

[sg_inbound]: img/securitygroup_rules_inbound.png "Security Group Inbound Rules"
[sg_outbound]: img/securitygroup_rules_outbound.png "Security Group Outbound Rules"
#### Security Group
All AWS instances must be set up as part of the same Security Group, to allow networking between Docker Swarm nodes and also connection from the administrator.

##### Inbound Rules
![Security Group Inbound Rules][sg_inbound]

##### Outbound Rules
![Security Group Inbound Rules][sg_outbound]

The following commands should be executed on a EC2 instance (or similar).

On first instance creation:
```bash
$ sudo yum update # update
$ sudo yum install docker # install docker
$ sudo systemctl enable docker # set docker to start on startup

# or as a single command
$ sudo yum update -y && \
sudo yum install docker -y && \
sudo systemctl enable docker
```

On the instance that will act as swarm manager:
```bash
# create a swarm
$ sudo docker swarm init
```

This will return the command to run on other instances, so they will join as workers. E.g.
```bash
$ sudo docker swarm join --token <token> <host>
```

All further swarm level configuration commands should be executed on the manager node.

Optionally, nodes can be labelled to control which services are deployed where. These are set as placement constraints in the [AWS compose file](docker-compose.aws.yml). Such labels can be created by running the following command:
```bash
$ sudo docker node update --label-add ec2=c5.large <node>

# <value> = t2.small, c5.large etc.
```

Create the [AWS compose file](docker-compose.aws.yml).
```bash
$ sudo vi docker-compose.yml
```

Create the AWS secrets file and populate it.
```bash
$ sudo vi secrets.aws.env
```

Create the stack
```bash
$ sudo docker stack deploy -c docker-compose.yml --env-file=secrets.aws.env  dependTest
```

Verify the services have been created
```bash
$ sudo docker node ls
```

On any given node (manager or worker):
```bash
# list services on that node
$ sudo docker service ls

# list containers on node
$ sudo docker container ls

# display container logs (ommitting tail will display all lines over lifetime of container)
$ sudo docker container logs <container-name> (--tail=<number-of-lines-to-display>)
```

### Useful Commands
Inspect Container
```bash
# Inspect container
$ docker container exec -it <container-name> /bin/sh

# Inspect image
$ docker run -it <image-name> /bin/sh
```

### Worker
https://stackoverflow.com/questions/39663096/docker-compose-creating-multiple-instances-for-the-same-image

`docker-compose up -V --scale worker=3`

## Neo4j
### Auth
Note that the environment variable NEO4J_AUTH only sets the initial password for the container. To change the password you must delete the container & associated volume. Note that doing so will remove all other data.

```bash
# remove container
$ docker container rm <neo4j_container>

# remove volume
$ docker volume rm <neo4j_volume>
```

### Cypher Shell
Can access a Cypher shell on the container
```bash
# start bash shell in container
$ sudo docker exec -it <neo4j_container> bash

# start cypher shell
$ cypher-shell -u <neo4j-username> -p <neo4j-password>

# run cypher commands
$ MATCH (n) RETURN count(*); # count all nodes
$ MATCH (n)-[r]->() RETURN COUNT(r); # count all relationships
```