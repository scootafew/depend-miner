import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { ArtifactJob, Repository, JobType, Artifact, AnalyseJob, RepositoryFetchJob } from '@app/models';
import { GithubService } from '../github.service';
import { map, count } from 'rxjs/operators';

@Injectable()
export class DependentsSearchService {

  constructor(
    @InjectQueue('analyse') private readonly analyseQueue: Queue,
    @InjectQueue('repositoryFetch') private readonly repositoryFetchQueue: Queue<RepositoryFetchJob>,
    @InjectQueue('dependentsSearch') private readonly dependentsSearchQueue: Queue,
    private readonly repoService: GithubService
    ) {
      this.setupQueueProcessor();
      this.setupRepositoryFetchQueueProcessor();
  }

  private setupQueueProcessor() {
    this.dependentsSearchQueue.process(JobType.Artifact, async (job: Job<ArtifactJob>, done) => {
      const { artifact, searchDepth } = job.data;
      console.log("\u001b[1;31m Getting dependents for artifact:", artifact);

      let query = this.buildQueryString(artifact);
      this.repoService.searchCode(query).pipe(
        map(item => ({user: item.repository.owner.login, repoName: item.repository.name, searchDepth: searchDepth})),
        map(repoFetchJob => {
          const jobOptions = {jobId: `${repoFetchJob.user}/${repoFetchJob.user}`}; // overriding job ID prevents duplicates as won't be unique
          this.repositoryFetchQueue.add(repoFetchJob, jobOptions).catch(reason => console.log("\u001b[1;31m ERROR: " + reason));
        }),
        count()
      ).subscribe(count => {
        console.log(`\u001b[1;36m Added ${count} items to queue ${this.repositoryFetchQueue.name} in DSS`);
        done(null, count);
      })

      // done();
    });
  }

  private setupRepositoryFetchQueueProcessor() {
    this.repositoryFetchQueue.process(async (job: Job<RepositoryFetchJob>, done) => {
      const {user, repoName, searchDepth} = job.data;
      this.repoService.getRepositoryInBackground(user, repoName, "GitHub").toPromise().then(repo => {
        if (!repo.isFork && repo.stars >= (+process.env.MIN_STAR_COUNT || 3)) {
          console.log(`Repo ${repo.fullName}, stars: ${repo.stars}, fork: ${repo.isFork}`)
          this.addRepoToQueue(this.analyseQueue, repo, searchDepth);
        }
        done();
      })
    })
  }

  private buildQueryString(artifact: Artifact) {
    return `<artifactId>${artifact.artifactId}</artifactId> filename:pom extension:xml`;
    // return `<artifactId>${artifactId}</artifactId> <version>${version}</version> filename:pom extension:xml`;
  }

  // Duplicated code
  private async addRepoToQueue(queue: Queue, repo: Repository, previousSearchDepth: number, lifo: boolean = false) {
    console.log(`\u001b[1;35m Adding repo: ${repo.fullName} to queue ${queue.name}`);
    queue.add(JobType.Repository, AnalyseJob.fromRepo(repo, previousSearchDepth + 1), {lifo: lifo})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${queue.name}`))
      .catch(err => console.log(err));
  }

}
