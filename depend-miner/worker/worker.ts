import * as BullQueue from 'bull';
import * as util from 'util';
import * as child_process from 'child_process';
import * as Redis from 'ioredis';
import * as promClient from 'prom-client';
import * as fastify from 'fastify'
import * as fs from 'fs';
import * as csvWriter from 'csv-write-stream';
import { Registry, Histogram, Counter } from 'prom-client';
import { performance } from 'perf_hooks';
import { Job, Queue } from 'bull';
import { Repository, Artifact, JobType, AnalyseJob } from '@app/models';
import { Readable } from 'stream';
import { Server, IncomingMessage, ServerResponse } from 'http'
import {ChildProcessWithoutNullStreams } from 'child_process';

// https://github.com/OptimalBits/bull/blob/master/PATTERNS.md

type OutputHandler = ((output: string) => void);

const exec = util.promisify(child_process.exec);
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
}
const redisClient = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host);
const subscriber = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host);

var bullOpts = {
  createClient: function (type) {
    switch (type) {
      case 'client':
        return redisClient;
      case 'subscriber':
        return subscriber;
      default:
        return new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host);
    }
  }
}

const metricsRegistry = new Registry();
const intervalCollector = promClient.collectDefaultMetrics({prefix: 'node_worker_', });
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

interface ProcessingResult {
  exitCode: number,
  processedArtifacts?: Artifact[],
  dependencies?: Artifact[],
  timeTaken?: number,
  message?: string
}

const opts = [
  `-DM2_HOME=${process.env.M2_HOME}`,
  `-DNEO4J_URI=${process.env.NEO4J_URL}`,
  "-jar",
  `${process.env.JP2G_JAR}`,
]

function appendMetricToCsv(id: string, processingTime: number, message: string) {
  let writer = csvWriter({sendHeaders: false})
  writer.pipe(fs.createWriteStream('metric_file.csv', {flags: 'a'}))
  writer.write({timestamp:new Date().valueOf(), id: id, processingTime: processingTime, message: message})
  writer.end()
}

// Create metrics endpoints
const server: fastify.FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify({})
server.get('/metrics', (request, reply) => {
  reply.code(200).header('Content-Type', promClient.register.contentType).send(promClient.register.metrics())
})

server.get('/csvmetrics', (request, reply) => {
  const stream = fs.createReadStream('metric_file.csv');
  reply.code(200).send(stream)
})

server.delete('/csvmetrics', (request, reply) => {
  fs.unlink('metric_file.csv',() => {
    reply.send("Deleted CSV Metrics File");
  });
})
server.listen(3000, "0.0.0.0");

// init
console.log("Worker up :) 1.0.2");
setupWorker();

async function setupWorker() {
  analyseQueue.process('*', async (job: Job<AnalyseJob>, done) => {
    console.log(job.data);

    const { name, args, searchDepth, type } = job.data;
    console.log(`\u001b[1;34m Analysing: ${name}`);
    console.log(`\u001b[1;34m Job Type: ${type}`);

    try {
      const outputHandlers: OutputHandler[] = [
        foundArtifactHandler(type, searchDepth),
        foundDependencyHandler(searchDepth)
      ];

      const processingResult = await anaylse(name, args, outputHandlers);

      // console.log(`Search depth: ${searchDepth}/${process.env.MAX_SEARCH_DEPTH}`);
      // if (searchDepth < +process.env.MAX_SEARCH_DEPTH) {
      //   handleProcessingResult(type, processingResult, searchDepth);
      // }
      
      done(null, processingResult);
    } catch (err) {
      console.log(`Got error analysing: ${name}`);
      done(new Error(`${job.data.name} - ${err.message}`));
    }
  })
}

async function anaylse(name: string, args: string[], outputHandlers: OutputHandler[]): Promise<ProcessingResult> {
  try {
    const startTime = performance.now();
    // const { stdout, stderr } = await exec(command);
    const processingResult = await spawnProcess([...opts, ...args], outputHandlers);
    const endTime = performance.now();

    processingResult.timeTaken = endTime - startTime;
    console.log(`Processing ${name} took ${processingResult.timeTaken} milliseconds`);

    // report metric
    processingTime.labels(name).observe(processingResult.timeTaken);

    appendMetricToCsv(name, processingResult.timeTaken, processingResult.message);

    // console.log('stdout:', stdout);
    // console.error('stderr:', stderr);
    return processingResult;
  } catch (err) {
    appendMetricToCsv(name, 0, err.message);
    
    throw err;
  }
}

