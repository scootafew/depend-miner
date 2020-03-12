import * as BullQueue from 'bull';
import * as util from 'util';
import * as child_process from 'child_process';
import * as Redis from 'ioredis';
import { performance } from 'perf_hooks';
import { Job, Queue } from 'bull';
import { Repository, RepositoryJob, Artifact, ArtifactJob, JobType, AnalyseJob } from '@app/models';

// https://github.com/OptimalBits/bull/blob/master/PATTERNS.md

const exec = util.promisify(child_process.exec);
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
}
const client = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host);
const subscriber = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host);

var bullOpts = {
  createClient: function (type) {
    switch (type) {
      case 'client':
        return client;
      case 'subscriber':
        return subscriber;
      default:
        return new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host);
    }
  }
}

const analyseQueue = new BullQueue('analyse', bullOpts);
const dependentsSearchQueue: Queue = new BullQueue("dependentsSearch", bullOpts);
const dependencySearchQueue: Queue = new BullQueue("dependencySearch", bullOpts);

interface ProcessingResult {
  exitCode: number,
  processedArtifacts: Artifact[],
  dependencies: Artifact[],
  timeTaken?: number
}

const opts = [
  `-DM2_HOME=${process.env.M2_HOME}`,
  `-DNEO4J_URI=${process.env.NEO4J_URL}`,
  "-jar",
  `${process.env.JP2G_JAR}`,
]

console.log("Worker up :)");
setupWorker();

async function setupWorker() {
  await analyseQueue.empty(); // reset for debugging purposes
  console.log("Emptied queue");

  analyseQueue.process('*', async (job: Job<AnalyseJob>, done) => {
    console.log(job.data);

    const { name, args, searchDepth, type } = job.data;
    console.log(`\u001b[1;34m Analysing: ${name}`);
    console.log(`\u001b[1;34m Job Type: ${type}`);

    try {
      const processingResult = await anaylse(name, args);

      console.log(`Search depth: ${searchDepth}/${process.env.MAX_SEARCH_DEPTH}`);
      if (searchDepth < +process.env.MAX_SEARCH_DEPTH) {
        handleProcessingResult(type, processingResult, searchDepth);
      }
      
      done(null, processingResult);
    } catch (err) {
      console.log(`Got error analysing: ${name}`);
      done(new Error(err.message));
    }
  })
}

async function anaylse(name: string, args: string[]): Promise<ProcessingResult> {
  const startTime = performance.now();
  // const { stdout, stderr } = await exec(command);
  const processingResult = await spawnProcess([...opts, ...args]);
  const endTime = performance.now();

  processingResult.timeTaken = endTime - startTime;
  console.log(`Processing ${name} took ${processingResult.timeTaken} milliseconds`)

  // console.log('stdout:', stdout);
  // console.error('stderr:', stderr);
  return processingResult;
}

async function spawnProcess(args: string[]): Promise<ProcessingResult> {
  return new Promise(function (resolve, reject) {
    let javaProcess = child_process.spawn("java", args);
    javaProcess.stdout.pipe(process.stdout);
    javaProcess.stderr.pipe(process.stderr);

    let latestStderr = "";

    let artifacts: Artifact[] = [];
    let dependencies: Artifact[] = [];

    javaProcess.stdout.on("data", (data: Buffer) => {
       // Line could be single linefeed char, if so ignore
      if (data.length > 1) {
        let stdout = data.toString('utf8').split(/[\r\n]+/g);

        stdout.forEach(line => {
          // Add artifact
          if (line.startsWith("Found maven artifact: ")) {
            console.log("Storing artifact");
            let artifact = line.replace("Found maven dependency: ", "");
            let [groupId, artifactId, version] = artifact.split(":");
            artifacts = [...artifacts, new Artifact(groupId, artifactId, version)]
          }

          // Add dependency
          if (line.startsWith("Found maven dependency: ")) {
            console.log("Storing dependency");
            let dependency = line.replace("Found maven dependency: ", "")
            let [groupId, artifactId, version] = dependency.split(":");
            dependencies = [...dependencies, new Artifact(groupId, artifactId, version)]
          }
        })
      }
    })

    javaProcess.stderr.on("data", (data: Buffer) => {
      latestStderr = data.length > 1 ? data.toString('utf8') : latestStderr; // Final line could be single linefeed char, if so ignore
    })

    javaProcess.on('exit', function (code) {
      console.log('Child process exited with code ' + code.toString());
      // reject if exited with non-zero exit code
      if (code) {
        reject({
          exitCode: code,
          message: latestStderr
        });
      } else {
        resolve({
          exitCode: code,
          processedArtifacts: artifacts,
          dependencies: dependencies
        });
      }
    });
  })
};

async function handleProcessingResult(jobType: JobType, result: ProcessingResult, prevSearchDepth: number) {
  // Queue dependents processing
  // Only if repository job as otherwise dependents search will already have been performed for artifact
  if (jobType == JobType.Repository) {
    result.processedArtifacts.map(artifact => {
      dependentsSearchQueue.add(JobType.Artifact, {artifact: artifact, searchDepth: prevSearchDepth})
      .then(() => console.log(`\u001b[1;36m Added artifact: ${artifact.toString()} to queue ${dependentsSearchQueue.name}`))
      .catch(err => console.log(err));
    })
  }

  // Queue dependency processing
  result.dependencies.map(artifact => {
    analyseQueue.add(JobType.Artifact, AnalyseJob.fromArtifact(artifact, prevSearchDepth + 1))
    .then(() => console.log(`\u001b[1;36m Added artifact: ${artifact.toString()} to queue ${dependencySearchQueue.name}`))
    .catch(err => console.log(err));
  })
}

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