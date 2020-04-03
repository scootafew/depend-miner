import { Module } from '@nestjs/common';
import { MetricsService } from './metrics/metrics.service';

@Module({
  providers: [MetricsService],
  exports: [MetricsService]
})
export class CommonModule {}
