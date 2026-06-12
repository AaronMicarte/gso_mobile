import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import {
  BulkScanPayload,
  BulkScanResponse,
  Condition,
  InventoryResponse,
  LoginResponse,
  PreviewScanResponse,
  RpcCycle,
  RpcInventoryCyclesResponse,
  RpcInventoryAuditLogPaginated,
  RpcInventoryReportResponse,
  RpcInventoryScansPaginated,
  RpcInventoryScanRecord,
  QrCodeRecord,
  QrPropertyListParams,
  QrPropertiesResponse,
  QrScanResponse,
} from '../../../types';

const DEFAULT_API_BASE_URL = 'http://localhost:8000/api';
const DEFAULT_API_TIMEOUT_MS = 15000;

function resolveApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  return configuredUrl ? configuredUrl.replace(/\/$/, '') : DEFAULT_API_BASE_URL;
}

function resolveApiTimeout(): number {
  const configuredTimeout = Number(process.env.EXPO_PUBLIC_API_TIMEOUT);
  return Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_API_TIMEOUT_MS;
}

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: resolveApiBaseUrl(),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: resolveApiTimeout(),
      withCredentials: true,
    });

    this.api.interceptors.request.use(
      (config) => {
        config.headers['X-Client-Source'] = 'mobile';
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          void this.clearToken();
        }
        return Promise.reject(error);
      }
    );
  }

  async init(): Promise<void> {
    this.token = await SecureStore.getItemAsync('auth_token');
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const payload = { username, password };
    const response = await this.api.post<LoginResponse>('/auth/mobile-login', payload);

    // If backend returns a token, persist it; otherwise rely on cookies.
    this.token = response.data.token ?? null;
    if (this.token) {
      await SecureStore.setItemAsync('auth_token', this.token);
    } else {
      await SecureStore.deleteItemAsync('auth_token');
    }

    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    await this.clearToken();
  }

  async clearToken(): Promise<void> {
    this.token = null;
    await SecureStore.deleteItemAsync('auth_token');
  }

  async previewScan(
    cycleId: number,
    qrValue: string,
    opts?: { property_number?: string; property_id?: number; inventory_detail_id?: number }
  ): Promise<PreviewScanResponse> {
    const payload: Record<string, unknown> = { qr_value: qrValue };
    // If caller explicitly passed property_number, use it. Otherwise infer when the
    // scanned value looks like a property number (contains a dash or starts with '0').
    if (opts?.property_number) {
      payload.property_number = opts.property_number;
    } else if (/-/.test(qrValue) || qrValue.trim().startsWith('0')) {
      payload.property_number = qrValue;
    }
    if (typeof opts?.property_id === 'number') payload.property_id = opts.property_id;
    if (typeof opts?.inventory_detail_id === 'number') payload.inventory_detail_id = opts.inventory_detail_id;

    const response = await this.api.post<PreviewScanResponse>(
      `/rpc-inventory/cycles/${cycleId}/scan-preview`,
      payload
    );
    return response.data;
  }

  async getInventory(id: number): Promise<InventoryResponse> {
    const response = await this.api.get<InventoryResponse>(`/admin/inventory/${id}`);
    return response.data;
  }

  async scanProperty(propertyId: number): Promise<QrScanResponse> {
    const response = await this.api.get<QrScanResponse>(`/qr/scan/${propertyId}`);
    return response.data;
  }

  async fetchQrProperties(params: QrPropertyListParams): Promise<QrPropertiesResponse> {
    const response = await this.api.get<QrPropertiesResponse>('/qr/properties', { params });
    return response.data;
  }

  async generateQrForProperty(propertyId: number): Promise<{ message: string; qr: QrCodeRecord }> {
    const response = await this.api.post<{ message: string; qr: QrCodeRecord }>(`/qr/properties/${propertyId}/generate`);
    return response.data;
  }

  async updatePropertyCondition(propertyId: number, conditionId: number): Promise<unknown> {
    const response = await this.api.put(`/qr/properties/${propertyId}`, { condition_id: conditionId });
    return response.data;
  }

  async bulkStoreScan(cycleId: number, payload: BulkScanPayload): Promise<BulkScanResponse> {
    const response = await this.api.post<BulkScanResponse>(
      `/rpc-inventory/cycles/${cycleId}/scans/bulk`,
      payload
    );
    return response.data;
  }

  async listRpcInventoryCycles(): Promise<RpcInventoryCyclesResponse> {
    const response = await this.api.get<RpcInventoryCyclesResponse>('/rpc-inventory/cycles');
    return response.data;
  }

  async createCurrentRpcInventoryCycle(): Promise<{ message: string; cycle: RpcCycle }> {
    const response = await this.api.post<{ message: string; cycle: RpcCycle }>('/rpc-inventory/cycles/current');
    return response.data;
  }

  async getRpcInventoryCycleScans(
    cycleId: number,
    params?: { search?: string; type?: 'RPCPPE' | 'RPCSEP'; page?: number; per_page?: number }
  ): Promise<RpcInventoryScansPaginated> {
    const response = await this.api.get<RpcInventoryScansPaginated>(`/rpc-inventory/cycles/${cycleId}/scans`, {
      params,
    });
    return response.data;
  }

  async getRpcInventoryReport(cycleId: number): Promise<RpcInventoryReportResponse> {
    const response = await this.api.get<RpcInventoryReportResponse>(`/rpc-inventory/cycles/${cycleId}/report`);
    return response.data;
  }

  async getRpcInventoryCycleAuditLogs(
    cycleId: number,
    params?: { page?: number; per_page?: number }
  ): Promise<RpcInventoryAuditLogPaginated> {
    const response = await this.api.get<RpcInventoryAuditLogPaginated>(
      `/rpc-inventory/cycles/${cycleId}/audit-logs`,
      { params }
    );
    return response.data;
  }

  async updateRpcScan(
    scanId: number,
    payload: { condition_id: number; quantity_per_count?: number; remarks?: string | null }
  ): Promise<{ message: string; scan: RpcInventoryScanRecord }> {
    const response = await this.api.patch<{ message: string; scan: RpcInventoryScanRecord }>(
      `/rpc-inventory/scans/${scanId}`,
      payload
    );
    return response.data;
  }

  async deleteRpcScan(scanId: number): Promise<{ message: string }> {
    const response = await this.api.delete<{ message: string }>(`/rpc-inventory/scans/${scanId}`);
    return response.data;
  }

  async getConditions(): Promise<Condition[]> {
    const response = await this.api.get<{ data: Condition[] }>(
      '/rpc-inventory/helpers/conditions'
    );
    return response.data.data;
  }
}

export default new ApiService();
