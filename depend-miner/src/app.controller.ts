import { Controller, Get, Res, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { MetricsService } from './common/metrics/metrics.service';
import { FastifyReply } from 'fastify';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService, private readonly metricsService: MetricsService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/metrics')
  getMetrics(@Res() response: FastifyReply<any>) {
    return response.code(200).header('Content-Type', this.metricsService.contentType).send(this.metricsService.getMetrics());
  }

  @Get('/workers/:endpoint')
  async scrapeWorkers(@Param('endpoint') endpoint: string, @Res() response: FastifyReply<any>) {
    let result = await this.metricsService.scrapeWorkerEndpoints(endpoint);
    console.log("Result: ", result);
    return response.code(200).header('Content-Type', "text/plain").send(result);
  }
}
