import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.WA_PORT || process.env.PORT || 3001);
const AUTH_DIR = path.join(__dirname, "whatsapp_auth_session");

let sock = null;
let connectionStatus = "starting"; // "starting" | "qr" | "connected" | "disconnected"
let currentQrDataUrl = "";
let connectedUser = null;
let isReconnecting = false;

async function startWhatsApp() {
    if (isReconnecting) return;
    isReconnecting = true;

    try {
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        let version = [2, 3000, 1015901307];
        try {
            const latest = await fetchLatestBaileysVersion();
            if (latest?.version) version = latest.version;
        } catch (_) {}

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: "silent" }),
            browser: ["Granja Rancho do Viana", "Chrome", "2.0.0"],
            syncFullHistory: false,
            markOnlineOnConnect: false
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                connectionStatus = "qr";
                try {
                    currentQrDataUrl = await QRCode.toDataURL(qr, {
                        margin: 2,
                        width: 280,
                        color: { dark: "#132a1c", light: "#ffffff" }
                    });
                    console.log("[WhatsApp API] Novo QR Code gerado. Escaneie na aba Ajustes do sistema ou em http://localhost:" + PORT);
                } catch (err) {
                    console.error("[WhatsApp API] Erro ao gerar imagem do QR Code:", err);
                }
            }

            if (connection === "open") {
                connectionStatus = "connected";
                currentQrDataUrl = "";
                connectedUser = {
                    id: sock.user?.id?.split(":")[0] || sock.user?.id || "",
                    name: sock.user?.name || "WhatsApp Granja"
                };
                console.log(`[WhatsApp API] Conectado com sucesso como: ${connectedUser.name} (${connectedUser.id})`);
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log("[WhatsApp API] Conexão fechada. Status:", statusCode, "Reconectar:", shouldReconnect);

                connectionStatus = "disconnected";
                connectedUser = null;
                currentQrDataUrl = "";

                if (!shouldReconnect) {
                    try {
                        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    } catch (_) {}
                }

                setTimeout(() => {
                    isReconnecting = false;
                    startWhatsApp();
                }, 2500);
            }
        });
    } catch (err) {
        console.error("[WhatsApp API] Erro ao iniciar Baileys:", err);
        connectionStatus = "disconnected";
        setTimeout(() => {
            isReconnecting = false;
            startWhatsApp();
        }, 5000);
    } finally {
        isReconnecting = false;
    }
}

function normalizeBrazilPhones(rawPhone) {
    let digits = String(rawPhone || "").replace(/\D/g, "").replace(/^0+/, "");
    if (!digits) return [];
    if (digits.length === 10 || digits.length === 11) {
        digits = "55" + digits;
    }

    const candidates = [digits];
    // No Brasil (DDI 55 + DDD 2 dígitos), algumas contas do WhatsApp foram criadas sem o 9º dígito e outras com o 9º dígito
    if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
        candidates.push(digits.slice(0, 4) + digits.slice(5));
    } else if (digits.startsWith("55") && digits.length === 12) {
        candidates.push(digits.slice(0, 4) + "9" + digits.slice(4));
    }
    return candidates;
}

async function resolveWhatsAppJid(rawPhone) {
    const candidates = normalizeBrazilPhones(rawPhone);
    if (!candidates.length) {
        throw new Error("Número de telefone inválido.");
    }

    for (const candidate of candidates) {
        try {
            const results = await sock.onWhatsApp(candidate);
            if (Array.isArray(results) && results.length > 0 && results[0].exists && results[0].jid) {
                return results[0].jid;
            }
        } catch (_) {}
    }

    return `${candidates[0]}@s.whatsapp.net`;
}

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 35 * 1024 * 1024) {
                reject(new Error("Payload muito grande"));
            }
        });
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error("JSON inválido"));
            }
        });
        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === "GET" && url.pathname === "/status") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
            ok: true,
            status: connectionStatus,
            connected: connectionStatus === "connected",
            qrDataUrl: currentQrDataUrl,
            user: connectedUser
        }));
        return;
    }

    if (req.method === "POST" && url.pathname === "/logout") {
        try {
            if (sock) {
                await sock.logout().catch(() => {});
            }
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            connectionStatus = "disconnected";
            connectedUser = null;
            currentQrDataUrl = "";
            setTimeout(() => startWhatsApp(), 1000);
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, message: "Sessão desconectada. Um novo QR Code será gerado." }));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
    }

    if (req.method === "POST" && (url.pathname === "/send-receipt" || url.pathname === "/")) {
        if (connectionStatus !== "connected" || !sock) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({
                ok: false,
                error: "O WhatsApp não está conectado. Vá em Ajustes → Dados da Empresa e escaneie o QR Code."
            }));
            return;
        }

        try {
            const payload = await readJsonBody(req);
            const { phone, fileName, caption, pdfBase64 } = payload;

            if (!phone || !pdfBase64) {
                res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "Telefone e PDF (pdfBase64) são obrigatórios." }));
                return;
            }

            const jid = await resolveWhatsAppJid(phone);
            const cleanBase64 = String(pdfBase64).includes(",")
                ? String(pdfBase64).split(",")[1]
                : String(pdfBase64);
            const pdfBuffer = Buffer.from(cleanBase64, "base64");

            await sock.sendMessage(jid, {
                document: pdfBuffer,
                mimetype: "application/pdf",
                fileName: fileName || "Recibo_Granja_Viana.pdf",
                caption: caption || ""
            });

            console.log(`[WhatsApp API] Recibo ${fileName} enviado com sucesso para ${jid}`);
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, jid }));
        } catch (err) {
            console.error("[WhatsApp API] Erro ao enviar documento:", err);
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: false, error: err.message || "Falha ao enviar PDF no WhatsApp" }));
        }
        return;
    }

    // Painel visual rápido caso o usuário acesse http://localhost:3001 diretamente no navegador
    if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="refresh" content="5">
                <title>Provedor WhatsApp — Granja Rancho do Viana</title>
                <style>
                    body { font-family: system-ui, sans-serif; background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                    .box { background: #fff; padding: 28px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; max-width: 380px; width: 100%; }
                    h2 { margin: 0 0 8px; color: #132a1c; }
                    .status { display: inline-block; padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 0.85rem; margin: 10px 0; }
                    .ok { background: #dcfce7; color: #15803d; }
                    .wait { background: #fef3c7; color: #b45309; }
                    img { border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; margin-top: 10px; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h2>Provedor WhatsApp</h2>
                    <small style="color:#64748b;">Granja Rancho do Viana</small><br>
                    ${connectionStatus === "connected"
                        ? `<div class="status ok">✅ Conectado (${connectedUser?.id || ""})</div><p style="font-size:0.9rem;color:#334155;">Pronto para enviar recibos em PDF automaticamente!</p>`
                        : currentQrDataUrl
                            ? `<div class="status wait">📱 Escaneie o QR Code no WhatsApp</div><br><img src="${currentQrDataUrl}" width="240" height="240" alt="QR Code">`
                            : `<div class="status wait">⏳ Gerando conexão... aguarde alguns segundos</div>`
                    }
                </div>
            </body>
            </html>
        `);
        return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Rota não encontrada" }));
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`====================================================`);
    console.log(`[WhatsApp API] Servidor Próprio rodando em http://localhost:${PORT}`);
    console.log(`====================================================`);
    startWhatsApp();
});
