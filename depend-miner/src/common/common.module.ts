import { Module, HttpModule } from '@nestjs/common';
import { MetricsService } from './metrics/metrics.service';

@Module({
  imports: [HttpModule],
  providers: [MetricsService],
  exports: [MetricsService]
})
export class CommonModule {}
