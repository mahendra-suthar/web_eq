import axios, {
  type AxiosInstance,
  type AxiosResponse,
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { getApiUrl } from '../../configs/config';
import { useAuthStore } from '../../store/auth.store';

// Module-level: all HttpClient instances share one in-flight refresh promise.
// Concurrent 401s wait for the same promise instead of firing parallel refresh calls.
let refreshPromise: Promise<string | null> | null = null;

class HttpClient {
  private instance: AxiosInstance;

  constructor() {
    const baseURL = getApiUrl();
    this.instance = axios.create({
      baseURL,
      timeout: 120000, // 2 min
      withCredentials: true,
    });    

    this.instance.interceptors.request.use(
      (config) => {
        // Don't set Content-Type for FormData - let browser handle it
        if (!(config.data instanceof FormData)) {
          config.headers['Content-Type'] = 'application/json';
        }
        config.withCredentials = true;
        // app's session even when another app's cookie exists on the same domain.
        const token = useAuthStore.getState().token;
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

        // Silent refresh: attempt once on 401 (not 403 — wrong role, refresh won't help).
        // Skip if this IS the refresh call itself (prevents infinite loop).
        if (
          status === 401 &&
          originalRequest &&
          !originalRequest._refreshAttempted &&
          !String(originalRequest.url ?? "").includes("/auth/token/refresh")
        ) {
          originalRequest._refreshAttempted = true;

          // Reuse an in-flight refresh — concurrent 401s share one promise.
          if (!refreshPromise) {
            refreshPromise = axios
              .post(`${baseURL}/auth/token/refresh`, {}, { withCredentials: true })
              .then((res) => (res.data?.access_token as string) ?? null)
              .catch(() => null)
              .finally(() => { refreshPromise = null; });
          }

          const newToken = await refreshPromise;
          if (newToken) {
            useAuthStore.getState().setToken(newToken);
            originalRequest.headers = {
              ...originalRequest.headers,
              Authorization: `Bearer ${newToken}`,
            };
            return await this.instance(originalRequest);
          }

          window.dispatchEvent(new Event("auth:unauthorized"));
          return Promise.reject(error);
        }

        if (status === 401 || status === 403) {
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
    if (import.meta.env.DEV) console.error("Request error:", error);
    return Promise.reject(error);
  }

  private handleSuccess<T>(response: AxiosResponse<T>): T {
    return response.data;
  }

  private handleError(error: any): never {
    if (import.meta.env.DEV && axios.isAxiosError(error)) {
      const e = error as AxiosError;
      console.error("Axios Error Details:", {
        message: e.message,
        code: e.code,
        response: e.response,
      });
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
