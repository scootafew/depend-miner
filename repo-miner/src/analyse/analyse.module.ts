import { Module } from '@nestjs/common';
import { AnalyseController } from './analyse.controller';
import { AnalyseService } from './analyse.service';
import { RepoModule } from 'src/common/repo/repo.module';

@Module({
  imports: [RepoModule],
  controllers: [AnalyseController],
  providers: [AnalyseService]
})
export class AnalyseModule {}
