import { Injectable, HttpService } from '@nestjs/common';
import { map, catchError, expand, concatMap } from 'rxjs/operators';
import { adapters } from './repo.adapters';
import { Observable, empty } from 'rxjs';
import { Repository } from './repo.model';
import { AxiosError } from 'axios';
import * as parseLinkHeader from 'parse-link-header';

@Injectable()
export class RepoService {

  GITHUB_API_TOKEN = process.env.GITHUB_API_TOKEN;

  options = {
    baseURL: "https://api.github.com",
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${this.GITHUB_API_TOKEN}`
    }
  }

  constructor(private readonly http: HttpService) { }

  fetchRepository(user: string, repo: string, source: string): Observable<Repository> {
    return this.http.get(`/repos/${user}/${repo}`, this.options).pipe(
      map(res => adapters.get(source + "Repository").adapt(res.data)),
      catchError((err: AxiosError) => {
        if (err.response?.status == 404) {
          return empty();
        }
        throw err;
      })
    );
  }

  searchRepositories(query: string, source: string, sort?: string, order?: string): Observable<Repository> {
    return this.http.get(`/search/repositories`, {
      ...this.options,
      params: {
        'q': query,
        ...(sort ? { 'sort': sort } : {}),
        ...(order ? { 'order': order } : {}),
        'per_page': '2',
        'page': '1'
      }
    }).pipe(
      map(res => res.data.items.map((r: any) => adapters.get(source).adapt(r)))
    )
  }

  // credit https://medium.com/angular-in-depth/rxjs-understanding-expand-a5f8b41a3602
  searchCode(query: string): Observable<any> {
    let initial_url = `search/code?q=${query}&per_page=100`;
    return this.getPaginated(initial_url).pipe(
      expand(({ next }) => next ? this.getPaginated(next) : empty()),
      concatMap(({ data }) => data)
    )
  }

  getPaginated(url: string): Observable<{data: any, next: string}> {
    return this.http.get(url)
    .pipe(
      map(res => {
        let rateLimitRemaining = res.headers['X-RateLimit-Remaining'];
        let links = parseLinkHeader(res.headers['Link']);

        let response = {
          data: res.data.items?.map((item: any) => item.repository?.full_name),
          next: links.next.url,
        }
        return response;
      })
    )
  }

  followLink(link: string) {
    return this.http.get(link);
  }

}
