import { Test, TestingModule } from '@nestjs/testing';
import { DependentsSearchService } from './dependents-search.service';

describe('DependentsSearchService', () => {
  let service: DependentsSearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DependentsSearchService],
    }).compile();

    service = module.get<DependentsSearchService>(DependentsSearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
