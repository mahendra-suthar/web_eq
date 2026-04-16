import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UnifiedProfileResponse } from "../services/profile/profile.service";
import { ProfileType } from "./constants";

interface UserState {
  profile: UnifiedProfileResponse | null;
  nextStep: string | null;
  token: string | null;

  impersonating: boolean;
  impersonatedBusinessName: string | null;
  preImpersonationProfile: UnifiedProfileResponse | null;

  setProfile: (profile: UnifiedProfileResponse) => void;
  setNextStep: (step: string | null) => void;
  setToken: (token: string | null) => void;
  isAuthenticated: () => boolean;
  canAccessDashboard: () => boolean;
  getProfileType: () => ProfileType | null;
  getBusinessId: () => string | null;
  getEmployeeId: () => string | null;
  resetUser: () => void;

  startImpersonation: (token: string, businessName: string) => void;
  exitImpersonation: () => void;
  isImpersonating: () => boolean;
}

export const useUserStore = create(
  persist<UserState>(
    (set, get) => ({
      profile: null,
      nextStep: null,
      token: null,
      impersonating: false,
      impersonatedBusinessName: null,
      preImpersonationProfile: null,

      setProfile: (profile) => set({ profile }),
      setNextStep: (step) => set({ nextStep: step }),
      setToken: (token) => set({ token }),

      isAuthenticated: () => {
        const profile = get().profile;
        return !!(profile?.user?.uuid);
      },

      canAccessDashboard: () => get().nextStep === "dashboard",

      getProfileType: () => {
        const profile = get().profile;
        if (!profile?.profile_type) return null;
        const pt = profile.profile_type.toUpperCase();
        if (
          pt === ProfileType.BUSINESS ||
          pt === ProfileType.EMPLOYEE ||
          pt === ProfileType.CUSTOMER ||
          pt === ProfileType.ADMIN
        ) {
          return pt as ProfileType;
        }
        return null;
      },

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
        if (profile.profile_type === ProfileType.BUSINESS && profile.employee?.uuid) {
          return profile.employee.uuid;
        }
        return null;
      },

      resetUser: () => set({
        profile: null,
        nextStep: null,
        token: null,
        impersonating: false,
        impersonatedBusinessName: null,
        preImpersonationProfile: null,
      }),

      // Impersonation

      startImpersonation: (token, businessName) =>
        set((state) => ({
          preImpersonationProfile: state.profile,
          token,
          impersonating: true,
          impersonatedBusinessName: businessName,
        })),

      exitImpersonation: () =>
        set((state) => ({
          profile: state.preImpersonationProfile,
          nextStep: "dashboard",
          token: null,
          impersonating: false,
          impersonatedBusinessName: null,
          preImpersonationProfile: null,
        })),

      isImpersonating: () => get().impersonating,
    }),
    {
      name: "web-eq-user",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        profile: state.profile,
        nextStep: state.nextStep,
        impersonating: state.impersonating,
        impersonatedBusinessName: state.impersonatedBusinessName,
        preImpersonationProfile: state.preImpersonationProfile,
      }) as UserState,
    }
  )
);
