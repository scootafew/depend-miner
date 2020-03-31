import { Controller, Get, Res } from '@nestjs/common';
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
}
