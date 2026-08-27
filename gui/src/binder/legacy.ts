import { invoke } from "@tauri-apps/api/core";
import { isSupportedMappingTarget, type MappingTarget } from "../input-codes";
import type { Profile, ProfileManagerHandle } from "../profile-manager";

/**
 * Legacy direct button-to-action mappings stored on the profile.
 * Predates the macro studio system. May be removed once macro studio
 * covers all use cases.
 */

export interface LegacyBinderHandle {
  getMapping(code: number): MappingTarget | null;
  /** Whether this binding claims exclusive use of the output while held. */
  getExclusive(code: number): boolean;
  /** Whether this binding latches on alternate presses. */
  getToggle(code: number): boolean;
  emit(code: number, pressed: boolean): Promise<void>;
  persist(
    code: number,
    nextTarget: MappingTarget | null,
    flags?: { exclusive?: boolean; toggle?: boolean },
  ): Promise<void>;
}

export function createLegacyBinder(options: {
  profileManager: ProfileManagerHandle;
  onProfileUpdate(profile: Profile): void;
  syncMonitoringScope(): Promise<void>;
}): LegacyBinderHandle {
  function findMapping(code: number) {
    const currentProfile = options.profileManager.getCurrentProfile();
    const selectedDevice = options.profileManager.getSelectedDevice();
    if (!currentProfile || !selectedDevice || selectedDevice.mappings_enabled === false) return null;

    const deviceKeys = new Set(
      [selectedDevice.id, `${selectedDevice.vendor_id}:${selectedDevice.product_id}`].filter(
        (value): value is string => !!value,
      ),
    );

    return (
      currentProfile.mappings.find(
        (mapping) =>
          mapping.from === code &&
          (!mapping.device || deviceKeys.has(mapping.device)) &&
          isSupportedMappingTarget(mapping.to)
      ) ?? null
    );
  }

  function getMapping(code: number): MappingTarget | null {
    const match = findMapping(code);
    return match ? { ...match.to } : null;
  }

  function getExclusive(code: number): boolean {
    return findMapping(code)?.exclusive === true;
  }

  function getToggle(code: number): boolean {
    return findMapping(code)?.toggle === true;
  }

  return {
    getMapping,
    getExclusive,
    getToggle,

    async emit(code: number, pressed: boolean) {
      const mapping = getMapping(code);
      if (!mapping) return;

      if (mapping.type === "macro") {
        // Playback uses the profile-embedded snapshot, never the library.
        const { definition } = mapping;

        if (mapping.mode === "hold") {
          // Hold semantics: playback runs while the button is held.
          if (pressed) {
            await invoke("start_macro_playback", { definition });
          } else {
            await invoke("stop_macro_playback", { id: definition.id });
          }
          return;
        }

        // Toggle semantics: press starts the macro, pressing again stops it.
        // Releases are ignored.
        if (!pressed) return;
        await invoke("toggle_macro_playback", { definition });
        return;
      }

      // `code` lets the backend key auto-repeat and output arbitration to
      // the source button, so releasing it is what ends both.
      await invoke("emit_output_target", {
        target: mapping,
        pressed,
        code,
        exclusive: getExclusive(code),
        toggle: getToggle(code),
      });
    },

    async persist(
      code: number,
      nextTarget: MappingTarget | null,
      flags: { exclusive?: boolean; toggle?: boolean } = {},
    ) {
      const currentProfile = options.profileManager.getCurrentProfile();
      const currentProfileName = options.profileManager.getCurrentProfileName();
      if (!currentProfile || !currentProfileName) {
        throw new Error("Select a profile first");
      }

      const selectedDevice = options.profileManager.getSelectedDevice();
      if (!selectedDevice) throw new Error("Select a device first");
      const device = selectedDevice.id || `${selectedDevice.vendor_id}:${selectedDevice.product_id}`;
      const nextMappings = currentProfile.mappings.filter(
        (mapping) => mapping.from !== code || (mapping.device && mapping.device !== device),
      );
      if (nextTarget) {
        nextMappings.push({
          device,
          from: code,
          to: { ...nextTarget },
          ...(flags.exclusive ? { exclusive: true } : {}),
          ...(flags.toggle ? { toggle: true } : {}),
        });
      }

      const nextProfile: Profile = { ...currentProfile, mappings: nextMappings };
      await invoke("save_profile", { name: currentProfileName, profile: nextProfile });

      options.onProfileUpdate(nextProfile);
      await options.syncMonitoringScope();
    },
  };
}
