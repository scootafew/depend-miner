import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'src/common/repo/repo.model';
import { RepoService } from 'src/common/repo/repo.service';

@Injectable()
export class AnalyseService {

  constructor(
    @InjectQueue('analyse') private readonly analyseQueue: Queue,
    private readonly repoService: RepoService
    ) { }

  async processRepository(repo: Repository, emptyQueue?: boolean) {
    if (emptyQueue) { this.emptyQueue() };
    console.log(`Processing repository ${repo.fullName}`);

    this.analyseQueue.add({repo: repo}, {lifo: true}) // add job with lifo so this job will be processed as soon as worker is free
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${this.analyseQueue.name}`))
      .catch(err => console.log(err));
  }

  async getRepository(user: string, repo: string): Promise<Repository> {
    return this.repoService.fetchRepository(user, repo, "GitHub");
  }

  async getDependents() {
    
  }

  async addToQueue() {
    for (let i = 0; i < 10; i++) {
      await this.analyseQueue.add({job: i})
      .then(() => console.log(`Added job: ${i}`))
      .catch(err => console.log(err));
    }
    let queueLength = await this.analyseQueue.count();
    console.log(`${queueLength} jobs in queue...`);
  }

  emptyQueue() {
    this.analyseQueue.empty();
  }
}
