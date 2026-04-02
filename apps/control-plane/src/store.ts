import type { TaskRecord } from "@feudal/contracts";

export class MemoryStore {
  private readonly tasks = new Map<string, TaskRecord>();

  listTasks(): TaskRecord[] {
    return [...this.tasks.values()];
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  saveTask(task: TaskRecord): TaskRecord {
    this.tasks.set(task.id, task);
    return task;
  }
}
