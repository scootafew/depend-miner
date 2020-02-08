import { Controller, Post, Req, Res, Param, NotFoundException } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AnalyseService } from './analyse.service';

@Controller('analyse')
export class AnalyseController {

  constructor(private readonly analyseService: AnalyseService ) {}

  @Post('github/:user/:repo')
  async postQueueHandler(@Req() req: FastifyRequest, @Param('user') user: string, @Param('repo') repoName: string, @Res() response: FastifyReply<any>) {
    let repo = await this.analyseService.getRepository(user, repoName);
    if (repo) {
      this.analyseService.processRepository(repo, true);
    } else {
      throw new NotFoundException(`Could not find repository "${user}/${repoName}"`);
    }
    response.code(200).send(`Processing "${repo.fullName}"...`);
  }
}
