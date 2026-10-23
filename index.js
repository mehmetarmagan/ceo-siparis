const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const http = require('http');

// ================= RENDER PORT UYARISINI AŞMAK İÇİN MİNİ HTTP SUNUCUSU =================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🚀 CEO-SİPARİŞ WhatsApp Botu Aktif ve Çalışıyor!\n');
}).listen(PORT, () => {
    console.log(`🌐 HTTP Sunucusu ${PORT} portunda aktif edildi.`);
});

// ================= SAHİP VE AYARLAR =================
const MY_NUMBER = "905307853165@s.whatsapp.net"; 
let IS_ACTIVE = true; 

// ================= MENÜ KODLARI VE FİYATLAR =================
const MENUS = {
    // KÜÇÜK BOY PİZZALAR (Minimum 2 Adet)
    'K1': { name: '2 Adet Küçük Boy Special Pizza', price: 250 },
    'K2': { name: '2 Adet Küçük Boy Luna Pizza', price: 220 },

    // ORTA BOY PİZZALAR
    'O1': { name: '1 Adet Orta Boy Special Pizza', price: 200 },
    'O2': { name: '2 Adet Orta Boy Luna Pizza', price: 190 },

    // BÜYÜK BOY PİZZALAR (En Cazip Seçenek)
    'B1': { name: '1 Adet Büyük Boy Special Pizza', price: 260 },
    'B2': { name: '1 Adet Büyük Boy Gurme / Kavurmalı Pizza', price: 330 },

    // HAMBURGER MENÜLERİ (Minimum 2 Adet)
    'H1': { name: '2 Adet Pasaport Burger', price: 250 }
};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    
    const sock = makeWASocket({
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📌 QR Kod Alındı, Lütfen WhatsApp ile Taratın:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('🚀 Ceo-Siparis Botu Aktif! Diğer kategorisi eklendi.');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const cleanText = text.toLowerCase();

        // --- ADMIN YÖNETİM KOMUTLARI ---
        if (sender === MY_NUMBER) {
            if (text === '!kapat') {
                IS_ACTIVE = false;
                await sock.sendMessage(sender, { text: "🔴 Ceo-Siparis: Bot sipariş alımına KAPATILDI." });
                return;
            }
            if (text === '!ac') {
                IS_ACTIVE = true;
                await sock.sendMessage(sender, { text: "🟢 Ceo-Siparis: Bot sipariş alımına AÇILDI." });
                return;
            }
        }

        if (!IS_ACTIVE) {
            await sock.sendMessage(sender, { text: "🔴 Şu anda sipariş alımımız kapalıdır. Aktif olduğumuzda tekrar bekleriz!" });
            return;
        }

        // --- CANLI DESTEK ---
        if (['destek', 'canlı destek', 'canli destek', 'yardım', 'yardim'].includes(cleanText)) {
            await sock.sendMessage(sender, { text: "👨‍💻 *Canlı Destek Talebiniz Alındı!*\n\nTalebiniz yetkiliye iletilmiştir. En kısa sürede sizinle iletişime geçilecektir." });
            await sock.sendMessage(MY_NUMBER, { text: `⚠️ *CEO-SİPARİŞ: CANLI DESTEK TALEBİ!*\n\n👤 *Müşteri:* +${sender.split('@')[0]}\n💬 *Mesaj:* "${text}"` });
            return;
        }

        // --- 1. ADIM: İLK KARŞILAMA VE HOŞ GELDİN MESAJI ---
        if (['sa', 'as', 'merhaba', 'selam', 'iyi günler', 'hayırlı işler', 'sahi'].includes(cleanText)) {
            const welcomeMsg = `👋 *CEO-SİPARİŞ'e Hoş Geldiniz!*\n\n` +
                               `Nallıhan Gece Acıkanlar Kulübü olarak sıcak ve indirimli lezzetleri kapınıza getiriyoruz.\n\n` +
                               `📜 Menümüzü incelemek ve sipariş vermek için lütfen *MENÜ* yazıp gönderiniz.\n\n` +
                               `⚠️ Sipariş verirken KYK'ya mı Pansiyona mı olduğunu belirtmeyi unutmayınız.`;
            await sock.sendMessage(sender, { text: welcomeMsg });
            return;
        }

        // --- 2. ADIM: KATEGORİ YÖNLENDİRME (MENÜ YAZINCA) ---
        if (cleanText === 'menü' || cleanText === 'menu') {
            const menuPrompt = `🍕 *Ne yemek isterdiniz?*\n\n` +
                               `Lütfen incelemek istediğiniz menü için ilgili kelimeyi yazınız:\n\n` +
                               `🔹 K. Pizza menüsü için 👉 *küçük*\n` +
                               `🔹 O. Pizza menüsü için 👉 *orta*\n` +
                               `🔹 B. Pizza menüsü için 👉 *büyük*\n` +
                               `🔹 Hamburger menüsü için 👉 *hamburger*\n` +
                               `🔹 Farklı bir isteğiniz varsa 👉 *diğer*\n\n` +
                               `❓ Canlı destek için *DESTEK* yazabilirsiniz.`;
            await sock.sendMessage(sender, { text: menuPrompt });
            return;
        }

        // --- 3. ADIM: ALT MENÜLERİN AÇILMASI ---
        if (cleanText === 'küçük' || cleanText === 'kucuk') {
            const kMenu = `🍕 *KÜÇÜK BOY PİZZALAR*\n` +
                          `⚠️ *Not:* Küçük boy pizzalar tek satılamamaktadır. Minimum 2 adet söylenebilir.\n\n` +
                          `👉 *K1* - 2 Adet Küçük Boy Special Pizza: *250 TL*\n` +
                          `👉 *K2* - 2 Adet Küçük Boy Luna Pizza: *220 TL*\n\n` +
                          `📝 *Sipariş İçin:* Kod Ad Soyad Tel Adres (KYK/Pansiyon)\n` +
                          `Örnek: *K1 Ahmet Yılmaz 05301234567 Pansiyon Oda 102*`;
            await sock.sendMessage(sender, { text: kMenu });
            return;
        }

        if (cleanText === 'orta') {
            const oMenu = `🍕 *ORTA BOY PİZZALAR*\n\n` +
                          `👉 *O1* - 1 Adet Orta Boy Special Pizza: *200 TL*\n` +
                          `👉 *O2* - 2 Adet Orta Boy Luna Pizza: *190 TL*\n\n` +
                          `📝 *Sipariş İçin:* Kod Ad Soyad Tel Adres (KYK/Pansiyon)\n` +
                          `Örnek: *O1 Ahmet Yılmaz 05301234567 KYK Oda 5*`;
            await sock.sendMessage(sender, { text: oMenu });
            return;
        }

        if (cleanText === 'büyük' || cleanText === 'buyuk') {
            const bMenu = `🍕 *BÜYÜK BOY PİZZALAR (EN ÇOK TERCİH EDİLEN)*\n\n` +
                          `👉 *B1* - 1 Adet Büyük Boy Special Pizza: *260 TL* 🔥\n` +
                          `👉 *B2* - 1 Adet Büyük Boy Gurme / Kavurmalı Pizza: *330 TL*\n\n` +
                          `📝 *Sipariş İçin:* Kod Ad Soyad Tel Adres (KYK/Pansiyon)\n` +
                          `Örnek: *B1 Ahmet Yılmaz 05301234567 KYK A Blok Oda 205*`;
            await sock.sendMessage(sender, { text: bMenu });
            return;
        }

        if (cleanText === 'hamburger') {
            const hMenu = `🍔 *PASAPORT BURGER MENÜLERİ*\n` +
                          `⚠️ *Not:* Hamburger menüleri minimum 2 adet ve 2'nin katları şeklinde sipariş edilebilir.\n\n` +
                          `👉 *H1* - 2 Adet Pasaport Burger: *250 TL*\n\n` +
                          `📝 *Sipariş İçin:* Kod Ad Soyad Tel Adres (KYK/Pansiyon)\n` +
                          `Örnek: *H1 Ahmet Yılmaz 05301234567 Pansiyon Oda 12*`;
            await sock.sendMessage(sender, { text: hMenu });
            return;
        }

        // --- DİĞER İSTEKLER KATEGORİSİ ---
        if (cleanText === 'diğer' || cleanText === 'diger') {
            const otherMenu = `🍔🍕 *ÖZEL VEYA FARKLI SİPARİŞ İSTEĞİ*\n\n` +
                               `Menüde göremediğiniz veya özel olarak istediğiniz (farklı pizza, tatlı, ekstra çıtır vb.) siparişleriniz için talebinizi ve adresinizi doğrudan yazabilirsiniz.\n\n` +
                               `📝 *Örnek Format:*\n` +
                               `*Özel İstek: 1 Adet Souffle ve 1 Orta Karışık Pizza, Ahmet Yılmaz 05301234567 Pansiyon Oda 8*\n\n` +
                               `Mesajınızı yazdıktan sonra fiyat ve onay için size dönüş yapılacaktır.`;
            await sock.sendMessage(sender, { text: otherMenu });
            return;
        }

        // --- 4. ADIM: SİPARİŞ ALGILAMA VE BİLDİRİM ---
        const firstWord = text.split(' ')[0].toUpperCase();
        if (MENUS[firstWord]) {
            const selectedMenu = MENUS[firstWord];
            const details = text.replace(new RegExp(`^${firstWord}`, 'i'), '').trim();

            if (!details) {
                await sock.sendMessage(sender, { 
                    text: `⚠️ Lütfen menü kodunun yanına Ad Soyad, Telefon ve Adres yazınız.\n\nÖrnek: *${firstWord} Ahmet Yılmaz 05301234567 Pansiyon Oda 4*` 
                });
                return;
            }

            const confirmText = `✅ *Sipariş Talebiniz Alındı!*\n\n` +
                                `📦 *Seçilen Menü:* ${selectedMenu.name}\n` +
                                `💰 *Ödenecek Tutar:* ${selectedMenu.price} TL\n` +
                                `📋 *Detaylar:* ${details}\n\n` +
                                `💳 *IBAN / Papara:* TR04 0006 2001 2830 0006 6572 61\n` +
                                `*Alıcı:* Mehmet Armağan\n\n` +
                                `⚠️ *Açıklamaya mutlaka Adınızı Soyadınızı yazınız.*\n` +
                                `Nakit ödeme için mesaj atabilirsiniz.\nDekont attığınızda siparişiniz onaylanacaktır.`;
            
            await sock.sendMessage(sender, { text: confirmText });

            const adminNotice = `🔔 *CEO-SİPARİŞ: YENİ SİPARİŞ!*\n\n` +
                                `👤 *Müşteri WhatsApp:* +${sender.split('@')[0]}\n` +
                                `🍕 *Sipariş:* ${selectedMenu.name} (${firstWord})\n` +
                                `💵 *Tutar:* ${selectedMenu.price} TL\n` +
                                `📍 *Adres & İletişim:* ${details}`;

            await sock.sendMessage(MY_NUMBER, { text: adminNotice });
            return;
        }

        // --- DİĞER/ÖZEL SİPARİŞ DETAYI ALGILAMA ---
        if (cleanText.startsWith('özel istek:') || cleanText.startsWith('ozel istek:')) {
            await sock.sendMessage(sender, { 
                text: `✅ *Özel Sipariş Talebiniz Alındı!*\n\nİsteğiniz yetkiliye iletildi. Fiyatlandırma ve onay için en kısa sürede dönüş yapacağız.` 
            });

            await sock.sendMessage(MY_NUMBER, { 
                text: `🔔 *CEO-SİPARİŞ: ÖZEL DİĞER TALEBİ!*\n\n👤 *Müşteri:* +${sender.split('@')[0]}\n💬 *Talep & Adres:* ${text}` 
            });
        }
    });
}

startBot();