import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Repository, Artifact } from '@app/models';
import { GithubService } from 'src/common/repo/github.service';
import { map } from 'rxjs/operators';

@Injectable()
export class AnalyseService {

  constructor(
    @InjectQueue('analyse') private readonly analyseQueue: Queue,
    @InjectQueue('repositorySearch') private readonly repositorySearchQueue: Queue,
    @InjectQueue('dependentsSearch') private readonly dependentsSearchQueue: Queue,
    @InjectQueue('dependencySearch') private readonly dependencySearchQueue: Queue,
    private readonly repoService: GithubService
    ) { }

  async processRepository(repo: Repository, emptyQueue?: boolean) {
    if (emptyQueue) { this.emptyQueue() };
    console.log(`Processing repository ${repo.fullName}`);

    repo.depthFromSearchRoot = 0;

    // add job to queue with lifo so this job will be processed as soon as worker is free
    this.addToQueue(this.analyseQueue, repo, true);

    // begin search for depencies and dependents
    this.getDependencies(repo);
    this.getDependents(repo);
  }

  private async addToQueue(queue: Queue, repo: Repository, lifo: boolean = false) {
    queue.add({repo: repo}, {lifo: lifo})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${queue.name}`))
      .catch(err => console.log(err));
  }

  async getRepository(user: string, repo: string, latestArtifact?: Artifact): Promise<Repository> {
    return this.repoService.getRepository(user, repo, "GitHub")
      .pipe(
        map(repo => this.setLatestReleaseArtifact(repo, latestArtifact))
      ).toPromise();
  }

  setLatestReleaseArtifact(repo: Repository, artifact?: Artifact) {
    console.log(`Setting latest artifact on ${repo.fullName}`);
    if (artifact) {
      repo.latestArtifact = artifact;
    }
    return repo;
  }

  async getDependencies(repo: Repository) {
    console.log(`Getting dependencies for ${repo.fullName}`);
    this.addToQueue(this.dependencySearchQueue, repo);

  }

  async getDependents(repo: Repository) {
    this.addToQueue(this.dependentsSearchQueue, repo);
  }

  emptyQueue() {
    this.analyseQueue.empty();
    this.repositorySearchQueue.empty();
    this.dependencySearchQueue.empty();
    this.dependentsSearchQueue.empty();
  }
}
