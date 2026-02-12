import axios, {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import { getApiUrl } from '../../configs/config';


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
      (error: any) => {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          try {
            // Clear persisted user state; next load starts unauthenticated
            window.localStorage.removeItem("web-eq-user");
          } catch (_) {}
          try {
            window.location.replace("/send-otp");
          } catch (_) {}
        }
        return Promise.reject(error);
      }
    );
  }

  private handleRequestConfig<T>(config: InternalAxiosRequestConfig<any>): InternalAxiosRequestConfig<any> {
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
      if (status === 401 || e.code === "ERR_NETWORK") {
        console.warn("Unauthorized or network error", status ?? e.code);
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
