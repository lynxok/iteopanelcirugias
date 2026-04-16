import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BOT_TOKEN = '8310837543:AAE9w82HWQRHrsoCx3uNgKpg98nsKOHbYNQ';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'quirofano' }
});

serve(async (req) => {
    try {
        const url = new URL(req.url);
        const body = await req.json();

        // 1. Handle Database Webhook (INSERT on telegram_notifications)
        // 1. Handle Database Webhook (INSERT on telegram_notifications)
        // 1. Handle Database Webhook (INSERT on telegram_notifications)
        if (body.type === 'INSERT') {
            const record = body.record;
            if (!record) return new Response('No record', { status: 400 });

            console.log('Webhook Payload:', body);

            // Debug: Check what table triggered this
            if (body.table !== 'telegram_notifications') {
                console.error('Wrong table:', body.table);
                return new Response('Ignored table', { status: 200 });
            }

            const userId = record.user_id;
            const message = record.message;

            if (!userId || !message) {
                console.error('Missing userId or message', record);
                return new Response('Missing data', { status: 400 });
            }

            // Fetch Chat ID
            // Explicitly using schema just in case default config fails in some context
            const { data: user, error } = await supabase
                .schema('quirofano')
                .from('users')
                .select('telegram_chat_id')
                .eq('id', userId)
                .single();

            if (error || !user?.telegram_chat_id) {
                console.error('Chat ID not found or Error:', error, userId);
                const errMsg = error ? JSON.stringify(error) : 'User not found or no Chat ID';

                await supabase
                    .schema('quirofano')
                    .from('telegram_notifications')
                    .update({ status: 'error', error_message: errMsg, processed_at: new Date().toISOString() })
                    .eq('id', record.id);

                return new Response('User not found or no Chat ID', { status: 200 });
            }

            console.log('Sending to Telegram:', user.telegram_chat_id);
            let tgResult;
            try {
                tgResult = await sendMessage(user.telegram_chat_id, message);
                console.log('Telegram Result:', tgResult);
            } catch (err) {
                console.error('Fetch Error:', err);
                tgResult = { error: err.message };
            }

            // Debug: Update notification status AND result
            const updatePayload: any = {
                processed_at: new Date().toISOString(),
                error_message: JSON.stringify(tgResult)
            };

            if (tgResult && tgResult.ok) {
                updatePayload.status = 'sent';
            } else {
                updatePayload.status = 'error';
            }

            const updateResult = await supabase
                .schema('quirofano')
                .from('telegram_notifications')
                .update(updatePayload)
                .eq('id', record.id);

            if (updateResult.error) {
                console.error('Error updating status:', updateResult.error);
            }

            return new Response('Notification Processed', { status: 200 });
        }

        // 2. Handle Telegram User Webhook (Incoming Message)
        if (body.message && body.message.chat && body.message.text) {
            const chatId = body.message.chat.id;
            const text = body.message.text;
            const userName = body.message.from?.first_name || 'Usuario';

            if (text === '/start' || text.toLowerCase() === 'iniciar') {
                await sendMessage(chatId, `¡Hola ${userName}! 👋\n\nTu ID de Chat para configurar en el sistema es:\n\`${chatId}\`\n\n(Copia solo el número y pégalo en tu perfil de usuario).`);
            } else {
                await sendMessage(chatId, `Tu ID de Chat es: \`${chatId}\``);
            }

            return new Response('ok', { status: 200 });
        }

        // 3. Handle Direct Invocation (Manual)
        const { chatId, message } = body;

        if (!chatId || !message) {
            return new Response(
                JSON.stringify({ error: 'Missing chatId or message' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
        }

        const data = await sendMessage(chatId, message);

        return new Response(
            JSON.stringify(data),
            { headers: { 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
    }
})

async function sendMessage(chatId: string | number, text: string) {
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
        }),
    });

    return await response.json();
}
