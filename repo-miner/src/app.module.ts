import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UI } from 'bull-board';
import { AnalyseModule } from './analyse/analyse.module';
import { QueueModule } from './common/queue/queue.module';
import { RepoModule } from './common/repo/repo.module';

@Module({
  imports: [
    AnalyseModule,
    QueueModule,
    RepoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UI).forRoutes({
      path: '/processqueue',
      method: RequestMethod.GET
    })
  }
}
