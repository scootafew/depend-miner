import * as Worker from 'bull';
import * as util from 'util';
import * as child_process from 'child_process';
import { performance } from 'perf_hooks';
import { Job } from 'bull';
import { Repository } from '@app/models';

interface RepositoryJob {
  repo: Repository
}

const exec = util.promisify(child_process.exec);
const worker = new Worker('analyse', { 
  redis: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT)
  }
})

const opts = [
  `-DM2_HOME=${process.env.M2_HOME}`,
  `-DNEO4J_URI=${process.env.NEO4J_URL}`,
  "-jar",
  `${process.env.JP2G_JAR}`,
]

console.log("Worker up :)")

const setupWorker = async () => {
  await worker.empty(); // reset for debugging purposes
  console.log("Emptied queue");

  worker.process(async (job: Job<RepositoryJob>, done) => {
    const repo = job.data.repo;
    console.log(repo);
    console.log(`Processing repository: ${repo.fullName}`);
    const timeTaken = await anaylseRepository(repo);
    done(null, {time: timeTaken});
  });
}

setupWorker();

const anaylseRepository = async (repo: Repository) => {
  const startTime = performance.now();
  // const { stdout, stderr } = await exec(command);
  await spawnProcess([...opts, `${repo.cloneUrl}`]);
  const endTime = performance.now();

  const timeTaken = endTime - startTime;
  console.log(`Processing ${repo.fullName} took ${timeTaken} milliseconds`)

  // console.log('stdout:', stdout);
  // console.error('stderr:', stderr);
  return timeTaken;
}

const spawnProcess = async (opts: string[]): Promise<number> => {
  return new Promise(function (resolve, reject) {
    let javaProcess = child_process.spawn("java", opts);
    javaProcess.stdout.pipe(process.stdout);
    javaProcess.stderr.pipe(process.stderr);

    javaProcess.on('exit', function (code) {
      console.log('Child process exited with code ' + code.toString());
      code ? reject(code) : resolve(code); // reject if exited with non-zero exit code
    });
  })
};