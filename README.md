# PR Review Bot

A NestJS-based bot that monitors Bitbucket pull requests and sends notifications to Pachka chat about PR status and review reminders.

## Features

- 🔍 Monitors multiple Bitbucket workspaces and repositories
- 📢 Sends notifications about new PRs
- ⏰ Sends review reminders during work hours
- ✅ Notifies PR authors when all reviewers approve
- 🕒 Respects configured work hours
- 👥 Supports reviewer mentions/mapping

## Setup

### Prerequisites

- Node.js (v16 or later)
- npm/yarn
- Bitbucket workspace and repository access
- Pachka bot token and chat ID

### Installation

```bash
# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the root directory with the following configurations:

```env
# Bitbucket Configuration
BITBUCKET_API_URL=https://api.bitbucket.org/2.0
BITBUCKET_USERNAME=your_username
BITBUCKET_APP_PASSWORD=your_app_password
BITBUCKET_WORKSPACES=[
  {
    "name": "workspace1",
    "repositories": ["repo1", "repo2", "repo3"]
  },
  {
    "name": "workspace2",
    "repositories": ["repo1", "repo2"]
  }
]

# Pachka Configuration
PACHKA_API_URL=your_pachka_api_url
PACHKA_BOT_TOKEN=your_bot_token
PACHKA_CHAT_ID=your_chat_id

# Optional: Reviewer Mappings ({"Bitbucket Name":"Pachka Mention"})
PACHKA_REVIEWERS={"Pavel Zadkov": "@pzadkov"}

# Work Schedule Configuration
WORK_SCHEDULE_WORK_DAYS=[1,2,3,4,5]  # Monday to Friday
WORK_SCHEDULE_START_HOUR=9            # 9 AM
WORK_SCHEDULE_END_HOUR=18            # 6 PM
WORK_SCHEDULE_TIMEZONE=Europe/Moscow
```

### Running the Bot

```bash
# Development mode
npm run start:dev

# Production mode
npm run start:prod
```

## How It Works

### PR Monitoring

1. The bot checks all configured repositories every 5 minutes
2. Only performs checks during configured work hours
3. Tracks PR status changes and review status

### Notification Types

1. **New PR Notification**
   ```
   🟢 *Новый Pull Request*
   
   *Название:* PR Title
   *Автор:* Author Name
   *Статус:* Открыт
   *Репозиторий:* repo-name
   *Ветки:* feature → main
   
   *Ревьюеры:*
   ⏳ Reviewer 1
   ⏳ Reviewer 2
   
   🔗 PR-Link
   ```

2. **Review Reminder**
   ```
   🔄 Напоминание о ревью
   PR: PR Title
   
   Ожидается ревью от:
   • Reviewer 1
   • Reviewer 2
   
   🔗 PR-Link
   ```

3. **All Approved Notification**
   ```
   🎉 *Все ревьюеры одобрили PR!*
   @Author, ваш PR готов к мерджу:
   PR: PR Title
   
   *Одобрено:*
   ✅ Reviewer 1
   ✅ Reviewer 2
   
   🔗 PR-Link
   ```

### Review Status Indicators

- ⏳ Pending review
- ✅ Approved
- 🔴 Changes requested

## Working Hours

- The bot only sends notifications during configured working hours
- Default: Monday-Friday, 9 AM - 6 PM Moscow time
- Configurable through environment variables

## Storage

The bot maintains a JSON-based storage (`message-store.json`) to track:
- PR IDs
- Message IDs
- Repository information
- Update timestamps

## Error Handling

- Retries failed API requests up to 3 times
- Sends error notifications to the chat
- Logs errors for debugging
- Gracefully handles API rate limits

## Maintenance

### Logs
Important logs are maintained for:
- Service initialization
- PR status changes
- API errors
- Message delivery status

### Cleanup
- Automatically removes closed PRs from storage
- Maintains clean message threads
- Prevents duplicate notifications

## Development

### Project Structure
```
src/
├── bitbucket/
│   ├── bitbucket.service.ts    # Bitbucket API integration
│   └── interfaces/
│       └── pull-request.interface.ts
├── pachka/
│   ├── pachka.service.ts       # Pachka messaging service
│   └── store/
│       └── message-store.service.ts
└── config/
    └── configuration.ts        # Configuration management
```

### Adding New Features
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Support

For issues and feature requests, please create an issue in the repository.