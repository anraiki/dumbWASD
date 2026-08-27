// ── Event payload types ──

export interface ButtonStateEvent {
  code: number;
  pressed: boolean;
  device_path: string;
  device_name: string;
}

export interface AxisStateEvent {
  axis: number;
  value: number;
  device_path: string;
  device_name: string;
  minimum?: number;
  maximum?: number;
  flat?: number;
}

export interface AzeronJoystickStateEvent {
  x: number;
  y: number;
  raw_x: number;
  raw_y: number;
  source: string;
}

export interface AzeronHidReportEvent {
  length: number;
  hex: string;
  ascii?: string | null;
  parsed_source?: string | null;
}

// ── Public types ──

export interface MonitoringRequest {
  devicePaths: string[];
  label: string;
  useAzeronHid: boolean;
  legacyMappings: Array<{ device?: string; from: number; to: Record<string, unknown> }>;
  suppressMappedInputs: boolean;
}

export interface MonitorHandle {
  syncScope(force?: boolean): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
}
