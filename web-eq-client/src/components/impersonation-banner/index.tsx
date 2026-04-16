interface ImpersonationBannerProps {
  businessName: string;
  onExit: () => void;
}

const ImpersonationBanner = ({ businessName, onExit }: ImpersonationBannerProps) => (
  <div className="impersonation-banner">
    <span className="impersonation-banner__text">
      Viewing as <strong>{businessName}</strong>
    </span>
    <button className="impersonation-banner__exit" onClick={onExit}>
      Exit ×
    </button>
  </div>
);

export default ImpersonationBanner;
