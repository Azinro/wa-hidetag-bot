const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n=== SCAN QR CODE ===\n');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi tertutup, reconnect:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot WhatsApp siap!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
        if (!isGroup) return;

        const sender = msg.key.participant || msg.key.remoteJid;
        const body = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || '';

        if (!body.startsWith('.h') && !body.startsWith('.hidetag')) return;

        try {
            const groupMetadata = await sock.groupMetadata(from);
            const participants = groupMetadata.participants;
            const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);

            if (!admins.includes(sender)) {
                await sock.sendMessage(from, { 
                    text: '❌ Keroco gak boleh ngatur!' 
                }, { quoted: msg });
                return;
            }

            const mentionList = participants.map(p => p.id);

            let textToSend = '';
            if (body.startsWith('.h ')) {
                textToSend = body.slice(3); 
            } else if (body.startsWith('.hidetag ')) {
                textToSend = body.slice(9);
            }

            await sock.sendMessage(from, {
                text: textToSend,
                mentions: mentionList
            });

        } catch (err) {
            console.error('Error:', err);
            await sock.sendMessage(from, { 
                text: '❌ Gagal proses command' 
            }, { quoted: msg });
        }
    });
}

startBot();