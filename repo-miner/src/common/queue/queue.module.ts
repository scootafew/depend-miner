import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
}

@Global()
@Module({
  imports:[
    BullModule.registerQueue(
      {
        name: 'analyse',
        redis: REDIS_CONFIG
      },
      {
        name: 'repositoryFetch',
        redis: REDIS_CONFIG
      },
      {
        name: 'dependentsSearch',
        redis: REDIS_CONFIG,
        limiter: {
          duration: 65000, // every 65 seconds
          max: 3, // 3 jobs
          bounceBack: false
        }
      },
      {
        name: 'dependencySearch',
        redis: REDIS_CONFIG
      },
    ),
  ],
  exports:[BullModule]
})
export class QueueModule {}
