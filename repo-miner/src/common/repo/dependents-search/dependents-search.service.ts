import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { RepositoryJob, Repository } from '@app/models';
import { GithubService } from '../github.service';
import { flatMap, map } from 'rxjs/operators';

@Injectable()
export class DependentsSearchService {

  constructor(
    @InjectQueue('analyse') private readonly analyseQueue: Queue,
    @InjectQueue('dependentsSearch') private readonly dependentsSearchQueue: Queue,
    @InjectQueue('dependencySearch') private readonly dependencySearchQueue: Queue,
    private readonly repoService: GithubService
    ) {
      this.setupQueueProcessor(dependentsSearchQueue);
  }

  private setupQueueProcessor(queue: Queue) {
    queue.process(async (job: Job<RepositoryJob>, done) => {
      const repo = job.data.repo;
      console.log("Getting dependents for repository:", repo.latestArtifact);

      let query = this.buildQueryString(repo);
      this.repoService.searchCode(query).pipe(
        flatMap(item => this.repoService.getRepositoryInBackground(item.repository.owner.login, item.repository.name, "GitHub")), // change to repo search queue?
        map(dependent => this.setDepth(dependent, repo.depthFromSearchRoot++))
      ).subscribe(repo => {
        this.addToQueue(this.analyseQueue, repo);
        // if (repo.depthFromSearchRoot < +process.env.MAX_SEARCH_DEPTH) {
        //   this.addToQueue(this.dependentsSearchQueue, repo); // Need to limit depth
        //   this.addToQueue(this.dependencySearchQueue, repo); // Need to limit depth
        // }
      })

      done();
    });
  }

  private buildQueryString(repo: Repository) {
    const { artifactId, version } = repo.latestArtifact;
    return `<artifactId>${artifactId}</artifactId> filename:pom extension:xml`;
    // return `<artifactId>${artifactId}</artifactId> <version>${version}</version> filename:pom extension:xml`;
  }

  // Duplicated code
  private async addToQueue(queue: Queue, repo: Repository, lifo: boolean = false) {
    queue.add({repo: repo}, {lifo: lifo})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${queue.name}`))
      .catch(err => console.log(err));
  }

  private setDepth(repo: Repository, depth: number) {
    repo.depthFromSearchRoot = depth;
    return repo;
  }

}
