import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface UserInfo {
  uuid: string;
  country_code: string;
  phone_number: string;
  full_name?: string | null;
  email?: string | null;
  date_of_birth?: string | null; // Stored as ISO string for serialization
  gender?: number | null;
}

interface UserState {
  userInfo: UserInfo | null;
  
  setUserInfo: (info: UserInfo) => void;
  isAuthenticated: () => boolean;
  resetUser: () => void;
}

export const useUserStore = create(
  persist<UserState>(
    (set, get) => ({
      userInfo: null,
      
      setUserInfo: (info) =>
        set({
          userInfo: {
            ...info,
            // Ensure date_of_birth is stored as ISO string
            date_of_birth: info.date_of_birth 
              ? (typeof info.date_of_birth === 'string' 
                  ? info.date_of_birth 
                  : new Date(info.date_of_birth).toISOString())
              : null,
          },
        }),

      isAuthenticated: () => {
        const userInfo = get().userInfo;
        return !!userInfo && !!userInfo.uuid;
      },

      resetUser: () => set({ userInfo: null }),
    }),
    {
      name: "web-eq-user",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
