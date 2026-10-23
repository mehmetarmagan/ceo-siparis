// 🔴 1. ADMIN KOMUTLARI
      const cleanSender = sender.replace(/[^0-9]/g, '');
      const isAdmin = ADMIN_NUMBERS.some(num => cleanSender.includes(num));

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