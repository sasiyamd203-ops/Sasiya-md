const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, disconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const ytdl = require('@distube/ytdl-core');
const yts = require('yt-search');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// වෙබ් එකට අවශ්‍ය API එක
app.get('/api/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: "Phone number is required" });
    phone = phone.replace(/[^0-9]/g, '');

    try {
        const { state, saveCreds } = await useMultiFileAuthState('session');
        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);

        await delay(3000);
        let code = await sock.requestPairingCode(phone);
        if (code && !code.includes('-')) {
            code = code.substring(0, 4) + '-' + code.substring(4);
        }
        res.json({ code: code });
    } catch (err) {
        res.status(500).json({ error: "WhatsApp Pairing Failed" });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- WHATSAPP BOT ENGINE ---
let startTime = Date.now();
let songCache = {}; // සින්දු සර්ච් රිසල්ට් මතක තියාගන්න

async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log("WhatsApp Bot successfully connected! ✅");
            
            // බොට් ලින්ක් වුණු ගමන් තමන්ගේ නම්බර් එකටම මැසේජ් එක යැවීම
            const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const welcomeMsg = `🌿 *SASIYA-MD V1*\n\n*Sʏsᴛᴇᴍ Uᴘᴅᴀᴛᴇ Iɴ Pʀᴏɢʀᴇss...*\n● ● ● ● ● ● ● ○ [ 75% ]\n▫️ *Server:* Main Cloud-01\n▫️ *Safety:* Secure Mode On\n\n*🇱🇰 දත්ත පද්ධතියට එක්වේ...*\nකරුණාකර විනාඩි කිහිපයක් රැඳී සිටින්න.\n\n*🇬🇧 Initializing system...*\nPlease wait 5-30 mins without using commands.\n\n*Simple & Clean Edition*\n\n> *powerd by sasiya 🔥*`;
            
            await sock.sendMessage(myJid, { text: welcomeMsg });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppBot();
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const from = mek.key.remoteJid;
            const type = Object.keys(mek.message)[0];
            const content = JSON.stringify(mek.message);
            
            // මැසේජ් එක ටෙක්ස්ට් එකක්ද කියා බැලීම
            let body = (type === 'conversation') ? mek.message.conversation : 
                       (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
            
            if (!body.startsWith('.')) return;
            const args = body.trim().split(/ +/).slice(1);
            const command = body.toLowerCase().split(' ')[0];

            // Uptime ගණනය කිරීම
            const uptimeMs = Date.now() - startTime;
            const uptime = new Date(uptimeMs).toISOString().substr(11, 8);
            // RAM ප්‍රමාණය ගණනය කිරීම
            const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + " MB";         
            
            // 1. MENU COMMAND
            if (command === '.menu') {
                const menuText = `👋 *ʜɪ* Sasindu \n\n*╭─「 BOT'S MENU 」*\n*│*👾 *Bot*: *sasindu-md 𝗕𝗼𝘁*\n*│*👤 *User*: Sasindu Xz !!\n*│*☎️ *Owners*: *sasiyaッ*\n*│*⏰ *Uptime*: ${uptime}\n*│*📂 *Ram*: ${ram}\n*│*✒ *Prefix*: .\n╰──────────●●►\n\n╭───「 *COMMANDS* 」\n│  .yt <youtube-link>\n│  .song <song-name>\n╰────────────●\n\n©️ SASIYA-MD WHATAPP BOT 🔥ッ`;
                await sock.sendMessage(from, { text: menuText }, { quoted: mek });
            }


            // 2. ALIVE COMMAND
            if (command === '.alive') {
                await sock.sendMessage(from, { text: "*SASIYA-MD IS ALIVE NOW* 🟢\n\n> powerd by sasiya 🔥" }, { quoted: mek });
            }

            // 3. YT (VIDEO DOCUMENT) COMMAND
            if (command === '.yt') {
                const url = args[0];
                if (!url || !ytdl.validateURL(url)) return reply(sock, from, "❌ කරුණාකර නිවැරදි YouTube ලින්ක් එකක් ලබාදෙන්න.\nඋදා: `.yt https://youtu....`", mek);
                
                await reply(sock, from, "⏳ වීඩියෝ එක ඩොකියුමන්ට් එකක් විදිහට සකසමින් පවතිනවා...", mek);
                
                const info = await ytdl.getInfo(url);
                const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
                const videoPath = `./${title}.mp4`;

                ytdl(url, { filter: 'formatcontainer', quality: 'highestvideo' })
                    .pipe(fs.createWriteStream(videoPath))
                    .on('finish', async () => {
                        await sock.sendMessage(from, { 
                            document: fs.readFileSync(videoPath), 
                            mimetype: 'video/mp4', 
                            fileName: `${title}.mp4` 
                        }, { quoted: mek });
                        fs.unlinkSync(videoPath); // File එක Delete කිරීම
                    });
            }

            // 4. SONG (SEARCH & DOWNLOAD) COMMAND
            if (command === '.song') {
                const query = args.join(' ');
                if (!query) return reply(sock, from, "❌ කරුණාකර සින්දුවේ නම ලබාදෙන්න.\nඋදා: `.song nopenෙන මානෙ`", mek);

                await reply(sock, from, `🔍 *"${query}"* සින්දුව සොයමින් පවතිනවා...`, mek);
                const search = await yts(query);
                const videos = search.videos.slice(0, 5); // මුල් රිසල්ට් 5

                if (videos.length === 0) return reply(sock, from, "❌ කිසිදු සින්දුවක් හමුනොවුණි.", mek);

                let searchMsg = `🎧 *SASIYA-MD SONG SEARCH* 🎧\n\nබොට් වෙතින් සින්දුව ඩවුන්ලෝඩ් කරගැනීමට අවශ්‍ය සින්දුවේ අංකය සමඟ නැවත මැසේජ් එකක් යවන්න (Reply).\n*(උදා: 1)*\n\n`;
                songCache[from] = [];

                videos.forEach((vid, i) => {
                    searchMsg += `*${i + 1}.* ${vid.title}\n⏱️ කාලය: ${vid.timestamp}\n\n`;
                    songCache[from].push(vid.url); // ලින්ක් එක සේව් කරගැනීම
                });

                await sock.sendMessage(from, { text: searchMsg }, { quoted: mek });
            }

            // සින්දුවේ අංකය ආවම ඩවුන්ලෝඩ් කරන කොටස (Reply handling)
            if (!isNaN(body.trim()) && songCache[from]) {
                const index = parseInt(body.trim()) - 1;
                if (index >= 0 && index < songCache[from].length) {
                    const selectedUrl = songCache[from][index];
                    delete songCache[from]; // ලැබුණු පසු Cache එක අයින් කිරීම

                    await reply(sock, from, "📥 සින්දුව MP3 එකක් විදිහට බාගත වෙමින් පවතිනවා...", mek);

                    const info = await ytdl.getInfo(selectedUrl);
                    const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
                    const audioPath = `./${title}.mp3`;

                    ytdl(selectedUrl, { filter: 'audioonly', quality: 'highestaudio' })
                        .pipe(fs.createWriteStream(audioPath))
                     y   .on('finish', async () => {
                            await sock.sendMessage(from, { 
                                audio: fs.readFileSync(audioPath), 
                                mimetype: 'audio/mp4', 
                                ptt: false 
                            }, { quoted: mek });
                            fs.unlinkSync(audioPath);
                        });
                }
            }

        } catch (e) {
            console.log(e);
        }
    });
}

function reply(sock, from, text, mek) {
    return sock.sendMessage(from, { text: text }, { quoted: mek });
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startWhatsAppBot().catch(err => console.error(err));
});
