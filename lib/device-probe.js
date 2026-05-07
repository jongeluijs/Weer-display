// Device probe — onderzoekt een gevonden netwerk-host op meerdere manieren om
// uit te vinden wat voor apparaat het is. Geen externe deps. Probes lopen
// parallel met korte timeouts.
//
// Gebruikte signalen:
//   1. HTTP GET op poort 80 → status, Server-header, HTML <title>
//   2. HTTP GET op specifieke fingerprints (Hue, Shelly, ESPHome, Sonos, ...)
//   3. TCP connectiviteit op signature-poorten
//   4. Hostname (uit reverse-DNS)
//
// Resultaat: een verrijkt object met `vendor`, `type`, `friendlyName`, `model`,
// `details`. Wat we kunnen doen wordt gerangschikt onder `capabilities`.

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';

const PROBE_TIMEOUT_MS = 1500;
const TCP_TIMEOUT_MS = 700;

function fetchPlain(targetUrl, { timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      reject(err);
      return;
    }
    const req = http.get(
      parsed,
      {
        timeout: timeoutMs,
        headers: { 'User-Agent': 'weer-display/1.0' },
      },
      (res) => {
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total < 16384) chunks.push(c);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function tcpProbe(host, port, timeoutMs = TCP_TIMEOUT_MS) {
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

function extractTitle(html) {
  if (!html) return null;
  const m = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  return m ? m[1].trim() : null;
}

// Enkele specifieke fingerprint-checks. Iedere fn krijgt de IP en optioneel
// het basis-HTTP-resultaat, en geeft `null` terug bij geen match of een
// {vendor,type,friendlyName,model,details,capabilities} object.

async function probeHueBridge(ip) {
  try {
    const r = await fetchPlain(`http://${ip}/api/0/config`);
    if (r.status !== 200) return null;
    const data = JSON.parse(r.body);
    if (!data?.bridgeid) return null;
    return {
      vendor: 'Philips Hue',
      type: 'hub',
      friendlyName: data.name || 'Hue Bridge',
      model: data.modelid || null,
      details: { bridgeId: data.bridgeid, mac: data.mac, swversion: data.swversion },
      capabilities: ['discover_lights', 'control_lights'],
      driver: 'hue',
    };
  } catch { return null; }
}

async function probeShelly(ip) {
  try {
    const r = await fetchPlain(`http://${ip}/shelly`);
    if (r.status !== 200) return null;
    const data = JSON.parse(r.body);
    if (!data?.type && !data?.mac) return null;
    return {
      vendor: 'Shelly',
      type: 'switch',
      friendlyName: data.name || data.type || 'Shelly',
      model: data.type || null,
      details: { fw: data.fw, auth: data.auth, num_outputs: data.num_outputs },
      capabilities: ['toggle', 'on', 'off', 'meter'],
      driver: 'shelly',
    };
  } catch { return null; }
}

async function probeShellyGen2(ip) {
  // Shelly Plus / Pro (Gen2) gebruikt /rpc/Shelly.GetDeviceInfo
  try {
    const r = await fetchPlain(`http://${ip}/rpc/Shelly.GetDeviceInfo`);
    if (r.status !== 200) return null;
    const data = JSON.parse(r.body);
    if (!data?.id && !data?.model) return null;
    return {
      vendor: 'Shelly',
      type: 'switch',
      friendlyName: data.name || data.id || 'Shelly Plus',
      model: data.model || null,
      details: { id: data.id, fw_id: data.fw_id, mac: data.mac, gen: data.gen },
      capabilities: ['toggle', 'on', 'off'],
      driver: 'shelly_gen2',
    };
  } catch { return null; }
}

async function probeESPHome(ip, htmlResult) {
  // ESPHome heeft een herkenbare web-frontend
  const html = htmlResult?.body || '';
  if (/esphome/i.test(html)) {
    const title = extractTitle(html);
    return {
      vendor: 'ESPHome',
      type: 'sensor',
      friendlyName: title || 'ESPHome',
      model: null,
      details: { server: htmlResult.headers?.server || null },
      capabilities: ['read_state'],
      driver: 'esphome',
    };
  }
  return null;
}

async function probeTasmota(ip, htmlResult) {
  const html = htmlResult?.body || '';
  if (/tasmota|sonoff/i.test(html)) {
    const title = extractTitle(html);
    return {
      vendor: 'Tasmota',
      type: 'switch',
      friendlyName: title || 'Tasmota',
      model: null,
      details: { server: htmlResult.headers?.server || null },
      capabilities: ['toggle', 'on', 'off'],
      driver: 'tasmota',
    };
  }
  return null;
}

async function probeSonos(ip) {
  try {
    const r = await fetchPlain(`http://${ip}:1400/xml/device_description.xml`);
    if (r.status !== 200) return null;
    const body = r.body;
    if (!/Sonos/i.test(body)) return null;
    const friendly = (body.match(/<friendlyName>([^<]+)<\/friendlyName>/) || [])[1] || 'Sonos';
    const model = (body.match(/<modelDescription>([^<]+)<\/modelDescription>/) || [])[1] || null;
    return {
      vendor: 'Sonos',
      type: 'speaker',
      friendlyName: friendly,
      model,
      details: {},
      capabilities: ['volume', 'play', 'pause'],
      driver: 'sonos',
    };
  } catch { return null; }
}

async function probeChromecast(ip) {
  // Chromecast luistert op poort 8008/8009. /setup/eureka_info geeft device info.
  try {
    const r = await fetchPlain(`http://${ip}:8008/setup/eureka_info?options=detail`);
    if (r.status !== 200) return null;
    const data = JSON.parse(r.body);
    if (!data?.name && !data?.bssid) return null;
    return {
      vendor: 'Google',
      type: 'speaker',
      friendlyName: data.name || 'Chromecast',
      model: data.model_name || null,
      details: { build_version: data.build_version },
      capabilities: ['cast'],
      driver: 'chromecast',
    };
  } catch { return null; }
}

async function probePrinter(ip) {
  // Internet Printing Protocol op 631 of raw printing op 9100
  if (await tcpProbe(ip, 9100)) {
    return {
      vendor: null,
      type: 'printer',
      friendlyName: 'Printer',
      model: null,
      details: { port: 9100 },
      capabilities: ['print'],
      driver: 'generic',
    };
  }
  return null;
}

async function probeAVMFritz(ip, htmlResult) {
  const html = htmlResult?.body || '';
  if (/fritz!?box|avm/i.test(html) || /fritz!?box/i.test(htmlResult?.headers?.server || '')) {
    const title = extractTitle(html);
    return {
      vendor: 'AVM',
      type: 'router',
      friendlyName: title || 'Fritz!Box',
      model: null,
      details: {},
      capabilities: [],
      driver: 'generic',
    };
  }
  return null;
}

async function probeGenericHttp(ip) {
  try {
    const r = await fetchPlain(`http://${ip}/`);
    return r;
  } catch {
    return null;
  }
}

// Synology DSM (NAS) — webman/index.cgi geeft een herkenbaar redirect/HTML.
// We controleren ook poort 5000 (DSM HTTP) als HTTPS-loos signaal.
async function probeSynology(ip, htmlResult) {
  const html = htmlResult?.body || '';
  const server = htmlResult?.headers?.server || '';
  if (/synology|diskstation/i.test(html) || /synology/i.test(server)) {
    const title = extractTitle(html);
    return {
      vendor: 'Synology',
      type: 'nas',
      friendlyName: title || 'Synology NAS',
      model: null,
      details: { server: server || null },
      capabilities: ['storage'],
      driver: 'generic',
    };
  }
  if (await tcpProbe(ip, 5000)) {
    try {
      const r = await fetchPlain(`http://${ip}:5000/webman/index.cgi`);
      if (r.status > 0 && /synology|diskstation/i.test(r.body)) {
        return {
          vendor: 'Synology',
          type: 'nas',
          friendlyName: extractTitle(r.body) || 'Synology NAS',
          model: null,
          details: { port: 5000 },
          capabilities: ['storage'],
          driver: 'generic',
        };
      }
    } catch {
      // negeer
    }
  }
  return null;
}

// Smart TV's: Samsung (poort 8001/8002), LG WebOS (3000/3001), of HTTP-titel
async function probeSmartTv(ip, htmlResult) {
  const html = htmlResult?.body || '';
  if (/webos|tizen|samsung tv|lg tv|android tv/i.test(html)) {
    return {
      vendor: /webos|lg/i.test(html) ? 'LG' : /samsung|tizen/i.test(html) ? 'Samsung' : null,
      type: 'tv',
      friendlyName: extractTitle(html) || 'Smart TV',
      model: null,
      details: {},
      capabilities: [],
      driver: 'generic',
    };
  }
  // Samsung Tizen API endpoint
  if (await tcpProbe(ip, 8001)) {
    try {
      const r = await fetchPlain(`http://${ip}:8001/api/v2/`);
      if (r.status > 0 && /Samsung|Tizen/i.test(r.body)) {
        return {
          vendor: 'Samsung',
          type: 'tv',
          friendlyName: 'Samsung TV',
          model: null,
          details: { port: 8001 },
          capabilities: [],
          driver: 'generic',
        };
      }
    } catch {
      // negeer
    }
  }
  return null;
}

// Apple-apparaten (iPhone/iPad/Mac/AppleTV/HomePod) zijn niet altijd HTTP-
// bereikbaar, dus we leunen op vendor-MAC + hostname-patroon. Geen netwerk-
// call nodig.
function probeAppleDevice({ mac, hostname, vendor }) {
  if (!vendor || !/apple/i.test(vendor)) return null;
  const h = (hostname || '').toLowerCase();
  if (/iphone/.test(h)) {
    return {
      vendor: 'Apple',
      type: 'phone',
      friendlyName: prettyHost(hostname) || 'iPhone',
      model: 'iPhone',
      details: { mac },
      capabilities: [],
      driver: 'generic',
    };
  }
  if (/ipad/.test(h)) {
    return {
      vendor: 'Apple',
      type: 'tablet',
      friendlyName: prettyHost(hostname) || 'iPad',
      model: 'iPad',
      details: { mac },
      capabilities: [],
      driver: 'generic',
    };
  }
  if (/macbook|imac|mac-mini|mac-pro|mac-studio/.test(h)) {
    return {
      vendor: 'Apple',
      type: 'computer',
      friendlyName: prettyHost(hostname) || 'Mac',
      model: 'Mac',
      details: { mac },
      capabilities: [],
      driver: 'generic',
    };
  }
  if (/appletv|apple-tv/.test(h)) {
    return {
      vendor: 'Apple',
      type: 'tv',
      friendlyName: prettyHost(hostname) || 'Apple TV',
      model: 'Apple TV',
      details: { mac },
      capabilities: [],
      driver: 'generic',
    };
  }
  if (/homepod/.test(h)) {
    return {
      vendor: 'Apple',
      type: 'speaker',
      friendlyName: prettyHost(hostname) || 'HomePod',
      model: 'HomePod',
      details: { mac },
      capabilities: [],
      driver: 'generic',
    };
  }
  // Apple-vendor zonder hostname-match → minstens "Apple-apparaat"
  return {
    vendor: 'Apple',
    type: 'generic',
    friendlyName: prettyHost(hostname) || 'Apple-apparaat',
    model: null,
    details: { mac },
    capabilities: [],
    driver: 'generic',
  };
}

// IP-camera detectie (Reolink, Hikvision, generieke RTSP)
async function probeIpCamera(ip, htmlResult) {
  const html = htmlResult?.body || '';
  const server = htmlResult?.headers?.server || '';
  if (/reolink|hikvision|dahua|axis|amcrest|foscam|netcam/i.test(html) ||
      /reolink|hikvision|dahua/i.test(server)) {
    const m = html.match(/reolink|hikvision|dahua|axis|amcrest|foscam/i);
    const vendor = m ? m[0].charAt(0).toUpperCase() + m[0].slice(1).toLowerCase() : null;
    return {
      vendor,
      type: 'camera',
      friendlyName: extractTitle(html) || `${vendor || 'IP'} camera`,
      model: null,
      details: { server: server || null },
      capabilities: ['stream'],
      driver: 'generic',
    };
  }
  // RTSP poort 554 + iets op 80 → vermoedelijk camera
  if (await tcpProbe(ip, 554)) {
    return {
      vendor: null,
      type: 'camera',
      friendlyName: 'IP camera',
      model: null,
      details: { rtsp: 554 },
      capabilities: ['stream'],
      driver: 'generic',
    };
  }
  return null;
}

// Maakt een hostname leesbaar: "kees-iphone.local" → "Kees iPhone"
function prettyHost(hostname) {
  if (!hostname) return null;
  let h = hostname.replace(/\.(local|lan|home)\.?$/i, '').replace(/\.in-addr\.arpa$/i, '');
  if (!h) return null;
  return h
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Hoofd-probe. Voert eerst de generic HTTP-call uit, dan parallel alle
// specifieke probes. Geeft het meest specifieke resultaat terug.
export async function probeDevice({ ip, mac, hostname, vendor }) {
  if (!ip) return null;

  // Apple-apparaten zijn vaak niet HTTP-bereikbaar — eerst hostname/vendor
  // check (geen netwerk-call) zodat we ze toch herkennen.
  const appleHit = probeAppleDevice({ mac, hostname, vendor });

  // Algemene HTTP probe (voor titles + headers)
  const baseHttp = await probeGenericHttp(ip);

  // Specifieke probes parallel
  const probes = await Promise.allSettled([
    probeHueBridge(ip),
    probeShelly(ip),
    probeShellyGen2(ip),
    probeESPHome(ip, baseHttp),
    probeTasmota(ip, baseHttp),
    probeAVMFritz(ip, baseHttp),
    probeSonos(ip),
    probeChromecast(ip),
    probeSynology(ip, baseHttp),
    probeSmartTv(ip, baseHttp),
    probeIpCamera(ip, baseHttp),
    probePrinter(ip),
  ]);

  for (const p of probes) {
    if (p.status === 'fulfilled' && p.value) {
      return p.value;
    }
  }

  // Apple zonder netwerk-match alsnog gebruiken
  if (appleHit) return appleHit;

  // Geen specifieke match. Bouw een fallback uit de signalen die we wél hebben.
  if (baseHttp && baseHttp.status > 0) {
    const title = extractTitle(baseHttp.body);
    const server = baseHttp.headers?.server || null;
    return {
      vendor: vendor || null,
      type: detectTypeFromText(title, server, hostname) || 'generic',
      friendlyName: title || prettyHost(hostname) || (vendor ? `${vendor} apparaat` : null),
      model: null,
      details: { http_server: server, http_title: title, http_status: baseHttp.status },
      capabilities: ['ping'],
      driver: 'generic',
    };
  }

  return {
    vendor: vendor || null,
    type: 'generic',
    friendlyName: prettyHost(hostname) || (vendor ? `${vendor} apparaat` : null),
    model: null,
    details: { hostname },
    capabilities: ['ping'],
    driver: 'generic',
  };
}

function detectTypeFromText(...texts) {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  if (!t) return null;
  if (/router|gateway|fritz|asus|netgear|tp-link|tplink|ubiquiti|unifi/.test(t)) return 'router';
  if (/printer|brother|epson|hp\s|laserjet|deskjet|officejet/.test(t)) return 'printer';
  if (/light|lamp|bulb|hue/.test(t)) return 'light';
  if (/speaker|sonos|chromecast|cast|airplay/.test(t)) return 'speaker';
  if (/camera|cam\b|dome|nvr|cctv/.test(t)) return 'camera';
  if (/tv\b|television|sony|samsung|lg/.test(t)) return 'tv';
  if (/sensor/.test(t)) return 'sensor';
  if (/switch|relay|smartplug|plug/.test(t)) return 'switch';
  if (/synology|diskstation|nas|qnap/.test(t)) return 'nas';
  if (/iphone|android.*phone|phone/.test(t)) return 'phone';
  if (/ipad|tablet/.test(t)) return 'tablet';
  if (/macbook|imac|laptop|desktop/.test(t)) return 'computer';
  return null;
}
