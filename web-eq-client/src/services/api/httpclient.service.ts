import axios, {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import { getApiUrl } from '../../configs/config';
import { useUserStore } from '../../utils/userStore';

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
async function refreshBusinessToken(baseURL: string): Promise<RefreshResult> {
  for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      const res = await axios.post(
        `${baseURL}/auth/token/refresh-business`,
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

// Shared across all HttpClient instances — concurrent 401s reuse one refresh call.
let refreshPromise: Promise<RefreshResult> | null = null;

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

        // 1) Silent refresh: attempt once on 401 (not 403 — wrong role, refresh won't help).
        if (
          status === 401 &&
          originalRequest &&
          !originalRequest._refreshAttempted &&
          !isRefreshUrl
        ) {
          originalRequest._refreshAttempted = true;

          if (!refreshPromise) {
            refreshPromise = refreshBusinessToken(this.baseURL)
              .finally(() => { refreshPromise = null; });
          }

          const result = await refreshPromise;
          if (result.token) {
            useUserStore.getState().setToken(result.token);
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
        //    403 (wrong role): a genuine auth failure — log out immediately.
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