async function spawnProcess(args: string[], outputHandlers: ((output: string) => void)[]): Promise<ProcessingResult> {
    let javaProcess = child_process.spawn("java", args);
    javaProcess.stderr.pipe(process.stderr);
    let stdOut = handleStdout(javaProcess.stdout, outputHandlers);

    return handleProcessExit(javaProcess, stdOut);
};

async function handleStdout(stdout: Readable, outputHandlers: OutputHandler[]): Promise<string> {
  stdout.pipe(process.stdout);
  
  return new Promise(async function (resolve) {
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
  return new Promise(async function (resolve, reject) {
      childProcess.on("exit", async code => {
        console.log('Child process exited with code ' + code.toString())

        let exitMessage = await exitMessage$;

        console.log("New Exit Message: " + exitMessage);

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

const foundArtifactHandler = (jobType: JobType, prevSearchDepth: number) => (line: String) => {
  // Only if repository job as otherwise dependents search will already have been performed for artifact
  if (line.startsWith("Found maven artifact: ") && (jobType == JobType.Repository) && (prevSearchDepth < +process.env.MAX_SEARCH_DEPTH)) {
    let artifactString = line.replace("/^(Found maven dependency: )/", "");
    let artifact = Artifact.fromString(artifactString);

    // Queue dependents processing
    dependentsSearchQueue.add(JobType.Artifact, {artifact: artifact, searchDepth: prevSearchDepth})
    .then(() => console.log(`\u001b[1;36m Added artifact: ${artifact.toString()} to queue ${dependentsSearchQueue.name}`))
    .catch(err => console.log(err));
  }
}


const foundDependencyHandler = (prevSearchDepth: number) => (line: String) => {
  if (line.startsWith("Found maven dependency: ") && (prevSearchDepth < +process.env.MAX_SEARCH_DEPTH)) {
    let dependencyString = line.replace("/^(Found maven dependency: )/", "");
    let dependency = Artifact.fromString(dependencyString);

    // Queue dependency processing
    analyseQueue.add(JobType.Artifact, AnalyseJob.fromArtifact(dependency, prevSearchDepth + 1))
    .then(() => console.log(`\u001b[1;36m Added dependency: ${dependency.toString()} to queue ${analyseQueue.name}`))
    .catch(err => console.log(err));
  }
}

// async function handleProcessingResult(jobType: JobType, result: ProcessingResult, prevSearchDepth: number) {
//   // Queue dependents processing
//   // Only if repository job as otherwise dependents search will already have been performed for artifact
//   if (jobType == JobType.Repository) {
//     result.processedArtifacts.map(artifact => {
//       dependentsSearchQueue.add(JobType.Artifact, {artifact: artifact, searchDepth: prevSearchDepth})
//       .then(() => console.log(`\u001b[1;36m Added artifact: ${artifact.toString()} to queue ${dependentsSearchQueue.name}`))
//       .catch(err => console.log(err));
//     })
//   }

//   // Queue dependency processing
//   result.dependencies.map(artifact => {
//     analyseQueue.add(JobType.Artifact, AnalyseJob.fromArtifact(artifact, prevSearchDepth + 1))
//     .then(() => console.log(`\u001b[1;36m Added artifact: ${artifact.toString()} to queue ${dependencySearchQueue.name}`))
//     .catch(err => console.log(err));
//   })
// }

// async function handleArtifactProcessingResult(artifact: Artifact, result: ProcessingResult) {
//   // Queue dependents processing
//   dependentsSearchQueue.add(JobType.Artifact, {artifact: artifact})
//     .then(() => console.log(`Added artifact: ${repo.fullName} to queue ${dependentsSearchQueue.name}`))
//     .catch(err => console.log(err));

//   // Queue dependency processing
//   result.dependencies.map(artifact => {
//     analyseQueue.add(JobType.Artifact, {artifact: artifact})
//     .then(() => console.log(`Added artifact: ${artifact.toString()} to queue ${dependencySearchQueue.name}`))
//     .catch(err => console.log(err));
//   })
// }

// Duplicated code
async function addToQueue(queue: Queue, repo: Repository, lifo: boolean = false) {
  queue.add({repo: repo}, {lifo: lifo})
    .then(() => console.log(`Added repo: ${repo.fullName} to queue ${queue.name}`))
    .catch(err => console.log(err));
}

// yo