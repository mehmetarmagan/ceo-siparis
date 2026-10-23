const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Render 7/24 uyanık tutma web sunucusu
app.get('/', (req, res) => res.send('CEO-SİPARİŞ Botu Aktif!'));
app.listen(PORT, () => console.log(`HTTP sunucusu ${PORT} portunda çalışıyor.`));

// ADMIN NUMARAN (Kendi numaranı yaz)
const ADMIN_NUMBER = "905335752836@s.whatsapp.net"; 

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
    console.error("Veri okuma hatası, varsayılan yüklendi.");
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(storeData, null, 2));
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

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
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
    const lowerText = text.toLowerCase();

    const cleanSender = sender.replace(':1', '');
    const cleanAdmin = ADMIN_NUMBER.replace(':1', '');

    // 🔴 1. ADMIN KOMUTLARI
    if (cleanSender === cleanAdmin) {
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
        if (storeData.promoters[name]) {
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
    if (storeData.isClosed) {
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
        `Sipariş vermek istediğiniz menü kodunu ve adresinizi yazabilirsiniz!`;
      
      await sock.sendMessage(sender, { text: menuText });
      return;
    }

  });
}

startBot();