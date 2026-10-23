const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Render 7/24 uyanık tutma web sunucusu
app.get('/', (req, res) => res.send('CEO-SİPARİŞ Botu Aktif!'));
app.listen(PORT, () => console.log(`HTTP sunucusu ${PORT} portunda çalışıyor.`));

// ADMIN NUMARALARI (TR numaran ve WhatsApp arka plan ID'n)
const ADMIN_NUMBERS = ["905307853165", "49482368602224"]; 

const DATA_FILE = path.join(__dirname, 'data.json');

let storeData = {
  isClosed: false,
  promoters: {
    "Asude": { total_orders: 0, balance: 0 },
    "Emin": { total_orders: 0, balance: 0 },
    "Şeyma": { total_orders: 0, balance: 0 },
    "Alper": { total_orders: 0, balance: 0 }
  },
  customers: {}, 
  userStates: {}  
};

if (fs.existsSync(DATA_FILE)) {
  try {
    storeData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    console.error("Veri okuma hatası, varsayılan yüklendi:", e);
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(storeData, null, 2));
  } catch (e) {
    console.error("Veri kaydetme hatası:", e);
  }
}

// Menü Fiyat Haritası
const menuPrices = {
  "k1": 250, "k2": 220,
  "o1": 200, "o2": 220,
  "b1": 260, "b2": 330,
  "h1": 250
};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  // 🔑 WHATSAPP EŞLEŞME KODU (Oturum kapalıysa kod üretir)
  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      const botPhoneNumber = "905335752836"; // WhatsApp botunun bağlı olduğu numara
      try {
        const code = await sock.requestPairingCode(botPhoneNumber);
        console.log(`\n==================================`);
        console.log(`🔑 WHATSAPP EŞLEŞME KODUNUZ: ${code}`);
        console.log(`==================================\n`);
      } catch (err) {
        console.error("Eşleşme kodu alma hatası:", err);
      }
    }, 4000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('🚀 CEO-Sipariş Botu Bulutta Aktif!');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      const sender = msg.key.remoteJid;
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
      const lowerText = text.toLowerCase();

      // Esnek Admin Numarası Eşleştirme (Hem 90... Hem 49... Tanınır)
      const cleanSender = sender.replace(/[^0-9]/g, '');
      const isAdmin = ADMIN_NUMBERS.some(num => cleanSender.includes(num));

      // 🔴 1. ADMIN KOMUTLARI
      if (isAdmin) {
        if (lowerText === '!kapat') {
          storeData.isClosed = true;
          saveData();
          await sock.sendMessage(sender, { text: "🔴 Dükkan siparişlere KAPATILDI." });
          return;
        }
        if (lowerText === '!ac') {
          storeData.isClosed = false;
          saveData();
          await sock.sendMessage(sender, { text: "🟢 Dükkan siparişlere AÇILDI." });
          return;
        }
        if (lowerText === '!komisyonlar') {
          let report = "📊 *GÜNCEL KOMİSYON BAKİYELERİ*\n\n";
          for (const [name, info] of Object.entries(storeData.promoters)) {
            report += `🔹 *${name}*: ${info.balance} TL (${info.total_orders} Sipariş)\n`;
          }
          await sock.sendMessage(sender, { text: report });
          return;
        }
        if (lowerText.startsWith('!sifirla ')) {
          const name = text.split(' ')[1];
          if (storeData.promoters && storeData.promoters[name]) {
            storeData.promoters[name].balance = 0;
            saveData();
            await sock.sendMessage(sender, { text: `✅ ${name} bakiyesi sıfırlandı.` });
          } else {
            await sock.sendMessage(sender, { text: `❌ ${name} bulunamadı.` });
          }
          return;
        }
      }

      // 🟡 2. DÜKKAN KAPALI KONTROLÜ
      if (storeData.isClosed && !isAdmin) {
        await sock.sendMessage(sender, { text: "⛔ Şu an sipariş alımımız kapalıdır. Açıldığında duyuru yapılacaktır!" });
        return;
      }

      // 🟢 3. REFERANS & MENÜ AKIŞI
      if (lowerText === 'referans') {
        storeData.userStates[sender] = 'WAITING_REF';
        saveData();
        let refMsg = "👤 *Bizi size öneren kişiyi seçiniz:*\n\n";
        let count = 1;
        for (const name of Object.keys(storeData.promoters)) {
          refMsg += `${count}️⃣ ${name}\n`;
          count++;
        }
        refMsg += "\n_Lütfen ismi yazınız (Örn: Asude)_";
        await sock.sendMessage(sender, { text: refMsg });
        return;
      }

      if (storeData.userStates[sender] === 'WAITING_REF') {
        const selectedName = Object.keys(storeData.promoters).find(n => n.toLowerCase() === lowerText);
        if (selectedName) {
          storeData.customers[sender] = selectedName;
          delete storeData.userStates[sender];
          saveData();
          await sock.sendMessage(sender, { text: `✅ Referansınız *${selectedName}* olarak kaydedildi!\n\nSipariş vermek için *MENÜ* yazabilirsiniz.` });
        } else {
          await sock.sendMessage(sender, { text: "❌ Geçersiz isim. Lütfen listedeki isimlerden birini yazın (Asude, Emin, Şeyma, Alper):" });
        }
        return;
      }

      if (lowerText === 'sa' || lowerText === 'merhaba' || lowerText === 'selam') {
        let welcome = "👋 *CEO-SİPARİŞ'e Hoş Geldiniz!*\n\n";
        if (storeData.customers[sender]) {
          welcome += `📌 *Referansınız:* ${storeData.customers[sender]}\n\n`;
        } else {
          welcome += "🔹 Bizi size öneren biri varsa *REFERANS* yazabilirsiniz.\n\n";
        }
        welcome += "🍕 Menüyü ve fiyatları görmek için *MENÜ* yazmanız yeterlidir.";
        await sock.sendMessage(sender, { text: welcome });
        return;
      }

      // Müşteri Menü İstediğinde
      if (lowerText === 'menü' || lowerText === 'menu') {
        const menuText = `🍕 *CEO-SİPARİŞ MENÜSÜ* 🍔\n\n` +
          `🔴 *KÜÇÜK BOY PIZZALAR*\n` +
          `*K1:* 2 Adet Küçük Special - 250 TL\n` +
          `*K2:* 2 Adet Küçük Luna - 220 TL\n\n` +
          `🟡 *ORTA BOY PIZZALAR*\n` +
          `*O1:* 1 Adet Orta Special - 200 TL\n` +
          `*O2:* 1 Adet Orta Gurme - 220 TL\n\n` +
          `🟢 *BÜYÜK BOY PIZZALAR*\n` +
          `*B1:* 1 Adet Büyük Special - 260 TL\n` +
          `*B2:* 1 Adet Büyük Gurme - 330 TL\n\n` +
          `🍔 *HAMBURGER*\n` +
          `*H1:* 2 Adet Pasaport Burger - 250 TL\n\n` +
          `Sipariş vermek istediğiniz menü kodunu ve adresinizi yazabilirsiniz!\n*(Örn: B1 KYK Mehmet Armağan 0533...)*`;
        
        await sock.sendMessage(sender, { text: menuText });
        return;
      }

      // 🍕 4. SİPARİŞ YAKALAMA KISMI (B1, O1, H1 vb.)
      const firstWord = lowerText.split(' ')[0];
      if (menuPrices[firstWord]) {
        const fiyat = menuPrices[firstWord];
        
        // Müşteriye bilgi mesajı
        await sock.sendMessage(sender, { 
          text: `✅ *Siparişiniz Alındı!*\n\nSeçtiğiniz Menü: *${firstWord.toUpperCase()}* (${fiyat} TL)\nAdresiniz kaydedildi, en kısa sürede hazırlanıp yola çıkacaktır!` 
        });

        // Admine (Sana) Düşen Bildirim
        const refUser = storeData.customers[sender] || "Yok";
        const adminBildirim = `🚨 *YENİ SİPARİŞ DÜŞTÜ!* 🚨\n\n` +
          `👤 Müşteri: wa.me/${sender.split('@')[0]}\n` +
          `📦 Sipariş Detayı: ${text}\n` +
          `📌 Referans: ${refUser}\n` +
          `💰 Tutar: ${fiyat} TL`;

        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: adminBildirim });

        // Komisyon Hesabı (%15)
        if (storeData.customers[sender] && storeData.promoters[storeData.customers[sender]]) {
          const promoterName = storeData.customers[sender];
          const komisyon = Math.round(fiyat * 0.15);
          storeData.promoters[promoterName].balance += komisyon;
          storeData.promoters[promoterName].total_orders += 1;
          saveData();
        }
        return;
      }

    } catch (err) {
      console.error("Mesaj işleme hatası:", err);
    }
  });
}

startBot();