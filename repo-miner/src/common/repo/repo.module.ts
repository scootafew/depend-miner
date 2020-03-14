import { Module, HttpModule, HttpService } from '@nestjs/common';
import { GithubService } from './github.service';
import { DependentsSearchService } from './dependents-search/dependents-search.service';
import * as BullQueue from 'bull';

// const gitHubServiceFactory = {
//   provide: 'GITHUBSERVICE',
//   useFactory: async (http: HttpService) => {
//     const REDIS_CONFIG = {
//       host: process.env.REDIS_HOST || "localhost",
//       port: Number(process.env.REDIS_PORT) || 6379,
//     }
//     const repositoryFetchQueue = new BullQueue('repositoryFetchQueue', {
//       redis: REDIS_CONFIG,
//       limiter: {
//         duration: 5000, // every 5 seconds
//         max: 1, // 1 jobs
//         bounceBack: false
//       }
//     });
//     await repositoryFetchQueue.empty();
//     await repositoryFetchQueue.clean(0, "active")
//     return new GithubService(http, repositoryFetchQueue);
//   },
//   inject: [HttpService],
// };

@Module({
  imports: [HttpModule],
  exports: [GithubService],
  providers: [GithubService, DependentsSearchService]
})
export class RepoModule {}
