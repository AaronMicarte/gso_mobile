export interface User {
    UserID: number;
    Email: string;
    FullName: string;
    DepartmentID: number;
    UserRoleID?: number;
    Role?: string;
}

export type RpcType = 'RPCPPE' | 'RPCSEP';

export interface LoginResponse {
    message: string;
    token?: string;
    user?: User;
    mfa_required?: boolean;
}

export interface RpcCycle {
    id: number;
    cycle_label: string;
    start_year: number;
    end_year: number;
    status: 'active' | 'closed';
    started_at: string | null;
    scans_count: number;
    rpcppe_count: number;
    rpcsep_count: number;
}

export interface RpcInventoryCyclesResponse {
    data: RpcCycle[];
    current_cycle: {
        start_year: number;
        end_year: number;
        label: string;
    };
}

export interface ScanAsset {
    inventory_detail_id: number;
    property_id: number | null;
    property_number: string | null;
    article: string | null;
    description: string | null;
    rpc_type: 'RPCPPE' | 'RPCSEP';
    end_user_id: number | null;
    department_id: number | null;
    unit_of_measure: string | null;
    unit_value: number | null;
    accountable_officer: string | null;
    property_classification_id: number | null;
    source_dr_detail_id: number | null;
    source_iar_detail_id: number | null;
    property_type_name: string | null;
    department_name: string | null;
    condition_id?: number | null;
    condition_name?: string | null;
}

export interface ScanCandidate {
    inventory_detail_id: number;
    property_id: number | null;
    property_number: string | null;
    is_scanned: boolean;
    existing_scan_id: number | null;
}

export interface PreviewScanResponse {
    asset: ScanAsset;
    already_scanned: boolean;
    existing_scan_id: number | null;
    group_total_count: number;
    group_scanned_count: number;
    group_remaining_count: number;
    candidates: ScanCandidate[];
}

export interface Condition {
    ConditionID: number;
    ConditionName: string;
}

export interface QrCodeRecord {
    QRCodeID: number;
    PropertyID: number;
    InventoryDetailID?: number | null;
    DepartmentID: number;
    QRCodeData: string | null;
    DateGenerated: string;
}

export interface QrScanIssuedBy {
    UserID: number;
    FullName: string;
}

export interface QrScanIssuance {
    IssuanceID: number;
    DocumentType: string;
    DocumentNumber: string;
    Status: string;
    DateIssued: string;
    Remarks?: string | null;
    AcknowledgedAt?: string | null;
    AcknowledgmentSignature?: string | null;
    AcknowledgmentNotes?: string | null;
    issuedBy?: QrScanIssuedBy | null;
    issued_by?: QrScanIssuedBy | null;
}

export interface QrScanIssuanceDetail {
    IssuanceDetailID: number;
    IssuanceID: number;
    InventoryDetailID: number;
    QuantityIssued: number;
    issuance?: QrScanIssuance | null;
}

export interface QrScanInventoryDetail {
    InventoryDetailID: number;
    PropertyNumber?: string | null;
    Description?: string | null;
    Brand?: string | null;
    ModelNumber?: string | null;
    SerialNumber?: string | null;
    UnitCost?: number | null;
    drDetail?: {
        DRDetailID: number;
        ItemDescription?: string | null;
        article?: {
            ArticleID: number;
            ArticleName: string;
        } | null;
    } | null;
    PropertyName?: string | null;
    ClassificationName?: string | null;
    unitOfMeasure?: {
        UnitName: string;
    } | null;
}

export interface QrScanEndUser {
    EndUserID: number;
    FullName: string;
    DepartmentID: number;
    department?: {
        DepartmentID: number;
        DepartmentName: string;
        DepartmentCode?: string | null;
    } | null;
}

export interface QrScanAssignedProperty {
    PropertyID: number;
    InventoryDetailID: number;
    EndUserID: number;
    DepartmentID: number;
    PropertyCardNumber?: string | null;
    Description?: string | null;
    AssignedDate: string;
    PropertyStatusID: number;
    ConditionID: number;
    Remarks?: string | null;
    CreatedDate?: string | null;
    UpdatedDate?: string | null;
    inventoryDetail?: QrScanInventoryDetail | null;
    endUser?: QrScanEndUser | null;
    department?: {
        DepartmentID: number;
        DepartmentName: string;
        DepartmentCode?: string | null;
    } | null;
    propertyStatus?: {
        PropertyStatusID: number;
        StatusName: string;
    } | null;
    condition?: {
        ConditionID: number;
        ConditionName: string;
    } | null;
    qrCode?: QrCodeRecord | null;
    requester?: string | null;
    documentType?: string | null;
    currentDepartmentHead?: string | null;
    departmentHeadVacant?: boolean;
    accountabilityLabel?: string | null;
}

export interface QrScanResponse {
    property: QrScanAssignedProperty;
    latest_issuance_detail?: QrScanIssuanceDetail | null;
}

export interface QrPropertyListParams {
    page?: number;
    per_page?: number;
    search?: string;
    with_qr_only?: boolean;
    missing_qr_only?: boolean;
}

export interface PaginatedResponse<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

export interface QrPropertiesResponse extends PaginatedResponse<QrScanAssignedProperty> { }

