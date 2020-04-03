import { Injectable } from '@nestjs/common';
import * as promClient from 'prom-client';
import { Registry, Histogram, Counter, Metric } from 'prom-client';

@Injectable()
export class MetricsService {

  private metricsRegistry = new Registry();
  private intervalCollector = promClient.collectDefaultMetrics({prefix: 'node_manager_'});

  private counterRegistry = {
    httpRequest: new Counter({
      name: 'http_request_total',
      help: "How many http requests have been made",
      labelNames: ['destination']
    }),
    httpResponse: new Counter({
      name: 'http_response_total',
      help: "How many http responses have been received",
      labelNames: ['destination', 'status_code']
    })
  };


  private histogramRegistry = {
    requestRetries: new Histogram({
      name: 'http_request_retries',
      help: 'How many times a http request has been retried',
      labelNames: ['endpoint'],
      buckets: [1,2,3]
    })
  };

  private localRegistries: {[key: string]: Metric<string>}[] = [this.counterRegistry, this.histogramRegistry];

  constructor() {
    this.localRegistries.forEach(registry => {
      for (let key in registry) {
        this.metricsRegistry.registerMetric(registry[key]);
      }
    })
  }

  get contentType() {
    return promClient.register.contentType;
  }

  /**
   * Returns data for Prometheus to scrape
   */
  getMetrics() {
    return promClient.register.metrics();
  }

  getCounter(name: string): Counter<string> {
    return this.counterRegistry[name];
  }

  getHistogram(name: string): Histogram<string> {
    return this.histogramRegistry[name];
  }

  get counters() {
    return this.counterRegistry;
  }

  get histograms() {
    return this.histogramRegistry;
  }

}
