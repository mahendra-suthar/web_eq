/**
 * Auth store for managing authentication state.
 * userInfo + profileType are persisted in localStorage.
 * token is persisted in sessionStorage so it survives page reloads but is
 * isolated per-tab and cleared on browser close (avoids the cookie-collision
 * logout bug when both admin and customer apps are open in the same browser).
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

const TOKEN_SS_KEY = 'eq_customer_token';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userInfo: null,
      profileType: null,
      // Bootstrap token from sessionStorage so it survives page reloads
      token: sessionStorage.getItem(TOKEN_SS_KEY) ?? null,

      setToken: (token) => {
        if (token) sessionStorage.setItem(TOKEN_SS_KEY, token);
        else sessionStorage.removeItem(TOKEN_SS_KEY);
        set({ token });
      },

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

      resetUser: () => {
        sessionStorage.removeItem(TOKEN_SS_KEY);
        set({ userInfo: null, profileType: null, token: null });
      },
    }),
    {
      name: 'web-eq-customer-user',
      storage: createJSONStorage(() => localStorage),
      // token lives in sessionStorage (above); only user identity is in localStorage
      partialize: (state) => ({ userInfo: state.userInfo, profileType: state.profileType }) as AuthState,
    }
  )
);