export interface InventoryDetailRecord {
    InventoryDetailID: number;
    InventoryID: number;
    Description?: string;
    dr_item_description?: string;
    dr_article_name?: string;
    Brand?: string;
    ModelNumber?: string;
    SerialNumber?: string;
    PropertyName?: string;
    PropertyNumber?: string;
    property_type_description?: string;
    ClassificationName?: string;
    DocumentType?: 'ICS' | 'PAR';
    drDetail?: { DRDetailID: number; ItemDescription?: string };
    Quantity: number;
    UnitCost: number;
    TotalCost: number;
    ConditionID?: number;
    ConditionName?: string;
    PropertyStatusID?: number;
    PropertyTypeID?: number;
    StatusName?: string;
    custodianName?: string;
    locationDepartment?: string;
    locationDepartmentId?: number | null;
    currentDepartmentHead?: string | null;
    departmentHeadVacant?: boolean;
    accountabilityLabel?: string | null;
    lastIssuedDate?: string | null;
    currentBorrowerName?: string | null;
    currentBorrowerDepartment?: string | null;
    qrCode?: { QRCodeData: string };
}

export interface InventoryResponse {
    InventoryID: number;
    InventoryNumber: string;
    DateAcquired: string;
    Remarks?: string;
    PrimaryStatus?: 'Available' | 'Assigned';
    details?: InventoryDetailRecord[];
    iar?: { IARNumber: string; deliveryReceipt?: { DRNumber: string; SupplierName?: string; DateReceived?: string } };
}

export interface RpcInventoryReportRow {
    property_type?: string | null;
    article: string;
    description: string;
    property_number: string;
    unit_of_measure: string;
    unit_value: number;
    quantity_per_card: number;
    quantity_per_count: number;
    shortage_overage_qty: number;
    shortage_overage_value: number;
    remarks: string | null;
    accountable_officer: string;
    department: string;
    condition?: string | null;
    is_scanned: boolean;
}

export interface RpcInventoryReportBucket {
    rows: RpcInventoryReportRow[];
    property_types?: string[];
    scanned_count: number;
    total_count: number;
}

export interface RpcInventoryReportResponse {
    cycle: RpcCycle;
    generated_at: string;
    rpcppe: RpcInventoryReportBucket;
    rpcsep: RpcInventoryReportBucket;
}

export interface RpcInventoryAuditLogPerformer {
    UserID: number;
    FullName: string;
}

export interface RpcInventoryAuditLogScan {
    id: number;
    property_number: string | null;
    inventory_detail_id: number;
    condition_id?: number | null;
    scanned_at?: string | null;
}

export interface RpcInventoryAuditLog {
    AuditID: number;
    rpc_inventory_cycle_id: number;
    rpc_inventory_scan_id: number | null;
    action: string;
    source: string;
    performed_by_user_id: number;
    performed_by_device_id: string | null;
    inventory_detail_id: number | null;
    property_id: number | null;
    property_number: string | null;
    condition_id: number | null;
    previous_condition_id: number | null;
    previous_remarks: string | null;
    new_remarks: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    performed_by?: RpcInventoryAuditLogPerformer | null;
    scan?: RpcInventoryAuditLogScan | null;
}

export interface RpcInventoryAuditLogPaginated {
    data: RpcInventoryAuditLog[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

export interface LocalScan {
    id: string;
    client_uuid: string;
    cycle_id: number;
    inventory_detail_id: number;
    property_id: number | null;
    condition_id: number;
    scanned_at: string;
    remarks: string | null;
    device_id: string;
    user_id: number;
    status: 'pending' | 'syncing' | 'synced' | 'failed';
    error_message: string | null;
    attempt_count: number;
    last_attempt_at: string | null;
    created_at: string;
    // Asset details
    article?: string | null;
    description?: string | null;
    property_number?: string | null;
    unit_of_measure?: string | null;
    unit_value?: number | null;
    accountable_officer?: string | null;
    condition_name?: string | null;
    rpc_type?: 'RPCPPE' | 'RPCSEP';
    Brand?: string | null;
    ModelNumber?: string | null;
    SerialNumber?: string | null;
    remote_scan_id?: number | null;
}

export interface BulkScanPayload {
    scans: {
        client_uuid: string;
        inventory_detail_id: number;
        property_id: number | null;
        condition_id: number;
        scanned_at: string;
        remarks: string | null;
        device_id: string;
    }[];
}

export interface BulkScanResult {
    client_uuid: string;
    status: 'created' | 'duplicate' | 'error';
    message: string;
    scan_id?: number;
}

export interface BulkScanResponse {
    message: string;
    summary: {
        total: number;
        created: number;
        duplicates: number;
        errors: number;
    };
    results: BulkScanResult[];
}

export interface RpcInventoryScanRecord {
    id: number;
    rpc_inventory_cycle_id: number;
    cycle_id: number;
    inventory_detail_id: number;
    property_id: number | null;
    rpc_type: 'RPCPPE' | 'RPCSEP';
    property_number: string | null;
    article: string | null;
    description: string | null;
    condition_id: number;
    condition?: {
        ConditionID: number;
        ConditionName: string;
    } | null;
    scanned_by_user_id?: number;
    scanned_by?: {
        UserID: number;
        FullName: string;
    } | null;
    property_type?: string | null;
    quantity_per_card: number;
    quantity_per_count: number;
    scanned_at: string;
    remarks: string | null;
    accountable_officer: string | null;
    unit_of_measure?: string | null;
    unit_value?: number | string | null;
    created_at: string;
    updated_at: string;
}

export interface RpcInventoryScansPaginated {
    data: RpcInventoryScanRecord[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}
