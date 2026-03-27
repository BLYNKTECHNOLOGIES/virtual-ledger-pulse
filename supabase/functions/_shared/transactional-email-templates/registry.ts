/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as taskNotification } from './task-notification.tsx'
import { template as taskSpectatorNotification } from './task-spectator-notification.tsx'
import { template as taskCompleted } from './task-completed.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'task-notification': taskNotification,
  'task-spectator-notification': taskSpectatorNotification,
  'task-completed': taskCompleted,
}
