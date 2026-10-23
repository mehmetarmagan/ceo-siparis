const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('CEO-SİPARİŞ Botu Aktif!'));
app.listen(PORT, () => console.log(`HTTP sunucusu ${PORT} portunda çalışıyor.`));

const ADMIN_NUMBERS = ["905307853165", "49482368602224"]; 

const DATA_FILE = path.join(__dirname, 'data.json');

let storeData = {
  isClosed: false,
  lastOrderNum: 0, // Sıralı sipariş numarası sayacı
  promoters: {
    "Emin": { total_orders: 0, balance: 0 },
    "Alper": { total_orders: 0, balance: 0 },
    "Asude": { total_orders: 0, balance: 0 },
    "Şeyma": { total_orders: 0, balance: 0 }
  },
  customers: {}, 
  userStates: {},
  pendingOrders: {} // Onay bekleyen siparişler (id: {...})
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

// Menü Fiyatları ve Menü Başına Net KÂR Haritası
const menuDetails = {
  "k1": { price: 250, profit: 80 },  // Örn: K1 satılınca net kâr 80 TL
  "k2": { price: 220, profit: 70 },
  "o1": { price: 200, profit: 60 },
  "o2": { price: 220, profit: 70 },
  "b1": { price: 260, profit: 90 },  // Örn: B1 net kârı 90 TL (%15 komisyon = ~14 TL)
  "b2": { price: 330, profit: 110 },
  "h1": { price: 250, profit: 80 }
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

      // 🔴 1. ADMIN KOMUTLARI & ÇOKLU ONAY SİSTEMİ
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

        // TOPLU ONAY KOMUTU: !onayla 1,2,3 veya !onayla 1
        if (lowerText.startsWith('!onayla ')) {
          const rawIds = text.replace('!onayla', '').trim();
          const orderIds = rawIds.split(',').map(id => id.trim());
          let approvedList = [];

          for (const orderId of orderIds) {
            if (storeData.pendingOrders[orderId]) {
              const order = storeData.pendingOrders[orderId];
              
              // Kâr üzerinden %15 Komisyon Hesabı
              if (order.promoter && storeData.promoters[order.promoter]) {
                const komisyon = Math.round(order.profit * 0.15);
                storeData.promoters[order.promoter].balance += komisyon;
                storeData.promoters[order.promoter].total_orders += 1;
              }

              // Müşteriye Onay Mesajı Gönder
              await sock.sendMessage(order.sender, { 
                text: `✅ *#${orderId}* Numaralı siparişiniz onaylandı!\n\nEn kısa sürede hazırlanıp adresinize teslim edilecektir. Afiyet olsun! 🍕` 
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
          `Sipariş formatı:\n*Menü kodu , Ad Soyad , Numara , Adres*\n*(Örn: B1 , Mehmet Armağan , 0530... , KYK Erkek yurdu)*`;
        
        await sock.sendMessage(sender, { text: menuText });
        return;
      }

      // 🍕 4. SİPARİŞ YAKALAMA VE SIRALI NO İLE DÜŞÜRME
      const firstWord = lowerText.split(',')[0].trim().split(' ')[0];
      if (menuDetails[firstWord]) {
        const item = menuDetails[firstWord];
        const refUser = storeData.customers[sender] || "Yok";

        // Sipariş ID'sini 1 artır
        storeData.lastOrderNum += 1;
        const currentOrderId = storeData.lastOrderNum.toString();

        // Bekleyen siparişe detaylı kaydet
        storeData.pendingOrders[currentOrderId] = {
          sender: sender,
          text: text,
          promoter: refUser,
          price: item.price,
          profit: item.profit
        };
        saveData();
        
        // Müşteriye Sipariş No Bilgisi
        await sock.sendMessage(sender, { 
          text: `⏳ *Siparişiniz Alındı! (Sipariş No: #${currentOrderId})*\n\nSeçtiğiniz Menü: *${firstWord.toUpperCase()}* (${item.price} TL)\nSatıcı onayladığında size bilgi mesajı gelecektir.` 
        });

        // Admine Sipariş Numaralı Bildirim
        const adminBildirim = `🚨 *YENİ SİPARİŞ DÜŞTÜ! (#${currentOrderId})* 🚨\n\n` +
          `🆔 *Sipariş No:* #${currentOrderId}\n` +
          `👤 Müşteri: wa.me/${sender.split('@')[0]}\n` +
          `📦 İçerik: ${text}\n` +
          `📌 Referans: ${refUser}\n` +
          `💰 Tutar: ${item.price} TL\n\n` +
          `✅ Onaylamak için yaz:\n\`!onayla ${currentOrderId}\``;

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