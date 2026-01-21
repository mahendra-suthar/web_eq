import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmployeeService, EmployeeResponse } from '../../services/employee/employee.service';
import { useBusinessRegistrationStore } from '../../utils/businessRegistrationStore';
import { getInitials, getAvatarBackground } from '../../utils/utils';
import Pagination from '../../components/pagination';
import "./employees.scss";

const Employees = () => {
    const { t } = useTranslation();
    const { businessId: routeBusinessId } = useParams<{ businessId?: string }>();
    const location = useLocation();
    const { businessId: storeBusinessId } = useBusinessRegistrationStore();
    
    // Get business_id from route params, location state, or store (in that order)
    const businessId = useMemo(
        () => routeBusinessId || location.state?.businessId || storeBusinessId,
        [routeBusinessId, location.state?.businessId, storeBusinessId]
    );
    
    const employeeService = useMemo(() => new EmployeeService(), []);
    
    const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [limit] = useState<number>(10);
    const [debouncedSearch, setDebouncedSearch] = useState<string>("");

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1); // Reset to first page when search changes
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Fetch employees
    useEffect(() => {
        const businessId = "3fc39028-3aef-4a3d-89c9-5f49ee7fac4b"
        if (!businessId) {
            setError(t("businessIdRequired"));
            return;
        }

        const fetchEmployees = async () => {
            setLoading(true);
            setError("");

            try {
                const data = await employeeService.getEmployees(
                    businessId,
                    currentPage,
                    limit,
                    debouncedSearch
                );
                setEmployees(data);
                // Note: Backend should return total count for proper pagination
                // For now, we'll estimate based on returned data
                // You may need to update the backend to return total count
                if (data.length < limit) {
                    setTotalPages(currentPage);
                } else {
                    setTotalPages(currentPage + 1); // Estimate - adjust when backend returns total
                }
            } catch (err: any) {
                console.error("Failed to fetch employees:", err);
                let errorMessage = t("failedToLoadEmployees");
                
                if (err?.response?.data?.detail?.message) {
                    errorMessage = err.response.data.detail.message;
                } else if (err?.message) {
                    errorMessage = err.message;
                } else if (err?.code === "ERR_NETWORK" || !err?.response) {
                    errorMessage = t("networkError");
                }
                
                setError(errorMessage);
                setEmployees([]);
            } finally {
                setLoading(false);
            }
        };

        fetchEmployees();
    }, [businessId, currentPage, limit, debouncedSearch, employeeService, t]);

    // Handle pagination
    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    // Early return if no business ID
    // if (!businessId) {
    //     return (
    //         <div className="employees-page">
    //             <div className="content-card">
    //                 <div className="error-message">
    //                     {t("businessIdRequired") || "Business ID is required to view employees."}
    //                 </div>
    //             </div>
    //         </div>
    //     );
    // }

    return (
        <div className="employees-page">
            <div className="content-card">
                <div className="card-header">
                    <h2 className="card-title">{t("employeeManagement")}</h2>
                    <div className="card-actions">
                        <button className="btn btn-secondary" disabled={loading || employees.length === 0}>
                            {t("export")}
                        </button>
                        <button className="btn btn-primary">
                            {t("addEmployee")}
                        </button>
                    </div>
                </div>

                <div className="filter-bar">
                    <input
                        type="text"
                        className="filter-input"
                        placeholder={t("searchEmployees")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={loading}
                    />
                </div>

                {error && (
                    <div className="error-message" style={{ padding: "1rem", color: "red", marginBottom: "1rem" }}>
                        {error}
                    </div>
                )}

                <div className="data-table-container">
                    {loading ? (
                        <div className="loading-state" style={{ padding: "2rem", textAlign: "center" }}>
                            {t("loadingEmployees")}
                        </div>
                    ) : employees.length === 0 ? (
                        <div className="empty-state" style={{ padding: "2rem", textAlign: "center" }}>
                            {debouncedSearch 
                                ? t("noEmployeesFoundSearch")
                                : t("noEmployeesFound")
                            }
                        </div>
                    ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                    <th>{t("employee")}</th>
                                    <th>{t("email")}</th>
                                    <th>{t("isVerified")}</th>
                                    <th>{t("actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map((emp) => (
                                    <tr key={emp.uuid}>
                                    <td>
                                        <div className="user-cell">
                                                <div 
                                                    className="user-avatar" 
                                                    style={{ background: getAvatarBackground(emp.full_name) }}
                                                >
                                                    {getInitials(emp.full_name)}
                                            </div>
                                            <div className="user-info">
                                                    <div className="user-name">{emp.full_name}</div>
                                            </div>
                                        </div>
                                    </td>
                                        <td>{emp.email || t("notAvailable")}</td>
                                    <td>
                                            <span className={`status-badge ${emp.is_verified ? 'active' : 'pending'}`}>
                                                {emp.is_verified 
                                                    ? t("verified")
                                                    : t("unverified")
                                                }
                                        </span>
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                                <button 
                                                    className="action-btn" 
                                                    title={t("view")}
                                                    aria-label={t("viewEmployee")}
                                                >
                                                    👁️
                                                </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    )}
                </div>

                {!loading && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        disabled={loading}
                    />
                )}
            </div>
        </div>
    );
};

export default Employees;
