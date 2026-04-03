import { registerRootComponent } from 'expo';
import {
  DEFAULT_AUTO_POLL_INTERVAL_MS,
  NotificationHost,
  type NotificationHostHandle,
} from '@enhearten/notification-host-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import type { ModuleRegistry } from '@enhearten/module-picker';
import { ModulePickerCalendarModal } from '@enhearten/module-picker';
import { BUILTIN_NOTIFICATION_MODULES } from '@enhearten/notification-modules-builtin';
import { tamaguiConfig } from './tamagui.config';
import {
  buildDemoEventContentModules,
  modulePickerStorageKey,
  type ModulePickerSession,
} from './demoEventContentModules';
import { DEMO_NOTIFICATION_SLOT_TYPE, createDemoNotificationDispatchService } from './demoNotificationService';

type Loaded = {
  Calendar: React.ComponentType<any>;
  scheduledEventService: any;
  service: any;
  userId: string;
  modulePickerRegistry: ModuleRegistry;
  modulePickerCalendarModuleType: string;
};

/** reminderAt = start − lead; due when reminderAt ≤ now */
function dueImmediatelySchedule() {
  const now = Date.now();
  const leadMinutes = 45;
  const start = new Date(now + 35 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { start, end, notificationLeadMinutes: leadMinutes };
}

/** Desktop modal-alert becomes due in ~1 minute (for delayed dispatch testing). */
function modalAlertDueInOneMinuteSchedule() {
  const now = Date.now();
  const leadMinutes = 10;
  const reminderAt = new Date(now + 60_000);
  const start = new Date(reminderAt.getTime() + leadMinutes * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { start, end, notificationLeadMinutes: leadMinutes };
}

const NOTIFICATION_MODULE_IDS = {
  mobileBanner: 'mobile.banner',
  mobilePush: 'mobile.push',
  mobileFullscreen: 'mobile.fullscreen',
  desktopToast: 'desktop.toast',
  desktopWebNotification: 'desktop.web-notification',
  desktopModalAlert: 'desktop.modal-alert',
} as const;

type ControlsTab = 'events' | 'json' | 'notifications';

function createLegacyCompatibleService(args: {
  scheduledEventService: any;
  userId: string;
}) {
  const { scheduledEventService, userId } = args;
  return {
    listNotificationModules(params?: { platform?: 'mobile' | 'desktop' }) {
      if (!params?.platform) return BUILTIN_NOTIFICATION_MODULES;
      return BUILTIN_NOTIFICATION_MODULES.filter((m) => m.platform === params.platform);
    },
    async createEvent(params: {
      input: {
        userId: string;
        title: string;
        start: Date;
        end: Date;
        description?: string;
        mobileNotificationModuleId?: string;
        desktopNotificationModuleId?: string;
        notificationLeadMinutes?: number;
      };
      checkConflicts?: boolean;
    }) {
      const input = params.input;
      const hasNotif = Boolean(input.mobileNotificationModuleId || input.desktopNotificationModuleId);
      return scheduledEventService.createEvent({
        input: {
          userId: input.userId,
          title: input.title,
          description: input.description,
          start: input.start,
          end: input.end,
          contentModules: hasNotif
            ? [
                {
                  instanceId: `slot_${Date.now().toString(16)}`,
                  moduleType: DEMO_NOTIFICATION_SLOT_TYPE,
                  config: {
                    mobileNotificationModuleId: input.mobileNotificationModuleId ?? '',
                    desktopNotificationModuleId: input.desktopNotificationModuleId ?? '',
                    notificationLeadMinutes: input.notificationLeadMinutes ?? 10,
                  },
                },
              ]
            : [],
        },
      });
    },
    async updateEvent(params: { userId: string; id: string; patch: { title?: string } }) {
      return scheduledEventService.updateEvent({
        userId: params.userId,
        id: params.id,
        patch: params.patch,
      });
    },
    async deleteEvent(params: { userId: string; id: string }) {
      return scheduledEventService.deleteEvent(params);
    },
    async exportEventsJson(params: { userId: string; start: Date; end: Date }) {
      const rows = await scheduledEventService.listInRange(params);
      const mapped = rows.map((e: any) => ({
        title: e.title,
        description: e.description,
        start: new Date(e.start).toISOString(),
        end: new Date(e.end).toISOString(),
      }));
      return JSON.stringify(mapped, null, 2);
    },
    async importEventsJsonWithReport(params: {
      json: string;
      userId?: string;
      checkConflicts?: boolean;
      dedupeWithinPayload?: boolean;
      continueOnError?: boolean;
    }) {
      const parsed = JSON.parse(params.json) as Array<Record<string, unknown>>;
      const uid = params.userId ?? userId;
      let createdCount = 0;
      let skippedDuplicates = 0;
      const failed: Array<{ index: number; reason: string }> = [];
      const seen = new Set<string>();
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        try {
          const title = String(item.title ?? '').trim();
          const start = new Date(String(item.start ?? ''));
          const end = new Date(String(item.end ?? ''));
          if (!title || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new Error('Invalid row shape');
          }
          const fp = `${title}|${start.toISOString()}|${end.toISOString()}`;
          if (params.dedupeWithinPayload !== false && seen.has(fp)) {
            skippedDuplicates += 1;
            continue;
          }
          seen.add(fp);
          await scheduledEventService.createEvent({
            input: {
              userId: uid,
              title,
              description: typeof item.description === 'string' ? item.description : undefined,
              start,
              end,
              contentModules: [],
            },
          });
          createdCount += 1;
        } catch (error) {
          failed.push({ index: i, reason: error instanceof Error ? error.message : String(error) });
          if (!params.continueOnError) break;
        }
      }
      return { createdCount, skippedDuplicates, failed };
    },
    async previewImportEventsJson(params: {
      json: string;
      userId?: string;
      checkConflicts?: boolean;
      dedupeWithinPayload?: boolean;
    }) {
      try {
        const parsed = JSON.parse(params.json) as Array<Record<string, unknown>>;
        const seen = new Set<string>();
        let wouldCreateCount = 0;
        let skippedDuplicates = 0;
        const failed: Array<{ index: number; reason: string }> = [];
        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i];
          const title = String(item.title ?? '').trim();
          const start = new Date(String(item.start ?? ''));
          const end = new Date(String(item.end ?? ''));
          if (!title || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            failed.push({ index: i, reason: 'Invalid row shape' });
            continue;
          }
          const fp = `${title}|${start.toISOString()}|${end.toISOString()}`;
          if (params.dedupeWithinPayload !== false && seen.has(fp)) {
            skippedDuplicates += 1;
            continue;
          }
          seen.add(fp);
          wouldCreateCount += 1;
        }
        return { wouldCreateCount, skippedDuplicates, failed };
      } catch (error) {
        return {
          wouldCreateCount: 0,
          skippedDuplicates: 0,
          failed: [{ index: 0, reason: error instanceof Error ? error.message : String(error) }],
        };
      }
    },
  };
}

