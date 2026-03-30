import type { EventService } from '@enhearten/event-module';
import type { ScheduledEventService, ScheduledCalendarEvent } from '@enhearten/calendar-module';

/** Must match the demo notification slot in `demoEventContentModules.tsx` */
export const DEMO_NOTIFICATION_SLOT_TYPE = 'demo.notification';

type NotificationDispatch = {
  eventId: string;
  userId: string;
  platform: 'mobile' | 'desktop';
  moduleId: string;
  reminderAt: Date;
  title: string;
  body?: string;
};

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

/**
 * Merges event-module notification preview with scheduled calendar events that carry
 * `DEMO_NOTIFICATION_SLOT_TYPE` content slots (same reminder math as event-module events).
 */
export function createDemoNotificationDispatchService(
  base: EventService,
  scheduled: ScheduledEventService,
  options?: { notificationSlotModuleType?: string }
): EventService {
  const slotType = options?.notificationSlotModuleType ?? DEMO_NOTIFICATION_SLOT_TYPE;
  return {
    ...base,
    async previewNotificationDispatches(args) {
      const merged = await base.previewNotificationDispatches(args);
      const now = args.now ?? new Date();
      const rows = await scheduled.listInRange({
        userId: args.userId,
        start: args.start,
        end: args.end,
      });
      const extra = scheduledEventsToNotificationDispatches(rows, now, slotType);
      return { dispatches: [...merged.dispatches, ...extra] };
    },
  };
}
