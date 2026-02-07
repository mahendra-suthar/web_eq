import { useNavigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import Button from "../../components/button";
import "./layout.scss";

export default function CustomerLayout() {
  const navigate = useNavigate();
  const { userInfo, isAuthenticated, resetUser } = useAuthStore();

  const handleLogout = () => {
    resetUser();
    // Clear cookies by making a logout request (if endpoint exists)
    // For now, just clear local storage
    navigate("/");
  };

  return (
    <div className="customer-layout">
      <header className="customer-appbar">
        <div className="customer-toolbar">
          <div className="customer-toolbar-inner">
            <h1 className="customer-brand" onClick={() => navigate("/")}>
              EQ
            </h1>

            <div style={{ flex: 1 }} />

            {isAuthenticated() ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {userInfo?.full_name && (
                  <span style={{ color: "#00695C", fontSize: "14px", fontFamily: '"Noto Sans Hebrew", serif' }}>
                    {userInfo.full_name}
                  </span>
                )}
                <Button
                  text="Logout"
                  color="outline-blue"
                  onClick={handleLogout}
                />
              </div>
            ) : (
              <Button
                text="Login"
                color="outline-blue"
                onClick={() => navigate("/send-otp")}
              />
            )}
          </div>
        </div>
      </header>

      <main className="customer-main">
        <Outlet />
      </main>

      <footer className="customer-footer">
        <div className="customer-footer-inner">
          <p style={{ color: "#637381", fontSize: "14px", margin: 0 }}>
            © {new Date().getFullYear()} EQ — Book appointments quickly.
          </p>
        </div>
      </footer>
    </div>
  );
}

