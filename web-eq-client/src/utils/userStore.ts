import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UnifiedProfileResponse } from "../services/profile/profile.service";
import { ProfileType } from "./constants";

export interface UserInfo {
  uuid: string;
  country_code: string;
  phone_number: string;
  full_name?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: number | null;
}

interface UserState {
  userInfo: UserInfo | null;
  profile: UnifiedProfileResponse | null;
  
  setUserInfo: (info: UserInfo) => void;
  setProfile: (profile: UnifiedProfileResponse) => void;
  isAuthenticated: () => boolean;
  getBusinessId: () => string | null;
  getEmployeeId: () => string | null;
  resetUser: () => void;
}

export const useUserStore = create(
  persist<UserState>(
    (set, get) => ({
      userInfo: null,
      profile: null,
      
      setUserInfo: (info) =>
        set({
          userInfo: {
            ...info,
            date_of_birth: info.date_of_birth 
              ? (typeof info.date_of_birth === 'string' 
                  ? info.date_of_birth 
                  : new Date(info.date_of_birth).toISOString())
              : null,
          },
        }),

      setProfile: (profile) => set({ profile }),

      isAuthenticated: () => {
        const userInfo = get().userInfo;
        return !!userInfo && !!userInfo.uuid;
      },

      getBusinessId: () => {
        const profile = get().profile;
        if (!profile) return null;
        
        if (profile.profile_type === ProfileType.BUSINESS && profile.business?.uuid) {
          return profile.business.uuid;
        } else if (profile.profile_type === ProfileType.EMPLOYEE && profile.employee?.business_id) {
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
        userInfo: null, 
        profile: null
      }),
    }),
    {
      name: "web-eq-user",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
