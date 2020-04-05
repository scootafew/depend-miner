import { Injectable, HttpService } from '@nestjs/common';
import * as promClient from 'prom-client';
import { Registry, Histogram, Counter, Metric } from 'prom-client';
import { Resolver } from 'dns';
import { Observable, of, forkJoin, empty } from 'rxjs';
import { mergeMap, map, catchError } from 'rxjs/operators';

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

  constructor(private readonly http: HttpService) {
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

  async scrapeWorkerEndpoints(endpoint: string): Promise<string> {
    const dnsResolver = new Resolver();

    return new Promise(async (resolve, reject) => {
      dnsResolver.resolve(process.env.WORKER_SVC_NAME, (err, addresses) => {
        if (err) {
          reject(err);
        }
        console.log(`Found workers at IP's: `, addresses);
        return of(addresses).pipe(
          mergeMap(addresses => {
            return forkJoin(addresses.map(address => {
              return this.scrapeWorkerEndpoint(address, endpoint)
            }))
          })
        ).subscribe(result => {
          resolve(result.join("\n"));
        })
      })
    })
  }

  scrapeWorkerEndpoint(ip: string, endpoint: string): Observable<any> {
    return this.http.get(`http://${ip}:3000/${endpoint}`).pipe(
      map(res => res.data),
      catchError(err => {
        console.log(`Error in response from worker at ${ip}`);
        return of("");
      })
    );
  }

}
