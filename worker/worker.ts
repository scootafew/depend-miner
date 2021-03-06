import * as BullQueue from 'bull';
import * as util from 'util';
import * as child_process from 'child_process';
import * as Redis from 'ioredis';
import * as promClient from 'prom-client';
import * as fastify from 'fastify'
import * as fs from 'fs';
import * as path from 'path';
import * as csvWriter from 'csv-write-stream';
import { Registry, Histogram, Counter } from 'prom-client';
import { performance } from 'perf_hooks';
import { Job, Queue } from 'bull';
import { Artifact, JobType, AnalyseJob } from '@app/models';
import { Readable } from 'stream';
import { Server, IncomingMessage, ServerResponse } from 'http'
import {ChildProcessWithoutNullStreams } from 'child_process';

// https://github.com/OptimalBits/bull/blob/master/PATTERNS.md

type OutputHandler = ((output: string) => void);

const exec = util.promisify(child_process.exec);
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD
}
const redisClient = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, { password: REDIS_CONFIG.password });
const subscriber = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, { password: REDIS_CONFIG.password });

var bullOpts = {
  createClient: function (type) {
    switch (type) {
      case 'client':
        return redisClient;
      case 'subscriber':
        return subscriber;
      default:
        return new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, { password: REDIS_CONFIG.password });
    }
  }
}

export enum LogColor {
  Red = "\u001b[31m",
  Green = "\u001b[32m",
  Blue = "\u001b[34m",
  Purple = "\u001b[35m",
  Cyan = "\u001b[36m",
}

const metricsRegistry = new Registry();
promClient.collectDefaultMetrics({prefix: 'node_worker_', });
const processedJobs = new Counter({
  name: 'jobs_processed_total',
  help: "How many jobs have been processed by this worker",
  labelNames: ['worker_id', "job_result"]
})
const processingTime = new Histogram({
  name: 'processing_time',
  help: 'How long it took to process the repository',
  labelNames: ['name']
});

metricsRegistry.registerMetric(processedJobs);
metricsRegistry.registerMetric(processingTime);

// Queue setup
const analyseQueue = new BullQueue('analyse', bullOpts);
const dependentsSearchQueue: Queue = new BullQueue("dependentsSearch", bullOpts);
const dependencySearchQueue: Queue = new BullQueue("dependencySearch", bullOpts);
// const cronCleanupQueue: Queue = new BullQueue("cronCleanupQueue", bullOpts);

// const cleanupFrequency = 10000 // 10 seconds
// cronCleanupQueue.add(process.env.HOSTNAME, {}, {
//   repeat: {
//     every: cleanupFrequency
//   }
// })

// cronCleanupQueue.process(process.env.HOSTNAME, async (job: Job, done) => {
//   console.log(`Waiting for current analyse job to finish then will cleanup dirs...`);
//   analyseQueue.whenCurrentJobsFinished().then(() => {
//     cleanDirectories();
//     done();
//   })
// });

interface ProcessingResult {
  exitCode: number,
  processedArtifacts?: Artifact[],
  dependencies?: Artifact[],
  timeTaken?: number,
  message?: string
}

const opts = [
  // `-DNEO4J_URI=${process.env.NEO4J_URI}`,
  "-jar",
  `${process.env.JP2G_JAR}`,
]

function appendMetricToCsv(jobType: string, id: string, processingTime: number, success: boolean, message: string) {
  let writer = csvWriter({sendHeaders: false})
  writer.pipe(fs.createWriteStream('metric_file.csv', {flags: 'a'})) // append output
  writer.write({
    worker: process.env.HOSTNAME,
    jobType: jobType,
    timestamp:new Date().valueOf(),
    id: id,
    processingTime: processingTime,
    success: success,
    message: message
  });
  writer.end()
}

// Create metrics endpoints
const server: fastify.FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify({})
server.get('/metrics', (_request, reply) => {
  reply.code(200).header('Content-Type', promClient.register.contentType).send(promClient.register.metrics())
})

server.get('/healthcheck', (_request, reply) => {
  reply.code(200).send();
})

server.get('/csvmetrics', (_request, reply) => {
  const stream = fs.createReadStream('metric_file.csv');
  reply.code(200).send(stream)
})

server.delete('/csvmetrics', (_request, reply) => {
  fs.unlink('metric_file.csv',() => {
    reply.send("Deleted CSV Metrics File");
  });
})
server.listen(3000, "0.0.0.0");

// init
console.log("Worker up :) 1.0.4");
setupWorker();

async function setupWorker() {
  analyseQueue.process('*', async (job: Job<AnalyseJob>, done) => {
    console.log(job.data);

    const { name, args, searchDepth, type } = job.data;
    log(`Analysing: ${name}`, LogColor.Blue);
    log(`Job Type: ${type}`, LogColor.Blue);

    try {
      const outputHandlers: OutputHandler[] = [
        foundArtifactHandler(type, searchDepth),
        foundDependencyHandler(searchDepth)
      ];

      const processingResult = await anaylse(name, args, outputHandlers);

      appendMetricToCsv(type, name, processingResult.timeTaken, true, processingResult.message);

      cleanTempDirectories();
      
      done(null, processingResult);
    } catch (err) {
      appendMetricToCsv(type, name, 0, false, err.message);

      console.log(`Got error analysing: ${name}`);
      done(new Error(`${job.data.name} - ${err.message}`));
    }
  })
}

