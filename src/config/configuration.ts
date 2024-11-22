export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  pachka: {
    webhookUrl: process.env.PACHKA_WEBHOOK_URL,
    botToken: process.env.PACHKA_BOT_TOKEN,
    chatId: process.env.PACHKA_CHAT_ID,
    apiUrl: process.env.PACHKA_API_URL,
    reviewers: process.env.REVIEWER_MAPPINGS,
  },
  bitbucket: {
    apiUrl: process.env.BITBUCKET_API_URL,
    username: process.env.BITBUCKET_USERNAME,
    appPassword: process.env.BITBUCKET_APP_PASSWORD,
    workspace: process.env.BITBUCKET_WORKSPACE,
    repository: process.env.BITBUCKET_REPOSITORY,
    pollInterval: parseInt(process.env.POLL_INTERVAL || '300', 10),
    workspaces: process.env.BITBUCKET_WORKSPACES,
  },
  workSchedule: {
    workDays: process.env.WORK_SCHEDULE_WORK_DAYS,
    startHour: process.env.WORK_SCHEDULE_START_HOUR,
    endHour: process.env.WORK_SCHEDULE_END_HOUR,
    timezone: process.env.WORK_SCHEDULE_TIMEZONE,
  },
});
