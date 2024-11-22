import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

interface MessageStore {
  [prId: number]: {
    messageId: string;
    repository: string;
    updatedAt: string;
  };
}

@Injectable()
export class MessageStoreService implements OnModuleInit {
  private readonly logger: Logger = new Logger(MessageStoreService.name);

  private store: MessageStore = {};

  private readonly storePath: string = path.join(
    __dirname,
    '..',
    '..',
    'message-store.json',
  );

  async onModuleInit(): Promise<void> {
    await this.initializeStore();
    this.logger.debug('Initial store contents:', this.store);
  }

  private async initializeStore(): Promise<void> {
    try {
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });

      try {
        const data = await fs.readFile(this.storePath, 'utf8');
        this.store = JSON.parse(data);
        this.logger.log('Message store loaded successfully:', {
          entries: Object.keys(this.store).length,
          path: this.storePath,
        });
      } catch (error) {
        if (error.code === 'ENOENT') {
          await this.saveStore();
          this.logger.log('Created new message store');
        } else {
          throw error;
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize message store:', error);
      throw error;
    }
  }

  private async saveStore(): Promise<void> {
    try {
      const content = JSON.stringify(this.store, null, 2);
      this.logger.debug('Writing store to file:', {
        path: this.storePath,
        entries: Object.keys(this.store).length,
        content: content.substring(0, 100) + '...',
      });

      await fs.writeFile(this.storePath, content, 'utf8');

      const savedContent = await fs.readFile(this.storePath, 'utf8');
      const parsedContent = JSON.parse(savedContent);

      this.logger.debug('Store file saved and verified:', {
        entriesInFile: Object.keys(parsedContent).length,
        entriesInMemory: Object.keys(this.store).length,
      });
    } catch (error) {
      this.logger.error('Failed to save store:', error);
      throw error;
    }
  }

  async getMessageId(prId: number): Promise<string | null> {
    const stored = this.store[prId]?.messageId;
    this.logger.debug('Retrieved message ID:', {
      prId,
      storedId: stored || 'none',
    });
    return stored || null;
  }

  async saveMessageId(
    prId: number,
    messageId: string,
    repository: string,
  ): Promise<void> {
    this.logger.debug('Saving message ID:', {
      prId,
      messageId,
      repository,
    });

    if (!messageId || !prId || !repository) {
      throw new Error('Invalid message data for storage');
    }

    this.store[prId] = {
      messageId,
      repository,
      updatedAt: new Date().toISOString(),
    };

    await this.saveStore();

    const storedId = await this.getMessageId(prId);
    if (storedId !== messageId) {
      this.logger.error('Message ID verification failed:', {
        stored: storedId,
        expected: messageId,
      });
      throw new Error('Message ID verification failed');
    }

    this.logger.debug('Message ID saved and verified:', {
      prId,
      messageId,
      repository,
    });
  }

  async removePR(prId: number, repository: string): Promise<void> {
    this.logger.debug('Attempting to remove PR:', {
      prId,
      repository,
    });

    const storedPR = this.store[prId];
    if (!storedPR) {
      this.logger.debug('PR not found in store:', { prId });
      return;
    }

    if (storedPR.repository !== repository) {
      this.logger.warn('Repository mismatch during PR removal:', {
        prId,
        storedRepository: storedPR.repository,
        requestedRepository: repository,
      });
      return;
    }

    delete this.store[prId];

    await this.saveStore();

    if (this.store[prId]) {
      this.logger.error('PR removal verification failed:', { prId });
      throw new Error('PR removal verification failed');
    }

    this.logger.debug('PR successfully removed from store:', {
      prId,
      repository,
    });
  }

  async getAllPRs(): Promise<
    Array<{ prId: string; repository: string; messageId: string }>
  > {
    return Object.entries(this.store).map(([prId, data]) => ({
      prId,
      repository: data.repository,
      messageId: data.messageId,
    }));
  }

  getStorePath(): string {
    return this.storePath;
  }
}
