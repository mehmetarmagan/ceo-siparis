const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('CEO-SİPARİŞ Botu Aktif!'));
app.listen(PORT, () => console.log(`HTTP sunucusu ${PORT} portunda çalışıyor.`));

const ADMIN_NUMBERS = ["905307853165", "49482368602224"]; 

// Kendi IBAN bilgini buraya girebilirsin
const IBAN_BILGISI = "TR00 0000 0000 0000 0000 0000 00 (Mehmet Armağan - Banka Adı)";

const DATA_FILE = path.join(__dirname, 'data.json');

let storeData = {
  isClosed: false,
  lastOrderNum: 0,
  promoters: {
    "Emin": { total_orders: 0, balance: 0 },
    "Alper": { total_orders: 0, balance: 0 },
    "Asude": { total_orders: 0, balance: 0 },
    "Şeyma": { total_orders: 0, balance: 0 }
  },
  customers: {}, 
  userStates: {},
  pendingOrders: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    storeData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    if (!storeData.pendingOrders) storeData.pendingOrders = {};
    if (!storeData.lastOrderNum) storeData.lastOrderNum = 0;
  } catch (e) {
    console.error("Veri okuma hatası:", e);
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(storeData, null, 2));
  } catch (e) {
    console.error("Veri kaydetme hatası:", e);
  }
}

// Tam Doğru İndirim ve Sepet Maliyeti Düşülmüş Net Kâr Haritası
const menuDetails = {
  "k1": { price: 250, profit: 50 },  // 250 - (80 + 120)
  "k2": { price: 220, profit: 90 },  // 220 - (80 + 50)
  "o1": { price: 200, profit: 70 },  // 200 - (80 + 50)
  "o2": { price: 220, profit: 90 },  // 220 - (80 + 50) [450 TL Liste Fiyatı]
  "b1": { price: 260, profit: 30 },  // 260 - (80 + 150)
  "b2": { price: 330, profit: 50 },  // 330 - (80 + 200)
  "h1": { price: 250, profit: 70 }   // 250 - (80 + 100)
};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      const botPhoneNumber = "905335752836"; 
      try {
        const code = await sock.requestPairingCode(botPhoneNumber);
        console.log(`\n🔑 WHATSAPP EŞLEŞME KODUNUZ: ${code}\n`);
      } catch (err) {
        console.error("Eşleşme kodu hatası:", err);
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

        // TOPLU ONAY: !onayla 1,2,3
        if (lowerText.startsWith('!onayla ')) {
          const rawIds = text.replace('!onayla', '').trim();
          const orderIds = rawIds.split(',').map(id => id.trim());
          let approvedList = [];

          for (const orderId of orderIds) {
            if (storeData.pendingOrders[orderId]) {
              const order = storeData.pendingOrders[orderId];
              
              // Net Kâr Üzerinden %15 Komisyon Hesabı
              if (order.promoter && storeData.promoters[order.promoter]) {
                const komisyon = Math.round(order.profit * 0.15);
                storeData.promoters[order.promoter].balance += komisyon;
                storeData.promoters[order.promoter].total_orders += 1;
              }

              // Müşteriye Onay Mesajı
              await sock.sendMessage(order.sender, { 
                text: `✅ *#${orderId}* Numaralı siparişiniz onaylandı ve ödemeniz alındı!\n\nEn kısa sürede hazırlanıp yola çıkacaktır. Afiyet olsun! 🍕` 
              });

              approvedList.push(orderId);
              delete storeData.pendingOrders[orderId];
            }
          }

          saveData();

          if (approvedList.length > 0) {
            await sock.sendMessage(sender, { text: `✅ *Sipariş(ler) Onaylandı:* #${approvedList.join(', #')}` });
          } else {
            await sock.sendMessage(sender, { text: "❌ Belirtilen sipariş numaraları bulunamadı veya zaten onaylanmış." });
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
        refMsg += "\n_Lütfen ismi yazınız (Örn: Emin)_";
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
          await sock.sendMessage(sender, { text: "❌ Geçersiz isim. Lütfen listedeki isimlerden birini yazın (Emin, Alper, Asude, Şeyma):" });
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
          `📝 *Sipariş Formatı:*\n` +
          `*Menü kodu , Ad Soyad , Numara , Adres*\n\n` +
          `📌 *Örnek Sipariş:*\n` +
          `_B1 , Mehmet Armağan , 05307853165 , KYK Erkek yurdu 205_`;
        
        await sock.sendMessage(sender, { text: menuText });
        return;
      }

      // 🍕 4. SİPARİŞ YAKALAMA VE IBAN İLETME
      const firstWord = lowerText.split(',')[0].trim().split(' ')[0];
      if (menuDetails[firstWord]) {
        const item = menuDetails[firstWord];
        const refUser = storeData.customers[sender] || "Yok";

        storeData.lastOrderNum += 1;
        const currentOrderId = storeData.lastOrderNum.toString();

        storeData.pendingOrders[currentOrderId] = {
          sender: sender,
          text: text,
          promoter: refUser,
          price: item.price,
          profit: item.profit
        };
        saveData();
        
        // Müşteriye IBAN Mesajı
        const musteriMesaji = `⏳ *Siparişiniz Alındı! (Sipariş No: #${currentOrderId})*\n\n` +
          `Seçtiğiniz Menü: *${firstWord.toUpperCase()}* (${item.price} TL)\n\n` +
          `💳 *Ödeme Bilgileri (IBAN):*\n` +
          `${IBAN_BILGISI}\n\n` +
          `⚠️ *Önemli:* Lütfen yukarıdaki IBAN adresine ödemeyi yapıp dekontu gönderin. Ödemeniz kontrol edildikten sonra siparişiniz onaylanacaktır!`;

        await sock.sendMessage(sender, { text: musteriMesaji });

        // Admine Düşen Bildirim
        const adminBildirim = `🚨 *YENİ SİPARİŞ DÜŞTÜ! (#${currentOrderId})* 🚨\n\n` +
          `🆔 *Sipariş No:* #${currentOrderId}\n` +
          `👤 Müşteri: wa.me/${sender.split('@')[0]}\n` +
          `📦 Sipariş Detayı: ${text}\n` +
          `📌 Referans: ${refUser}\n` +
          `💰 Tutar: ${item.price} TL (IBAN Ödemesi Bekleniyor)\n\n` +
          `✅ Onaylamak için:\n\`!onayla ${currentOrderId}\``;

        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: adminBildirim });
        return;
      }

    } catch (err) {
      console.error("Mesaj işleme hatası:", err);
    }
  });
}

startBot();