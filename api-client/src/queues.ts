import * as Queue from 'bull';

export const queues = {
  "process": new Queue('process', process.env.REDIS_URL)
};