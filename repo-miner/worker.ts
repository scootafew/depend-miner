import * as Worker from 'bull';
import * as util from 'util'
import * as child_process from 'child_process'
import { Job } from 'bull';
import { Repository } from 'src/common/repo/repo.model';

const exec = util.promisify(child_process.exec);
const worker = new Worker('anaylse', process.env.REDIS_URL);

worker.process(async (job: Job<Repository>) => {
  const repo = job.data;
  console.log(`Processed repository: ${repo.fullName}`);
  // anaylseRepository(repo);
});

const anaylseRepository = async (repo: Repository) => {
  const command = `java -DM2_HOME="${process.env.M2_HOME}" -DNEO4J_URI=${process.env.NEO4J_URL} -jar ${process.env.JP2G_JAR} "${repo.url}"`;
  const { stdout, stderr } = await exec(command);
  console.log('stdout:', stdout);
  console.error('stderr:', stderr);
}