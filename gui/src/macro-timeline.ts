export interface MacroActionItem {
  id: number;
  kind: "action";
  code: number;
  input: string;
  direction: "down" | "up";
}

export interface MacroWaitItem {
  id: number;
  kind: "wait";
  durationMs: number;
}

export type MacroTimelineItem = MacroActionItem | MacroWaitItem;

export interface PlaybackConfig {
  leadInMs: number;
  iterations: number;
  pauseBetweenIterationsMs: number;
}

export interface MacroTimelineHandle {
  getTimeline(): MacroTimelineItem[];
  setTimeline(items: MacroTimelineItem[]): void;
  isRecording(): boolean;
  isPlaybackRunning(): boolean;
  getActivePlaybackItemId(): number | null;
  getPlaybackLog(): string[];
  nextId(): number;
  appendLog(entry: string): void;
  handleInputEvent(code: number, pressed: boolean): void;
  startRecording(): void;
  stopRecording(message?: string): void;
  startPlayback(config: PlaybackConfig): void;
  stopPlayback(message?: string): void;
}

export function createMacroTimeline(options: {
  getIsMonitoringActive(): boolean;
  normalizeInput(code: number): string;
  onUpdate(): void;
  onRecorded(): void;
}): MacroTimelineHandle {
  let recording = false;
  let playbackRunning = false;
  let activePlaybackItemId: number | null = null;
  let lastRecordedAt = 0;
  let nextItemId = 1;
  let timeline: MacroTimelineItem[] = [];
  let playbackLog: string[] = [];
  let playbackTimers: number[] = [];

  function nextId() {
    return nextItemId++;
  }

  function appendLog(entry: string) {
    playbackLog = [entry, ...playbackLog].slice(0, 18);
  }

  function formatDuration(durationMs: number) {
    return `${durationMs} ms`;
  }

  function totalDurationMs(config: PlaybackConfig) {
    const perIteration = timeline.reduce(
      (sum, item) => sum + (item.kind === "wait" ? item.durationMs : 0),
      0,
    );
    return (
      config.leadInMs +
      perIteration * config.iterations +
      config.pauseBetweenIterationsMs * Math.max(0, config.iterations - 1)
    );
  }

  function clearPlaybackTimers() {
    for (const timer of playbackTimers) window.clearTimeout(timer);
    playbackTimers = [];
  }

  function handleInputEvent(code: number, pressed: boolean) {
    if (!recording) return;

    const now = performance.now();
    if (timeline.some((item) => item.kind === "action")) {
      timeline = timeline.concat({
        id: nextId(),
        kind: "wait",
        durationMs: Math.max(0, Math.round(now - lastRecordedAt)),
      });
    }

    timeline = timeline.concat({
      id: nextId(),
      kind: "action",
      code,
      input: options.normalizeInput(code),
      direction: pressed ? "down" : "up",
    });

    lastRecordedAt = now;
    appendLog(`Captured ${options.normalizeInput(code)} ${pressed ? "down" : "up"}`);
    options.onRecorded();
    options.onUpdate();
  }

  function startRecording() {
    if (!options.getIsMonitoringActive() || playbackRunning) return;
    recording = true;
    lastRecordedAt = performance.now();
    appendLog("Recording started.");
    options.onUpdate();
  }

  function stopRecording(message = "Recording stopped.") {
    if (!recording) return;
    recording = false;
    appendLog(message);
    options.onUpdate();
  }

  function startPlayback(config: PlaybackConfig) {
    if (timeline.length === 0 || playbackRunning) return;

    if (recording) stopRecording("Recording stopped for test playback.");

    clearPlaybackTimers();
    playbackRunning = true;
    activePlaybackItemId = null;
    playbackLog = [];
    appendLog(`Test playback queued for ${config.iterations} iteration${config.iterations === 1 ? "" : "s"}.`);
    options.onUpdate();

    let elapsed = config.leadInMs;
    for (let iteration = 0; iteration < config.iterations; iteration += 1) {
      for (const item of timeline) {
        if (item.kind === "wait") {
          elapsed += item.durationMs;
          const waitAt = elapsed;
          playbackTimers.push(window.setTimeout(() => {
            activePlaybackItemId = item.id;
            appendLog(`[${waitAt}ms] wait ${item.durationMs}ms • loop ${iteration + 1}`);
            options.onUpdate();
          }, waitAt));
          continue;
        }

        const actionAt = elapsed;
        playbackTimers.push(window.setTimeout(() => {
          activePlaybackItemId = item.id;
          appendLog(`[${actionAt}ms] ${item.input} ${item.direction} • loop ${iteration + 1}`);
          options.onUpdate();
        }, actionAt));
      }

      if (iteration < config.iterations - 1 && config.pauseBetweenIterationsMs > 0) {
        elapsed += config.pauseBetweenIterationsMs;
        const pauseAt = elapsed;
        playbackTimers.push(window.setTimeout(() => {
          activePlaybackItemId = null;
          appendLog(`[${pauseAt}ms] pause between iterations`);
          options.onUpdate();
        }, pauseAt));
      }
    }

    playbackTimers.push(window.setTimeout(() => {
      playbackRunning = false;
      activePlaybackItemId = null;
      playbackTimers = [];
      appendLog(`Test playback complete in ${formatDuration(totalDurationMs(config))}.`);
      options.onUpdate();
    }, elapsed + 120));
  }

  function stopPlayback(message?: string) {
    if (!playbackRunning && playbackTimers.length === 0) return;
    clearPlaybackTimers();
    playbackRunning = false;
    activePlaybackItemId = null;
    if (message) appendLog(message);
    options.onUpdate();
  }

  return {
    getTimeline: () => timeline,
    setTimeline: (items) => { timeline = items; },
    isRecording: () => recording,
    isPlaybackRunning: () => playbackRunning,
    getActivePlaybackItemId: () => activePlaybackItemId,
    getPlaybackLog: () => playbackLog,
    nextId,
    appendLog,
    handleInputEvent,
    startRecording,
    stopRecording,
    startPlayback,
    stopPlayback,
  };
}
