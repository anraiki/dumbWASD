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
  emit(code: number, pressed: boolean): Promise<void>;
  persist(code: number, nextTarget: MappingTarget | null): Promise<void>;
}

export function createLegacyBinder(options: {
  profileManager: ProfileManagerHandle;
  onProfileUpdate(profile: Profile): void;
  syncMonitoringScope(): Promise<void>;
}): LegacyBinderHandle {
  function getMapping(code: number): MappingTarget | null {
    const currentProfile = options.profileManager.getCurrentProfile();
    if (!currentProfile) return null;

    const match = currentProfile.mappings.find(
      (mapping) => mapping.from === code && isSupportedMappingTarget(mapping.to)
    );

    return match ? { ...match.to } : null;
  }

  return {
    getMapping,

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

      await invoke("emit_output_target", { target: mapping, pressed });
    },

    async persist(code: number, nextTarget: MappingTarget | null) {
      const currentProfile = options.profileManager.getCurrentProfile();
      const currentProfileName = options.profileManager.getCurrentProfileName();
      if (!currentProfile || !currentProfileName) {
        throw new Error("Select a profile first");
      }

      const nextMappings = currentProfile.mappings.filter((mapping) => mapping.from !== code);
      if (nextTarget) {
        nextMappings.push({ from: code, to: { ...nextTarget } });
      }

      const nextProfile: Profile = { ...currentProfile, mappings: nextMappings };
      await invoke("save_profile", { name: currentProfileName, profile: nextProfile });

      options.onProfileUpdate(nextProfile);
      await options.syncMonitoringScope();
    },
  };
}
