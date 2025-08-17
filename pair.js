const fs = require("fs");
const { exec } = require("child_process");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega"); // MEGA uploader

function removeFile(path) {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
}

function generateId(length = 6, digits = 4) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const num = Math.floor(Math.random() * Math.pow(10, digits));
  return `${id}${num}`;
}

async function paircodeHandler(req, res) {
  const rawNum = req.query.number;
  if (!rawNum || rawNum.length < 10) {
    return res.status(400).send({ code: "Invalid number" });
  }

  const number = rawNum.replace(/[^0-9]/g, "");

  let sent = false;
  const safeSend = (data) => {
    if (!sent && !res.headersSent) {
      res.send(data);
      sent = true;
    }
  };

  try {
    const { state, saveCreds } = await useMultiFileAuthState("./session");

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "fatal" }),
      browser: Browsers.macOS("Safari"),
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        try {
          await delay(10000);

          const userJid = jidNormalizedUser(sock.user.id);
          const sessionPath = "./session/creds.json";

          if (!fs.existsSync(sessionPath)) {
            throw new Error("Session file missing");
          }

          const megaUrl = await upload(
            fs.createReadStream(sessionPath),
            `${generateId()}.json`
          );

          const sessionCode = megaUrl.replace("https://mega.nz/file/", "");

          await sock.sendMessage(userJid, {
            image: {
              url: "https://raw.githubusercontent.com/Dark-Robin/Bot-Helper/refs/heads/main/autoimage/Bot%20robin%20WP.jpg",
            },
            caption: "𝑩𝑶𝑻 𝑪𝑶𝑵𝑵𝑬𝑪𝑻𝑬𝑫 ✅\n⚡ Powered by - HASA and NERO ⚡",
          });

          await sock.sendMessage(userJid, {
            text: `🔐 Session Code:\n${sessionCode}`,
          });

          await sock.sendMessage(userJid, {
            text: "🛑 *Do not share this code with anyone!* 🛑",
          });

          await sock.sendMessage(userJid, {
            text: `
𝑩𝑶𝑻 𝑪𝑶𝑵𝑵𝑬𝑪𝑻𝑬𝑫 ✅

🎉 ඔබේ WhatsApp අංකය සාර්ථකව HASA and NERO bot එකට සම්බන්ධ විය!

╔════════════════════╗
║   HASA and NERO    ║
╚════════════════════╝

⚡ Powered by - HASA and NERO ⚡  
📢 Channel: https://whatsapp.com/channel/0029Vb5dXrlBkfi7XjLb8g1S  
🧠 Sinhala UX + Plugin Intelligence
`,
          });

          removeFile("./session");
        } catch (err) {
          console.error("Messaging failed:", err);
          exec("pm2 restart prabath");
        }
      } else if (
        connection === "close" &&
        lastDisconnect?.error?.output?.statusCode !== 401
      ) {
        console.warn("Reconnecting...");
        exec("pm2 restart Robin-md");
      }
    });

    const code = await sock.requestPairingCode(number);
    safeSend({ code });
  } catch (err) {
    console.error("Pairing failed:", err);
    exec("pm2 restart Robin");
    removeFile("./session");
    safeSend({ code: "Service Unavailable" });
  }
}

module.exports = paircodeHandler;
