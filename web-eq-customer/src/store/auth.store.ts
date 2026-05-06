/**
 * Auth store for managing authentication state.
 * Token is stored in cookies by backend, only user info is stored here.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface UserInfo {
  uuid: string;
  country_code: string;
  phone_number: string;
  full_name?: string | null;
  email?: string | null;
  email_verify?: boolean;
  date_of_birth?: string | null;
  gender?: number | null;
}

interface AuthState {
  userInfo: UserInfo | null;
  profileType: string | null;
  token: string | null;

  setUserInfo: (info: UserInfo) => void;
  setProfileType: (type: string | null) => void;
  setToken: (token: string | null) => void;
  isAuthenticated: () => boolean;
  resetUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userInfo: null,
      profileType: null,
      token: null,

      setToken: (token) => set({ token }),
      setProfileType: (type) => set({ profileType: type }),

      setUserInfo: (info) =>
        set({
          userInfo: {
            ...info,
            date_of_birth: info.date_of_birth ? String(info.date_of_birth).slice(0, 10) : null,
          },
        }),

      isAuthenticated: () => {
        const userInfo = get().userInfo;
        return !!userInfo && !!userInfo.uuid;
      },

      resetUser: () => set({ userInfo: null, profileType: null, token: null }),
    }),
    {
      name: 'web-eq-customer-user',
      storage: createJSONStorage(() => localStorage),
      // token is memory-only; profileType is persisted for the cross-session guard
      partialize: (state) => ({ userInfo: state.userInfo, profileType: state.profileType }) as AuthState,
    }
  )
);
