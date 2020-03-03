import { Module, HttpModule } from '@nestjs/common';
import { GithubService } from './github.service';
import { DependentsSearchService } from './dependents-search/dependents-search.service';

@Module({
  imports: [HttpModule],
  exports: [GithubService],
  providers: [GithubService, DependentsSearchService]
})
export class RepoModule {}
