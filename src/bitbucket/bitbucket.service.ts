import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios, { AxiosInstance } from 'axios';
import { PachkaService } from '../pachka/pachka.service';
import { PullRequest } from './interfaces/pull-request.interface';
import { WorkSchedule } from './interfaces/work-schedule.config';

interface WorkspaceConfig {
  name: string;
  repositories: string[];
}

@Injectable()
export class BitbucketService implements OnModuleInit {
  private readonly logger: Logger = new Logger(BitbucketService.name);

  private lastCheckedDate: Date = new Date(Date.now() - 60 * 60 * 1000);

  private readonly apiClient?: AxiosInstance;

  private readonly workspaces: WorkspaceConfig[] = this.loadWorkspacesConfig();

  private workSchedule?: WorkSchedule;

  constructor(
    private readonly configService: ConfigService,
    private readonly pachkaService: PachkaService,
  ) {
    this.loadWorkScheduleConfig();
    this.apiClient = axios.create({
      baseURL: this.configService.get('bitbucket.apiUrl'),
      auth: {
        username: this.configService.get('bitbucket.username'),
        password: this.configService.get('bitbucket.appPassword'),
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private loadWorkspacesConfig(): WorkspaceConfig[] {
    const workspacesConfig = this.configService.get<string>(
      'bitbucket.workspaces',
    );
    try {
      return JSON.parse(workspacesConfig);
    } catch (error) {
      this.logger.error('Failed to parse workspaces configuration', error);
      return [];
    }
  }

  private loadWorkScheduleConfig(): void {
    this.workSchedule = {
      workDays: this.configService.get<number[]>(
        'workSchedule.workDays',
        [1, 2, 3, 4, 5],
      ), // Mon-Fri by default
      workHours: {
        start: this.configService.get<number>('workSchedule.startHour', 10), // 10 AM by default
        end: this.configService.get<number>('workSchedule.endHour', 18), // 6 PM by default
      },
      timezone: this.configService.get<string>(
        'workSchedule.timezone',
        'Europe/Moscow',
      ),
    };

    this.logger.log('Work schedule initialized:', {
      workDays: this.workSchedule.workDays,
      workHours: this.workSchedule.workHours,
      timezone: this.workSchedule.timezone,
    });
  }

  private isWorkingHours(): boolean {
    const now = new Date().toLocaleString('en-US', {
      timeZone: this.workSchedule.timezone,
    });
    const currentDate = new Date(now);

    const currentDay = currentDate.getDay();
    if (!this.workSchedule.workDays.includes(currentDay)) {
      this.logger.debug('Current day is not a work day:', {
        currentDay,
        workDays: this.workSchedule.workDays,
      });
      return false;
    }

    const currentHour = currentDate.getHours();
    const isWorkHour =
      currentHour >= this.workSchedule.workHours.start &&
      currentHour < this.workSchedule.workHours.end;

    this.logger.debug('Work hours check:', {
      currentHour,
      workHours: this.workSchedule.workHours,
      isWorkHour,
    });

    return isWorkHour;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing BitbucketService...');

    try {
      for (const workspace of this.workspaces) {
        await this.validateCredentials(workspace.name);
      }
      this.logger.log('Successfully connected to Bitbucket API');

      await this.pachkaService.sendStartupMessage();
      this.logger.log('Sent startup message to Pachka');

      await this.processAllRepositories();

      this.lastCheckedDate = new Date();
      this.logger.log('Initialization complete');
    } catch (error) {
      const errorMessage = `Failed to initialize BitbucketService: ${error.message}`;
      this.logger.error(errorMessage);
      await this.pachkaService.sendError(new Error(errorMessage));
      throw error;
    }
  }

  private async processAllRepositories(): Promise<void> {
    for (const workspace of this.workspaces) {
      for (const repository of workspace.repositories) {
        try {
          const openPRs = await this.getOpenPullRequests(
            workspace.name,
            repository,
          );
          this.logger.log(
            `Found ${openPRs.length} open PRs in ${workspace.name}/${repository}`,
          );

          for (const pr of openPRs) {
            await this.pachkaService.sendPullRequestNotification(pr);
            this.logger.debug(
              `Processed PR #${pr.id} in ${workspace.name}/${repository}:`,
              {
                title: pr.title,
                reviewers: pr.reviewers.length,
              },
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to process repository ${workspace.name}/${repository}:`,
            error.message,
          );
        }
      }
    }
  }

  private async getOpenPullRequests(
    workspace: string,
    repository: string,
  ): Promise<PullRequest[]> {
    try {
      const response = await this.apiClient.get<{ values: PullRequest[] }>(
        `/repositories/${workspace}/${repository}/pullrequests`,
        {
          params: {
            fields: [
              'values.id',
              'values.title',
              'values.description',
              'values.state',
              'values.created_on',
              'values.updated_on',
              'values.author.display_name',
              'values.author.account_id',
              'values.reviewers.display_name',
              'values.reviewers.account_id',
              'values.participants.user.display_name',
              'values.participants.user.account_id',
              'values.participants.role',
              'values.participants.approved',
              'values.participants.state',
              'values.source.branch.name',
              'values.source.repository.full_name',
              'values.destination.branch.name',
              'values.links.html.href',
            ].join(','),
            state: 'OPEN',
            sort: '-updated_on',
            pagelen: 50,
          },
        },
      );

      return response.data.values;
    } catch (error) {
      this.logger.error(
        `Failed to fetch pull requests for ${workspace}/${repository}`,
        error.message,
      );
      return [];
    }
  }

  private async validateCredentials(workspace: string): Promise<void> {
    try {
      await this.apiClient.get(`/workspaces/${workspace}`);
    } catch (error) {
      throw new Error(
        `Invalid Bitbucket credentials or workspace ${workspace}: ${error.message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkPullRequests(): Promise<void> {
    if (!this.isWorkingHours()) {
      this.logger.debug('Outside of work hours, skipping PR check');
      return;
    }

    try {
      this.logger.debug('Checking PRs with date:', {
        lastChecked: this.lastCheckedDate.toISOString(),
      });

      const storedPRs = await this.pachkaService.getAllStoredPRs();
      const activePRIds = new Set<string>();

      for (const workspace of this.workspaces) {
        for (const repository of workspace.repositories) {
          const openPRs = await this.getOpenPullRequests(
            workspace.name,
            repository,
          );

          for (const pr of openPRs) {
            activePRIds.add(pr.id.toString());
            const hasUnreviewedChanges = this.hasPendingReviewers(pr);

            if (hasUnreviewedChanges) {
              await this.pachkaService.sendPullRequestNotification(pr);
              this.logger.debug(
                `Sent reminder for PR #${pr.id} in ${workspace.name}/${repository}`,
              );
            }
          }

          const repositoryStoredPRs = storedPRs.filter(
            (pr) => pr.repository === repository,
          );

          for (const storedPR of repositoryStoredPRs) {
            if (!activePRIds.has(storedPR.prId)) {
              try {
                const prStatus = await this.getPRStatus(
                  workspace.name,
                  repository,
                  storedPR.prId,
                );

                if (prStatus !== 'OPEN') {
                  await this.pachkaService.removeFromStore(
                    storedPR.prId,
                    repository,
                  );
                  this.logger.debug(
                    `Removed closed PR #${storedPR.prId} from store for ${repository}`,
                  );
                }
              } catch (error) {
                this.logger.error(
                  `Failed to check PR status #${storedPR.prId} in ${repository}:`,
                  error.message,
                );
              }
            }
          }
        }
      }

      this.lastCheckedDate = new Date();
    } catch (error) {
      const errorMessage = `Failed to check pull requests: ${error.message}`;
      this.logger.error(errorMessage);
      await this.pachkaService.sendError(new Error(errorMessage));
    }
  }

  private async getPRStatus(
    workspace: string,
    repository: string,
    prId: string,
  ): Promise<string> {
    try {
      const response = await this.apiClient.get(
        `/repositories/${workspace}/${repository}/pullrequests/${prId}`,
        {
          params: {
            fields: 'state',
          },
        },
      );
      return response.data.state;
    } catch (error) {
      if (error.response?.status === 404) {
        return 'CLOSED';
      }
      throw error;
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
}
