import { useUserStore } from "../../utils/userStore";

interface ShareMenuProps {
    employeeName: string;
    code: string;
    disabled?: boolean;
    label?: string;
    className?: string;
}

function buildText(employeeName: string, code: string, businessName?: string | null): string {
    const biz = businessName ? ` ${businessName}` : "";
    return (
        `Hi ${employeeName}! 👋\n\n` +
        `You've been invited to join${biz} on EaseQueue.\n\n` +
        `Your invitation code: ${code}\n\n` +
        `Enter this code on the EaseQueue web app to get started.`
    );
}

export function ShareMenu({ employeeName, code, disabled, label = "Share", className = "" }: ShareMenuProps) {
    const businessName = useUserStore((s) => s.profile?.business?.name);

    if (typeof navigator === "undefined" || !navigator.share) {
        return (
            <button
                type="button"
                className={`btn btn-secondary btn-sm${className ? ` ${className}` : ""}`}
                disabled
                title="Share is available on mobile"
            >
                {label}
            </button>
        );
    }

    const handleClick = async () => {
        const text = buildText(employeeName, code, businessName);
        try {
            await navigator.share({ title: `EaseQueue Invitation for ${employeeName}`, text });
        } catch {
            // user cancelled
        }
    };

    return (
        <button
            type="button"
            className={`btn btn-primary btn-sm${className ? ` ${className}` : ""}`}
            onClick={handleClick}
            disabled={disabled}
        >
            {label}
        </button>
    );
}
