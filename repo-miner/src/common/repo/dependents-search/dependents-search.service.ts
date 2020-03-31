import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { ArtifactJob, Repository, JobType, Artifact, AnalyseJob, RepositoryFetchJob } from '@app/models';
import { GithubService } from '../github.service';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { DoneCallback } from 'bull';

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
      console.log("Getting dependents for artifact:", artifact);

      let query = this.buildQueryString(artifact);
      this.repoService.searchCode(query).pipe(
        map(item => ({user: item.repository.owner.login, repoName: item.repository.name, searchDepth: searchDepth}))
      ).subscribe(repoFetchJob => {
        console.log(`\u001b[1;36m Added ${repoFetchJob.user}/${repoFetchJob.repoName} to queue ${this.repositoryFetchQueue.name} in DSS`);
        const jobOptions = {jobId: `${repoFetchJob.user}/${repoFetchJob.user}`}; // overriding job ID prevents duplicates as won't be unique
        
        this.repositoryFetchQueue.add(repoFetchJob, jobOptions).catch(reason => console.log("\u001b[1;31m ERROR: " + reason));
      })

      done();
    });
  }

  private setupRepositoryFetchQueueProcessor() {
    this.repositoryFetchQueue.process(async (job: Job<RepositoryFetchJob>, done) => {
      const {user, repoName, searchDepth} = job.data;
      console.log(`\u001b[1;36m Processing ${user}/${repoName} from queue ${this.repositoryFetchQueue.name} in DSS`);
      this.repoService.getRepositoryInBackground(user, repoName, "GitHub").toPromise().then(repo => {
        console.log(`In sub with repo ${repo.fullName}, stars: ${repo.stars}, fork: ${repo.isFork}`)
        if (!repo.isFork && repo.stars > 0) {
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
