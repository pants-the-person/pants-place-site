import type { ComponentType } from 'preact';

export type WindowMode = 'normal' | 'min' | 'max';
export type AppCategory = 'accessories' | 'games' | 'internet' | 'system' | 'wine';

export interface DialogButton {
  id: string;
  label: string;
  default?: boolean;
}

export interface DialogOptions {
  title: string;
  message: string;
  detail?: string;
  icon?: string;
  kind?: 'info' | 'warning' | 'error' | 'question';
  buttons?: DialogButton[];
  input?: {
    value?: string;
    placeholder?: string;
    label?: string;
  };
}

export interface DialogState extends DialogOptions {
  id: string;
  resolve: (value: string) => void;
}

export interface AppApi {
  close: () => void;
  focus: () => void;
  setTitle: (title: string) => void;
  openApp: (appId: string, props?: Record<string, unknown>) => void;
  dialog: (options: DialogOptions) => Promise<string>;
  notify: (message: string) => void;
}

export interface AppProps {
  windowId: string;
  appProps: Record<string, unknown>;
  api: AppApi;
}

export interface AppDefinition {
  id: string;
  title: string;
  icon: string;
  smallIcon?: string;
  category: AppCategory;
  description?: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  resizable?: boolean;
  singleton?: boolean;
  component: () => Promise<{ default: ComponentType<AppProps> }>;
  createProps?: (api: AppApi) => Record<string, unknown>;
  startMenu?: 'programs' | 'games' | 'internet' | 'settings' | 'system' | 'none';
  desktop?: boolean;
  hidden?: boolean;
}

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  mode: WindowMode;
  props: Record<string, unknown>;
  resizable: boolean;
  minW: number;
  minH: number;
  restore?: { x: number; y: number; w: number; h: number };
  createdAt: number;
}

export interface DesktopDocument {
  id: string;
  title: string;
  filename: string;
  body: string;
  updated?: string;
}