function DemoApp() {
  const [state, setState] = useState<{ loading: boolean; error: string | null; loaded: Loaded | null }>({
    loading: true,
    error: null,
    loaded: null,
  });
  const [calendarKey, setCalendarKey] = useState(0);
  const [message, setMessage] = useState<string>('');
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [jsonPayload, setJsonPayload] = useState<string>('');
  const [notificationLog, setNotificationLog] = useState<string[]>([]);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [controlsTab, setControlsTab] = useState<ControlsTab>('events');
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const notificationHostRef = useRef<NotificationHostHandle>(null);
  const [modulePickerSession, setModulePickerSession] = useState<ModulePickerSession | null>(null);

  const notificationDispatchService = useMemo(() => {
    if (!state.loaded) return null;
    return createDemoNotificationDispatchService(state.loaded.scheduledEventService, BUILTIN_NOTIFICATION_MODULES);
  }, [state.loaded]);

  const eventContentModules = useMemo(() => {
    if (!state.loaded) return [];
    const mobileModules = state.loaded.service.listNotificationModules({ platform: 'mobile' });
    const desktopModules = state.loaded.service.listNotificationModules({ platform: 'desktop' });
    return buildDemoEventContentModules({
      userId: state.loaded.userId,
      modulePickerType: state.loaded.modulePickerCalendarModuleType,
      mobileModules,
      desktopModules,
      onOpenModulePicker: setModulePickerSession,
    });
  }, [state.loaded]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cal = await import('@enhearten/calendar-module');
        const mp = await import('@enhearten/module-picker');

        const userId = 'demo-user-1';

        const scheduledStorage = cal.createMemoryScheduledEventStorage([]);
        const scheduledEventService = cal.createScheduledEventService(scheduledStorage);
        const service = createLegacyCompatibleService({ scheduledEventService, userId });

        const modulePickerRegistry = mp.createRegistry();
        mp.registerAllSampleModules(modulePickerRegistry);

        if (!mounted) return;
        setState({
          loading: false,
          error: null,
          loaded: {
            Calendar: cal.Calendar,
            scheduledEventService,
            service,
            userId,
            modulePickerRegistry,
            modulePickerCalendarModuleType: mp.MODULE_PICKER_CALENDAR_MODULE_TYPE,
          },
        });
      } catch (error) {
        if (!mounted) return;
        const msg = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
        setState({ loading: false, error: msg, loaded: null });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshCalendar = () => setCalendarKey((k) => k + 1);

  const createManualEvent = async () => {
    if (!state.loaded) return;
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60_000);
    const end = new Date(now.getTime() + 90 * 60_000);
    const created = await state.loaded.service.createEvent({
      input: {
        userId: state.loaded.userId,
        title: `Manual test event ${Date.now().toString().slice(-5)}`,
        start,
        end,
      },
      checkConflicts: false,
    });
    setLastCreatedId(created.id);
    setMessage(`Created ${created.title}`);
    refreshCalendar();
  };

  const updateLastCreated = async () => {
    if (!state.loaded || !lastCreatedId) {
      setMessage('Create an event first');
      return;
    }
    const updated = await state.loaded.service.updateEvent({
      userId: state.loaded.userId,
      id: lastCreatedId,
      patch: { title: `Updated manual event ${Date.now().toString().slice(-4)}` },
      checkConflicts: false,
    });
    setMessage(`Updated ${updated.title}`);
    refreshCalendar();
  };

  const deleteLastCreated = async () => {
    if (!state.loaded || !lastCreatedId) {
      setMessage('No created event to delete');
      return;
    }
    await state.loaded.service.deleteEvent({ userId: state.loaded.userId, id: lastCreatedId });
    setLastCreatedId(null);
    setMessage('Deleted last created event');
    refreshCalendar();
  };

  const runAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const exportRangeJson = async () => {
    if (!state.loaded) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + 14);
    end.setHours(23, 59, 59, 999);
    const exported = await state.loaded.service.exportEventsJson({
      userId: state.loaded.userId,
      start,
      end,
    });
    setJsonPayload(exported);
    setMessage('Exported events to JSON payload');
  };

  const importJsonPayload = async () => {
    if (!state.loaded) return;
    const report = await state.loaded.service.importEventsJsonWithReport({
      json: jsonPayload,
      userId: state.loaded.userId,
      checkConflicts: false,
      dedupeWithinPayload: true,
      continueOnError: true,
    });
    setMessage(
      `Imported ${report.createdCount} event(s), skipped ${report.skippedDuplicates} duplicate(s), failed ${report.failed.length}`
    );
    refreshCalendar();
  };

  const importJsonPayloadAllowDuplicates = async () => {
    if (!state.loaded) return;
    const report = await state.loaded.service.importEventsJsonWithReport({
      json: jsonPayload,
      userId: state.loaded.userId,
      checkConflicts: false,
      dedupeWithinPayload: false,
      continueOnError: true,
    });
    setMessage(`Imported ${report.createdCount} event(s) with duplicates allowed, failed ${report.failed.length}`);
    refreshCalendar();
  };

  const previewJsonPayload = async () => {
    if (!state.loaded) return;
    const preview = await state.loaded.service.previewImportEventsJson({
      json: jsonPayload,
      userId: state.loaded.userId,
      checkConflicts: false,
      dedupeWithinPayload: true,
    });
    setMessage(
      `Preview: would create ${preview.wouldCreateCount}, skip ${preview.skippedDuplicates}, fail ${preview.failed.length}`
    );
  };

  const loadSampleJson = () => {
    const sample = [
      {
        title: 'Imported sample event',
        start: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        end: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      },
      {
        title: 'Imported sample event',
        start: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        end: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      },
    ];
    setJsonPayload(JSON.stringify(sample, null, 2));
    setMessage('Loaded sample JSON payload (includes duplicate row)');
  };

  const clearJson = () => {
    setJsonPayload('');
    setMessage('Cleared JSON payload');
  };

  const addNotificationTestEvent = async (args: {
    label: string;
    mobileId?: string;
    desktopId?: string;
    start: Date;
    end: Date;
    notificationLeadMinutes: number;
  }) => {
    if (!state.loaded) return;
    const { start, end, notificationLeadMinutes, mobileId, desktopId, label } = args;
    const created = await state.loaded.service.createEvent({
      input: {
        userId: state.loaded.userId,
        title: `[${label}] ${Date.now().toString(36)}`,
        description: 'Demo notification test event',
        start,
        end,
        mobileNotificationModuleId: mobileId,
        desktopNotificationModuleId: desktopId,
        notificationLeadMinutes,
      },
      checkConflicts: false,
    });
    setLastCreatedId(created.id);
    setMessage(`Created “${label}” test event — due reminders dispatch automatically (and via Run once).`);
    refreshCalendar();
  };

  const addImmediatelyDueEvent = (moduleKey: keyof typeof NOTIFICATION_MODULE_IDS) => {
    const id = NOTIFICATION_MODULE_IDS[moduleKey];
    const sched = dueImmediatelySchedule();
    const isMobile = moduleKey.startsWith('mobile');
    return () =>
      runAction(() =>
        addNotificationTestEvent({
          label: moduleKey,
          ...(isMobile ? { mobileId: id } : { desktopId: id }),
          ...sched,
        })
      );
  };

  const addModalAlertDueInOneMinute = () =>
    runAction(() =>
      addNotificationTestEvent({
        label: 'desktop.modal-alert in ~1min',
        desktopId: NOTIFICATION_MODULE_IDS.desktopModalAlert,
        ...modalAlertDueInOneMinuteSchedule(),
      })
    );

  const previewNotifications = async () => {
    if (!state.loaded || !notificationDispatchService) return;
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60_000);
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
    const preview = await notificationDispatchService.previewNotificationDispatches({
      userId: state.loaded.userId,
      start,
      end,
      now,
    });
    setMessage(`Notification preview: ${preview.dispatches.length} due dispatch(es)`);
  };

  const dispatchNotificationsManual = () =>
    runAction(async () => {
      await notificationHostRef.current?.flushOnce('manual');
    });

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <NotificationHost
        ref={notificationHostRef}
        service={notificationDispatchService}
        userId={state.loaded?.userId ?? 'demo-user-1'}
        pollIntervalMs={DEFAULT_AUTO_POLL_INTERVAL_MS}
        onManualSummary={setMessage}
        onPollTick={setLastPollAt}
        onNewLogLines={(lines) => setNotificationLog((prev) => [...lines, ...prev].slice(0, 100))}
      >
        <View style={styles.appRoot}>
        <ScrollView contentContainerStyle={styles.container} style={styles.mainScroll}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>DEMO LOADED</Text>
        </View>
        <Text style={styles.title}>Calendar + scheduled events (demo)</Text>
        {state.loading ? <Text style={styles.subtitle}>Loading linked modules...</Text> : null}
        {state.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Import/Runtime error</Text>
            <Text style={styles.errorMessage}>{state.error}</Text>
          </View>
        ) : null}
        {state.loaded ? (
          <View style={styles.toolsBox}>
            <View style={styles.toolsHeaderRow}>
              <Text style={styles.toolsTitle}>Manual test controls</Text>
              <Pressable
                style={styles.collapseButton}
                onPress={() => setControlsCollapsed((c) => !c)}
                accessibilityRole="button"
              >
                <Text style={styles.collapseButtonText}>{controlsCollapsed ? 'Expand' : 'Collapse'}</Text>
              </Pressable>
            </View>

            {!controlsCollapsed ? (
              <>
                <View style={styles.tabRow}>
                  {(
                    [
                      { id: 'events' as const, label: 'Events & calendar' },
                      { id: 'json' as const, label: 'JSON import/export' },
                      { id: 'notifications' as const, label: 'Notifications' },
                    ] as const
                  ).map((tab) => (
                    <Pressable
                      key={tab.id}
                      style={[styles.tab, controlsTab === tab.id && styles.tabActive]}
                      onPress={() => setControlsTab(tab.id)}
                    >
                      <Text style={[styles.tabText, controlsTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {controlsTab === 'events' ? (
                  <View style={styles.tabPanel}>
                    <Text style={styles.panelHint}>
                      The calendar &quot;Create event&quot; button opens scheduling first, then optional content
                      modules. Add &quot;Module workspace&quot; and tap Open module workspace; add &quot;Notification&quot;
                      and pick modules plus lead time so the notification host dispatches like event-module events.
                      Controls below use event-module storage for JSON and quick-add notification tests.
                    </Text>
                    <View style={styles.toolsRow}>
                      <Pressable style={styles.toolButton} onPress={() => runAction(createManualEvent)}>
                        <Text style={styles.toolButtonText}>Create event</Text>
                      </Pressable>
                      <Pressable style={styles.toolButton} onPress={() => runAction(updateLastCreated)}>
                        <Text style={styles.toolButtonText}>Update last created</Text>
                      </Pressable>
                      <Pressable style={styles.toolButton} onPress={() => runAction(deleteLastCreated)}>
                        <Text style={styles.toolButtonText}>Delete last created</Text>
                      </Pressable>
                      <Pressable style={styles.toolButton} onPress={refreshCalendar}>
                        <Text style={styles.toolButtonText}>Refresh calendar</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {controlsTab === 'json' ? (
                  <View style={styles.tabPanel}>
                    <Text style={styles.panelHint}>Round-trip events as JSON for QA scenarios.</Text>
                    <View style={styles.toolsRow}>
                      <Pressable style={styles.toolButton} onPress={() => runAction(exportRangeJson)}>
                        <Text style={styles.toolButtonText}>Export JSON</Text>
                      </Pressable>
                      <Pressable style={styles.toolButton} onPress={() => runAction(importJsonPayload)}>
                        <Text style={styles.toolButtonText}>Import JSON</Text>
                      </Pressable>
                      <Pressable style={styles.toolButton} onPress={() => runAction(importJsonPayloadAllowDuplicates)}>
                        <Text style={styles.toolButtonText}>Import JSON (allow dupes)</Text>
                      </Pressable>
                      <Pressable style={styles.toolButton} onPress={() => runAction(previewJsonPayload)}>
                        <Text style={styles.toolButtonText}>Preview import</Text>
                      </Pressable>
                      <Pressable style={styles.toolButton} onPress={loadSampleJson}>
                        <Text style={styles.toolButtonText}>Load sample JSON</Text>
                      </Pressable>
                      <Pressable style={styles.toolButton} onPress={clearJson}>
                        <Text style={styles.toolButtonText}>Clear JSON</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      multiline
                      value={jsonPayload}
                      onChangeText={setJsonPayload}
                      placeholder="Paste event JSON array here"
                      style={styles.jsonInput}
                    />
                  </View>
                ) : null}

                {controlsTab === 'notifications' ? (
                  <View style={styles.tabPanel}>
                    <Text style={styles.panelHint}>
                      Due reminders run automatically every {DEFAULT_AUTO_POLL_INTERVAL_MS / 1000}s. Ephemeral desktop notifications
                      clear after a few seconds; fullscreen and desktop modal use Dismiss / Snooze (5 min). Quick-add
                      creates events you can verify without the calendar modal. Scheduled events with a Notification
                      content slot use the same pipeline (reminder at event start minus lead minutes).
                    </Text>
                    <View style={styles.toolsRow}>
                      <Pressable style={styles.toolButton} onPress={() => runAction(previewNotifications)}>
                        <Text style={styles.toolButtonText}>Preview notifications</Text>
                      </Pressable>
              <Pressable style={styles.toolButton} onPress={dispatchNotificationsManual}>
                <Text style={styles.toolButtonText}>Run notifications once</Text>
              </Pressable>
                    </View>
                    <Text style={styles.subPanelTitle}>Due immediately (auto-dispatch or Run once)</Text>
                    <View style={styles.toolsRow}>
                      <Pressable style={styles.toolButtonAccent} onPress={addImmediatelyDueEvent('mobileBanner')}>
                        <Text style={styles.toolButtonText}>+ Mobile banner</Text>
                      </Pressable>
                      <Pressable style={styles.toolButtonAccent} onPress={addImmediatelyDueEvent('mobilePush')}>
                        <Text style={styles.toolButtonText}>+ Mobile push</Text>
                      </Pressable>
                      <Pressable style={styles.toolButtonAccent} onPress={addImmediatelyDueEvent('mobileFullscreen')}>
                        <Text style={styles.toolButtonText}>+ Mobile fullscreen</Text>
                      </Pressable>
                      <Pressable style={styles.toolButtonAccent} onPress={addImmediatelyDueEvent('desktopToast')}>
                        <Text style={styles.toolButtonText}>+ Desktop toast</Text>
                      </Pressable>
                      <Pressable
                        style={styles.toolButtonAccent}
                        onPress={addImmediatelyDueEvent('desktopWebNotification')}
                      >
                        <Text style={styles.toolButtonText}>+ Desktop web notification</Text>
                      </Pressable>
                      <Pressable style={styles.toolButtonAccent} onPress={addImmediatelyDueEvent('desktopModalAlert')}>
                        <Text style={styles.toolButtonText}>+ Desktop modal alert</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.subPanelTitle}>Delayed</Text>
                    <View style={styles.toolsRow}>
                      <Pressable style={styles.toolButtonWarn} onPress={addModalAlertDueInOneMinute}>
                        <Text style={styles.toolButtonText}>+ Modal alert due in ~1 min</Text>
                      </Pressable>
                    </View>
                    {lastPollAt ? (
                      <Text style={styles.pollHint}>Last auto check: {lastPollAt}</Text>
                    ) : null}
                    {Platform.OS === 'web' ? (
                      <Text style={styles.hint}>
                        Desktop modal uses an in-app Modal (not window.alert). Allow browser notifications for
                        web-notification / push tests.
                      </Text>
                    ) : null}
                    {notificationLog.length > 0 ? (
                      <View style={styles.logBox}>
                        <Text style={styles.logTitle}>Notification delivery log</Text>
                        {notificationLog.map((line, idx) => (
                          <Text key={`${line}-${idx}`} style={styles.logLine}>
                            {line}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {message ? <Text style={styles.toolsMessage}>{message}</Text> : null}
              </>
            ) : (
              <Text style={styles.collapsedHint}>Controls hidden — tap Expand to show.</Text>
            )}
            {controlsCollapsed && message ? <Text style={styles.toolsMessage}>{message}</Text> : null}
          </View>
        ) : null}
        {state.loaded ? (
          <View style={styles.calendarHost}>
            <state.loaded.Calendar
              key={calendarKey}
              scheduledEventService={state.loaded.scheduledEventService}
              eventContentModules={eventContentModules}
              userId={state.loaded.userId}
            />
          </View>
        ) : null}
        </ScrollView>
        </View>
      </NotificationHost>
      {modulePickerSession && state.loaded ? (
        <ModulePickerCalendarModal
          instanceKey={modulePickerSession.instanceKey}
          onClose={() => setModulePickerSession(null)}
          title={modulePickerSession.title}
          registry={state.loaded.modulePickerRegistry}
          config={{
            persistState: true,
            storageKey: modulePickerStorageKey({
              userId: state.loaded.userId,
              anchorDate: modulePickerSession.anchorDate,
              instanceKey: modulePickerSession.instanceKey,
            }),
            appName: modulePickerSession.appName,
          }}
        />
      ) : null}
    </TamaguiProvider>
  );
}

registerRootComponent(DemoApp);

export default DemoApp;

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    minHeight: '100%',
    position: 'relative',
  },
  mainScroll: {
    flex: 1,
  },
  hint: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 16,
  },
  pollHint: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  container: {
    minHeight: '100%',
    padding: 16,
    backgroundColor: '#ffffff',
    gap: 12,
  },
  banner: {
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bannerText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#374151',
    fontSize: 14,
  },
  calendarHost: {
    minHeight: 600,
    backgroundColor: '#ffffff',
  },
  errorBox: {
    borderWidth: 1,
    borderColor: '#b91c1c',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
  },
  errorTitle: {
    color: '#7f1d1d',
    fontWeight: '700',
    marginBottom: 6,
  },
  errorMessage: {
    color: '#7f1d1d',
  },
  toolsBox: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    gap: 8,
  },
  toolsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toolsTitle: {
    color: '#111827',
    fontWeight: '700',
    flex: 1,
  },
  collapseButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
  },
  collapseButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  collapsedHint: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 8,
    marginBottom: 4,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  tabActive: {
    backgroundColor: '#dbeafe',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  tabTextActive: {
    color: '#1d4ed8',
  },
  tabPanel: {
    gap: 8,
  },
  panelHint: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  subPanelTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginTop: 4,
  },
  toolsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolButton: {
    backgroundColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  toolButtonAccent: {
    backgroundColor: '#059669',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  toolButtonWarn: {
    backgroundColor: '#d97706',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  toolButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  toolsMessage: {
    color: '#1f2937',
    fontSize: 13,
  },
  jsonInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    padding: 8,
    fontSize: 12,
    color: '#111827',
  },
  logBox: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 8,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  logTitle: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 12,
  },
  logLine: {
    color: '#334155',
    fontSize: 12,
  },
});