async function anaylse(name: string, args: string[], outputHandlers: OutputHandler[]): Promise<ProcessingResult> {
  const startTime = performance.now();
  // const { stdout, stderr } = await exec(command);
  const processingResult = await spawnProcess([...opts, ...args], outputHandlers);
  const endTime = performance.now();

  processingResult.timeTaken = endTime - startTime;
  console.log(`Processing ${name} took ${processingResult.timeTaken} milliseconds`);

  // report metric
  processingTime.labels(name).observe(processingResult.timeTaken);

  return processingResult;
}

async function spawnProcess(args: string[], outputHandlers: ((output: string) => void)[]): Promise<ProcessingResult> {
  let javaProcess = child_process.spawn("java", args);
  javaProcess.stderr.pipe(process.stderr);
  let stdOut = handleStdout(javaProcess.stdout, outputHandlers);

  return handleProcessExit(javaProcess, stdOut);
}

async function handleStdout(stdout: Readable, outputHandlers: OutputHandler[]): Promise<string> {
  stdout.pipe(process.stdout);
  
  return new Promise(async (resolve) => {
    stdout.on("data", (data: Buffer) => {
      // Line could be single linefeed char, if so ignore
      if (data.length > 1) {
        let stdout = data.toString('utf8').split(/[\r\n]+/g);
  
        stdout.forEach(line => {
          outputHandlers.forEach((handler) => handler(line));
  
          if (line.startsWith("Exit message: ")) {
            let message = line.replace("Exit message: ", "");
            resolve(message);
          }
        })
      }
    })
  })
}

async function handleProcessExit(childProcess: ChildProcessWithoutNullStreams, exitMessage$: Promise<string>): Promise<ProcessingResult> {
  return new Promise(async (resolve, reject) => {
    childProcess.on("exit", async code => {
      console.log('Child process exited with code ' + code.toString())

      let exitMessage: string;
      
      try {
        exitMessage = await promiseOrTimeout(5000, exitMessage$);
      } catch (err) {
        exitMessage = `Child process exited abruptly with code ${code} and no exit message`
      }
      
      console.log("Exit Message: " + exitMessage);

      // reject if exited with non-zero exit code
      if (code) {
        processedJobs.labels(process.env.HOSTNAME, "fail").inc();
        reject({
          exitCode: code,
          message: exitMessage
        });
      } else {
        processedJobs.labels(process.env.HOSTNAME, "success").inc();
        resolve({
          exitCode: code,
          // processedArtifacts: artifacts,
          // dependencies: dependencies,
          message: exitMessage
        });
      }
    })
  })
}

const foundArtifactHandler = (jobType: JobType, prevSearchDepth: number) => (line: string) => {
  // Only if repository job as otherwise dependents search will already have been performed for artifact
  if (line.startsWith("Found maven artifact: ") && (jobType == JobType.Repository)) {
    let artifactString = line.replace(/^(Found maven artifact: )/, "");
    let artifact = Artifact.fromString(artifactString);

    // Queue artifact processing - allows multiple workers to contribute to processing artifacts from single repo
    analyseQueue.add(JobType.Artifact, AnalyseJob.fromArtifact(artifact, prevSearchDepth))
      .then(() => log(`Added artifact: ${artifact.toString()} to queue ${analyseQueue.name}`, LogColor.Cyan))
      .catch(err => console.log(err));

    if (prevSearchDepth < +process.env.MAX_SEARCH_DEPTH) {
      // Queue dependents processing
      dependentsSearchQueue.add(JobType.Artifact, { artifact: artifact, searchDepth: prevSearchDepth })
        .then(() => log(`Added artifact: ${artifact.toString()} to queue ${dependentsSearchQueue.name}`, LogColor.Cyan))
        .catch(err => console.log(err));
    }
  }
}


const foundDependencyHandler = (prevSearchDepth: number) => (line: string) => {
  if (line.startsWith("Found maven dependency: ") && (prevSearchDepth < +process.env.MAX_SEARCH_DEPTH)) {
    let dependencyString = line.replace(/^(Found maven dependency: )/, "");
    let dependency = Artifact.fromString(dependencyString);

    // Queue dependency processing
    analyseQueue.add(JobType.Artifact, AnalyseJob.fromArtifact(dependency, prevSearchDepth + 1))
    .then(() => log(`Added dependency: ${dependency.toString()} to queue ${analyseQueue.name}`, LogColor.Cyan))
    .catch(err => console.log(err));
  }
}

function cleanTempDirectories() {
  console.log("Starting cleanup...");
  const dirs = [
    path.normalize("../clones"),
    path.normalize("../artifacts")
  ];
  dirs.forEach(dir => {
    console.log(`Removing directory ${dir}`)
    fs.rmdirSync(dir, { recursive: true })
  });
}

function log(str: string, color: LogColor) {
  const ANSI_RESET = "\u001b[0m";
  console.log(color + str + ANSI_RESET);
}

/**
 * Resolves a promise with a timeout
 * @param ms the timeout in ms after which to reject if Promise has not already completed
 * @param promise the promise to attempt to resolve before timeout ms.
 */
function promiseOrTimeout(ms: number, promise: Promise<any>): Promise<any> {
  // Create a promise that rejects in <ms> milliseconds
  let id: NodeJS.Timeout;
  let timeout = new Promise((_resolve, reject) => {
    id = setTimeout(() => {
      reject(`Timed out in ${ms} ms.`)
    }, ms)
  })

  // Returns a race between our timeout and the passed in promise
  return Promise.race([
    promise,
    timeout
  ]).then(result => {
    clearTimeout(id);
    return result;
  })
}