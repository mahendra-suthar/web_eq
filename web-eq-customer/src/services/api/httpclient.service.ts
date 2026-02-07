import axios, {
  type AxiosInstance,
  type AxiosResponse,
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
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
        config.withCredentials = true; // Cookies are used for authentication
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
    console.log("Request error:", error);
    if (axios.isAxiosError(error)) {
      const e = error as AxiosError;
      console.error("Axios Error Details:", {
        message: e.message,
        name: e.name,
        code: e.code,
        config: e.config,
        request: e.request,
        response: e.response,
      });
      // Handle 401 Unauthorized or Network Errors
      if (e.response?.status === 401 || e.code === "ERR_NETWORK") {
        console.warn("Unauthorized or Network Error");         
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
