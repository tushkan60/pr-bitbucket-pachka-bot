import { Module } from '@nestjs/common';
import { BitbucketService } from './bitbucket.service';
import { PachkaModule } from '../pachka/pachka.module';

@Module({
  imports: [PachkaModule],
  providers: [BitbucketService],
  exports: [BitbucketService],
})
export class BitbucketModule {}
