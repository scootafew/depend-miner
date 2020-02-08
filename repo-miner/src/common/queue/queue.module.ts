import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

@Global()
@Module({
  imports:[
    BullModule.registerQueue({
      name: 'analyse',
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
  ],
  exports:[BullModule]
})
export class QueueModule {}
