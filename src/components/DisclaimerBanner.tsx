import { AlertCircle } from "lucide-react";

const DisclaimerBanner = () => {
    return (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div>
                    <h3 className="font-semibold text-warning mb-1">For Amusement Purpose Only</h3>
                    <p className="text-sm text-muted-foreground">
                        This application is designed for entertainment and practice purposes only.
                        No real money or prizes are involved.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default DisclaimerBanner;
