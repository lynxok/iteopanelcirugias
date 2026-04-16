import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'quirofano' }
});

serve(async (req) => {
    try {
        const payload = await req.json();
        
        // Handle Database Webhook (INSERT on email_notifications)
        if (payload.type === 'INSERT') {
            const record = payload.record;
            if (!record || !record.recipient_email) {
                return new Response('Invalid record or missing recipient_email', { status: 400 });
            }

            console.log('Processing Email Notification:', record.id, 'to:', record.recipient_email);

            // 1. Fetch SMTP settings from admin_settings
            const { data: settingsData, error: settingsError } = await supabase
                .schema('quirofano')
                .from('admin_settings')
                .select('key, value');

            if (settingsError) {
                console.error('Error fetching SMTP settings:', settingsError);
                throw settingsError;
            }

            const settings: Record<string, string> = {};
            settingsData.forEach((s) => (settings[s.key] = s.value));

            // Validate required SMTP settings
            if (!settings.smtp_host || !settings.smtp_port || !settings.smtp_user || !settings.smtp_pass) {
                console.error('Missing SMTP configuration in admin_settings');
                
                await supabase
                    .schema('quirofano')
                    .from('email_notifications')
                    .update({ status: 'error', metadata: { error: 'Configuración SMTP incompleta en admin_settings' } })
                    .eq('id', record.id);
                    
                return new Response('Missing SMTP configuration', { status: 200 });
            }

            const transporter = nodemailer.createTransport({
                host: settings.smtp_host,
                port: parseInt(settings.smtp_port),
                secure: settings.smtp_port === "465", 
                auth: {
                    user: settings.smtp_user,
                    pass: settings.smtp_pass,
                },
                tls: {
                    rejectUnauthorized: false 
                }
            });

            console.log(`Sending email...`);

            const mailOptions = {
                from: `"${settings.smtp_from_name || 'Panel de Cirugías'}" <${settings.smtp_from_email || settings.smtp_user}>`,
                to: record.recipient_email,
                subject: record.subject,
                text: record.body,
            };

            try {
                const info = await transporter.sendMail(mailOptions);
                console.log('Message sent: %s', info.messageId);

                // 2. Update status in email_notifications
                await supabase
                    .schema('quirofano')
                    .from('email_notifications')
                    .update({ 
                        status: 'sent', 
                        sent_at: new Date().toISOString() 
                    })
                    .eq('id', record.id);

                return new Response('Email Sent', { status: 200 });
            } catch (mailError: any) {
                console.error('Mail Transport Error:', mailError);
                
                await supabase
                    .schema('quirofano')
                    .from('email_notifications')
                    .update({ 
                        status: 'error', 
                        metadata: { error: mailError.message, phase: 'sendMail' } 
                    })
                    .eq('id', record.id);
                
                return new Response('Mail error recorded', { status: 200 });
            }
        }

        return new Response('Method not supported or wrong payload type', { status: 400 });

    } catch (error: any) {
        console.error('Global Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
    }
})
