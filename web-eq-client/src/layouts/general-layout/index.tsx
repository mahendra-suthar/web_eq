import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import "./layout.scss";

interface LayoutContextType {
  t: (key: string) => string;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const useLayoutContext = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayoutContext must be used within a MainLayout");
  }
  return context;
};

export default function MainLayout() {
  const { t } = useTranslation();

  return (
    <LayoutContext.Provider value={{ t }}>
      <div className="pages-layout">
        <div className="main-body">
          <Outlet />
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
