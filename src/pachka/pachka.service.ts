import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { PullRequest } from '../bitbucket/interfaces/pull-request.interface';
import { MessageStoreService } from './store/message-store.service';
import { Cron, CronExpression } from '@nestjs/schedule';

interface QueuedMessage {
  message: string;
  parentMessageId?: string;
  prId?: number;
  repository?: string;
  retries: number;
}

interface StoredPR {
  prId: string;
  repository: string;
  messageId: string;
}

type ReviewerMappings = {
  [key: string]: string;
};

@Injectable()
export class PachkaService {
  private readonly logger: Logger = new Logger(PachkaService.name);

  private readonly apiClient?: AxiosInstance;

  private readonly messageQueue: QueuedMessage[] = [];

  private isProcessing = false;

  private readonly MAX_RETRIES = 3;

  private readonly chatId = this.configService.get('pachka.chatId');

  private readonly reviewerMappings: ReviewerMappings = JSON.parse(
    this.configService.get('pachka.reviewers') || '{}',
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly messageStore: MessageStoreService,
  ) {
    const apiToken = this.configService.get('pachka.botToken');
    const apiUrl = this.configService.get('pachka.apiUrl');

    this.apiClient = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${apiToken}`,
      },
    });
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processMessageQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    try {
      const message = this.messageQueue[0];

      try {
        let response: AxiosResponse<any, any>;

        if (message.parentMessageId) {
          this.logger.debug('Sending threaded message:', {
            parentMessageId: message.parentMessageId,
            prId: message.prId,
          });

          response = await this.apiClient.post('/messages', {
            message: {
              content: message.message,
              entity_type: 'thread',
              entity_id: message.parentMessageId,
            },
          });

          this.logger.debug('Threaded message response:', {
            status: response.status,
            data: response.data,
          });
        } else {
          response = await this.apiClient.post('/messages', {
            message: {
              content: message.message,
              entity_type: 'discussion',
              entity_id: this.chatId,
            },
          });

          if (response.data?.data?.id) {
            const messageId = response.data.data.id.toString();

            const threadResponse = await this.apiClient.post(
              `/messages/${messageId}/thread`,
            );

            this.logger.debug('Thread creation response:', {
              status: threadResponse.status,
              data: threadResponse.data,
            });

            if (message.prId && message.repository) {
              await this.messageStore.saveMessageId(
                message.prId,
                threadResponse.data?.data?.id?.toString(),
                message.repository,
              );

              this.logger.debug('Saved message and thread IDs:', {
                prId: message.prId,
                messageId,
                threadId: threadResponse.data?.data?.id,
                response: response.data.data,
              });
            }
          }
        }

        this.messageQueue.shift();
      } catch (error) {
        this.logger.error('Failed to process message:', {
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });

        if (error.response?.status === 429) {
          if (message.retries < this.MAX_RETRIES) {
            message.retries++;
          } else {
            this.messageQueue.shift();
          }
        } else {
          this.messageQueue.shift();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async sendPullRequestNotification(pr: PullRequest): Promise<boolean> {
    try {
      const repository = pr.source.repository.full_name;
      const existingMessageId = await this.messageStore.getMessageId(pr.id);

      this.logger.debug('Processing PR notification:', {
        prId: pr.id,
        title: pr.title,
        existingMessageId,
        hasPendingReviewers: this.hasPendingReviewers(pr),
      });

      if (existingMessageId) {
        const updateMessage = this.formatPullRequestUpdateMessage(pr);
        if (updateMessage) {
          this.logger.debug('Found existing message, queueing update:', {
            prId: pr.id,
            messageId: existingMessageId,
            hasUpdateMessage: !!updateMessage,
          });

          this.queueMessage(
            updateMessage,
            existingMessageId,
            pr.id,
            repository,
          );
        } else {
          this.logger.debug('No update needed for PR:', { prId: pr.id });
        }
      } else {
        const formattedMessage = this.formatPullRequestMessage(pr);
        this.queueMessage(
          formattedMessage.message,
          undefined,
          pr.id,
          repository,
        );
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to queue PR notification:', error);
      return false;
    }
  }

  private hasPendingReviewers(pr: PullRequest): boolean {
    return pr.reviewers.some((reviewer) => {
      const participant = pr.participants.find(
        (p) => p.user.account_id === reviewer.account_id,
      );
      return (
        !participant?.approved && participant?.state !== 'changes_requested'
      );
    });
  }

  private queueMessage(
    message: string,
    parentMessageId?: string,
    prId?: number,
    repository?: string,
  ): void {
    this.messageQueue.push({
      message,
      parentMessageId,
      prId,
      repository,
      retries: 0,
    });

    this.logger.debug('Added message to queue:', {
      queueLength: this.messageQueue.length,
      prId,
      hasParentId: !!parentMessageId,
    });
  }

  private formatPullRequestMessage(pr: PullRequest): { message: string } {
    const reviewersText = pr.reviewers
      .map((reviewer) => {
        const participantInfo = pr.participants.find(
          (p) => p.user.account_id === reviewer.account_id,
        );
        const status = participantInfo?.approved
          ? '✅'
          : participantInfo?.state === 'changes_requested'
            ? '🔴'
            : '⏳';
        return `${status} ${reviewer.display_name}`;
      })
      .join('\n');

    return {
      message: [
        `🟢 *Новый Pull Request*`,
        '',
        `*Название:* ${pr.title}`,
        `*Автор:* ${pr.author.display_name}`,
        `*Статус:* ${pr.state === 'OPEN' ? 'Открыт' : pr.state}`,
        `*Репозиторий:* ${pr.source.repository.full_name}`,
        `*Ветки:* ${pr.source.branch.name} → ${pr.destination.branch.name}`,
        '',
        '*Ревьюеры:*',
        reviewersText || 'Нет назначенных ревьюеров',
        '',
        pr.description ? ['*Описание:*', pr.description, ''].join('\n') : '',
        `🔗 ${pr.links.html.href}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private formatPullRequestUpdateMessage(pr: PullRequest): string | null {
    const pendingReviewers = pr.reviewers
      .filter((reviewer) => {
        const participantInfo = pr.participants.find(
          (p) => p.user.account_id === reviewer.account_id,
        );
        return (
          !participantInfo?.approved &&
          participantInfo?.state !== 'changes_requested'
        );
      })
      .map((reviewer) => {
        const displayName = reviewer.display_name;
        const mention = this.reviewerMappings[displayName];
        return mention ? `${displayName} - ${mention}` : displayName;
      });

    const allReviewersApproved =
      pr.reviewers.length > 0 &&
      pr.reviewers.every((reviewer) => {
        const participantInfo = pr.participants.find(
          (p) => p.user.account_id === reviewer.account_id,
        );
        return participantInfo?.approved === true;
      });

    if (pr.state === 'OPEN' && allReviewersApproved) {
      const authorName = this.reviewerMappings[pr.author.display_name];
      const displayName = authorName
        ? `${pr.author.display_name} - ${authorName}`
        : pr.author.display_name;
      const reviewersText = pr.reviewers
        .map((reviewer) => `✅ ${reviewer.display_name}`)
        .join('\n');

      return [
        '🎉 *Все ревьюеры одобрили PR!*',
        `${displayName}, ваш PR готов к мерджу:`,
        `PR: ${pr.title}`,
        '',
        '*Одобрено:*',
        reviewersText,
        '',
        `🔗 ${pr.links.html.href}`,
      ].join('\n');
    }

    if (pendingReviewers.length > 0) {
      return [
        '🔄 Напоминание о ревью',
        `PR: ${pr.title}`,
        '',
        'Ожидается ревью от:',
        ...pendingReviewers.map((name) => `• ${name}`),
        '',
        `🔗 ${pr.links.html.href}`,
      ].join('\n');
    }

    return null;
  }

  async sendStartupMessage(): Promise<boolean> {
    const message = [
      '🚀 *PR Bot запущен*',
      '',
      '*Бот отслеживает:*',
      '• Новые pull requests',
      '• Обновления существующих pull requests',
      '',
      '_Проверка каждые 10 минут_',
    ].join('\n');

    this.queueMessage(message);
    return true;
  }

  async sendError(error: Error): Promise<boolean> {
    const message = [
      '❌ *Ошибка*',
      '',
      `*Тип:* ${error.name}`,
      `*Сообщение:* ${error.message}`,
      '',
      '_Проверьте логи приложения для получения дополнительной информации._',
    ].join('\n');

    this.queueMessage(message);
    return true;
  }

  async getAllStoredPRs(): Promise<StoredPR[]> {
    try {
      return await this.messageStore.getAllPRs();
    } catch (error) {
      this.logger.error('Failed to get stored PRs:', error);
      return [];
    }
  }

  async removeFromStore(prId: string, repository: string): Promise<void> {
    try {
      await this.messageStore.removePR(+prId, repository);
    } catch (error) {
      this.logger.error(`Failed to remove PR #${prId} from store:`, error);
    }
  }
}
