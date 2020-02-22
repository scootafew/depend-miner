import { Injectable, HttpService, HttpStatus } from '@nestjs/common';
import { map, expand, concatMap, delay, mergeMap } from 'rxjs/operators';
import { adapters } from './repo.adapters';
import { Observable, empty, of, timer, BehaviorSubject, Subject } from 'rxjs';
import { Repository } from './repo.model';
import { AxiosError, AxiosResponse } from 'axios';
import * as parseLinkHeader from 'parse-link-header';
import { GithubRateLimit, GithubResourceRateLimits, GithubRateLimitResponse } from './rateLimit.model';
import { GitHubSearchResult, GitHubCodeSearchResultItem } from './codeSearchResult';
import { PendingRequest } from './pendingRequest';

@Injectable()
export class RepoService {

  options = {
    baseURL: "https://api.github.com",
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${process.env.GITHUB_API_TOKEN}`,
    }
  }

  requestSubject: Subject<PendingRequest> = new Subject();

  rateLimits: BehaviorSubject<GithubResourceRateLimits> = new BehaviorSubject(null);

  constructor(private readonly http: HttpService) {
    this.getResourceRateLimits();
    this.setupRateLimitedSubject(1000);
  }

  getResourceRateLimits(): void {
    this.http.get<GithubRateLimitResponse>('/rate_limit', this.options).subscribe(res => {
      this.rateLimits.next(res.data.resources);
    })
  }

  // TODO improve by not delaying the first request
  private setupRateLimitedSubject(rate: number): void {
    this.requestSubject.pipe(
      concatMap(item => of(item).pipe(delay(rate))) // Delay request by rate param (milliseconds)
    ).subscribe(pending => {
      this.execute(pending);
    })
  }

  getRepository(user: string, repo: string, source: string): Observable<Repository> {
    return this.addRequestToQueue(`/repos/${user}/${repo}`);
  }

  private addRequestToQueue(url: string): Observable<Repository> {
    const sub = new Subject<Repository>();
    const request = new PendingRequest(url, sub);

    this.requestSubject.next(request);
    return sub;
  }

   // Credit https://stackoverflow.com/questions/48021728/add-queueing-to-angulars-httpclient
  private execute(request: PendingRequest): void {
    console.log(`Getting url ${request.url}`)
    this.http.get(request.url, this.options).pipe(
      map(res => adapters.get("GitHubRepository").adapt(res.data)),
    ).subscribe(res => {
      request.subscription.next(res)
      request.subscription.complete();
    }, (err: AxiosError) => {
      if (err.response?.status == HttpStatus.NOT_FOUND) {
        console.log(`Repository at ${request.url} not found!`);
        request.subscription.complete();
      } else {
        throw err;
      }
    });
  }

  searchCode(query: string): Observable<GitHubCodeSearchResultItem> {
    let url = `https://api.github.com/search/code?q=${query}&per_page=100`;
    let rateLimit = {
      limit: 30,
      remaining: 30,
      reset: Math.ceil(Date.now() / 1000) + 10
    }
    return this.getPages<GitHubCodeSearchResultItem>(url, this.options, rateLimit);
  }

  getPages<T>(url: string, options: any, limit: GithubRateLimit): Observable<T> {
    return this.getPage<T>(url, options, limit).pipe(
      expand(({ next, rateLimit }) => next ? this.getPage<T>(next, options, rateLimit) : empty()),
      concatMap(({ data }) => data)
    )
  }

  getPage<T>(url: string, options: any, rateLimit: GithubRateLimit): Observable<{ data: T[], next: string, rateLimit: GithubRateLimit }> {
    return this.get<T>(url, options, rateLimit)
      .pipe(
        map(res => {
          // console.log(res)
          let rateLimit = this.parseRateLimit(res);
          console.log(`Rate Limit Remaining: ${rateLimit.remaining}`);
          console.log(`Rate Limit Reset: ${rateLimit.reset}`);
          let nextUrl = res!.headers['link'] ? parseLinkHeader(res.headers['link']).next?.url : null;

          // console.log("Next Url: " + nextUrl)

          return {
            data: res.data.items,
            next: nextUrl,
            rateLimit: rateLimit
          }
        })
      )
  }

  private get<T>(url: string, options: any, rateLimit: GithubRateLimit): Observable<AxiosResponse<GitHubSearchResult<T>>> {
    return this.waitForRateLimit(rateLimit)
      .pipe(
        mergeMap(() => this.http.get<GitHubSearchResult<T>>(url, options))
      );
  }

  private waitForRateLimit(rateLimit: GithubRateLimit): Observable<any> {
    if (!rateLimit.remaining) {
      const secondsDelay = 5;
      const resetDate = new Date((rateLimit.reset * 1000) + secondsDelay);

      console.log("Waiting until: ", resetDate)

      return timer(resetDate);
    } else {
      return of(null);
    }
  }

  private parseRateLimit(res: AxiosResponse<any>): GithubRateLimit {
    return {
      limit: res.headers['x-ratelimit-limit'] ? Number(res.headers['x-ratelimit-limit']) : 0,
      remaining: res.headers['x-ratelimit-remaining'] ? Number(res.headers['x-ratelimit-remaining']) : 0,
      reset: res.headers['x-ratelimit-reset'] ? Number(res.headers['x-ratelimit-reset']) : 0
    }
  }

}
