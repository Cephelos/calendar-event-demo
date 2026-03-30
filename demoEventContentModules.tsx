import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EventContentModuleDefinition } from '@enhearten/calendar-module';
import { DEMO_NOTIFICATION_SLOT_TYPE } from './demoNotificationService';

export type ModulePickerSession = {
  instanceKey: string;
  anchorDate: Date;
  title: string;
  appName: string;
};

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function modulePickerStorageKey(params: {
  userId: string;
  anchorDate: Date;
  instanceKey: string;
}): string {
  return `module-picker-cal-${params.userId}-${localDayKey(params.anchorDate)}-${params.instanceKey}`;
}

/**
 * Calendar scheduled-event content slots for the demo: module-picker (openable) + notification config.
 */
export function buildDemoEventContentModules(params: {
  userId: string;
  modulePickerType: string;
  mobileModules: Array<{ id: string; label: string }>;
  desktopModules: Array<{ id: string; label: string }>;
  onOpenModulePicker: (session: ModulePickerSession) => void;
}): EventContentModuleDefinition[] {
  const { userId, modulePickerType, mobileModules, desktopModules, onOpenModulePicker } = params;

  return [
    {
      moduleType: modulePickerType,
      label: 'Module workspace',
      createDefaultConfig: () => ({ appName: 'Calendar demo' }),
      renderEditor: ({ config, onChange, mode, slot: _slot, context }) => {
        const readOnly = mode === 'view';
        const appName = String(config.appName ?? 'Calendar demo');
        const instanceKey = `${context.savedScheduledEventId ?? 'draft'}-${context.slotInstanceId}`;
        return (
          <View style={styles.slotBlock}>
            <Text style={styles.label}>Module picker app name</Text>
            <TextInput
              editable={!readOnly}
              value={appName}
              onChangeText={(t) => onChange({ ...config, appName: t })}
              style={styles.input}
            />
            <Pressable
              style={styles.openPickerBtn}
              onPress={() =>
                onOpenModulePicker({
                  instanceKey,
                  anchorDate: context.eventStart,
                  title: context.eventTitle?.trim() ? context.eventTitle : 'Module workspace',
                  appName,
                })
              }
            >
              <Text style={styles.openPickerBtnText}>Open module workspace</Text>
            </Pressable>
            <Text style={styles.hint}>
              Opens the full module picker in a separate modal. State is persisted per calendar day and slot.
            </Text>
          </View>
        );
      },
    },
    {
      moduleType: DEMO_NOTIFICATION_SLOT_TYPE,
      label: 'Notification',
      createDefaultConfig: () => ({
        mobileNotificationModuleId: '',
        desktopNotificationModuleId: '',
        notificationLeadMinutes: 10,
      }),
      renderEditor: ({ config, onChange, mode }) => {
        const readOnly = mode === 'view';
        const lead = String(config.notificationLeadMinutes ?? 10);
        return (
          <View style={styles.slotBlock}>
            <Text style={styles.hint}>
              Reminder fires at event start minus lead minutes. Dispatches merge with event-module events in the
              notification host.
            </Text>
            <Text style={styles.label}>Mobile notification module</Text>
            {Platform.OS === 'web' ? (
              <select
                value={String(config.mobileNotificationModuleId ?? '')}
                onChange={(e) => onChange({ ...config, mobileNotificationModuleId: e.target.value })}
                disabled={readOnly}
                style={styles.webSelect}
              >
                <option value="">None</option>
                {mobileModules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <TextInput
                editable={!readOnly}
                value={String(config.mobileNotificationModuleId ?? '')}
                onChangeText={(t) => onChange({ ...config, mobileNotificationModuleId: t })}
                style={styles.input}
              />
            )}
            <Text style={styles.label}>Desktop notification module</Text>
            {Platform.OS === 'web' ? (
              <select
                value={String(config.desktopNotificationModuleId ?? '')}
                onChange={(e) => onChange({ ...config, desktopNotificationModuleId: e.target.value })}
                disabled={readOnly}
                style={styles.webSelect}
              >
                <option value="">None</option>
                {desktopModules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <TextInput
                editable={!readOnly}
                value={String(config.desktopNotificationModuleId ?? '')}
                onChangeText={(t) => onChange({ ...config, desktopNotificationModuleId: t })}
                style={styles.input}
              />
            )}
            <Text style={styles.label}>Lead minutes</Text>
            <TextInput
              editable={!readOnly}
              value={lead}
              keyboardType="numeric"
              onChangeText={(t) => onChange({ ...config, notificationLeadMinutes: Number(t) || 0 })}
              style={styles.input}
            />
          </View>
        );
      },
    },
  ];
}

const styles = StyleSheet.create({
  slotBlock: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    color: '#374151',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
  },
  webSelect: {
    width: '100%',
    minHeight: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 8,
    fontSize: 14,
  },
  openPickerBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f766e',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  openPickerBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
