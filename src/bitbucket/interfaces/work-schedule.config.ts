export interface WorkSchedule {
  workDays: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  workHours: {
    start: number; // 0-23 hour format
    end: number; // 0-23 hour format
  };
  timezone: string; // e.g., 'Europe/Moscow'
}
