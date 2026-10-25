const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('CEO-SİPARİŞ Botu Aktif!'));
app.listen(PORT, () => console.log(`HTTP sunucusu ${PORT} portunda çalışıyor.`));

const ADMIN_NUMBERS = ["905307853165", "49482368602224"]; 

// Kendi IBAN Bilgin
const IBAN_BILGISI = "TR04 0006 2001 2830 0006 6572 61 (Mehmet Armağan - Garanti Bankası)";

const DATA_FILE = path.join(__dirname, 'data.json');

let storeData = {
  isClosed: false,
  lastOrderNum: 0,
  regions: {
    "Nallıhan": {
      promoters: {
        "Emin": { total_orders: 0, balance: 0 },
        "Alper": { total_orders: 0, balance: 0 },
        "Asude": { total_orders: 0, balance: 0 },
        "Şeyma": { total_orders: 0, balance: 0 }
      }
    },
    "Beypazarı": {
      promoters: {
        "Beypazarı Temsilcisi": { total_orders: 0, balance: 0 }
      }
    },
    "Diğer": {
      promoters: {}
    }
  },
  customers: {}, // { sender: { region, promoter, otherLocation } }
  userStates: {}, 
  pendingOrders: {}, 
  customerActiveOrder: {}, 
  lastGreetingTime: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    storeData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    if (!storeData.pendingOrders) storeData.pendingOrders = {};
    if (!storeData.lastOrderNum) storeData.lastOrderNum = 0;
    if (!storeData.customerActiveOrder) storeData.customerActiveOrder = {};
    if (!storeData.regions) {
      storeData.regions = {
        "Nallıhan": { promoters: { "Emin": {total_orders:0, balance:0}, "Alper": {total_orders:0, balance:0}, "Asude": {total_orders:0, balance:0}, "Şeyma": {total_orders:0, balance:0} } },
        "Beypazarı": { promoters: { "Beypazarı Temsilcisi": {total_orders:0, balance:0} } },
        "Diğer": { promoters: {} }
      };
    }
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

const menuDetails = {
  "k1": { price: 250, profit: 50 },  
  "k2": { price: 220, profit: 90 },  
  "o1": { price: 200, profit: 70 },  
  "o2": { price: 220, profit: 90 },  
  "b1": { price: 260, profit: 30 },  
  "b2": { price: 330, profit: 50 },  
  "h1": { price: 250, profit: 70 }   
};

const GREETING_WORDS = [
  'sa', 'sav', 'selam', 'selamun aleykum', 'selamün aleyküm', 'slm', 'sleam', 'selamlar', 
  'merhaba', 'merhabalarr', 'mrb', 'iyi günler', 'iyi aksamlar', 'iyi akşamlar', 
  'kolay gelsin', 'fiyat', 'fiyatlar', 'sipariş', 'siparis', 'helo', 'hello', 'hey'
];

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
          let report = "📊 *BÖLGE VE KOMİSYON BAKİYELERİ*\n\n";
          for (const [regionName, regionData] of Object.entries(storeData.regions)) {
            report += `🌍 *${regionName} Bölgesi:*\n`;
            for (const [name, info] of Object.entries(regionData.promoters)) {
              report += `  🔹 ${name}: ${info.balance} TL (${info.total_orders} Sipariş)\n`;
            }
            report += "\n";
          }
          await sock.sendMessage(sender, { text: report });
          return;
        }
        if (lowerText.startsWith('!sifirla ')) {
          const parts = text.split(' ');
          const regionName = parts[1];
          const name = parts[2];
          if (storeData.regions[regionName] && storeData.regions[regionName].promoters[name]) {
            storeData.regions[regionName].promoters[name].balance = 0;
            saveData();
            await sock.sendMessage(sender, { text: `✅ ${regionName} - ${name} bakiyesi sıfırlandı.` });
          } else {
            await sock.sendMessage(sender, { text: `❌ Bölge veya isim bulunamadı. (Örn: !sifirla Nallıhan Emin)` });
          }
          return;
        }

        if (lowerText.startsWith('!onayla ')) {
          const rawIds = text.replace('!onayla', '').trim();
          const orderIds = rawIds.split(',').map(id => id.trim());
          let approvedList = [];

          for (const orderId of orderIds) {
            if (storeData.pendingOrders[orderId]) {
              const order = storeData.pendingOrders[orderId];
              
              if (order.promoter && storeData.regions[order.region] && storeData.regions[order.region].promoters[order.promoter]) {
                const promoterObj = storeData.regions[order.region].promoters[order.promoter];
                const komisyon = Math.round(order.profit * 0.15);
                promoterObj.balance += komisyon;
                promoterObj.total_orders += 1;
              }

              await sock.sendMessage(order.sender, { 
                text: `✅ *#${orderId}* Numaralı siparişiniz onaylandı ve ödemeniz alındı!\n\nEn kısa sürede hazırlanıp yola çıkacaktır. Afiyet olsun! 🍕\n\nInstagram: @ceosiparis` 
              });

              if (storeData.customerActiveOrder[order.sender] === orderId) {
                delete storeData.customerActiveOrder[order.sender];
              }

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
        await sock.sendMessage(sender, { text: "⛔ Şu an sipariş alımımız kapalıdır. Açıldığında duyuru yapılacaktır!\nInstagram: @ceosiparis" });
        return;
      }

      // 🛠️ 3. DESTEK SİSTEMİ (!destek)
      if (lowerText === '!destek' || lowerText === 'destek') {
        storeData.userStates[sender] = 'IN_SUPPORT';
        saveData();
        await sock.sendMessage(sender, { text: "🛟 *Destek Hattına Bağlandınız.*\n\nLütfen sorununuzu veya talebinizi yazın, yetkili arkadaşlar en kısa sürede sizinle ilgilenecektir." });
        
        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: `🛟 *DESTEK TALEBİ!*\n👤 Kullanıcı: wa.me/${sender.split('@')[0]}\nMesaj: ${text}` });
        return;
      }

      if (storeData.userStates[sender] === 'IN_SUPPORT') {
        if (lowerText === '!kapatdestek') {
          delete storeData.userStates[sender];
          saveData();
          await sock.sendMessage(sender, { text: "✅ Destek oturumu sonlandırıldı." });
          return;
        }
        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: `🛟 *DESTEK MESAJI (wa.me/${sender.split('@')[0]}):*\n${text}` });
        await sock.sendMessage(sender, { text: "✅ Mesajınız yetkiliye iletildi, dönüş bekleniyor..." });
        return;
      }

      // 🌍 4. "DİĞER" BÖLGE KONUM ALMA AKIŞI
      if (storeData.userStates[sender] === 'WAITING_OTHER_LOCATION') {
        const locationText = text;
        if (!storeData.customers[sender]) storeData.customers[sender] = {};
        storeData.customers[sender].otherLocation = locationText;
        delete storeData.userStates[sender];
        saveData();

        await sock.sendMessage(sender, { text: `✅ Konum/Bölge bilginiz (*${locationText}*) alındı!\n\nYetkili ekibimiz inceleyip size özel dönüş yapacaktır. Sabrınız için teşekkürler!\nInstagram: @ceosiparis` });

        // Admine bildir
        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: `🌍 *DİĞER BÖLGEDEN ÖZEL TALEP!* 🌍\n👤 Müşteri: wa.me/${sender.split('@')[0]}\n📍 Belirttiği Konum/Bölge: *${locationText}*\n\n_Bu kullanıcıya özel fiyat/şart belirleyip dönüş yapabilirsiniz._` });
        return;
      }

      // ❌ 5. MÜŞTERİ İPTAL SİSTEMİ (!iptal)
      if (lowerText === '!iptal') {
        const activeOrderId = storeData.customerActiveOrder[sender];
        if (activeOrderId && storeData.pendingOrders[activeOrderId]) {
          delete storeData.pendingOrders[activeOrderId];
          delete storeData.customerActiveOrder[sender];
          saveData();

          await sock.sendMessage(sender, { text: `❌ *#${activeOrderId}* numaralı siparişiniz başarıyla iptal edildi.` });

          const adminJid = "905307853165@s.whatsapp.net";
          await sock.sendMessage(adminJid, { text: `⚠️ *SİPARİŞ İPTAL EDİLDİ!* (#${activeOrderId})\nMüşteri: wa.me/${sender.split('@')[0]}` });
        } else {
          await sock.sendMessage(sender, { text: "❌ İptal edilecek aktif veya onay bekleyen bir siparişiniz bulunmamaktadır." });
        }
        return;
      }

      // 🌍 6. BÖLGE SEÇİMİ VE REFERANS AKIŞI
      if (lowerText === 'bölge' || lowerText === 'bolge' || lowerText === 'referans') {
        storeData.userStates[sender] = 'WAITING_REGION';
        saveData();
        let regionMsg = "📍 *Lütfen Bulunduğunuz Bölgeyi Seçin:*\n\n" +
          "1️⃣ Nallıhan\n" +
          "2️⃣ Beypazarı\n" +
          "3️⃣ Diğer\n\n" +
          "_Lütfen bölge adını yazınız (Örn: Nallıhan)_";
        await sock.sendMessage(sender, { text: regionMsg });
        return;
      }

      if (storeData.userStates[sender] === 'WAITING_REGION') {
        const selectedRegion = Object.keys(storeData.regions).find(r => r.toLowerCase() === lowerText);
        if (selectedRegion) {
          if (!storeData.customers[sender]) storeData.customers[sender] = {};
          storeData.customers[sender].region = selectedRegion;

          if (selectedRegion === 'Nallıhan' || selectedRegion === 'Beypazarı') {
            storeData.userStates[sender] = 'WAITING_REF';
            saveData();
            let refMsg = `👤 *${selectedRegion} Bölgesi İçin Referans Seçiniz:*\n\n`;
            let count = 1;
            const promoters = storeData.regions[selectedRegion].promoters;
            for (const name of Object.keys(promoters)) {
              refMsg += `${count}️⃣ ${name}\n`;
              count++;
            }
            refMsg += "\n_Lütfen ismi yazınız (Yoksa 'Yok' yazabilirsiniz)_";
            await sock.sendMessage(sender, { text: refMsg });
          } else if (selectedRegion === 'Diğer') {
            // DİĞER SEÇİLİRSE DOĞRUDAN KONUM SORMA ADIMINA BAĞLA
            storeData.userStates[sender] = 'WAITING_OTHER_LOCATION';
            saveData();
            await sock.sendMessage(sender, { text: "📍 Bölgeniz *Diğer* olarak işaretlendi.\n\nLütfen bulunduğunuz yeri / konumu yazar mısınız? (Sizinle özel olarak ilgileneceğiz):" });
          }
        } else {
          await sock.sendMessage(sender, { text: "❌ Geçersiz bölge. Lütfen (Nallıhan, Beypazarı, Diğer) yazın:" });
        }
        return;
      }

      if (storeData.userStates[sender] === 'WAITING_REF') {
        const currentRegion = storeData.customers[sender]?.region || 'Nallıhan';
        const promoters = storeData.regions[currentRegion].promoters;
        
        if (lowerText === 'yok' || lowerText === 'yoktur') {
          storeData.customers[sender].promoter = "Yok";
          delete storeData.userStates[sender];
          saveData();
          await sock.sendMessage(sender, { text: `✅ Bölgeniz ve tercihleriniz kaydedildi!\n\nSipariş vermek için *MENÜ* yazabilirsiniz.` });
          return;
        }

        const selectedName = Object.keys(promoters).find(n => n.toLowerCase() === lowerText);
        if (selectedName) {
          storeData.customers[sender].promoter = selectedName;
          delete storeData.userStates[sender];
          saveData();
          await sock.sendMessage(sender, { text: `✅ Referansınız *${selectedName}* (${currentRegion}) olarak kaydedildi!\n\nSipariş vermek için *MENÜ* yazabilirsiniz.` });
        } else {
          await sock.sendMessage(sender, { text: `❌ Geçersiz isim. Lütfen listeden birini seçin veya 'Yok' yazın:` });
        }
        return;
      }

      // 🍕 7. MENÜ GÖSTERİMİ (Sadece Nallıhan / Beypazarı için mantıklı)
      if (lowerText === 'menü' || lowerText === 'menu') {
        const userCust = storeData.customers[sender] || {};
        const userRegion = userCust.region || "Seçilmemiş";

        if (userRegion === 'Diğer') {
          await sock.sendMessage(sender, { text: `⚠️ Seçtiğiniz bölge (*Diğer*) için standart menümüz bulunmamaktadır. Konumunuzu belirttiyseniz yetkilinin dönüşünü bekleyebilir veya *!destek* yazarak doğrudan iletişime geçebilirsiniz.` });
          return;
        }

        const menuText = `🍕 *CEO-SİPARİŞ MENÜSÜ* 🍔\n` +
          `📍 Bölge: *${userRegion}*\n\n` +
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
          `💡 *İpucu:* Sipariş verdikten sonra iptal için \`!iptal\` yazabilirsiniz.\n` +
          `📸 Instagram: @ceosiparis`;
        
        await sock.sendMessage(sender, { text: menuText });
        return;
      }

      // 🍕 8. SİPARİŞ YAKALAMA VE IBAN GÖNDERME
      const firstWord = lowerText.split(',')[0].trim().split(' ')[0];
      if (menuDetails[firstWord]) {
        const userCust = storeData.customers[sender] || { region: "Nallıhan", promoter: "Yok" };

        if (userCust.region === 'Diğer') {
          await sock.sendMessage(sender, { text: `❌ 'Diğer' bölgesinden standart menü siparişi verilemez. Lütfen özel talebiniz için *!destek* yazın.` });
          return;
        }

        if (storeData.customerActiveOrder[sender] && storeData.pendingOrders[storeData.customerActiveOrder[sender]]) {
          await sock.sendMessage(sender, { text: `⚠️ Zaten onay bekleyen aktif bir siparişiniz var (#${storeData.customerActiveOrder[sender]}). İptal etmek için \`!iptal\` yazabilirsiniz.` });
          return;
        }

        const item = menuDetails[firstWord];
        storeData.lastOrderNum += 1;
        const currentOrderId = storeData.lastOrderNum.toString();

        storeData.pendingOrders[currentOrderId] = {
          sender: sender,
          text: text,
          region: userCust.region,
          promoter: userCust.promoter || "Yok",
          price: item.price,
          profit: item.profit
        };

        storeData.customerActiveOrder[sender] = currentOrderId;
        saveData();
        
        const musteriMesaji = `⏳ *Siparişiniz Alındı! (Sipariş No: #${currentOrderId})*\n\n` +
          `Seçtiğiniz Menü: *${firstWord.toUpperCase()}* (${item.price} TL)\n` +
          `🌍 Bölge: ${userCust.region}\n\n` +
          `💳 *Ödeme Bilgileri (IBAN):*\n` +
          `${IBAN_BILGISI}\n\n` +
          `⚠️ *Önemli:* Ödemeyi yapıp dekontu iletin. Vazgeçerseniz \`!iptal\` yazabilirsiniz!\n\n` +
          `📸 Instagram: @ceosiparis`;

        await sock.sendMessage(sender, { text: musteriMesaji });

        const adminBildirim = `🚨 *YENİ SİPARİŞ DÜŞTÜ! (#${currentOrderId})* 🚨\n\n` +
          `🆔 *Sipariş No:* #${currentOrderId}\n` +
          `👤 Müşteri: wa.me/${sender.split('@')[0]}\n` +
          `🌍 Bölge: ${userCust.region}\n` +
          `📦 Sipariş Detayı: ${text}\n` +
          `📌 Referans: ${userCust.promoter || "Yok"}\n` +
          `💰 Tutar: ${item.price} TL\n\n` +
          `✅ Onaylamak için:\n\`!onayla ${currentOrderId}\``;

        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: adminBildirim });
        return;
      }

      // 🟢 9. MÜŞTERİ KARŞILAMA
      const now = Date.now();
      const lastGreeting = (storeData.lastGreetingTime && storeData.lastGreetingTime[sender]) || 0;
      const isGreetingWord = GREETING_WORDS.some(w => lowerText.includes(w));
      const isTwoHoursPassed = (now - lastGreeting) > (2 * 60 * 60 * 1000);

      if (isGreetingWord || isTwoHoursPassed) {
        if (!storeData.lastGreetingTime) storeData.lastGreetingTime = {};
        storeData.lastGreetingTime[sender] = now;
        saveData();

        let welcome = "👋 *CEO-SİPARİŞ'e Hoş Geldiniz!*\n\n";
        if (storeData.customers[sender] && storeData.customers[sender].region) {
          welcome += `📍 Bölge: *${storeData.customers[sender].region}*\n`;
        } else {
          welcome += "🔹 Bölge seçmek ve kaydolmak için *BÖLGE* yazabilirsiniz.\n\n";
        }
        welcome += "🍕 Menüyü görmek için *MENÜ*, destek için *DESTEK* yazabilirsiniz!\n";
        welcome += "📸 Instagram: @ceosiparis";
        
        await sock.sendMessage(sender, { text: welcome });
        return;
      }

    } catch (err) {
      console.error("Mesaj işleme hatası:", err);
    }
  });
}

startBot();