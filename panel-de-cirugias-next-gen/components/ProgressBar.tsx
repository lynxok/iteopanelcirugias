import React, { useEffect, useState } from 'react';

interface ProgressBarProps {
    isLoading: boolean;
    className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ isLoading, className = "" }) => {
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isLoading) {
            setVisible(true);
            setProgress(0);

            // Simulate progress up to 90%
            interval = setInterval(() => {
                setProgress(prev => {
                    if (prev < 90) {
                        return prev + Math.random() * 15;
                    }
                    return prev;
                });
            }, 200);
        } else {
            setProgress(100);
            // Wait for it to finish then hide
            const timeout = setTimeout(() => {
                setVisible(false);
            }, 300);
            return () => clearTimeout(timeout);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isLoading]);

    if (!visible) return null;

    return (
        <div className={`fixed top-0 left-0 w-full h-1 z-[9999] pointer-events-none bg-transparent ${className}`}>
            <div
                className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_10px_#0d7ff2]"
                style={{
                    width: `${progress}%`,
                }}
            />
        </div>
    );
};

export default ProgressBar;
