import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UnifiedProfileResponse } from "../services/profile/profile.service";
import { ProfileType } from "./constants";

interface UserState {
  profile: UnifiedProfileResponse | null;
  nextStep: string | null;
  setProfile: (profile: UnifiedProfileResponse) => void;
  setNextStep: (step: string | null) => void;
  isAuthenticated: () => boolean;
  canAccessDashboard: () => boolean;
  getBusinessId: () => string | null;
  getEmployeeId: () => string | null;
  resetUser: () => void;
}

export const useUserStore = create(
  persist<UserState>(
    (set, get) => ({
      profile: null,
      nextStep: null,

      setProfile: (profile) => set({ profile }),

      setNextStep: (step) => set({ nextStep: step }),

      isAuthenticated: () => {
        const profile = get().profile;
        return !!(profile?.user?.uuid);
      },

      canAccessDashboard: () => get().nextStep === "dashboard",

      getBusinessId: () => {
        const profile = get().profile;
        if (!profile) return null;
        if (profile.profile_type === ProfileType.BUSINESS && profile.business?.uuid) {
          return profile.business.uuid;
        }
        if (profile.profile_type === ProfileType.EMPLOYEE && profile.employee?.business_id) {
          return profile.employee.business_id;
        }
        return null;
      },

      getEmployeeId: () => {
        const profile = get().profile;
        if (!profile) return null;
        if (profile.profile_type === ProfileType.EMPLOYEE && profile.employee?.uuid) {
          return profile.employee.uuid;
        }
        return null;
      },

      resetUser: () => set({
        profile: null,
        nextStep: null,
      }),
    }),
    {
      name: "web-eq-user",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
