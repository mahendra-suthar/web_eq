import { Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Navbar from "../../components/Navbar";
import "./auth-layout.scss";

export default function AuthLayout() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="al-page">
      <div className="al-bg-mesh" aria-hidden="true" />
      <div className="al-orb al-orb-1" aria-hidden="true" />
      <div className="al-orb al-orb-2" aria-hidden="true" />

      <Navbar
        right={
          <button className="al-nav-home" onClick={() => navigate("/")}>
            {t("backToHome")}
          </button>
        }
      />

      <main className="al-main">
        <Outlet />
      </main>
    </div>
  );
}
