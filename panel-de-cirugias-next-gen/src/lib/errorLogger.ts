import { supabase } from './supabase';
import { AppUser } from '../../types';

export type ErrorSeverity = 'ERROR' | 'WARNING' | 'CRITICAL';

interface CaptureErrorOptions {
    context?: string;
    severity?: ErrorSeverity;
    metadata?: any;
    user?: AppUser | null;
}

/**
 * Captures an error and persists it to the Supabase system_errors table.
 * This is designed to be non-blocking.
 */
export const captureError = async (
    error: any,
    options: CaptureErrorOptions = {}
) => {
    const {
        context = 'Unknown',
        severity = 'ERROR',
        metadata = {},
        user = null
    } = options;

    let errorMessage: string;
    if (error instanceof Error) {
        errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
        // Handle Supabase errors or other objects
        errorMessage = JSON.stringify(error);
    } else {
        errorMessage = String(error);
    }
    const errorStack = error instanceof Error ? error.stack : null;

    console.error(`[${severity}] ${context}:`, error);

    try {
        const { error: insertError } = await supabase
            .from('system_errors')
            .insert({
                user_name: user?.name || 'Anonymous',
                user_role: user?.role || 'Guest',
                context,
                message: errorMessage,
                stack: errorStack,
                severity,
                metadata: {
                    ...metadata,
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                }
            });

        if (insertError) {
            // If logging fails, we just log to console to avoid infinite loops
            console.error('Failed to persist error log:', insertError);
        }
    } catch (loggingErr) {
        console.error('Critical failure in error logger:', loggingErr);
    }
};
