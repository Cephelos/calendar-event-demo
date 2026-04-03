import type { ScheduledEventService, ScheduledCalendarEvent } from '@enhearten/calendar-module';
import type { NotificationDispatch, NotificationMiniModule } from '@enhearten/notification-contracts';

/** Must match the demo notification slot in `demoEventContentModules.tsx` */
export const DEMO_NOTIFICATION_SLOT_TYPE = 'demo.notification';

function scheduledEventsToNotificationDispatches(
  events: ScheduledCalendarEvent[],
  now: Date,
  slotModuleType: string
): NotificationDispatch[] {
  const out: NotificationDispatch[] = [];
  for (const evt of events) {
    for (const slot of evt.contentModules) {
      if (slot.moduleType !== slotModuleType) continue;
      const c = slot.config as Record<string, unknown>;
      const leadMinutes =
        typeof c.notificationLeadMinutes === 'number' && Number.isFinite(c.notificationLeadMinutes)
          ? c.notificationLeadMinutes
          : 10;
      const reminderAt = new Date(evt.start.getTime() - leadMinutes * 60_000);
      if (reminderAt.getTime() > now.getTime()) continue;

      const mobileId =
        typeof c.mobileNotificationModuleId === 'string' ? c.mobileNotificationModuleId.trim() : '';
      const desktopId =
        typeof c.desktopNotificationModuleId === 'string' ? c.desktopNotificationModuleId.trim() : '';
      const baseEventId = `sched:${evt.id}:${slot.instanceId}`;
      const body = typeof evt.description === 'string' ? evt.description : undefined;

      if (mobileId) {
        out.push({
          eventId: baseEventId,
          userId: evt.userId,
          platform: 'mobile',
          moduleId: mobileId,
          reminderAt,
          title: evt.title,
          ...(body != null && body.length > 0 ? { body } : {}),
        });
      }
      if (desktopId) {
        out.push({
          eventId: `${baseEventId}:desktop`,
          userId: evt.userId,
          platform: 'desktop',
          moduleId: desktopId,
          reminderAt,
          title: evt.title,
          ...(body != null && body.length > 0 ? { body } : {}),
        });
      }
    }
  }
  return out;
}

export type DemoNotificationDispatchService = {
  previewNotificationDispatches(args: {
    userId: string;
    start: Date;
    end: Date;
    now?: Date;
  }): Promise<{ dispatches: NotificationDispatch[] }>;
  listNotificationModules(args?: { platform?: 'mobile' | 'desktop' }): NotificationMiniModule[];
};

/**
 * Notification host adapter for scheduled-calendar events with notification slots.
 */
export function createDemoNotificationDispatchService(
  scheduled: ScheduledEventService,
  modules: NotificationMiniModule[],
  options?: { notificationSlotModuleType?: string }
): DemoNotificationDispatchService {
  const slotType = options?.notificationSlotModuleType ?? DEMO_NOTIFICATION_SLOT_TYPE;
  return {
    listNotificationModules(args) {
      if (!args?.platform) return modules;
      return modules.filter((m) => m.platform === args.platform);
    },
    async previewNotificationDispatches(args) {
      const now = args.now ?? new Date();
      const rows = await scheduled.listInRange({
        userId: args.userId,
        start: args.start,
        end: args.end,
      });
      const extra = scheduledEventsToNotificationDispatches(rows, now, slotType);
      return { dispatches: extra };
    },
  };
}
