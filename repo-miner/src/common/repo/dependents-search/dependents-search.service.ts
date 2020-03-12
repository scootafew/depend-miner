import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { ArtifactJob, Repository, JobType, Artifact, AnalyseJob } from '@app/models';
import { GithubService } from '../github.service';
import { flatMap, map, take, filter } from 'rxjs/operators';

@Injectable()
export class DependentsSearchService {

  constructor(
    @InjectQueue('analyse') private readonly analyseQueue: Queue,
    @InjectQueue('dependentsSearch') private readonly dependentsSearchQueue: Queue,
    @InjectQueue('dependencySearch') private readonly dependencySearchQueue: Queue,
    private readonly repoService: GithubService
    ) {
      console.log("Created Dependents Search Service!");
      this.setupQueueProcessor(dependentsSearchQueue);
  }

  private setupQueueProcessor(queue: Queue) {
    queue.process(JobType.Artifact, async (job: Job<ArtifactJob>, done) => {
      const { artifact, searchDepth } = job.data;
      console.log("Getting dependents for artifact:", artifact);

      let query = this.buildQueryString(artifact);
      this.repoService.searchCode(query).pipe(
        flatMap(item => this.repoService.getRepositoryInBackground(item.repository.owner.login, item.repository.name, "GitHub").pipe(
          map(repo => {
            repo.pathToPomWithDependency = item.path;
            return repo;
          })
        )), // change to repo retrieval queue?
        filter(repo => !repo.isFork && repo.stars > 0),
        // take(10)
      ).subscribe(repo => {
        this.addRepoToQueue(this.analyseQueue, repo, searchDepth);
        // if ((searchDepth + 1) < +process.env.MAX_SEARCH_DEPTH) {
        //   this.addToQueue(this.dependentsSearchQueue, repo); // Need to limit depth
        //   // this.addToQueue(this.dependencySearchQueue, repo); // Need to limit depth
        // }
      })

      done();
    });
  }

  private buildQueryString(artifact: Artifact) {
    return `<artifactId>${artifact.artifactId}</artifactId> filename:pom extension:xml`;
    // return `<artifactId>${artifactId}</artifactId> <version>${version}</version> filename:pom extension:xml`;
  }

  // Duplicated code
  private async addRepoToQueue(queue: Queue, repo: Repository, previousSearchDepth: number, lifo: boolean = false) {
    queue.add(JobType.Repository, AnalyseJob.fromRepo(repo, previousSearchDepth + 1), {lifo: lifo})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${queue.name}`))
      .catch(err => console.log(err));
  }

}
