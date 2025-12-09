import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import { IAuthService } from '@/core/interfaces/IAuthService';
import { ILogger } from '@/core/interfaces/ILogger';

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface ApiRequestOptions<T> {
    method?: RequestMethod;
    body?: T;
    headers?: Record<string, string>;
    skipAuth?: boolean;
}

export class ApiClient {
    private static async request<TResponse, TBody = unknown>(
        endpoint: string,
        options: ApiRequestOptions<TBody> = {}
    ): Promise<TResponse> {
        const { method = 'GET', body, headers = {}, skipAuth = false } = options;
        const logger = clientContainer.get<ILogger>(TYPES.Logger);

        try {
            const requestHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                ...headers,
            };

            if (!skipAuth) {
                const authService = clientContainer.get<IAuthService>(TYPES.AuthService);
                const token = await authService.getToken();
                if (token) {
                    requestHeaders['Authorization'] = `Bearer ${token}`;
                }
            }

            const response = await fetch(endpoint, {
                method,
                headers: requestHeaders,
                body: body ? JSON.stringify(body) : undefined,
            });

            if (!response.ok) {
                let errorMessage = `API Error: ${response.status} ${response.statusText}`;
                try {
                    const errorBody = await response.json();
                    if (errorBody.message) errorMessage = errorBody.message;
                } catch {
                    // Ignore JSON parse error on error response
                }

                throw new Error(errorMessage);
            }

            // Handle empty responses (e.g. 204)
            if (response.status === 204) {
                return {} as TResponse;
            }

            return await response.json();

        } catch (error) {
            logger.error(`API Request Failed: ${method} ${endpoint}`, error);
            throw error;
        }
    }

    public static async get<T>(endpoint: string, headers?: Record<string, string>) {
        return this.request<T>(endpoint, { method: 'GET', headers });
    }

    public static async post<T, B>(endpoint: string, body: B, headers?: Record<string, string>) {
        return this.request<T, B>(endpoint, { method: 'POST', body, headers });
    }

    public static async put<T, B>(endpoint: string, body: B, headers?: Record<string, string>) {
        return this.request<T, B>(endpoint, { method: 'PUT', body, headers });
    }

    public static async delete<T>(endpoint: string, headers?: Record<string, string>) {
        return this.request<T>(endpoint, { method: 'DELETE', headers });
    }
}
