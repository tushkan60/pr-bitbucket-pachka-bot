import { Module } from '@nestjs/common';
import { PachkaService } from './pachka.service';
import { MessageStoreService } from './store/message-store.service';

@Module({
  providers: [PachkaService, MessageStoreService],
  exports: [PachkaService, MessageStoreService],
})
export class PachkaModule {}
