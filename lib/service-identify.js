// Service-identificatie: per (host, open poort) een korte banner-grab of
// HTTP-titel om uit te vinden welke applicatie luistert. Geen externe deps.
//
// Strategie:
//   - Bekende poorten → label uit PORT_SERVICE map (snelle hint zelfs zonder banner)
//   - HTTP/HTTPS poorten → korte GET, extract `<title>` + Server-header
//   - SSH/FTP/SMTP/IMAP/POP3 → "passive" banner (server stuurt eerst regel)
//   - RTSP → OPTIONS request
//   - Anders → eerste 256 bytes lezen, controleren of het printable is

import net from 'node:net';
import http from 'node:http';
import { URL } from 'node:url';

const SOCKET_TIMEOUT_MS = 1500;
const HTTP_TIMEOUT_MS = 1500;

// Korte beschrijving per bekende poort. Wordt gebruikt als tooltip-tekst en
// als fallback wanneer banner-grab niets oplevert. Top-100 lijst dekt
// smart-home, NAS, printer, media en standaard infrastructuur.
export const PORT_SERVICE = {
  20: { name: 'FTP-data', kind: 'ftp' },
  21: { name: 'FTP', kind: 'ftp' },
  22: { name: 'SSH', kind: 'ssh' },
  23: { name: 'Telnet', kind: 'telnet' },
  25: { name: 'SMTP', kind: 'smtp' },
  53: { name: 'DNS', kind: 'dns' },
  67: { name: 'DHCP', kind: 'dhcp' },
  80: { name: 'HTTP', kind: 'http' },
  110: { name: 'POP3', kind: 'pop3' },
  111: { name: 'RPC', kind: 'rpc' },
  119: { name: 'NNTP', kind: 'nntp' },
  123: { name: 'NTP', kind: 'ntp' },
  135: { name: 'MS-RPC', kind: 'rpc' },
  137: { name: 'NetBIOS-NS', kind: 'netbios' },
  139: { name: 'NetBIOS', kind: 'netbios' },
  143: { name: 'IMAP', kind: 'imap' },
  161: { name: 'SNMP', kind: 'snmp' },
  389: { name: 'LDAP', kind: 'ldap' },
  443: { name: 'HTTPS', kind: 'https' },
  445: { name: 'SMB', kind: 'smb' },
  465: { name: 'SMTPS', kind: 'smtp' },
  500: { name: 'IPsec', kind: 'vpn' },
  502: { name: 'Modbus', kind: 'industrial' },
  515: { name: 'LPD/printer', kind: 'printer' },
  548: { name: 'AFP', kind: 'fileshare' },
  554: { name: 'RTSP', kind: 'rtsp' },
  587: { name: 'SMTP-submission', kind: 'smtp' },
  631: { name: 'IPP/printer', kind: 'printer' },
  636: { name: 'LDAPS', kind: 'ldap' },
  873: { name: 'rsync', kind: 'fileshare' },
  993: { name: 'IMAPS', kind: 'imap' },
  995: { name: 'POP3S', kind: 'pop3' },
  1080: { name: 'SOCKS', kind: 'proxy' },
  1194: { name: 'OpenVPN', kind: 'vpn' },
  1433: { name: 'MSSQL', kind: 'database' },
  1521: { name: 'Oracle', kind: 'database' },
  1723: { name: 'PPTP', kind: 'vpn' },
  1883: { name: 'MQTT', kind: 'mqtt' },
  1900: { name: 'SSDP/UPnP', kind: 'upnp' },
  2049: { name: 'NFS', kind: 'fileshare' },
  3000: { name: 'HTTP (LG WebOS / dev)', kind: 'http' },
  3001: { name: 'HTTPS (LG WebOS)', kind: 'https' },
  3306: { name: 'MySQL', kind: 'database' },
  3389: { name: 'RDP', kind: 'remote' },
  3478: { name: 'STUN', kind: 'stun' },
  3689: { name: 'DAAP/iTunes', kind: 'media' },
  4500: { name: 'IPsec NAT-T', kind: 'vpn' },
  5000: { name: 'HTTP (Synology DSM / UPnP)', kind: 'http' },
  5001: { name: 'HTTPS (Synology DSM)', kind: 'https' },
  5060: { name: 'SIP', kind: 'voip' },
  5061: { name: 'SIP-TLS', kind: 'voip' },
  5222: { name: 'XMPP', kind: 'chat' },
  5353: { name: 'mDNS', kind: 'mdns' },
  5432: { name: 'PostgreSQL', kind: 'database' },
  5683: { name: 'CoAP', kind: 'iot' },
  5900: { name: 'VNC', kind: 'remote' },
  6379: { name: 'Redis', kind: 'database' },
  7000: { name: 'AirPlay', kind: 'media' },
  8000: { name: 'HTTP-alt', kind: 'http' },
  8001: { name: 'HTTP (Samsung Tizen)', kind: 'http' },
  8002: { name: 'HTTPS (Samsung Tizen)', kind: 'https' },
  8008: { name: 'HTTP (Chromecast)', kind: 'http' },
  8009: { name: 'Chromecast', kind: 'cast' },
  8060: { name: 'Roku ECP', kind: 'media' },
  8080: { name: 'HTTP-proxy', kind: 'http' },
  8081: { name: 'HTTP-alt', kind: 'http' },
  8086: { name: 'InfluxDB', kind: 'database' },
  8088: { name: 'HTTP-alt', kind: 'http' },
  8089: { name: 'HTTPS-alt', kind: 'https' },
  8123: { name: 'Home Assistant', kind: 'http' },
  8181: { name: 'HTTP (Tautulli)', kind: 'http' },
  8200: { name: 'GoVCR / DLNA', kind: 'media' },
  8443: { name: 'HTTPS-alt', kind: 'https' },
  8554: { name: 'RTSP-alt', kind: 'rtsp' },
  8843: { name: 'UniFi-portal', kind: 'https' },
  8880: { name: 'UniFi inform', kind: 'http' },
  8883: { name: 'MQTT-TLS', kind: 'mqtt' },
  8888: { name: 'HTTP-alt', kind: 'http' },
  9000: { name: 'HTTP (Portainer / Plex)', kind: 'http' },
  9090: { name: 'HTTP (Cockpit)', kind: 'http' },
  9100: { name: 'Printer raw (JetDirect)', kind: 'printer' },
  9200: { name: 'Elasticsearch', kind: 'database' },
  9443: { name: 'HTTPS-alt', kind: 'https' },
  10250: { name: 'Kubelet', kind: 'kubernetes' },
  11434: { name: 'Ollama', kind: 'http' },
  19999: { name: 'Netdata', kind: 'http' },
  20000: { name: 'DNP3', kind: 'industrial' },
  22000: { name: 'Syncthing', kind: 'sync' },
  25565: { name: 'Minecraft', kind: 'game' },
  27017: { name: 'MongoDB', kind: 'database' },
  32400: { name: 'Plex', kind: 'media' },
  32469: { name: 'Plex DLNA', kind: 'media' },
  49152: { name: 'UPnP-alt', kind: 'upnp' },
  51820: { name: 'WireGuard', kind: 'vpn' },
};

