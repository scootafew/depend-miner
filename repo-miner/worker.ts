import * as Worker from 'bull';
import * as util from 'util'
import * as child_process from 'child_process'
import { Job } from 'bull';
import { Repository } from './repo.model';

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

worker.process(async (job: Job<RepositoryJob>) => {
  const repo = job.data.repo;
  console.log(repo);
  console.log(`Processed repository: ${repo.fullName}`);
  // anaylseRepository(repo);
});

const anaylseRepository = async (repo: Repository) => {
  const command = `java -DM2_HOME="${process.env.M2_HOME}" -DNEO4J_URI=${process.env.NEO4J_URL} -jar ${process.env.JP2G_JAR} "${repo.url}"`;
  const { stdout, stderr } = await exec(command);
  console.log('stdout:', stdout);
  console.error('stderr:', stderr);
}