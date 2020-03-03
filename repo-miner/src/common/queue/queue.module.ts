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
        name: 'repositorySearch',
        redis: REDIS_CONFIG
      },
      {
        name: 'dependentsSearch',
        redis: REDIS_CONFIG
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
