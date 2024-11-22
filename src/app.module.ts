import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BitbucketModule } from './bitbucket/bitbucket.module';
import { PachkaModule } from './pachka/pachka.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    BitbucketModule,
    PachkaModule,
  ],
})
export class AppModule {}
