import { HttpClient } from "../api/httpclient.service";

export class QRService extends HttpClient {
    constructor() {
        super();
    }

    /** Returns the business QR code as a PNG Blob. */
    async getBusinessQR(): Promise<Blob> {
        return this.get("/qr/business", { responseType: "blob" });
    }

    /** Returns the employee QR code as a PNG Blob (business admin viewing a specific employee). */
    async getEmployeeQR(employeeUuid: string): Promise<Blob> {
        return this.get(`/qr/employee/${employeeUuid}`, { responseType: "blob" });
    }

    /** Returns the QR code for the currently authenticated employee (self-serve). */
    async getMyEmployeeQR(): Promise<Blob> {
        return this.get("/qr/employee/me", { responseType: "blob" });
    }
}