export const TOP_PORTS = Object.keys(PORT_SERVICE).map(Number).sort((a, b) => a - b);

function tcpProbe(host, port, timeoutMs = SOCKET_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try { socket.connect(port, host); } catch { finish(false); }
  });
}

// Verbind op poort en lees max ~256 bytes binnen 1.5s. Werkt voor protocols
// die direct een banner sturen (SSH, FTP, SMTP, IMAP, POP3, IRC, ...).
function passiveBanner(host, port, timeoutMs = SOCKET_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (banner) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(banner);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      // Wacht passief op data; als er niets komt → timeout
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 256) {
        finish(buf.slice(0, 256).toString('utf8').replace(/[^\x20-\x7e\r\n]/g, '').trim());
      }
    });
    socket.once('timeout', () => {
      if (buf.length > 0) {
        finish(buf.toString('utf8').replace(/[^\x20-\x7e\r\n]/g, '').trim());
      } else {
        finish(null);
      }
    });
    socket.once('end', () => {
      finish(buf.length > 0 ? buf.toString('utf8').replace(/[^\x20-\x7e\r\n]/g, '').trim() : null);
    });
    socket.once('error', () => finish(null));
    try { socket.connect(port, host); } catch { finish(null); }
  });
}

// HTTP GET op een specifieke poort. Geeft titel + Server-header terug.
function fetchHttp(host, port, { timeoutMs = HTTP_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(`http://${host}:${port}/`);
    } catch {
      resolve(null);
      return;
    }
    const req = http.get(
      parsed,
      { timeout: timeoutMs, headers: { 'User-Agent': 'weer-display/1.0' } },
      (res) => {
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total < 8192) chunks.push(c);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const titleMatch = body.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
          resolve({
            status: res.statusCode || 0,
            server: res.headers?.server || null,
            title: titleMatch ? titleMatch[1].trim() : null,
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
  });
}

// RTSP OPTIONS — vraag wat de server kan, geeft Server-header terug
function rtspOptions(host, port, timeoutMs = SOCKET_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (banner) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(banner);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(`OPTIONS rtsp://${host}:${port}/ RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: weer-display\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 1024) {
        finish(buf.slice(0, 1024).toString('utf8').trim());
      }
    });
    socket.once('timeout', () => {
      finish(buf.length > 0 ? buf.toString('utf8').trim() : null);
    });
    socket.once('end', () => {
      finish(buf.length > 0 ? buf.toString('utf8').trim() : null);
    });
    socket.once('error', () => finish(null));
    try { socket.connect(port, host); } catch { finish(null); }
  });
}

// Hoofdfunctie: identificeer service achter (host, port). Returnt
// { port, name, kind, banner, server, title } object — banner kan null zijn.
export async function identifyService(host, port) {
  const known = PORT_SERVICE[port] || { name: `poort ${port}`, kind: 'unknown' };
  const result = {
    port,
    name: known.name,
    kind: known.kind,
    banner: null,
    server: null,
    title: null,
  };

  if (known.kind === 'http') {
    const r = await fetchHttp(host, port);
    if (r) {
      result.title = r.title;
      result.server = r.server;
      // Verfijn naam op basis van titel/server
      result.banner = r.title || r.server || null;
    }
    return result;
  }

  if (known.kind === 'https') {
    // TLS overslaan — we doen geen TLS-handshake. Markeer alleen dat de poort
    // openstaat; identifie via TLS zou een TLS-stack vereisen.
    return result;
  }

  if (known.kind === 'rtsp') {
    const r = await rtspOptions(host, port);
    if (r) {
      result.banner = r.split(/\r?\n/).slice(0, 4).join(' | ').slice(0, 200);
      const m = r.match(/Server:\s*([^\r\n]+)/i);
      if (m) result.server = m[1].trim();
    }
    return result;
  }

  // Passive banner protocols: SSH, FTP, SMTP, IMAP, POP3, IRC, telnet
  if (['ssh', 'ftp', 'smtp', 'imap', 'pop3', 'telnet'].includes(known.kind)) {
    const banner = await passiveBanner(host, port);
    if (banner) {
      result.banner = banner.split(/\r?\n/)[0].slice(0, 200);
    }
    return result;
  }

  // Onbekende kind: probeer toch passieve banner als laatste poging
  const banner = await passiveBanner(host, port, 1000);
  if (banner) result.banner = banner.split(/\r?\n/)[0].slice(0, 200);
  return result;
}

export { tcpProbe };
