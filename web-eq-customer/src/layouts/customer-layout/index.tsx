import { useNavigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import Button from "../../components/button";
import ProfileDropdown from "../../components/profile-dropdown";
import "./layout.scss";

export default function CustomerLayout() {
  const navigate = useNavigate();
  const { userInfo, isAuthenticated, resetUser } = useAuthStore();

  const handleLogout = () => {
    resetUser();
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

            <div className="util-flex-spacer" />

            {isAuthenticated() ? (
              <ProfileDropdown
                userName={userInfo?.full_name ?? undefined}
                onLogout={handleLogout}
              />
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
          <p className="customer-footer__text">
            © {new Date().getFullYear()} EQ — Book appointments quickly.
          </p>
        </div>
      </footer>
    </div>
  );
}

