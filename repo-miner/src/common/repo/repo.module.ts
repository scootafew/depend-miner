import { Module, HttpModule } from '@nestjs/common';
import { RepoService } from './repo.service';

@Module({
  imports: [HttpModule],
  exports: [RepoService],
  providers: [RepoService]
})
export class RepoModule {}
