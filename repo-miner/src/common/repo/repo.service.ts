import { Injectable, HttpService } from '@nestjs/common';
import { map, catchError, expand, concatMap, delay, delayWhen, flatMap, mergeMap, tap } from 'rxjs/operators';
import { adapters } from './repo.adapters';
import { Observable, empty, of, interval, timer, BehaviorSubject } from 'rxjs';
import { Repository } from './repo.model';
import { AxiosError, AxiosResponse } from 'axios';
import * as parseLinkHeader from 'parse-link-header';
import { GithubRateLimit, GithubResourceRateLimits, GithubRateLimitResponse } from './rateLimit.model';
import { GitHubSearchResultRepository, GitHubSearchResult, GitHubCodeSearchResultItem } from './codeSearchResult';

@Injectable()
export class RepoService {

  GITHUB_API_TOKEN = process.env.GITHUB_API_TOKEN;

  options = {
    baseURL: "https://api.github.com",
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${this.GITHUB_API_TOKEN}`,
    }
  }

  rateLimits: BehaviorSubject<GithubResourceRateLimits> = new BehaviorSubject(null);

  constructor(private readonly http: HttpService) {
    this.getResourceRateLimits();
  }

  getResourceRateLimits() {
    this.http.get<GithubRateLimitResponse>('/rate_limit', this.options).subscribe(res => {
      this.rateLimits.next(res.data.resources);
    })
  }

  fetchRepository(user: string, repo: string, source: string): Observable<Repository> {
    console.log(`Fetching repo: ${user}/${repo}`);
    return this.http.get(`/repos/${user}/${repo}`, this.options).pipe(
      map(res => adapters.get(source + "Repository").adapt(res.data)),
      catchError((err: AxiosError) => {
        if (err.response?.status == 404) {
          console.log(`Repository ${user}/${repo} not found!`);
          return empty();
        }
        throw err;
      })
    );
  }

  // searchRepositories(query: string, source: string, sort?: string, order?: string): Observable<Repository> {
  //   return this.http.get(`/search/repositories`, {
  //     ...this.options,
  //     params: {
  //       'q': query,
  //       ...(sort ? { 'sort': sort } : {}),
  //       ...(order ? { 'order': order } : {}),
  //       'per_page': '2',
  //       'page': '1'
  //     }
  //   }).pipe(
  //     map(res => res.data.items.map((r: any) => adapters.get(source).adapt(r)))
  //   )
  // }

  // // credit https://medium.com/angular-in-depth/rxjs-understanding-expand-a5f8b41a3602
  // searchCode(query: string): Observable<any> {
  //   let initial_url = `/search/code?q=${query}&per_page=100`;
  //   return this.getPaginated(initial_url).pipe(
  //     expand(({ next, rateLimitRemaining, rateLimitReset }) => {
  //       if (next) {
  //         // this.getPaginated(next);
  //         if (rateLimitRemaining) {
  //           console.log("Rate limit not zero continuing...")
  //           return this.getPaginated(next);
  //         } else {
  //           console.log("Rate limit zero waiting...")
  //           // return of(delay(this.getDelay(rateLimitReset))).pipe(() => this.getPaginated(next));
  //           return this.getPaginated(next).pipe(
  //             concatMap(res => of(res).pipe(delay(10000)))
  //           )
  //         }
  //       } else {
  //         return empty();
  //       }
  //     }),
  //     concatMap(({ data }) => data)
  //   )
  // }

  // getDelay(rlr: number) {
  //   let delay = (rlr * 1000) - Date.now();
  //   console.log("Delay: " + delay);
  //   return delay;
  // }

  // getPaginated(url: string): Observable<{ data: any, next: string, rateLimitRemaining: number, rateLimitReset: number }> {
  //   console.log(url)
  //   return this.http.get(url, this.options)
  //     .pipe(
  //       map(res => {
  //         // console.log(res)
  //         let rateLimitRemaining = 0;
  //         let rateLimitReset = Math.ceil(Date.now() / 1000) + 10;
  //         // let rateLimitRemaining = res.headers['x-ratelimit-remaining'] || null;
  //         // let rateLimitReset = res.headers['x-ratelimit-reset'] || null;
  //         console.log(`Rate Limit Remaining: ${rateLimitRemaining}`);
  //         console.log(`Rate Limit Reset: ${rateLimitReset}`);
  //         let nextUrl = res!.headers['link'] ? parseLinkHeader(res.headers['link']).next?.url : null;

  //         // console.log("Next Url: " + nextUrl)

  //         let response = {
  //           data: res.data.items?.map((item: any) => item.repository?.full_name),
  //           next: nextUrl,
  //           rateLimitRemaining: rateLimitRemaining,
  //           rateLimitReset: rateLimitReset
  //         }
  //         return response;
  //       }),
  //       catchError((err: AxiosError) => {
  //         console.log("Error", err)
  //         throw err;
  //       })
  //     )
  // }

  // followLink(link: string) {
  //   return this.http.get(link);
  // }

  searchCodeTwo(query: string): Observable<GitHubCodeSearchResultItem> {
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
