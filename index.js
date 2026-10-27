const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('CEO-SİPARİŞ Botu Aktif!'));
app.listen(PORT, () => console.log(`HTTP sunucusu ${PORT} portunda çalışıyor.`));

const ADMIN_NUMBERS = ["905307853165", "49482368602224"]; 

const IBAN_NUMARASI = "TR04 0006 2001 2830 0006 6572 61";
const IBAN_SAHIBI = "Mehmet Armağan - Garanti Bankası";

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
      promoters: {}
    },
    "Diğer": {
      promoters: {}
    }
  },
  customers: {}, 
  userStates: {}, 
  pendingOrders: {}, 
  customerActiveOrders: {}, 
  lastGreetingTime: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    storeData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    if (!storeData.pendingOrders) storeData.pendingOrders = {};
    if (!storeData.lastOrderNum) storeData.lastOrderNum = 0;
    if (!storeData.customerActiveOrders) storeData.customerActiveOrders = {};
    if (!storeData.regions) {
      storeData.regions = {
        "Nallıhan": { promoters: { "Emin": {total_orders:0, balance:0}, "Alper": {total_orders:0, balance:0}, "Asude": {total_orders:0, balance:0}, "Şeyma": {total_orders:0, balance:0} } },
        "Beypazarı": { promoters: {} },
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

// Nallıhan Menüleri
const nallihanMenu = {
  "k1": { name: "2 Adet Küçük Special", price: 250, profit: 50 },  
  "k2": { name: "2 Adet Küçük Luna", price: 230, profit: 90 },  
  "o1": { name: "1 Adet Orta Special", price: 210, profit: 70 },  
  "o2": { name: "1 Adet Orta Gurme", price: 230, profit: 90 },  
  "b1": { name: "1 Adet Büyük Special", price: 290, profit: 30 },  
  "b2": { name: "1 Adet Büyük Gurme", price: 350, profit: 50 },  
  "h1": { name: "2 Adet Pasaport Burger", price: 240, profit: 70 }   
};

// Beypazarı Menüleri (Restoran Bazlı)
const beypazariMenus = {
  "komagene": {
    "kg1": { name: "600 GR Çiğ Köfte", price: 210, profit: 50 },
    "kg2": { name: "2 Adet Mega Çiğ Köfte Dürüm + 1 Litre Kola", price: 190, profit: 45 },
    "kg3": { name: "4 Adet Çiğ Köfte Dürüm", price: 220, profit: 50 }
  },
  "burgerking": {
    "bk1": { name: "Maç Menüsü (Big Mac + Chicken Big King + 6'lı Soğan + Kova Patates + 1L Kola)", price: 360, profit: 80 },
    "bk2": { name: "Whopper Menü", price: 200, profit: 50 },
    "bk3": { name: "Kral Avantaj Menü (Double Whopper JR. + King Chicken + Orta Patates + 4'lü Soğan + 1L Kola)", price: 280, profit: 65 },
    "bk4": { name: "Pro Gamer Big King (Big King + Orta Patates + 4'lü Soğan + 1L Kola)", price: 200, profit: 45 }
  },
  "popeyes": {
    "pp1": { name: "Popeyes Ceo Menü (2 Tavuk Burger + Patates + 6 Soğan + 6 Nugget + 1L İçecek)", price: 200, profit: 50 },
    "pp2": { name: "Maxi XL Menü (XL Sandviç + 2 Acılı Kanat + 4'lü Nugget + Patates + Kutu İçecek)", price: 235, profit: 55 },
    "pp3": { name: "Maxi Smoky XL Menü (Maxi Sandviç + 4 Soğan + 3 Nugget + Orta Patates + Kutu İçecek)", price: 220, profit: 50 }
  },
  "pasaport": {
    "bp1": { name: "2 Adet Küçük Special (Pasaport BP)", price: 250, profit: 50 },  
    "bp2": { name: "2 Adet Küçük Luna (Pasaport BP)", price: 230, profit: 90 },  
    "bo1": { name: "1 Adet Orta Special (Pasaport BP)", price: 210, profit: 70 },  
    "bo2": { name: "1 Adet Orta Gurme (Pasaport BP)", price: 230, profit: 90 },  
    "bb1": { name: "1 Adet Büyük Special (Pasaport BP)", price: 290, profit: 30 },  
    "bb2": { name: "1 Adet Büyük Gurme (Pasaport BP)", price: 350, profit: 50 },  
    "bh1": { name: "2 Adet Pasaport Burger (Pasaport BP)", price: 240, profit: 70 }
  },
  "caddelkatik": {
    "ck1": { name: "Mega Katık Tavuk Döner Dürüm Menü", price: 200, profit: 45 }
  }
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
                text: `✅ *#${orderId}* Numaralı siparişiniz onaylandı ve ödemeniz alındı!\n\n⏳ Siparişiniz ortalama *30 dakika* içinde kapınızda olacaktır. Kuryelerimiz sizi telefonla aramayacaktır, lütfen kapıda bekleyin!\n\nAfiyet olsun! 🍕\nInstagram: @ceosiparis` 
              });

              if (storeData.customerActiveOrders[order.sender]) {
                storeData.customerActiveOrders[order.sender] = storeData.customerActiveOrders[order.sender].filter(id => id !== orderId);
                if (storeData.customerActiveOrders[order.sender].length === 0) {
                  delete storeData.customerActiveOrders[order.sender];
                }
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

        // REDDETME SİSTEMİ: !reddet <id> <sebep>
        if (lowerText.startsWith('!reddet ')) {
          const content = text.replace('!reddet', '').trim();
          const firstSpaceIdx = content.indexOf(' ');
          const orderId = firstSpaceIdx === -1 ? content : content.substring(0, firstSpaceIdx).trim();
          const sebep = firstSpaceIdx === -1 ? "Belirtilmedi" : content.substring(firstSpaceIdx).trim();

          if (storeData.pendingOrders[orderId]) {
            const order = storeData.pendingOrders[orderId];

            await sock.sendMessage(order.sender, { 
              text: `❌ *#${orderId}* Numaralı siparişiniz reddedilmiştir.\n\n📝 *Sebep / Açıklama:* ${sebep}\n\nDetaylı bilgi için *!destek* yazabilirsiniz.` 
            });

            if (storeData.customerActiveOrders[order.sender]) {
              storeData.customerActiveOrders[order.sender] = storeData.customerActiveOrders[order.sender].filter(id => id !== orderId);
              if (storeData.customerActiveOrders[order.sender].length === 0) {
                delete storeData.customerActiveOrders[order.sender];
              }
            }

            delete storeData.pendingOrders[orderId];
            saveData();

            await sock.sendMessage(sender, { text: `❌ *#${orderId}* numaralı sipariş başarıyla reddedildi. Sebep: "${sebep}"` });
          } else {
            await sock.sendMessage(sender, { text: "❌ Belirtilen sipariş numarası bulunamadı." });
          }
          return;
        }
      }

      // 🟡 2. DÜKKAN KAPALI KONTROLÜ
      if (storeData.isClosed && !isAdmin) {
        await sock.sendMessage(sender, { text: "⛔ Şu an sipariş alımımız KAPALIDIR. Dükkan açıldığında buradan duyuru yapılacaktır!\nInstagram: @ceosiparis" });
        return;
      }

      // 🛠️ 3. DESTEK SİSTEMİ (!destek)
      if (lowerText === '!destek' || lowerText === 'destek') {
        storeData.userStates[sender] = 'IN_SUPPORT';
        saveData();
        await sock.sendMessage(sender, { text: "🛟 *Destek Hattına Bağlandınız.*\n\nLütfen sorununuzu veya talebinizi yazın, yetkili arkadaşlar en kısa sürede sizinle ilgilenecektir.\n\n_Destekten çıkmak için **!kapatdestek** yazabilirsiniz._" });
        
        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: `🛟 *DESTEK TALEBİ BAŞLATILDI!*\n👤 Kullanıcı: wa.me/${sender.split('@')[0]}\nMesaj: ${text}` });
        return;
      }

      if (storeData.userStates[sender] === 'IN_SUPPORT') {
        if (lowerText === '!kapatdestek') {
          delete storeData.userStates[sender];
          saveData();
          await sock.sendMessage(sender, { text: "✅ Destek oturumu sonlandırıldı. Normal menü akışına dönebilirsiniz." });
          return;
        }
        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: `🛟 *DESTEK (wa.me/${sender.split('@')[0]}):*\n${text}` });
        return;
      }

      // 🌍 4. "DİĞER" BÖLGE KONUM ALMA AKIŞI
      if (storeData.userStates[sender] === 'WAITING_OTHER_LOCATION') {
        const locationText = text;
        if (!storeData.customers[sender]) storeData.customers[sender] = {};
        storeData.customers[sender].otherLocation = locationText;
        delete storeData.userStates[sender];
        saveData();

        await sock.sendMessage(sender, { text: `✅ Konum/Bölge bilginiz (*${locationText}*) alındı!\n\nYetkili ekibimiz inceleyip size özel dönüş yapacaktır.\nInstagram: @ceosiparis` });

        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: `🌍 *DİĞER BÖLGEDEN ÖZEL TALEP!* 🌍\n👤 Müşteri: wa.me/${sender.split('@')[0]}\n📍 Konum: *${locationText}*` });
        return;
      }

      // 🍔 BEYPAZARI "DİĞER" (ÖZEL TALEP) AKIŞI
      if (storeData.userStates[sender] === 'WAITING_BEYPAZARI_OTHER') {
        const talepText = text;
        delete storeData.userStates[sender];
        saveData();

        await sock.sendMessage(sender, { text: `✅ Beypazarı Diğer / Özel talebiniz (*${talepText}*) alındı!\n\nYetkili ekibimiz inceleyip fiyat ve onay bilgisi ile dönecektir.\nInstagram: @ceosiparis` });

        const adminJid = "905307853165@s.whatsapp.net";
        await sock.sendMessage(adminJid, { text: `🏙️ *BEYPAZARI DİĞER / ÖZEL TALEP!* 🏙️\n👤 Müşteri: wa.me/${sender.split('@')[0]}\n📦 Talep/Ürün: *${talepText}*` });
        return;
      }

      // ❌ 5. MÜŞTERİ İPTAL SİSTEMİ (!iptal)
      if (lowerText === '!iptal') {
        const activeOrders = storeData.customerActiveOrders[sender] || [];
        if (activeOrders.length > 0) {
          const latestOrderId = activeOrders[activeOrders.length - 1];
          
          if (storeData.pendingOrders[latestOrderId]) {
            delete storeData.pendingOrders[latestOrderId];
          }

          storeData.customerActiveOrders[sender] = activeOrders.filter(id => id !== latestOrderId);
          if (storeData.customerActiveOrders[sender].length === 0) {
            delete storeData.customerActiveOrders[sender];
          }
          saveData();

          await sock.sendMessage(sender, { text: `❌ *#${latestOrderId}* numaralı siparişiniz başarıyla iptal edildi.` });

          const adminJid = "905307853165@s.whatsapp.net";
          await sock.sendMessage(adminJid, { text: `⚠️ *SİPARİŞ İPTAL EDİLDİ!* (#${latestOrderId})\nMüşteri: wa.me/${sender.split('@')[0]}` });
        } else {
          await sock.sendMessage(sender, { text: "❌ İptal edilecek aktif veya onay bekleyen bir siparişiniz bulunmamaktadır." });
        }
        return;
      }

      // 🔄 DÜKKAN DEĞİŞTİRME KOMUTU (Beypazarı için)
      if (lowerText === 'dükkan' || lowerText === 'dukkan' || lowerText === 'restoran') {
        const userCust = storeData.customers[sender] || {};
        if (userCust.region === 'Beypazarı') {
          storeData.userStates[sender] = 'WAITING_BEYPAZARI_STORE';
          saveData();
          let storeMsg = "🏙️ *Beypazarı Restoran Seçimi (Dükkan Değiştirme):*\n\n" +
            "1️⃣ Burger King\n" +
            "2️⃣ Pasaport Pizza\n" +
            "3️⃣ Popeyes\n" +
            "4️⃣ Komagene\n" +
            "5️⃣ Cadde Katık\n" +
            "6️⃣ Komagene Diğer / Harici Sipariş\n\n" +
            "_Lütfen dükkan adını yazınız (Örn: Burger King veya Pasaport Pizza)_";
          await sock.sendMessage(sender, { text: storeMsg });
          return;
        } else {
          await sock.sendMessage(sender, { text: "⚠️ Bu komut yalnızca Beypazarı bölgesinde dükkan değiştirmek içindir. Bölgenizi değiştirmek için *BÖLGE* yazabilirsiniz." });
          return;
        }
      }

      // 🌍 6. BÖLGE SEÇİMİ VE AKIŞI
      if (lowerText === 'bölge' || lowerText === 'bolge' || lowerText === 'referans') {
        storeData.userStates[sender] = 'WAITING_REGION';
        saveData();
        let regionMsg = "📍 *Lütfen Bulunduğunuz Bölgeyi Seçin:*\n\n" +
          "1️⃣ Nallıhan\n" +
          "2️⃣ Beypazarı\n" +
          "3️⃣ Diğer\n\n" +
          "_Lütfen bölge adını yazınız (Örn: Nallıhan veya Beypazarı)_";
        await sock.sendMessage(sender, { text: regionMsg });
        return;
      }

      if (storeData.userStates[sender] === 'WAITING_REGION') {
        const selectedRegion = Object.keys(storeData.regions).find(r => r.toLowerCase() === lowerText);
        if (selectedRegion) {
          if (!storeData.customers[sender]) storeData.customers[sender] = {};
          storeData.customers[sender].region = selectedRegion;

          if (selectedRegion === 'Nallıhan') {
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
          } else if (selectedRegion === 'Beypazarı') {
            storeData.userStates[sender] = 'WAITING_BEYPAZARI_STORE';
            saveData();
            let storeMsg = "🏙️ *Beypazarı Restoran Seçimi:*\n\n" +
              "1️⃣ Burger King\n" +
              "2️⃣ Pasaport Pizza\n" +
              "3️⃣ Popeyes\n" +
              "4️⃣ Komagene\n" +
              "5️⃣ Cadde Katık\n" +
              "6️⃣ Komagene Diğer / Harici Sipariş\n\n" +
              "_Lütfen dükkan adını yazınız (Örn: Burger King veya Komagene)_";
            await sock.sendMessage(sender, { text: storeMsg });
          } else if (selectedRegion === 'Diğer') {
            storeData.userStates[sender] = 'WAITING_OTHER_LOCATION';
            saveData();
            await sock.sendMessage(sender, { text: "📍 Bölgeniz *Diğer* olarak işaretlendi.\n\nLütfen bulunduğunuz yeri / konumu yazar mısınız?:" });
          }
        } else {
          await sock.sendMessage(sender, { text: "❌ Geçersiz bölge. Lütfen (Nallıhan, Beypazarı, Diğer) yazın:" });
        }
        return;
      }

      // BEYPAZARI RESTORAN SEÇİMİ
      if (storeData.userStates[sender] === 'WAITING_BEYPAZARI_STORE') {
        const storeInput = lowerText;
        let matchedStore = "";

        if (storeInput.includes("burger")) matchedStore = "burgerking";
        else if (storeInput.includes("pasaport")) matchedStore = "pasaport";
        else if (storeInput.includes("popeyes")) matchedStore = "popeyes";
        else if (storeInput.includes("komagene") && storeInput.includes("diğer")) matchedStore = "komagene_diger";
        else if (storeInput.includes("komagene")) matchedStore = "komagene";
        else if (storeInput.includes("cadde") || storeInput.includes("katık")) matchedStore = "caddelkatik";

        if (matchedStore === "komagene_diger") {
          storeData.userStates[sender] = 'WAITING_BEYPAZARI_OTHER';
          saveData();
          await sock.sendMessage(sender, { text: "📌 *Komagene Diğer / Harici Sipariş Modülü*\n\nLütfen istediğiniz menüyü ve detayları yazınız:" });
          return;
        }

        if (beypazariMenus[matchedStore]) {
          if (!storeData.customers[sender]) storeData.customers[sender] = {};
          storeData.customers[sender].beypazariStore = matchedStore;
          delete storeData.userStates[sender];
          saveData();

          await sock.sendMessage(sender, { text: `✅ Restoran seçildi! Menüyü görmek için *MENÜ* yazabilirsiniz. (Dükkan değiştirmek için dilediğiniz zaman *DÜKKAN* yazabilirsiniz.)` });
        } else {
          await sock.sendMessage(sender, { text: "❌ Geçersiz dükkan adı. Lütfen listeden birini yazınız (Burger King, Pasaport Pizza, Popeyes, Komagene, Cadde Katık):" });
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
          await sock.sendMessage(sender, { text: `✅ Referansınız *${selectedName}* olarak kaydedildi!\n\nSipariş vermek için *MENÜ* yazabilirsiniz.` });
        } else {
          await sock.sendMessage(sender, { text: `❌ Geçersiz isim. Lütfen listeden birini seçin veya 'Yok' yazın:` });
        }
        return;
      }

      // 🍕 7. MENÜ GÖSTERİMİ (BÖLGEYE VE BEYPAZARI İSE SEÇİLEN DÜKKANA GÖRE)
      if (lowerText === 'menü' || lowerText === 'menu') {
        const userCust = storeData.customers[sender] || {};
        const userRegion = userCust.region || "Seçilmemiş";

        if (userRegion === 'Seçilmemiş') {
          await sock.sendMessage(sender, { text: "⚠️ Önce bölge seçmelisiniz. Lütfen *BÖLGE* yazın." });
          return;
        }

        if (userRegion === 'Diğer') {
          await sock.sendMessage(sender, { text: `⚠️ Seçtiğiniz bölge (*Diğer*) için standart menümüz bulunmamaktadır. *!destek* yazarak doğrudan iletişime geçebilirsiniz.` });
          return;
        }

        if (userRegion === 'Nallıhan') {
          const menuText = `🍕 *CEO-SİPARİŞ NALLIHAN MENÜSÜ* 🍔\n\n` +
            `🔴 *KÜÇÜK BOY PIZZALAR*\n` +
            `*K1:* 2 Adet Küçük Special - 250 TL\n` +
            `*K2:* 2 Adet Küçük Luna - 230 TL\n\n` +
            `🟡 *ORTA BOY PIZZALAR*\n` +
            `*O1:* 1 Adet Orta Special - 210 TL\n` +
            `*O2:* 1 Adet Orta Gurme - 230 TL\n\n` +
            `🟢 *BÜYÜK BOY PIZZALAR*\n` +
            `*B1:* 1 Adet Büyük Special - 290 TL\n` +
            `*B2:* 1 Adet Büyük Gurme - 350 TL\n\n` +
            `🍔 *HAMBURGER*\n` +
            `*H1:* 2 Adet Pasaport Burger - 240 TL\n\n` +
            `📝 *Sipariş Formatı:*\n` +
            `*Menü kodu , Ad Soyad , Numara , Adres*\n\n` +
            `📸 Instagram: @ceosiparis`;
          await sock.sendMessage(sender, { text: menuText });
          return;
        }

        if (userRegion === 'Beypazarı') {
          const storeKey = userCust.beypazariStore;
          if (!storeKey || !beypazariMenus[storeKey]) {
            await sock.sendMessage(sender, { text: "⚠️ Önce dükkan seçmelisiniz. Lütfen *BÖLGE* yazıp Beypazarı dükkanınızı seçin veya doğrudan *DÜKKAN* yazın." });
            return;
          }

          let itemsList = "";
          const menuObj = beypazariMenus[storeKey];

          for (const [code, info] of Object.entries(menuObj)) {
            itemsList += `*${code.toUpperCase()}:* ${info.name} - ${info.price} TL\n`;
          }

          const beypazariMenuText = `🏙️ *CEO-SİPARİŞ BEYPAZARI MENÜSÜ* 🍔\n` +
            `📍 Dükkan: *${storeKey.toUpperCase()}*\n\n` +
            itemsList + `\n` +
            `📝 *Sipariş Formatı:*\n` +
            `*Menü kodu , Ad Soyad , Numara , Adres*\n\n` +
            `🔄 *Dükkan Değiştirmek İçin:* \`DÜKKAN\` yazabilirsiniz.\n` +
            `💳 *Önemli Not:* Beypazarı siparişlerinde yalnızca **Havale / Eft** ödeme yöntemi geçerlidir.\n` +
            `📸 Instagram: @ceosiparis`;

          await sock.sendMessage(sender, { text: beypazariMenuText });
          return;
        }
      }

      // 🍕 8. SİPARİŞ YAKALAMA VE HAVALE / IBAN AKIŞI
      const firstWord = lowerText.split(',')[0].trim().split(' ')[0];
      let foundItem = null;
      let activeRegion = "";

      const userCust = storeData.customers[sender] || { region: "Nallıhan" };
      activeRegion = userCust.region;

      if (activeRegion === 'Nallıhan' && nallihanMenu[firstWord]) {
        foundItem = nallihanMenu[firstWord];
      } else if (activeRegion === 'Beypazarı') {
        const storeKey = userCust.beypazariStore;
        if (storeKey && beypazariMenus[storeKey] && beypazariMenus[storeKey][firstWord]) {
          foundItem = beypazariMenus[storeKey][firstWord];
        }
      }

      if (foundItem) {
        if (!storeData.customerActiveOrders[sender]) storeData.customerActiveOrders[sender] = [];
        if (storeData.customerActiveOrders[sender].length >= 5) {
          await sock.sendMessage(sender, { text: `⚠️ Aynı anda en fazla *5 aktif sipariş* verebilirsiniz.` });
          return;
        }

        storeData.lastOrderNum += 1;
        const currentOrderId = storeData.lastOrderNum.toString();

        storeData.pendingOrders[currentOrderId] = {
          sender: sender,
          text: text,
          region: activeRegion,
          promoter: userCust.promoter || "Yok",
          price: foundItem.price,
          profit: foundItem.profit
        };

        storeData.customerActiveOrders[sender].push(currentOrderId);
        saveData();
        
        let paymentNote = activeRegion === 'Beypazarı' 
          ? "💳 *Beypazarı Bölgesi için yalnızca Havale / EFT kabul edilmektedir.*\nLütfen aşağıdaki IBAN'a ödemeyi yapıp dekontu gönderin:"
          : "💳 Aşağıdaki IBAN'a ödemeyi yapıp dekontu gönderin:";

        const musteriMesaji = `⏳ *Siparişiniz Alındı! (Sipariş No: #${currentOrderId})*\n\n` +
          `Seçtiğiniz Menü: *${firstWord.toUpperCase()}* (${foundItem.price} TL)\n\n` +
          `⏱️ *Teslimat Bilgisi:* Siparişiniz ortalama *30 dakika* içinde kapınızda olacaktır. Sizi telefonla aramayacağız, lütfen kapıda bekleyin!\n\n` +
          paymentNote;

        await sock.sendMessage(sender, { text: musteriMesaji });
        await sock.sendMessage(sender, { text: IBAN_NUMARASI });
        await sock.sendMessage(sender, { text: `📌 Alıcı / Banka: ${IBAN_SAHIBI}` });

        const adminBildirim = `🚨 *YENİ SİPARİŞ DÜŞTÜ! (#${currentOrderId})* 🚨\n\n` +
          `🆔 *Sipariş No:* #${currentOrderId}\n` +
          `👤 Müşteri: wa.me/${sender.split('@')[0]}\n` +
          `🌍 Bölge: ${activeRegion} ${activeRegion === 'Beypazarı' ? '(' + (userCust.beypazariStore || '') + ')' : ''}\n` +
          `📦 Sipariş Detayı: ${text}\n` +
          `💰 Tutar: ${foundItem.price} TL\n\n` +
          `✅ Onaylamak için:\n\`!onayla ${currentOrderId}\`\n\n` +
          `❌ Reddetmek için:\n\`!reddet ${currentOrderId} <sebep>\``;

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

        let welcome = "👋 *Aleykümselam, CEO-SİPARİŞ'e Hoş Geldiniz!*\n\n";
        if (storeData.customers[sender] && storeData.customers[sender].region) {
          welcome += `📍 Bölge: *${storeData.customers[sender].region}*\n`;
        } else {
          welcome += "🔹 Bölge seçmek için *BÖLGE* yazabilirsiniz.\n\n";
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