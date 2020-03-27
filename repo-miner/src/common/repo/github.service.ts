import { Injectable, HttpService, HttpStatus } from '@nestjs/common';
import { map, expand, concatMap, mergeMap, take, filter, tap, catchError, retryWhen } from 'rxjs/operators';
import { Observable, empty, of, timer, BehaviorSubject, Subject } from 'rxjs';
import { Repository, adapters } from '@app/models';
import { AxiosResponse } from 'axios';
import * as parseLinkHeader from 'parse-link-header';
import { GithubRateLimit, GithubRateLimitResponse, RateLimitType } from './rateLimit.model';
import { GitHubSearchResult, GitHubCodeSearchResultItem } from './codeSearchResult';
import { PendingRequest } from './pendingRequest';
import { genericRetryStrategy } from './http.helpers';
import * as BullQueue from 'bull';
import { Job } from 'bull';

type RateLimits = {
  [key in RateLimitType]: BehaviorSubject<GithubRateLimit>
}

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
}

// Credit https://stackoverflow.com/questions/48021728/add-queueing-to-angulars-httpclient
// Credit https://github.com/andrewseguin/dashboard/blob/d1bf6e1d87ec2fd1bf38417757576c30514b0145/src/app/service/github.ts
@Injectable()
export class GithubService {

  private repositoryFetchQueue = new BullQueue('githubRepositoryFetchQueue', {
    redis: REDIS_CONFIG,
    limiter: {
      duration: 2000, // every 5 seconds
      max: 1, // 1 jobs
      bounceBack: false
    }
  });  

  options = {
    baseURL: "https://api.github.com",
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${process.env.GITHUB_API_TOKEN}`,
    }
  }

  backgroundRequestQueue$: Subject<PendingRequest> = new Subject();  // Could potentially replace with another Bull queue

  rateLimits: RateLimits = {
    [RateLimitType.Core]: new BehaviorSubject(null),
    [RateLimitType.Search]: new BehaviorSubject(null)
  }

  constructor(private readonly http: HttpService) {
    this.getResourceRateLimits();
    this.setupQueueProcessor();
  }

  private getResourceRateLimits(): void {
    this.http.get<GithubRateLimitResponse>('/rate_limit', this.options).subscribe(res => {
      
      this.rateLimits[RateLimitType.Core].next(res.data.resources.core);
      this.rateLimits[RateLimitType.Search].next(res.data.resources.search);
    })
  }

  private setupQueueProcessor(): void {
    this.repositoryFetchQueue.process(async (job: Job) => {
      console.log(`\u001b[1;31m Processing ${job.data.url} from queue`);
      const repo = await this.execute(job.data).toPromise();
      return Promise.resolve(repo);
    })
  }

  getRepository(user: string, repoName: string, source: string): Observable<Repository> {
    const request = new PendingRequest(`/repos/${user}/${repoName}`, RateLimitType.Core);
    let resSubject = new Subject<Repository>();
    this.repositoryFetchQueue.add(request, {lifo: true}).then((job: Job) => {
      console.log(`\u001b[1;32m Added job ${user}/${repoName} to queue ${this.repositoryFetchQueue.name} in GHS`);
      job.finished().then(res => {
        resSubject.next(res);
        resSubject.complete();
      })
    });

    return resSubject.asObservable();
  }

  getRepositoryInBackground(user: string, repoName: string, source: string): Observable<Repository> {
    console.log("\u001b[1;32m Listeners: " + this.repositoryFetchQueue.listenerCount('completed'));
    const resultSubject = new Subject<Repository>();
    const request = new PendingRequest(`/repos/${user}/${repoName}`, RateLimitType.Core);

    this.repositoryFetchQueue.add(request).then((job: Job) => {
      job.finished().then((result: Repository) => {
        resultSubject.next(result);
        resultSubject.complete();
      })
    }).catch(reason => console.log("\u001b[1;31m ERROR: " + reason));

    return resultSubject.asObservable();
  }

  searchCode(query: string): Observable<GitHubCodeSearchResultItem> {
    let url = `https://api.github.com/search/code?q=${query}&per_page=100`;
    return this.getPages<GitHubCodeSearchResultItem>(url, this.options, RateLimitType.Core);
  }

  private execute(request: PendingRequest): Observable<Repository> {
    console.log(`Getting url ${request.url}`)
    return this.get<any>(request.url, this.options, request.rateLimitType).pipe(
      map(res => adapters.get("GitHubRepository").adapt(res.data)),
      catchError((err: any) => {
        if (err.response?.status == HttpStatus.NOT_FOUND) {
          console.log(`Repository at ${request.url} not found!`);
          return empty();
        } else {
          throw err;
        }
      })
    );
  }

  private getPages<T>(url: string, options: any, rateLimitType: RateLimitType): Observable<T> {
    return this.getPage<T>(url, options, rateLimitType).pipe(
      expand(({ next }) => next ? this.getPage<T>(next, options, rateLimitType) : empty()),
      concatMap(({ data }) => data)
    )
  }

  private getPage<T>(url: string, options: any, rateLimitType: RateLimitType): Observable<{ data: T[], next: string }> {
    return this.get<GitHubSearchResult<T>>(url, options, rateLimitType)
      .pipe(
        map(res => {
          const rateLimit = this.parseRateLimit(res);
          console.log(`Rate Limit Remaining: ${rateLimit.remaining}`);
          console.log(`Rate Limit Reset: ${rateLimit.reset}`);
          const nextUrl = res!.headers['link'] ? parseLinkHeader(res.headers['link']).next?.url : null;

          return {
            data: res.data.items,
            next: nextUrl
          }
        })
      )
  }

  private get<T>(url: string, options: any, rateLimitType: RateLimitType): Observable<AxiosResponse<T>> {
    return this.waitForRateLimit(rateLimitType)
      .pipe(
        mergeMap(() => this.http.get<T>(url, options).pipe(
          retryWhen(genericRetryStrategy({ excludedStatusCodes: [403, 404] }))
        )),
        tap(response => this.updateRateLimit(rateLimitType, response))
      );
  }

  private waitForRateLimit(rateLimitType: RateLimitType): Observable<any> {
    return this.rateLimits[rateLimitType].pipe(
      filter(v => !!v), take(1), mergeMap(rateLimit => {
        if (!rateLimit.remaining) {
          const secondsDelay = 5;
          const resetDate = new Date((rateLimit.reset * 1000) + secondsDelay);
    
          console.log("Waiting until: ", resetDate)
    
          return timer(resetDate); // TODO fix requests piling up waiting to all be released at the same time (if waiting should be timer at queue level)
        } else {
          console.log(`Actual rate limit remaining: ${rateLimit.remaining}`)
          return of(null);
        }
      }));
  }

  private updateRateLimit(type: RateLimitType, response: AxiosResponse<any>|null) {
    if (!response) {
      return;
    }

    const {reset, limit, remaining} = this.parseRateLimit(response);
    this.rateLimits[type].pipe(filter(v => !!v), take(1)).subscribe(rateLimit => {
      rateLimit = {reset, limit, remaining};
      this.rateLimits[type].next(rateLimit);
    });
  }

  private parseRateLimit(res: AxiosResponse<any>): GithubRateLimit {
    return {
      limit: res.headers['x-ratelimit-limit'] ? Number(res.headers['x-ratelimit-limit']) : 0,
      remaining: res.headers['x-ratelimit-remaining'] ? Number(res.headers['x-ratelimit-remaining']) : 0,
      reset: res.headers['x-ratelimit-reset'] ? Number(res.headers['x-ratelimit-reset']) : 0
    }
  }

}
