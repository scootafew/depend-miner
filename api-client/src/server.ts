// Credit https://github.com/fastify/fastify/blob/master/examples/typescript-server.ts

import { FastifyReply, FastifyRequest } from 'fastify';
import * as fastify from 'fastify';
// import * as cors from 'cors';
import { createReadStream } from 'fs';
import * as url from 'url';
import { GitHubConnector } from './githubConnector';
import { IncomingMessage, ServerResponse } from 'http';
import { setQueues, UI } from 'bull-board';
import { queues } from './queues';
import { Queue } from 'bull';

console.log("Hi There");

const server = fastify();

const ghc = new GitHubConnector();

const processQueue: Queue<any> = queues.process;

setQueues(processQueue);

let jobs = 0;

const opts = {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      }
    }
  }
}

server.register(require('fastify-cors'), {
  origin: true
});


// Credit https://codewithhugo.com/bring-redux-to-your-queue-logic-an-express-setup-with-es6-and-bull-queue/
function getRedisConfig(redisUrl) {
  const redisConfig = url.parse(redisUrl);
  return {
    host: redisConfig.hostname || 'localhost',
    port: Number(redisConfig.port || 6379),
    database: (redisConfig.pathname || '/0').substr(1) || '0',
    password: redisConfig.auth ? redisConfig.auth.split(':')[1] : undefined
  };
}

function getHelloHandler(req: FastifyRequest<IncomingMessage>, reply: FastifyReply<ServerResponse>) {
  reply.header('Content-Type', 'application/json').code(200);
  reply.send({ hello: 'world' });
}

function getStreamHandler(req: FastifyRequest<IncomingMessage>, reply: FastifyReply<ServerResponse>) {
  const stream = createReadStream(process.cwd() + '/examples/plugin.js', 'utf8');
  reply.code(200).send(stream);
}

function getRunHandler(req: FastifyRequest<IncomingMessage>, reply: FastifyReply<ServerResponse>) {
  // ghc.fetchRepository('javaparser', 'javaparser');
  ghc.searchRepositories('user:microsoft');
  reply.code(200).send();
}

async function postQueueHandler(req: FastifyRequest<IncomingMessage>, reply: FastifyReply<ServerResponse>) {
  for (let i = 0; i < 10; i++) {
    processQueue.add({job: jobs}).catch(err => console.log(err));
    console.log(`Added job: ${jobs}`);
    jobs++;
  }
  let queueLength = await processQueue.count();
  console.log(`${queueLength} jobs in queue...`);
  reply.code(200).send();
}

// server.use(cors())
server.get('/', opts, getHelloHandler);
server.get('/stream', getStreamHandler);
server.get('/run', getRunHandler);

server.post('/addjobs', postQueueHandler);

server.use('/processqueue', UI);

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, '0.0.0.0', (err, address) => {
  if (err) throw err;
  console.log(`Server listening at ${address}`);
});