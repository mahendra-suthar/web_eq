import axios, {
  type AxiosInstance,
  type AxiosResponse,
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { getApiUrl } from '../../configs/config';
import { useAuthStore } from '../../store/auth.store';
import { resolveErrorMessage } from '../../utils/util';

type RefreshResult = { token?: string; authFailed?: boolean };

const MAX_TRANSIENT_RETRIES = 3;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// True for errors worth retrying: connectivity loss, request timeout, or a
// gateway/unavailable response (e.g. a cold-starting server waking up).
function isTransientError(error: any): boolean {
  const status = error?.response?.status;
  const code = error?.code;
  return (
    code === "ERR_NETWORK" ||
    code === "ECONNABORTED" ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

// Silent refresh with its own transient retry. Returns a fresh token on success,
// { authFailed: true } only on a real 401/403 (→ log out), or {} on transient
// failure (→ keep the session; a cold-start must never force a logout).
async function refreshCustomerToken(baseURL: string): Promise<RefreshResult> {
  for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      const res = await axios.post(
        `${baseURL}/auth/token/refresh`,
        {},
        { withCredentials: true }
      );
      return { token: (res.data?.token?.access_token as string) ?? undefined };
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) return { authFailed: true };
      if (attempt < MAX_TRANSIENT_RETRIES - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  return {}; // transient failure after retries — do not log out
}

// Module-level: all HttpClient instances share one in-flight refresh promise.
// Concurrent 401s wait for the same promise instead of firing parallel refresh calls.
let refreshPromise: Promise<RefreshResult> | null = null;

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
        const isRefreshUrl = String(originalRequest?.url ?? "").includes("/auth/token/refresh");

        // 1) Silent refresh: attempt once on 401 (not 403 — wrong role, refresh won't help).
        //    Skip if this IS the refresh call itself (prevents infinite loop).
        if (
          status === 401 &&
          originalRequest &&
          !originalRequest._refreshAttempted &&
          !isRefreshUrl
        ) {
          originalRequest._refreshAttempted = true;

          // Reuse an in-flight refresh — concurrent 401s share one promise.
          if (!refreshPromise) {
            refreshPromise = refreshCustomerToken(baseURL)
              .finally(() => { refreshPromise = null; });
          }

          const result = await refreshPromise;
          if (result.token) {
            useAuthStore.getState().setToken(result.token);
            originalRequest.headers = {
              ...originalRequest.headers,
              Authorization: `Bearer ${result.token}`,
            };
            return await this.instance(originalRequest);
          }
          // Real auth rejection → log out. Transient refresh failure (cold-start,
          // network) → keep the session and let the caller surface a retryable error.
          if (result.authFailed) {
            window.dispatchEvent(new Event("auth:unauthorized"));
          }
          return Promise.reject(error);
        }

        // 2) A 401 that survives a refresh+retry (fresh token also rejected), or a
        //    403 (wrong role): a genuine auth failure — log out. Never for the
        //    refresh endpoint itself; useSessionRestore decides that case.
        if ((status === 401 || status === 403) && !isRefreshUrl) {
          window.dispatchEvent(new Event("auth:unauthorized"));
          return Promise.reject(error);
        }

        // 3) Transient failures (network drop, timeout, cold-start gateway):
        //    retry the original request with exponential backoff (1s, 2s, 4s).
        if (isTransientError(error) && originalRequest) {
          const retries = originalRequest._retryCount ?? 0;
          if (retries < MAX_TRANSIENT_RETRIES) {
            originalRequest._retryCount = retries + 1;
            await sleep(1000 * 2 ** retries);
            return await this.instance(originalRequest);
          }
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
    if (axios.isAxiosError(error)) {
      const e = error as AxiosError;
      if (import.meta.env.DEV) {
        console.error("Axios Error Details:", {
          message: e.message,
          code: e.code,
          response: e.response,
        });
      }
      error.message = resolveErrorMessage(e);
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
