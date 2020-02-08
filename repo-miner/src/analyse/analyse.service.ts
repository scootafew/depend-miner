import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Repository, Artifact } from 'src/common/repo/repo.model';
import { RepoService } from 'src/common/repo/repo.service';
import { map } from 'rxjs/operators';

@Injectable()
export class AnalyseService {

  constructor(
    @InjectQueue('analyse') private readonly analyseQueue: Queue,
    private readonly repoService: RepoService
    ) { }

  async processRepository(repo: Repository, emptyQueue?: boolean) {
    if (emptyQueue) { this.emptyQueue() };
    console.log(`Processing repository ${repo.fullName}`);

    // add job to queue with lifo so this job will be processed as soon as worker is free
    this.analyseQueue.add({repo: repo}, {lifo: true})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${this.analyseQueue.name}`))
      .catch(err => console.log(err));

    // begin search for depencies and dependents
    this.getDependencies(repo);
    this.getDependents(repo);
  }

  async getRepository(user: string, repo: string, latestArtifact?: Artifact): Promise<Repository> {
    return this.repoService.fetchRepository(user, repo, "GitHub")
      .pipe(
        map(repo => this.setLatestReleaseArtifact(repo, latestArtifact))
      ).toPromise();
  }

  async setLatestReleaseArtifact(repo: Repository, artifact?: Artifact) {
    if (artifact) {
      repo.latestArtifact = artifact;
    }
    return repo;
  }

  async getDependencies(repo: Repository) {
    console.log(`Getting dependencies for ${repo.fullName}`);


  }

  async getDependents(repo: Repository) {
    console.log("Getting dependents for: ", repo.latestArtifact);


  }

  // async addToQueue() {
  //   for (let i = 0; i < 10; i++) {
  //     await this.analyseQueue.add({job: i})
  //     .then(() => console.log(`Added job: ${i}`))
  //     .catch(err => console.log(err));
  //   }
  //   let queueLength = await this.analyseQueue.count();
  //   console.log(`${queueLength} jobs in queue...`);
  // }

  emptyQueue() {
    this.analyseQueue.empty();
  }
}
