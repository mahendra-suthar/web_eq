import axios, {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import { getApiUrl } from '../../configs/config';
import { useUserStore } from '../../utils/userStore';

// Shared across all HttpClient instances — concurrent 401s reuse one refresh call.
let refreshPromise: Promise<string | null> | null = null;

class HttpClient {
  private instance: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = getApiUrl();
    this.instance = axios.create({
      baseURL: this.baseURL,
      timeout: 120000, // 2 min
      withCredentials: true,
    });

    this.instance.interceptors.request.use(
      (config) => {
        if (!(config.data instanceof FormData)) {
          config.headers['Content-Type'] = 'application/json';
        }
        config.withCredentials = true;
        const token = useUserStore.getState().token;
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
      },
      this.handleRequestError
    );

    this.instance.interceptors.request.use(
      this.handleRequestConfig,
      this.handleRequestError
    );

    this.instance.interceptors.response.use(
      this.handleSuccess,
      async (error: any) => {
        const status = error?.response?.status;
        const originalRequest = error?.config as any;
        const isRefreshUrl = String(originalRequest?.url ?? "").includes("/auth/token/refresh-business");

        // Silent refresh: attempt once on 401 (not 403 — wrong role, refresh won't help).
        if (
          status === 401 &&
          originalRequest &&
          !originalRequest._refreshAttempted &&
          !isRefreshUrl
        ) {
          originalRequest._refreshAttempted = true;

          if (!refreshPromise) {
            refreshPromise = axios
              .post(`${this.baseURL}/auth/token/refresh-business`, {}, { withCredentials: true })
              .then((res) => (res.data?.token?.access_token as string) ?? null)
              .catch(() => null)
              .finally(() => { refreshPromise = null; });
          }

          const newToken = await refreshPromise;
          if (newToken) {
            useUserStore.getState().setToken(newToken);
            originalRequest.headers = {
              ...originalRequest.headers,
              Authorization: `Bearer ${newToken}`,
            };
            return await this.instance(originalRequest);
          }

          window.dispatchEvent(new Event("auth:unauthorized"));
          return Promise.reject(error);
        }

        // 403 = wrong role; refresh won't help — log out immediately.
        // ERR_NETWORK is a connectivity issue, not an auth failure — do not log out.
        if (status === 403 && !isRefreshUrl) {
          window.dispatchEvent(new Event("auth:unauthorized"));
        }

        return Promise.reject(error);
      }
    );
  }

  private handleRequestConfig(config: InternalAxiosRequestConfig<any>): InternalAxiosRequestConfig<any> {
    config.withCredentials = true; // Ensure cookies are sent with the request
    return config;
  }

  private handleRequestError(error: any): Promise<any> {
    console.error("Request error:", error);
    return Promise.reject(error);
  }

  private handleSuccess<T>(response: AxiosResponse<T>): T {
    return response.data;
  }

  private handleError(error: any): never {
    if (axios.isAxiosError(error)) {
      const e = error as AxiosError;
      const status = e.response?.status;
      const code = e.code ?? "UNKNOWN";
      if (status === 401 || code === "ERR_NETWORK") {
        console.warn("Unauthorized or network error", status ?? code);
      } else {
        console.error("Request error:", e.message, e.response?.data);
      }
    }
    throw error;
  }

  public async get<T>(url: string, config?: AxiosRequestConfig<any>): Promise<any> {
    try {
      const response = await this.instance.get<T>(url, config);
      return response;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig<any>): Promise<any> {
    try {
      const response = await this.instance.post<T>(url, data, config);      
      return response;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig<any>): Promise<any> {
    try {
      const response = await this.instance.put<T>(url, data, config);
      return response;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  public async patch<T>(url: string, data?: any, config?: AxiosRequestConfig<any>): Promise<any> {
    try {
      const response = await this.instance.patch<T>(url, data, config);
      return response;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig<any>): Promise<any> {
    try {
      const response = await this.instance.delete<T>(url, config);
      return response;
    } catch (error: any) {
      this.handleError(error);
    }
  }
}

export { HttpClient };
