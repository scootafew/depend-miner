import { Controller, Post, Req, Res, Param, NotFoundException, Query } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AnalyseService } from './analyse.service';

@Controller('analyse')
export class AnalyseController {

  constructor(private readonly analyseService: AnalyseService ) {}

  @Post('github/:user/:repo')
  async postQueueHandler(
    @Req() req: FastifyRequest,
    @Param('user') user: string,
    @Param('repo') repoName: string,
    @Query('resetQueus') resetQueues: boolean,
    @Res() response: FastifyReply<any>) {
    let repo = await this.analyseService.getRepository(user, repoName);
    if (repo) {
      this.analyseService.processRepository(repo, resetQueues);
    } else {
      throw new NotFoundException(`Could not find repository '${user}/${repoName}'`);
    }
    response.code(200).send(`Processing "${repo.fullName}"...`);
  }

  @Post('maven')
  async postArtifactHandler(
    @Req() req: FastifyRequest,
    @Query('artifact') artifact: string,
    @Query('resetQueus') resetQueues: boolean,
    @Res() response: FastifyReply<any>) {
    this.analyseService.processArtifact(artifact, resetQueues);
    response.code(200).send(`Processing "${artifact}"...`);
  }

  @Post('stop')
  async stop() {
    this.analyseService.emptyQueues();
  }
}
