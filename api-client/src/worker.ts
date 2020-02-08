import * as Worker from 'bull';
import { Job } from 'bull';

const worker = new Worker('process', process.env.REDIS_URL);

worker.process(async (job: Job<any>) => {
  console.log(`Processed job: ${job.data.job}`);
});